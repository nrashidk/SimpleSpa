import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { AuditLogger } from "./auditLog";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Helper to get registered strategy name, with fallback for local/unknown hostnames
  const getStrategyName = (hostname: string): string => {
    const domains = process.env.REPLIT_DOMAINS!.split(",");
    // Check if hostname matches a registered domain
    if (domains.includes(hostname)) {
      return `replitauth:${hostname}`;
    }
    // Fallback to first registered domain for localhost/127.0.0.1/etc
    return `replitauth:${domains[0]}`;
  };

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(getStrategyName(req.hostname), {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(getStrategyName(req.hostname), async (err: any, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      
      if (!user) {
        return res.redirect("/api/login");
      }
      
      // Log in the user
      req.login(user, async (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        
        // Log successful authentication
        if (user && user.claims) {
          try {
            await AuditLogger.logAuth(req, "LOGIN", user.claims.sub);
          } catch (error) {
            console.error("Failed to log authentication:", error);
          }
        }
        
        // Redirect to admin panel
        res.redirect("/admin");
      });
    })(req, res, next);
  });

  app.get("/api/logout", async (req, res) => {
    // Log logout before clearing session
    const user = req.user as any;
    if (user && user.claims) {
      try {
        await AuditLogger.logAuth(req, "LOGOUT", user.claims.sub);
      } catch (error) {
        console.error("Failed to log logout:", error);
      }
    }
    
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Admin-only middleware - requires authentication + admin role
export const isAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.expires_at) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // Check if user has admin or super_admin role and is approved
  const userId = user.claims.sub;
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "super_admin")) {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  if (dbUser.status !== "approved") {
    return res.status(403).json({ message: "Forbidden: Admin account pending approval" });
  }

  next();
};

// Middleware to inject admin's spa into request context
// Use this after isAdmin to ensure the admin has a spa set up
export const injectAdminSpa: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  const userId = user.claims.sub;
  
  // Get user from database
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser) {
    return res.status(500).json({ message: "User not found in database" });
  }
  
  // Check if admin has a spa assigned
  if (!dbUser.adminSpaId) {
    return res.status(400).json({ 
      message: "No spa assigned to this admin account. Please complete the setup wizard first.",
      setupRequired: true 
    });
  }
  
  // Fetch the spa and validate it exists
  const spa = await storage.getSpaById(dbUser.adminSpaId);
  
  if (!spa) {
    return res.status(404).json({ 
      message: "Spa not found. Please contact support or complete the setup wizard again.",
      setupRequired: true 
    });
  }
  
  // Attach spa and user to request for use in routes
  (req as any).adminSpa = spa;
  (req as any).dbUser = dbUser;
  
  next();
};

// Setup wizard enforcement middleware - blocks admin access when setup is incomplete
// Applied globally to /api/admin/* routes; requires isAuthenticated before it
export const enforceSetupWizard: RequestHandler = async (req, res, next) => {
  // Allow CORS preflight requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Always allow setup wizard routes (req.path is relative to /api/admin mount)
  if (req.path.startsWith('/setup')) {
    return next();
  }

  const user = req.user as any;
  const userId = user.claims.sub;
  const dbUser = await storage.getUser(userId);

  // Only enforce for regular admins, not super admins
  if (dbUser && dbUser.role === 'admin') {
    // Check if user is approved
    if (dbUser.status !== 'approved') {
      return res.status(403).json({ 
        message: "Your account is pending approval by a super admin.",
        pendingApproval: true
      });
    }

    // Check if admin has a spa assigned
    if (!dbUser.adminSpaId) {
      return res.status(403).json({ 
        setupRequired: true, 
        message: "Complete the setup wizard first to activate your spa." 
      });
    }

    // Fetch the spa and check if setup is complete
    const spa = await storage.getSpaById(dbUser.adminSpaId);
    if (!spa || !spa.setupComplete) {
      return res.status(403).json({ 
        setupRequired: true, 
        message: "Complete the setup wizard first to activate your spa." 
      });
    }
  }

  next();
};

// Ensure setup wizard is complete - blocks write operations until setup is done
// Use this middleware AFTER injectAdminSpa for write routes
export const ensureSetupComplete: RequestHandler = async (req, res, next) => {
  const spa = (req as any).adminSpa;
  
  if (!spa) {
    return res.status(500).json({ message: "Spa context missing from request" });
  }
  
  if (!spa.setupComplete) {
    return res.status(412).json({ 
      message: "Setup wizard must be completed before performing this action",
      setupRequired: true 
    });
  }
  
  next();
};

// Super Admin-only middleware - requires authentication + super_admin role
export const isSuperAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.expires_at) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // Check if user has super_admin role
  const userId = user.claims.sub;
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser || dbUser.role !== "super_admin") {
    return res.status(403).json({ message: "Forbidden: Super Admin access required" });
  }

  next();
};
