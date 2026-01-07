import admin from "firebase-admin";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { AuditLogger } from "./auditLog";

let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    console.warn("Firebase project ID not configured - Firebase auth will not work");
    return;
  }

  admin.initializeApp({
    projectId: projectId,
  });
  
  firebaseInitialized = true;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
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
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  
  initializeFirebase();

  app.post("/api/auth/firebase", async (req, res) => {
    try {
      const { idToken } = req.body;
      
      if (!idToken) {
        return res.status(400).json({ message: "ID token is required" });
      }

      if (!firebaseInitialized) {
        return res.status(500).json({ message: "Firebase not configured" });
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      const firebaseUser = {
        uid: decodedToken.uid,
        email: decodedToken.email || "",
        name: decodedToken.name || "",
        picture: decodedToken.picture || "",
      };

      await storage.upsertUser({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        firstName: firebaseUser.name?.split(' ')[0] || "",
        lastName: firebaseUser.name?.split(' ').slice(1).join(' ') || "",
        profileImageUrl: firebaseUser.picture,
      });

      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
      
      (req.session as any).user = {
        claims: {
          sub: firebaseUser.uid,
          email: firebaseUser.email,
        },
        expires_at: expiresAt,
        firebaseAuth: true,
      };

      await AuditLogger.logAuth(req, "LOGIN", firebaseUser.uid);

      res.json({ 
        success: true, 
        user: {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.name,
        }
      });
    } catch (error) {
      console.error("Firebase auth error:", error);
      res.status(401).json({ message: "Invalid token" });
    }
  });

  app.get("/api/logout", async (req, res) => {
    const sessionUser = (req.session as any).user;
    if (sessionUser?.claims?.sub) {
      try {
        await AuditLogger.logAuth(req, "LOGOUT", sessionUser.claims.sub);
      } catch (error) {
        console.error("Failed to log logout:", error);
      }
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const sessionUser = (req.session as any).user;

  if (!sessionUser || !sessionUser.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > sessionUser.expires_at) {
    return res.status(401).json({ message: "Session expired" });
  }

  (req as any).user = sessionUser;
  return next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  const sessionUser = (req.session as any).user;

  if (!sessionUser || !sessionUser.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > sessionUser.expires_at) {
    return res.status(401).json({ message: "Session expired" });
  }

  const userId = sessionUser.claims.sub;
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "super_admin")) {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  if (dbUser.status !== "approved") {
    return res.status(403).json({ message: "Forbidden: Admin account pending approval" });
  }

  (req as any).user = sessionUser;
  next();
};

export const injectAdminSpa: RequestHandler = async (req, res, next) => {
  const sessionUser = (req.session as any).user;
  const userId = sessionUser.claims.sub;
  
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser) {
    return res.status(500).json({ message: "User not found in database" });
  }
  
  if (!dbUser.adminSpaId) {
    return res.status(400).json({ 
      message: "No spa assigned to this admin account. Please complete the setup wizard first.",
      setupRequired: true 
    });
  }
  
  const spa = await storage.getSpaById(dbUser.adminSpaId);
  
  if (!spa) {
    return res.status(404).json({ 
      message: "Spa not found. Please contact support or complete the setup wizard again.",
      setupRequired: true 
    });
  }
  
  (req as any).adminSpa = spa;
  (req as any).dbUser = dbUser;
  
  next();
};

export const enforceSetupWizard: RequestHandler = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (req.path.startsWith('/setup')) {
    return next();
  }

  const sessionUser = (req.session as any).user;
  const userId = sessionUser.claims.sub;
  const dbUser = await storage.getUser(userId);

  if (dbUser && dbUser.role === 'admin') {
    if (dbUser.status !== 'approved') {
      return res.status(403).json({ 
        message: "Your account is pending approval by a super admin.",
        pendingApproval: true
      });
    }

    if (!dbUser.adminSpaId) {
      return res.status(403).json({ 
        setupRequired: true, 
        message: "Complete the setup wizard first to activate your spa." 
      });
    }

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

export const isSuperAdmin: RequestHandler = async (req, res, next) => {
  const sessionUser = (req.session as any).user;

  if (!sessionUser || !sessionUser.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > sessionUser.expires_at) {
    return res.status(401).json({ message: "Session expired" });
  }

  const userId = sessionUser.claims.sub;
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser || dbUser.role !== "super_admin") {
    return res.status(403).json({ message: "Forbidden: Super Admin access required" });
  }

  (req as any).user = sessionUser;
  next();
};
