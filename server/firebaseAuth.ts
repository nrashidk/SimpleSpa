import admin from "firebase-admin";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { AuditLogger } from "./auditLog";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { otpRequestLimiter, otpVerifyLimiter } from "./index";
import { db } from "./db";
import { otpCodes } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

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
  const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
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
      secure: isProduction,
      maxAge: sessionTtl,
      sameSite: 'lax', // Always use 'lax' - CSRF tokens handle cross-origin protection
      domain: process.env.COOKIE_DOMAIN || undefined, // Support custom domain cookies
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", true); // Trust all proxies in production (CDN, load balancer, reverse proxy)
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
      
      // SECURITY: Regenerate session to prevent session fixation attacks
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('Session regeneration error:', regenerateErr);
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Set user data and create new CSRF token after session regeneration
        const crypto = require('crypto');
        (req.session as any).user = {
          claims: {
            sub: firebaseUser.uid,
            email: firebaseUser.email,
          },
          expires_at: expiresAt,
          firebaseAuth: true,
        };
        (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');

        req.session.save(async (saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: "Login failed" });
          }
          
          await AuditLogger.logAuth(req, "LOGIN", firebaseUser.uid);

          // Return CSRF token with login response so frontend can use it immediately
          res.json({ 
            success: true, 
            user: {
              id: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.name,
            },
            csrfToken: (req.session as any).csrfToken
          });
        });
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

  // DUMMY_PASSWORD_HASH for constant-time comparison (prevents email enumeration)
  const DUMMY_PASSWORD_HASH = '$2b$10$2NHsfc5kq84lGXf/Glaa2uaU47qlqt9JGX0r3w53bbZOUDM9ir2hm';

  // Password validation helper for customers
  function validateCustomerPassword(password: string): { valid: boolean; message?: string } {
    if (!password || password.length < 8) {
      return { valid: false, message: "Password must be at least 8 characters." };
    }
    if (password.length > 128) {
      return { valid: false, message: "Password must be 128 characters or less." };
    }
    return { valid: true };
  }

  // Phone validation helper
  function validatePhone(phone: string): { valid: boolean; normalized?: string; message?: string } {
    const normalized = phone.replace(/[\s\-\(\)]/g, '').trim();
    if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
      return { valid: false, message: "Invalid phone number format. Use international format like +971501234567" };
    }
    return { valid: true, normalized };
  }

  // Customer email/password registration
  app.post("/api/auth/customer/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Validate password
      const passwordValidation = validateCustomerPassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      // Check if phone already exists
      if (phone) {
        const phoneValidation = validatePhone(phone);
        if (!phoneValidation.valid) {
          return res.status(400).json({ message: phoneValidation.message });
        }
        const existingPhoneUser = await storage.getUserByPhone(phoneValidation.normalized!);
        if (existingPhoneUser) {
          return res.status(409).json({ message: "An account with this phone number already exists" });
        }
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await storage.upsertUser({
        email: email.toLowerCase().trim(),
        phone: phone ? phone.replace(/[\s\-\(\)]/g, '').trim() : undefined,
        password: hashedPassword,
        firstName: firstName || "",
        lastName: lastName || "",
        role: "customer",
        status: "approved",
      });

      // Create session for the new user
      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
      
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('Session regeneration error:', regenerateErr);
          return res.status(500).json({ message: "Registration failed" });
        }

        (req.session as any).user = {
          claims: { sub: newUser.id, email: newUser.email },
          expires_at: expiresAt,
        };
        (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');

        req.session.save(async (saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: "Registration failed" });
          }

          await AuditLogger.logAuth(req, "REGISTER", newUser.id);

          res.json({
            success: true,
            user: {
              id: newUser.id,
              email: newUser.email,
              firstName: newUser.firstName,
              lastName: newUser.lastName,
            },
            csrfToken: (req.session as any).csrfToken,
          });
        });
      });
    } catch (error) {
      console.error("Customer registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Customer email/password login
  app.post("/api/auth/customer/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Look up user by email
      const user = await storage.getUserByEmail(email);

      // SECURITY: Always run bcrypt comparison even if user doesn't exist
      const passwordToCheck = user?.password || DUMMY_PASSWORD_HASH;
      const passwordMatch = await bcrypt.compare(password, passwordToCheck);

      if (!user || !passwordMatch) {
        await AuditLogger.logAuthFailed(req, email, "Invalid credentials");
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Create session
      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('Session regeneration error:', regenerateErr);
          return res.status(500).json({ message: "Login failed" });
        }

        (req.session as any).user = {
          claims: { sub: user.id, email: user.email },
          expires_at: expiresAt,
        };
        (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');

        req.session.save(async (saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: "Login failed" });
          }

          await AuditLogger.logAuth(req, "LOGIN", user.id);

          res.json({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            },
            csrfToken: (req.session as any).csrfToken,
          });
        });
      });
    } catch (error) {
      console.error("Customer login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // OTP cleanup - delete expired codes every 5 minutes
  setInterval(async () => {
    try {
      await db.delete(otpCodes).where(lt(otpCodes.expiresAt, new Date()));
    } catch (error) {
      console.error("OTP cleanup error:", error);
    }
  }, 5 * 60 * 1000);

  // Customer phone OTP request - Rate limited to prevent SMS flooding
  app.post("/api/auth/customer/phone/request-otp", otpRequestLimiter, async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({ message: phoneValidation.message });
      }

      const normalizedPhone = phoneValidation.normalized!;

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + (10 * 60 * 1000)); // 10 minutes

      // Store OTP in database (upsert pattern - replace existing if present)
      await db.delete(otpCodes).where(eq(otpCodes.phone, normalizedPhone));
      await db.insert(otpCodes).values({
        phone: normalizedPhone,
        otp,
        expiresAt,
        attempts: 0,
      });

      // Log in development for testing
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] OTP for ${normalizedPhone}: ${otp}`);
      }

      // Try to send via Twilio if available
      try {
        const twilioClient = require('twilio');
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

        if (accountSid && authToken && twilioPhone) {
          const client = twilioClient(accountSid, authToken);
          await client.messages.create({
            body: `Your verification code is: ${otp}`,
            from: twilioPhone,
            to: normalizedPhone,
          });
          console.log(`OTP sent to ${normalizedPhone} via Twilio`);
        }
      } catch (smsError) {
        console.log("SMS sending not available:", smsError);
      }

      res.json({
        success: true,
        message: "Verification code sent",
        // In development, return OTP for testing
        ...(process.env.NODE_ENV === 'development' && { devOtp: otp }),
      });
    } catch (error) {
      console.error("Phone OTP request error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  // Customer phone OTP verify - Rate limited to prevent brute force
  app.post("/api/auth/customer/phone/verify-otp", otpVerifyLimiter, async (req, res) => {
    try {
      const { phone, otp, firstName, lastName } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone and OTP are required" });
      }

      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({ message: phoneValidation.message });
      }

      const normalizedPhone = phoneValidation.normalized!;
      
      // Fetch OTP from database
      const [storedOtp] = await db.select()
        .from(otpCodes)
        .where(eq(otpCodes.phone, normalizedPhone))
        .limit(1);

      if (!storedOtp) {
        return res.status(400).json({ message: "No verification code found. Please request a new one." });
      }

      if (new Date() > storedOtp.expiresAt) {
        await db.delete(otpCodes).where(eq(otpCodes.phone, normalizedPhone));
        return res.status(400).json({ message: "Verification code expired. Please request a new one." });
      }

      // Increment attempts
      const newAttempts = storedOtp.attempts + 1;
      if (newAttempts > 5) {
        await db.delete(otpCodes).where(eq(otpCodes.phone, normalizedPhone));
        return res.status(429).json({ message: "Too many attempts. Please request a new code." });
      }
      
      // Update attempts count in database
      await db.update(otpCodes)
        .set({ attempts: newAttempts })
        .where(eq(otpCodes.phone, normalizedPhone));

      if (storedOtp.otp !== otp) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      // OTP verified, delete from database
      await db.delete(otpCodes).where(eq(otpCodes.phone, normalizedPhone));

      // Find or create user by phone
      let user = await storage.getUserByPhone(normalizedPhone);
      
      if (!user) {
        // Create new user
        user = await storage.upsertUser({
          phone: normalizedPhone,
          firstName: firstName || "",
          lastName: lastName || "",
          role: "customer",
          status: "approved",
          phoneVerified: true,
        });
      } else {
        // Update phone verified status
        await storage.updateUserPhoneVerified(user.id, true);
      }

      // Create session
      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error('Session regeneration error:', regenerateErr);
          return res.status(500).json({ message: "Verification failed" });
        }

        (req.session as any).user = {
          claims: { sub: user!.id, email: user!.email, phone: user!.phone },
          expires_at: expiresAt,
        };
        (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');

        req.session.save(async (saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: "Verification failed" });
          }

          await AuditLogger.logAuth(req, "LOGIN", user!.id);

          res.json({
            success: true,
            user: {
              id: user!.id,
              phone: user!.phone,
              firstName: user!.firstName,
              lastName: user!.lastName,
            },
            csrfToken: (req.session as any).csrfToken,
          });
        });
      });
    } catch (error) {
      console.error("Phone OTP verify error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
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
