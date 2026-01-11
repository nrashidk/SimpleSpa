import express, { type Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { z } from "zod";
import twilio from "twilio";
import { storage } from "./storage";
import { db } from "./db";
import { users, spas } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decryptJSON } from "./encryptionService";
import { setupAuth, isAuthenticated, isAdmin, isSuperAdmin, injectAdminSpa, enforceSetupWizard, ensureSetupComplete } from "./firebaseAuth";
import { loginLimiter, bookingLimiter, apiLimiter, validateCsrf, ensureCsrfToken } from "./index";
import { generateAvailableTimeSlots, validateBooking } from "./timeSlotService";
import { notificationService } from "./notificationService";
import { requireStaff, requireStaffRole, getStaffByUserId, canViewStaffCalendar, canEditAppointments, canAccessDashboard } from "./staffPermissions";
import { staffRoles, staffRoleInfo } from "@shared/schema";
import { AuditLogger } from "./auditLog";
import { 
  validateTwilioCredentials, 
  validateMsg91Credentials, 
  validateEmailCredentials 
} from "./providerValidation";
import { encryptJSON } from "./encryptionService";
import { 
  generateAuthUrl, 
  exchangeCodeForTokens, 
  encryptTokensForStorage,
  getValidAccessToken 
} from "./oauthService";
import { exportToCSV, exportToExcel, exportToPDF, formatCurrency, formatPercentage, formatDate } from "./exportUtils";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { logger, securityLogger, redactEmail } from "./logger";
import {
  insertSpaSettingsSchema,
  insertServiceCategorySchema,
  insertServiceSchema,
  insertMembershipSchema,
  insertMembershipServiceSchema,
  insertCustomerMembershipSchema,
  insertMembershipUsageSchema,
  insertStaffSchema,
  insertStaffScheduleSchema,
  insertStaffTimeEntrySchema,
  insertProductSchema,
  insertCustomerSchema,
  insertPromoCodeSchema,
  insertBookingSchema,
  insertBookingItemSchema,
  insertTransactionSchema,
  insertLoyaltyCardSchema,
  insertLoyaltyCardUsageSchema,
  insertProductSaleSchema,
  insertVendorSchema,
  insertExpenseSchema,
  insertBillSchema,
} from "@shared/schema";

// OAuth State HMAC signing for CSRF protection with single-use nonce
// Used nonces are stored in memory with their expiration time to prevent replay attacks
const usedOAuthNonces = new Map<string, number>();

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiry] of usedOAuthNonces.entries()) {
    if (now > expiry) {
      usedOAuthNonces.delete(nonce);
    }
  }
}, 5 * 60 * 1000);

function signOAuthState(data: object): string {
  const secret = process.env.SESSION_SECRET || 'fallback-secret';
  // Add unique nonce for single-use enforcement
  const nonce = crypto.randomBytes(16).toString('hex');
  const stateData = { ...data, nonce };
  const stateJson = JSON.stringify(stateData);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(stateJson);
  const signature = hmac.digest('hex');
  return Buffer.from(JSON.stringify({ data: stateData, signature })).toString('base64');
}

function verifyOAuthState(state: string): { valid: boolean; data?: any; alreadyUsed?: boolean } {
  try {
    const secret = process.env.SESSION_SECRET || 'fallback-secret';
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(decoded.data));
    const expectedSignature = hmac.digest('hex');
    
    if (decoded.signature !== expectedSignature) {
      return { valid: false };
    }
    
    // Check if nonce has already been used (replay attack prevention)
    const nonce = decoded.data.nonce;
    if (usedOAuthNonces.has(nonce)) {
      securityLogger.warn("OAuth state nonce replay attempt detected", { nonce: nonce.substring(0, 8) + '...' });
      return { valid: false, alreadyUsed: true };
    }
    
    return { valid: true, data: decoded.data };
  } catch {
    return { valid: false };
  }
}

function markOAuthStateAsUsed(nonce: string, expiryMs: number = 10 * 60 * 1000): void {
  // Store nonce with expiration timestamp (10 minutes by default)
  usedOAuthNonces.set(nonce, Date.now() + expiryMs);
}

// Dummy password hash for constant-time comparison (prevents email enumeration)
// This is a valid bcrypt hash of a random string - actual value doesn't matter
// We just need bcrypt.compare to run the same amount of work for non-existent users
const DUMMY_PASSWORD_HASH = '$2b$10$2NHsfc5kq84lGXf/Glaa2uaU47qlqt9JGX0r3w53bbZOUDM9ir2hm';

// Public booking request validation schema
const publicBookingRequestSchema = z.object({
  spaId: z.number().int().positive("Invalid spa ID"),
  customerName: z.string().min(2, "Name must be at least 2 characters").max(100, "Name too long"),
  customerEmail: z.string().email("Invalid email format").optional().nullable(),
  customerPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone format").optional().nullable(),
  services: z.array(z.number().int().positive()).min(1, "At least one service required").max(10, "Maximum 10 services"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  time: z.string().regex(/^(\d{1,2}:\d{2}(\s*[AP]M)?|\d{2}:\d{2})$/i, "Invalid time format"),
  staffId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(500, "Notes too long").optional().nullable(),
}).refine(data => data.customerEmail || data.customerPhone, {
  message: "Either email or phone is required",
  path: ["customerEmail"],
});

// Domain error class for business logic errors
export class DomainError extends Error {
  status: number;
  code?: string;
  
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
  }
}

// Generate unique error ID for tracking without exposing details
function generateErrorId(): string {
  return `ERR-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
}

// Helper function for consistent error handling
function handleRouteError(res: any, error: any, message: string) {
  // Domain errors (business logic) - safe to expose
  if (error instanceof DomainError) {
    return res.status(error.status).json({ 
      message: error.message, 
      code: error.code 
    });
  }
  
  // Zod validation errors - safe to expose field-level errors
  if (error.name === "ZodError") {
    return res.status(400).json({ 
      message: "Validation error", 
      errors: error.errors.map((e: any) => ({ 
        field: e.path.join('.'), 
        message: e.message 
      }))
    });
  }
  
  // Postgres database errors - return generic messages in production
  if (error.code === '23505') { // Unique constraint violation
    return res.status(409).json({ 
      message: "This record already exists" 
    });
  }
  
  if (error.code === '23503') { // Foreign key constraint violation
    return res.status(400).json({ 
      message: "Referenced record does not exist" 
    });
  }
  
  if (error.code === '23502') { // Not null violation
    return res.status(400).json({ 
      message: "Missing required field" 
    });
  }
  
  // Generate error ID for tracking
  const errorId = generateErrorId();
  
  // Log full error details for debugging (server-side only)
  console.error(`[${errorId}] ${message}:`, {
    error: error.message,
    stack: error.stack,
    code: error.code,
    timestamp: new Date().toISOString()
  });
  
  // Production: Return generic message with error ID for support
  // Development: Include error details for debugging
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ 
      message: "An unexpected error occurred. Please try again later.",
      errorId: errorId
    });
  }
  
  // Development: Include error details
  res.status(500).json({ 
    message: error.message || message,
    errorId: errorId,
    stack: error.stack
  });
}

// Helper function to parse and validate numeric ID params
function parseNumericId(param: string): number | null {
  const id = parseInt(param);
  return Number.isFinite(id) ? id : null;
}

// Password validation helper - enforces strong password policy
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 12) {
    return { valid: false, message: "Password must be at least 12 characters long" };
  }
  if (password.length > 128) {
    return { valid: false, message: "Password must be 128 characters or less" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one special character" };
  }
  // Check for common passwords
  const commonPasswords = ['password123', 'password1234', 'admin123456', 'qwerty123456'];
  if (commonPasswords.includes(password.toLowerCase())) {
    return { valid: false, message: "Password is too common. Please choose a stronger password." };
  }
  return { valid: true };
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'licenses');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'license-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, JPEG, and PNG files are allowed.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware setup
  await setupAuth(app);

  // Apply rate limiting to all API routes (prevents DoS and brute force attacks)
  app.use('/api', apiLimiter);

  // CSRF Protection - ensure token exists in session, then validate on state-changing requests
  app.use('/api', ensureCsrfToken, validateCsrf);

  // CSRF Token endpoint - returns the session-bound CSRF token
  app.get('/api/csrf-token', (req, res) => {
    // Ensure CSRF token exists in session
    if (!(req.session as any).csrfToken) {
      (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.json({ csrfToken: (req.session as any).csrfToken });
  });

  // File upload endpoint for license documents
  // SECURITY: Requires authentication to prevent unauthorized uploads
  app.post('/api/upload/license', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // SECURITY: Validate file content matches extension (magic bytes check)
      const fileBuffer = fs.readFileSync(req.file.path);
      const magicBytes = fileBuffer.slice(0, 8).toString('hex');
      
      const validMagicBytes: Record<string, string[]> = {
        '.pdf': ['25504446'],  // %PDF
        '.jpg': ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', 'ffd8ffe8'],  // JPEG signatures
        '.jpeg': ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', 'ffd8ffe8'],
        '.png': ['89504e47'],  // PNG signature
      };
      
      const ext = path.extname(req.file.originalname).toLowerCase();
      const expectedMagic = validMagicBytes[ext];
      
      if (expectedMagic && !expectedMagic.some(magic => magicBytes.startsWith(magic))) {
        // Delete the suspicious file
        fs.unlinkSync(req.file.path);
        logger.warn("File upload rejected - magic bytes mismatch", { 
          filename: req.file.originalname,
          declaredExt: ext,
          actualMagic: magicBytes.slice(0, 8)
        });
        return res.status(400).json({ message: 'Invalid file content. File type does not match extension.' });
      }
      
      // Return the file URL (relative path that can be accessed)
      const fileUrl = `/uploads/licenses/${req.file.filename}`;
      logger.info("License document uploaded", { filename: req.file.filename });
      res.json({ fileUrl });
    } catch (error) {
      console.error('License upload error:', error);
      res.status(500).json({ message: 'Failed to upload license document' });
    }
  });

  // Serve uploaded files (with authentication for super admin only)
  app.use('/uploads', isAuthenticated, isSuperAdmin, (req, res) => {
    try {
      // Secure file serving to prevent path traversal
      const uploadsBase = path.join(process.cwd(), 'uploads');
      
      // Normalize and sanitize the requested path
      const relativePath = path.normalize(req.path).replace(/^\/+/, '');
      const filePath = path.join(uploadsBase, relativePath);
      
      // Check if file exists first
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      // SECURITY: Resolve symlinks and verify the real path is within uploads directory
      // This prevents symlink-based path traversal attacks
      const realUploadsBase = fs.realpathSync(uploadsBase);
      const realFilePath = fs.realpathSync(filePath);
      
      if (!realFilePath.startsWith(realUploadsBase)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Double-check file still exists after realpath (race condition protection)
      if (!fs.existsSync(realFilePath)) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      // Serve the file
      res.sendFile(filePath);
    } catch (error) {
      console.error('Error serving file:', error);
      res.status(500).json({ message: 'Error serving file' });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch user");
    }
  });

  // Staff permission routes
  app.get('/api/staff/me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const staffMember = await getStaffByUserId(userId);
      
      if (!staffMember) {
        return res.status(404).json({ error: "Staff profile not found" });
      }

      // Return staff info with permissions
      res.json({
        ...staffMember,
        permissions: staffRoleInfo[staffMember.role as keyof typeof staffRoleInfo] || staffRoleInfo.basic,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch staff profile");
    }
  });

  // Check staff permissions
  app.get('/api/staff/permissions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admins have all permissions
      if (user?.role === "admin" || user?.role === "super_admin") {
        return res.json({
          canViewOwnCalendar: true,
          canViewAllCalendars: true,
          canEditAppointments: true,
          canAccessDashboard: true,
          role: user.role,
          isAdmin: true,
        });
      }

      const staffMember = await getStaffByUserId(userId);
      
      if (!staffMember) {
        return res.json({
          canViewOwnCalendar: false,
          canViewAllCalendars: false,
          canEditAppointments: false,
          canAccessDashboard: false,
          role: null,
          isAdmin: false,
        });
      }

      const role = staffMember.role || staffRoles.BASIC;
      
      res.json({
        canViewOwnCalendar: canViewStaffCalendar(role, staffMember.id, staffMember.id),
        canViewAllCalendars: canViewStaffCalendar(role, staffMember.id, -1), // -1 for different staff
        canEditAppointments: canEditAppointments(role),
        canAccessDashboard: canAccessDashboard(role),
        role: role,
        isAdmin: false,
        staffId: staffMember.id,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to check permissions");
    }
  });

  // Admin login route (email/password authentication) - Rate limited to prevent brute force
  // SECURITY: Constant-time comparison to prevent email enumeration timing attacks
  app.post('/api/admin/login', loginLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      // Look up user by email
      const user = await storage.getUserByEmail(email);
      
      // SECURITY: Always run bcrypt comparison even if user doesn't exist
      // This prevents timing attacks that could enumerate valid email addresses
      const passwordToCheck = user?.password || DUMMY_PASSWORD_HASH;
      const passwordMatch = await bcrypt.compare(password, passwordToCheck);
      
      // Check all conditions with same error message to prevent enumeration
      if (!user || !passwordMatch) {
        await AuditLogger.logAuthFailed(req, email, "Invalid credentials");
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Check if user is admin or super_admin
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        await AuditLogger.logAuthFailed(req, email, "Non-admin role attempted admin login");
        return res.status(403).json({ message: "Access denied. Admin access required." });
      }
      
      // Check if user is approved
      if (user.status !== 'approved') {
        await AuditLogger.logAuthFailed(req, email, "Account pending approval");
        return res.status(403).json({ message: "Your account is pending approval" });
      }
      
      // SECURITY: Regenerate session to prevent session fixation attacks
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          logger.error('Session regeneration error', { error: regenerateErr instanceof Error ? regenerateErr.message : 'Unknown' });
          return res.status(500).json({ message: "Login failed" });
        }
        
        // Set user data and create new CSRF token after session regeneration
        (req.session as any).user = {
          claims: { sub: user.id, email: user.email },
          expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        };
        (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');
        
        req.session.save(async (saveErr) => {
          if (saveErr) {
            logger.error('Session save error', { error: saveErr instanceof Error ? saveErr.message : 'Unknown' });
            return res.status(500).json({ message: "Login failed" });
          }
          
          await AuditLogger.logAuth(req, "LOGIN", user.id);
          
          const { password: _, passwordResetToken: __, passwordResetExpires: ___, ...safeUser } = user;
          return res.json({ 
            success: true, 
            user: safeUser,
            csrfToken: (req.session as any).csrfToken
          });
        });
      });
    } catch (error) {
      logger.error("Admin login error", { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get current authenticated user info
  app.get('/api/user', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(dbUser);
    } catch (error) {
      handleRouteError(res, error, "Failed to get user info");
    }
  });

  // DEV ENDPOINTS - Only available in development mode
  // SECURITY: These endpoints are disabled in production to prevent unauthorized access
  if (process.env.NODE_ENV === 'development') {
    // DEV/TEST: Make current user a super admin (requires authentication)
    app.post('/api/dev/make-super-admin', isAuthenticated, async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user.claims.sub;
        const userEmail = user.claims.email || `dev-${userId}@test.com`;

        // Upsert user with super_admin role
        const superAdminUser = await storage.upsertUser({
          id: userId,
          email: userEmail,
          role: 'super_admin',
          status: 'approved'
        });

        res.json({
          success: true,
          message: "You are now a super admin! Refresh the page to access the admin panel.",
          user: superAdminUser
        });
      } catch (error) {
        handleRouteError(res, error, "Failed to create super admin");
      }
    });

    // Create a super admin with email and password (for direct login without OAuth)
    // SECURITY: Only available in development mode
    app.post('/api/dev/create-super-admin', async (req, res) => {
      try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
          return res.status(400).json({ message: "Email and password are required" });
        }

        // Validate password strength with enhanced policy
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          return res.status(400).json({ message: passwordValidation.message });
        }

        // Check if user already exists
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          // If user exists but has no password, we can update it
          if (!existingUser.password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            const updatedUser = await storage.upsertUser({
              id: existingUser.id,
              email: email,
              password: hashedPassword,
              role: 'super_admin',
              status: 'approved'
            });

            return res.json({
              success: true,
              message: "Super admin updated with password. You can now login with email and password.",
              user: { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role }
            });
          }

          return res.status(400).json({
            message: "User with this email already exists. Use a different email or update the existing user's password."
          });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new super admin user
        const superAdminUser = await storage.upsertUser({
          email: email,
          password: hashedPassword,
          role: 'super_admin',
          status: 'approved'
        });

        res.json({
          success: true,
          message: "Super admin created successfully! You can now login with email and password.",
          user: { id: superAdminUser.id, email: superAdminUser.email, role: superAdminUser.role }
        });
      } catch (error) {
        console.error("Create super admin error:", error);
        res.status(500).json({ message: "Failed to create super admin" });
      }
    });
  }

  // Get current user's admin application (if any)
  app.get('/api/admin/my-application', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const application = await storage.getAdminApplicationByUserId(userId);
      
      if (!application) {
        return res.status(404).json({ message: "No application found" });
      }
      
      res.json(application);
    } catch (error) {
      handleRouteError(res, error, "Failed to get application");
    }
  });

  // Admin register route - creates pending application with email/password
  app.post('/api/admin/register', async (req, res) => {
    try {
      const { email, password, spaName, licenseUrl } = req.body;
      
      if (!email || !password || !spaName) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      logger.info("Admin application submission", { email: redactEmail(email), spaName, hasLicenseUrl: !!licenseUrl });
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ 
          message: "An account with this email already exists"
        });
      }
      
      // Hash password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      
      logger.debug("Creating new admin user and application");
      
      // Create new user with pending status
      const newUser = await storage.upsertUser({
        email: email,
        password: hashedPassword,
        role: 'admin',
        status: 'pending'
      });
      
      // Create admin application
      await storage.createAdminApplication({
        userId: newUser.id,
        businessName: spaName,
        businessType: 'spa',
        licenseUrl: licenseUrl || null,
        status: 'pending',
      });
      
      logger.info("Admin application created successfully", { userId: newUser.id });
      
      res.json({ 
        success: true, 
        message: 'Application submitted successfully and is pending for review.',
        pendingApproval: true
      });
    } catch (error) {
      logger.error("Admin register error", { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({ message: "Application submission failed" });
    }
  });

  // Change password endpoint for authenticated admins
  app.put('/api/admin/change-password', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      // Get the user from database
      const dbUser = await storage.getUser(userId);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      if (!dbUser.password) {
        return res.status(400).json({ message: "No password set for this account. Please contact support." });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, dbUser.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Validate new password strength
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }

      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, hashedPassword);

      logger.info("Password changed successfully", { userId });
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      logger.error("Change password error", { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Forgot password - Request password reset email
  app.post('/api/admin/forgot-password', loginLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration
      // But only actually send email if user exists and is admin
      if (user && (user.role === 'admin' || user.role === 'super_admin')) {
        const crypto = await import('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await storage.setPasswordResetToken(user.id, hashedToken, expiresAt);

        // Get the domain for the reset link - use production domain if deployed, otherwise dev domain
        const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
        let domain: string;
        
        if (isProduction && process.env.REPLIT_DOMAINS) {
          // In production, use the first domain from REPLIT_DOMAINS (comma-separated list)
          domain = process.env.REPLIT_DOMAINS.split(',')[0].trim();
        } else if (process.env.REPLIT_DEV_DOMAIN) {
          domain = process.env.REPLIT_DEV_DOMAIN;
        } else {
          domain = `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        }
        
        const resetUrl = `https://${domain}/admin/reset-password?token=${resetToken}`;
        
        logger.info("Password reset initiated", { 
          email: redactEmail(email), 
          domain,
          isProduction,
          hasSmtpConfig: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
        });

        // Try to send email via notification service or log for dev
        if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
          console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
        }

        // Try to send via nodemailer if SMTP is configured
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (!smtpHost || !smtpUser || !smtpPass) {
          logger.warn("SMTP not configured - password reset email cannot be sent", {
            hasHost: !!smtpHost,
            hasUser: !!smtpUser,
            hasPass: !!smtpPass
          });
        } else {
          try {
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.default.createTransport({
              host: smtpHost,
              port: parseInt(process.env.SMTP_PORT || '587'),
              secure: process.env.SMTP_SECURE === 'true',
              auth: { user: smtpUser, pass: smtpPass },
            });

            await transporter.sendMail({
              from: process.env.SMTP_FROM || smtpUser,
              to: email,
              subject: 'Password Reset Request',
              html: `
                <h2>Password Reset</h2>
                <p>You requested a password reset. Click the link below to reset your password:</p>
                <p><a href="${resetUrl}">Reset Password</a></p>
                <p>This link expires in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
              `,
            });
            logger.info("Password reset email sent successfully", { email: redactEmail(email), to: email });
          } catch (emailError) {
            logger.error("Failed to send password reset email", { 
              error: emailError instanceof Error ? emailError.message : 'Unknown',
              smtpHost,
              smtpUser: smtpUser ? `${smtpUser.substring(0, 3)}...` : 'not set'
            });
          }
        }

        await AuditLogger.logAction(req, 'CONFIG_CHANGE', 'user', user.id, { action: 'PASSWORD_RESET_REQUEST' });
      }

      // Always return success to prevent email enumeration
      res.json({ 
        success: true, 
        message: "If an account exists with this email, you will receive a password reset link." 
      });
    } catch (error) {
      logger.error("Forgot password error", { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Reset password with token
  app.post('/api/admin/reset-password', loginLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }

      // Hash the token to compare with stored value
      const crypto = await import('crypto');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user with matching token and not expired
      const user = await storage.getUserByResetToken(hashedToken);

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (!user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
        return res.status(400).json({ message: "Reset token has expired. Please request a new one." });
      }

      // Hash and update password
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updateUserPassword(user.id, hashedPassword);
      
      // Clear reset token
      await storage.clearPasswordResetToken(user.id);

      await AuditLogger.logAction(req, 'CONFIG_CHANGE', 'user', user.id, { action: 'PASSWORD_RESET_COMPLETE' });
      logger.info("Password reset completed", { userId: user.id });

      res.json({ success: true, message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
      logger.error("Reset password error", { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ===== SETUP WIZARD ENFORCEMENT =====
  // Apply setup wizard enforcement globally to all /api/admin/* routes
  // This blocks admin access when setupComplete !== true, except for /api/admin/setup/* routes
  app.use('/api/admin', isAuthenticated, enforceSetupWizard);

  // OAuth Integration Routes
  
  // Get all integrations for a spa
  app.get('/api/integrations', isAuthenticated, isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const spaId = req.adminSpa.id;

      const integrations = await storage.getAllIntegrations(spaId);
      
      // Return integrations with status but without encrypted tokens
      const safeIntegrations = integrations.map(int => ({
        id: int.id,
        spaId: int.spaId,
        integrationType: int.integrationType,
        status: int.status,
        settings: int.settings,
        lastSyncAt: int.lastSyncAt,
        createdAt: int.createdAt,
      }));
      
      res.json(safeIntegrations);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch integrations");
    }
  });

  // Initiate OAuth flow
  app.get('/api/oauth/:provider/connect', isAuthenticated, isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const provider = req.params.provider as 'google' | 'hubspot' | 'mailchimp';
      const { integrationType } = req.query;
      const spaId = req.adminSpa.id;

      if (!integrationType) {
        return res.status(400).json({ message: "Missing integrationType" });
      }

      // SECURITY: Create HMAC-signed state to prevent OAuth CSRF attacks
      const state = signOAuthState({
        spaId,
        integrationType,
        userId: req.user.claims.sub,
        timestamp: Date.now(),
      });

      const authUrl = generateAuthUrl(provider, integrationType as string, state);
      
      res.json({ authUrl });
    } catch (error) {
      handleRouteError(res, error, "Failed to initiate OAuth");
    }
  });

  // OAuth callback handler
  app.get('/api/oauth/:provider/callback', async (req, res) => {
    try {
      const provider = req.params.provider as 'google' | 'hubspot' | 'mailchimp';
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`/admin/settings?oauth_error=${error}`);
      }

      if (!code || !state) {
        return res.redirect('/admin/settings?oauth_error=missing_params');
      }

      // SECURITY: Verify HMAC-signed state to prevent OAuth CSRF attacks
      const stateVerification = verifyOAuthState(state as string);
      if (!stateVerification.valid) {
        const errorType = stateVerification.alreadyUsed ? 'state_reused' : 'invalid_state';
        return res.redirect(`/admin/settings?oauth_error=${errorType}`);
      }
      
      const { spaId, integrationType, userId, timestamp, nonce } = stateVerification.data;

      // Verify state is recent (within 10 minutes)
      if (Date.now() - timestamp > 10 * 60 * 1000) {
        return res.redirect('/admin/settings?oauth_error=expired_state');
      }
      
      // SECURITY: Mark nonce as used immediately to prevent replay attacks
      markOAuthStateAsUsed(nonce);

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(provider, integrationType, code as string);
      
      // Encrypt tokens for storage
      const { encryptedTokens, tokenMetadata } = encryptTokensForStorage(tokens);

      // Check if integration exists
      const existingIntegration = await storage.getIntegrationByType(spaId, integrationType);

      let integration;
      if (existingIntegration) {
        integration = await storage.updateIntegration(existingIntegration.id, {
          encryptedTokens,
          tokenMetadata,
          status: 'active',
          settings: {
            connectedAt: new Date().toISOString(),
            connectedBy: userId,
          } as any,
        });
      } else {
        integration = await storage.createIntegration({
          spaId,
          integrationType,
          encryptedTokens,
          tokenMetadata,
          status: 'active',
          settings: {
            connectedAt: new Date().toISOString(),
            connectedBy: userId,
          } as any,
        } as any);
      }

      // Log the integration
      await AuditLogger.log({
        userId,
        action: 'CREATE',
        entityType: 'spa',
        entityId: spaId,
        changes: {
          after: { integrationType, connected: true },
        },
      });

      // Redirect back to settings with success message
      res.redirect(`/admin/settings?oauth_success=${integrationType}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/admin/settings?oauth_error=exchange_failed');
    }
  });

  // Disconnect integration
  app.post('/api/integrations/:integrationId/disconnect', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const integrationId = parseNumericId(req.params.integrationId);
      if (!integrationId) {
        return res.status(400).json({ message: "Invalid integration ID" });
      }

      const integration = await storage.getIntegrationById(integrationId);
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      // Update status to inactive
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      await storage.updateIntegration(integrationId, {
        status: 'inactive',
        settings: {
          ...(integration.settings as any),
          disconnectedAt: new Date().toISOString(),
          disconnectedBy: userId,
        } as any,
      });

      await AuditLogger.log({
        userId,
        action: 'DELETE',
        entityType: 'spa',
        entityId: integration.spaId,
        changes: {
          after: { integrationType: integration.integrationType, disconnected: true },
        },
      });

      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to disconnect integration");
    }
  });

  // Public search endpoint for finding spas
  app.get("/api/search/spas", async (req, res) => {
    try {
      const { search, location, date, time } = req.query;
      
      const searchParams = {
        search: search as string | undefined,
        location: location as string | undefined,
        date: date as string | undefined,
        time: time as string | undefined,
      };
      
      const results = await storage.searchSpas(searchParams);
      res.json(results);
    } catch (error) {
      handleRouteError(res, error, "Failed to search spas");
    }
  });

  // Public spa details endpoint
  app.get("/api/spas/:id", async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid spa ID" });
      }
      
      const spa = await storage.getSpaById(id);
      if (!spa) {
        return res.status(404).json({ message: "Spa not found" });
      }
      
      res.json(spa);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch spa");
    }
  });

  // Public spa services endpoint
  // Public spa services endpoint - Filter in database for efficiency and security
  app.get("/api/spas/:id/services", async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid spa ID" });
      }
      
      const services = await storage.getServicesBySpaId(id);
      res.json(services);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch spa services");
    }
  });

  // Public spa staff endpoint - Filter in database for efficiency and security
  app.get("/api/spas/:id/staff", async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid spa ID" });
      }
      
      const staff = await storage.getStaffBySpaId(id);
      res.json(staff);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch spa staff");
    }
  });

  // Get available time slots for a spa
  app.get("/api/spas/:id/available-slots", async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid spa ID" });
      }

      const { date, duration, staffId } = req.query;
      
      if (!date || !duration) {
        return res.status(400).json({ message: "Date and duration are required" });
      }

      const serviceDuration = parseInt(duration as string);
      if (!Number.isFinite(serviceDuration) || serviceDuration <= 0) {
        return res.status(400).json({ message: "Invalid duration" });
      }

      const staffIdNum = staffId ? parseNumericId(staffId as string) ?? undefined : undefined;
      
      const slots = await generateAvailableTimeSlots(
        id,
        date as string,
        serviceDuration,
        staffIdNum
      );

      res.json(slots);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch available time slots");
    }
  });

  // Public booking creation endpoint
  app.post("/api/bookings", bookingLimiter, async (req, res) => {
    try {
      // Validate input using Zod schema
      const validationResult = publicBookingRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validationResult.error.errors.map(e => ({ 
            field: e.path.join('.'), 
            message: e.message 
          }))
        });
      }
      
      const { spaId, customerName, customerEmail, customerPhone, services, date, time, staffId, notes } = validationResult.data;

      // Find or create customer
      let customer;
      const userId = (req.user as any)?.claims?.sub; // Get userId from Replit Auth if available

      if (userId) {
        customer = await storage.getCustomerByUserId(userId);
      }

      if (!customer && customerEmail) {
        customer = await storage.getCustomerByEmail(customerEmail);
      }

      if (!customer && customerPhone) {
        customer = await storage.getCustomerByPhone(customerPhone);
      }

      if (!customer) {
        customer = await storage.createCustomer({
          userId: userId || undefined,
          name: customerName,
          email: customerEmail || null,
          phone: customerPhone || null,
        });
      }

      // Calculate total amount and duration using base service prices
      const serviceRecords = await storage.getAllServices();
      const selectedServices = serviceRecords.filter(s => services.includes(s.id));
      const totalAmount = selectedServices.reduce((sum, service) => {
        const price = typeof service.price === 'string' ? parseFloat(service.price) : service.price;
        return sum + price;
      }, 0);
      
      // Calculate total service duration
      const totalDuration = selectedServices.reduce((sum, service) => sum + service.duration, 0);

      // Convert time to 24-hour format if needed and create booking date
      let bookingDate: Date;
      try {
        // Check if time is in 12-hour format (contains AM/PM)
        if (time.match(/[AP]M$/i)) {
          // Convert 12-hour to 24-hour format
          const timeParts = time.match(/(\d+):(\d+)\s*([AP]M)/i);
          if (timeParts) {
            let hours = parseInt(timeParts[1]);
            const minutes = timeParts[2];
            const period = timeParts[3].toUpperCase();
            
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            
            const hours24 = hours.toString().padStart(2, '0');
            bookingDate = new Date(`${date}T${hours24}:${minutes}:00`);
          } else {
            throw new Error('Invalid time format');
          }
        } else {
          // Already in 24-hour format
          bookingDate = new Date(`${date}T${time}:00`);
        }
      } catch (error) {
        console.error('Error parsing date/time:', error);
        return res.status(400).json({ message: 'Invalid date or time format' });
      }

      // Validate booking against calendar rules
      const validation = await validateBooking(spaId, bookingDate, totalDuration, staffId || undefined);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }

      const booking = await storage.createBooking({
        spaId,
        customerId: customer.id,
        staffId: staffId || null,
        bookingDate,
        totalAmount: totalAmount.toString(),
        notes: notes || null,
        status: 'confirmed',
      });

      // Create booking items using base service prices
      for (const serviceId of services) {
        const service = selectedServices.find(s => s.id === serviceId);
        if (service) {
          await storage.createBookingItem({
            bookingId: booking.id,
            serviceId: service.id,
            staffId: staffId || null,
            price: service.price.toString(),
            duration: service.duration,
          });
        }
      }

      // Create FTA-compliant invoice for booking
      try {
        const spa = await storage.getSpaById(spaId);
        if (spa) {
          const { prepareFTACompliantInvoice } = await import('./invoiceUtils');
          const { calculateVAT } = await import('./vatUtils');
          
          // Calculate VAT based on spa's VAT activation status
          let subtotal: number;
          let taxAmount: number;
          
          if (spa.vatEnabled && spa.taxRegistrationNumber) {
            // VAT enabled: Calculate 5% inclusive VAT
            const vatCalc = calculateVAT(totalAmount, 'SR');
            subtotal = vatCalc.netAmount;
            taxAmount = vatCalc.vatAmount;
          } else {
            // VAT disabled: No tax, subtotal equals total
            subtotal = totalAmount;
            taxAmount = 0;
          }
          
          // Generate invoice number (simple sequential format)
          const invoiceNumber = `INV-${Date.now()}-${booking.id}`;
          
          // Prepare FTA-compliant invoice
          const invoiceData = prepareFTACompliantInvoice({
            spa,
            customer,
            subtotal,
            taxAmount,
            totalAmount,
            invoiceNumber,
            customerId: customer.id,
            bookingId: booking.id,
            paymentMethod: undefined,
            notes: notes || undefined,
          });
          
          // Create invoice
          await storage.createInvoice(invoiceData);

          // Check VAT threshold and send reminder if needed (non-blocking)
          if (spa.vatThresholdReminderEnabled && !spa.vatEnabled) {
            try {
              const { checkVATThreshold, shouldSendThresholdNotification } = await import('./revenueUtils');
              
              // Get all invoices for the spa to calculate current year revenue
              const allInvoices = await storage.getInvoicesBySpaId(spaId);
              const thresholdAmount = parseFloat(spa.vatThresholdAmount || "375000");
              const thresholdCheck = checkVATThreshold(allInvoices, thresholdAmount);
              
              // Check if we should send notification
              const shouldNotify = shouldSendThresholdNotification(
                thresholdCheck.thresholdReached,
                spa.lastThresholdNotificationYear
              );
              
              if (shouldNotify) {
                // Update spa to mark notification as sent this year
                // CRITICAL: This must succeed before sending notification to prevent duplicates
                const updatedSpa = await storage.updateSpa(spaId, {
                  lastThresholdNotificationYear: new Date().getFullYear(),
                });
                
                if (updatedSpa) {
                  // Only send notification if flag update succeeded
                  // Send notification to spa admin (async, non-blocking)
                  const spaOwner = spa.ownerUserId ? await storage.getUser(spa.ownerUserId) : null;
                  if (spaOwner?.email) {
                    const templateData = {
                      spaName: spa.name,
                      currentRevenue: thresholdCheck.annualRevenue.toFixed(2),
                      thresholdAmount: thresholdAmount.toFixed(2),
                      percentageOfThreshold: thresholdCheck.percentageOfThreshold.toFixed(1),
                      currentYear: thresholdCheck.currentYear,
                    };
                    
                    // Send email notification about VAT threshold
                    const notificationService = (await import('./notificationService')).default;
                    await notificationService.sendNotification(
                      spaId,
                      'reminder',
                      { email: spaOwner.email },
                      undefined,
                      templateData
                    ).catch((err: Error) => {
                      console.error('Error sending VAT threshold notification:', err);
                      // Note: We've already updated the flag, so won't retry until next year
                      // This prevents notification spam even if email delivery fails
                    });
                  } else {
                    console.warn('No admin email found for spa', spaId, '- VAT threshold reached but notification not sent');
                  }
                } else {
                  console.error('Failed to update lastThresholdNotificationYear for spa', spaId, '- skipping notification to prevent duplicates');
                }
              }
            } catch (error) {
              console.error('Error checking VAT threshold:', error);
              // Don't fail the booking if threshold check fails
            }
          }
        }
      } catch (error) {
        console.error('Error creating invoice for booking:', error);
        // Don't fail the booking if invoice creation fails
      }

      // Log booking creation to audit trail
      await AuditLogger.logCreate(req, "booking", booking.id, {
        spaId,
        customerId: customer.id,
        staffId,
        bookingDate: booking.bookingDate,
        totalAmount,
        services: services.map(id => id),
      }, spaId);

      // Send booking confirmation notification (async, non-blocking)
      (async () => {
        try {
          const spa = await storage.getSpaById(spaId);
          const staff = staffId ? await storage.getStaffById(staffId) : null;
          
          const templateData = {
            customerName: customer.name,
            spaName: spa?.name || 'Spa',
            spaAddress: spa?.address || undefined,
            spaPhone: spa?.contactPhone || undefined,
            bookingDate: date,
            bookingTime: time,
            services: selectedServices.map(s => ({
              name: s.name,
              duration: s.duration,
              price: String(s.price),
              currency: spa?.currency || 'AED',
            })),
            staffName: staff?.name || undefined,
            totalAmount: totalAmount.toFixed(2),
            currency: spa?.currency || 'AED',
            bookingId: booking.id,
            cancellationPolicy: spa?.cancellationPolicy 
              ? `${(spa.cancellationPolicy as any).description || 'Please check our cancellation policy.'}` 
              : undefined,
          };

          // Send customer notification
          await notificationService.sendNotification(
            spaId,
            'confirmation',
            { email: customer.email || undefined, phone: customer.phone || undefined },
            booking.id,
            templateData
          );

          // Send staff notification if staff is assigned
          if (staff && (staff.email || staff.phone)) {
            await notificationService.sendStaffNotification(
              spaId,
              'confirmation',
              { email: staff.email || undefined, phone: staff.phone || undefined },
              booking.id,
              {
                ...templateData,
                staffName: staff.name,
              }
            );
          }
        } catch (error) {
          console.error('Failed to send booking confirmation:', error);
        }
      })();

      res.json({ 
        success: true, 
        booking,
        customerId: customer.id 
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to create booking");
    }
  });

  // Get customer's bookings (requires authentication)
  app.get("/api/my-bookings", async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const customer = await storage.getCustomerByUserId(userId);
      if (!customer) {
        return res.json([]);
      }

      const bookings = await storage.getBookingsByCustomerId(customer.id);
      
      // Fetch related data for each booking
      const bookingsWithDetails = await Promise.all(
        bookings.map(async (booking) => {
          const bookingItems = await storage.getBookingItemsByBookingId(booking.id);
          const spa = await storage.getSpaById(booking.spaId);
          const staff = booking.staffId ? await storage.getStaffById(booking.staffId) : null;
          
          const allServices = await storage.getAllServices();
          const servicesData = bookingItems.map((item) => {
            return allServices.find((s: any) => s.id === item.serviceId);
          });

          return {
            ...booking,
            spa,
            staff,
            services: servicesData.filter((s: any) => s !== undefined),
            bookingItems,
          };
        })
      );

      res.json(bookingsWithDetails);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch bookings");
    }
  });

  // Cancel booking
  app.put("/api/bookings/:id/cancel", async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid booking ID" });
      }

      const booking = await storage.getBookingById(id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Check if user owns this booking
      const userId = (req.user as any)?.claims?.sub;
      if (userId) {
        const customer = await storage.getCustomerByUserId(userId);
        if (customer && customer.id !== booking.customerId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }

      // Check cancellation policy
      const spa = await storage.getSpaById(booking.spaId);
      const cancellationPolicy = spa?.cancellationPolicy as { hoursBeforeBooking?: number; description?: string } | null;
      
      if (cancellationPolicy?.hoursBeforeBooking) {
        const hoursUntilBooking = (new Date(booking.bookingDate).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilBooking < cancellationPolicy.hoursBeforeBooking) {
          return res.status(400).json({ 
            message: `Cannot cancel booking. Cancellation must be made at least ${cancellationPolicy.hoursBeforeBooking} hours before appointment.` 
          });
        }
      }

      const { reason } = req.body;
      
      const updated = await storage.updateBooking(id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason || null,
      });

      // Log booking cancellation to audit trail
      if (updated) {
        await AuditLogger.logUpdate(req, "booking", id, 
          { status: booking.status },
          { status: 'cancelled', reason },
          booking.spaId
        );
      }

      // Send booking cancellation notification (async, non-blocking)
      if (updated) {
        (async () => {
          try {
            const customer = await storage.getCustomerById(booking.customerId);
            const staff = booking.staffId ? await storage.getStaffById(booking.staffId) : null;
            const bookingItems = await storage.getBookingItemsByBookingId(id);
            const allServices = await storage.getAllServices();

            const servicesData = bookingItems.map((item) => {
              const service = allServices.find((s) => s.id === item.serviceId);
              return service ? {
                name: service.name,
                duration: item.duration,
                price: String(item.price),
                currency: spa?.currency || 'AED',
              } : null;
            }).filter(Boolean);

            const templateData = {
              customerName: customer?.name || 'Valued Customer',
              spaName: spa?.name || 'Spa',
              spaAddress: spa?.address || undefined,
              spaPhone: spa?.contactPhone || undefined,
              bookingDate: new Date(updated!.bookingDate).toISOString().split('T')[0],
              bookingTime: new Date(updated!.bookingDate).toTimeString().substring(0, 5),
              services: servicesData as any,
              staffName: staff?.name || undefined,
              totalAmount: String(updated!.totalAmount),
              currency: spa?.currency || 'AED',
              bookingId: updated!.id,
              notes: reason || undefined,
              cancellationPolicy: cancellationPolicy?.description || undefined,
            };

            // Send customer notification
            await notificationService.sendNotification(
              booking.spaId,
              'cancellation',
              { email: customer?.email || undefined, phone: customer?.phone || undefined },
              updated!.id,
              templateData
            );

            // Send staff notification if staff is assigned
            if (staff && (staff.email || staff.phone)) {
              await notificationService.sendStaffNotification(
                booking.spaId,
                'cancellation',
                { email: staff.email || undefined, phone: staff.phone || undefined },
                updated!.id,
                templateData
              );
            }
          } catch (error) {
            console.error('Failed to send booking cancellation notification:', error);
          }
        })();
      }

      res.json(updated);
    } catch (error) {
      handleRouteError(res, error, "Failed to cancel booking");
    }
  });

  // Modify booking
  app.put("/api/bookings/:id", async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid booking ID" });
      }

      const booking = await storage.getBookingById(id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Check if user owns this booking
      const userId = (req.user as any)?.claims?.sub;
      if (userId) {
        const customer = await storage.getCustomerByUserId(userId);
        if (customer && customer.id !== booking.customerId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }

      // Check cancellation policy for modifications
      const spa = await storage.getSpaById(booking.spaId);
      const cancellationPolicy = spa?.cancellationPolicy as { hoursBeforeBooking?: number; description?: string } | null;
      
      if (cancellationPolicy?.hoursBeforeBooking) {
        const hoursUntilBooking = (new Date(booking.bookingDate).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilBooking < cancellationPolicy.hoursBeforeBooking) {
          return res.status(400).json({ 
            message: `Cannot modify booking. Changes must be made at least ${cancellationPolicy.hoursBeforeBooking} hours before appointment.` 
          });
        }
      }

      const { date, time, staffId, notes } = req.body;
      const updates: any = {};

      if (date && time) {
        updates.bookingDate = new Date(`${date}T${time}:00`);
      }

      if (staffId !== undefined) {
        updates.staffId = staffId || null;
      }

      if (notes !== undefined) {
        updates.notes = notes;
      }

      if (Object.keys(updates).length > 0) {
        updates.status = 'modified';
      }

      const updated = await storage.updateBooking(id, updates);

      // Log booking modification to audit trail
      if (updated && Object.keys(updates).length > 0) {
        await AuditLogger.logUpdate(req, "booking", id, 
          {
            bookingDate: booking.bookingDate,
            staffId: booking.staffId,
            notes: booking.notes,
          },
          updates,
          booking.spaId
        );
      }

      // Send booking modification notification (async, non-blocking)
      if (updated && Object.keys(updates).length > 0) {
        (async () => {
          try {
            const customer = await storage.getCustomerById(booking.customerId);
            const bookingItems = await storage.getBookingItemsByBookingId(id);
            const allServices = await storage.getAllServices();
            const staff = updated!.staffId ? await storage.getStaffById(updated!.staffId) : null;

            const servicesData = bookingItems.map((item) => {
              const service = allServices.find((s) => s.id === item.serviceId);
              return service ? {
                name: service.name,
                duration: item.duration,
                price: String(item.price),
                currency: spa?.currency || 'AED',
              } : null;
            }).filter(Boolean);

            const templateData = {
              customerName: customer?.name || 'Valued Customer',
              spaName: spa?.name || 'Spa',
              spaAddress: spa?.address || undefined,
              spaPhone: spa?.contactPhone || undefined,
              bookingDate: date || new Date(updated!.bookingDate).toISOString().split('T')[0],
              bookingTime: time || new Date(updated!.bookingDate).toTimeString().substring(0, 5),
              services: servicesData as any,
              staffName: staff?.name || undefined,
              totalAmount: String(updated!.totalAmount),
              currency: spa?.currency || 'AED',
              bookingId: updated!.id,
              notes: updated!.notes || undefined,
            };

            // Send customer notification
            await notificationService.sendNotification(
              booking.spaId,
              'modification',
              { email: customer?.email || undefined, phone: customer?.phone || undefined },
              updated!.id,
              templateData
            );

            // Send staff notification if staff is assigned
            if (staff && (staff.email || staff.phone)) {
              await notificationService.sendStaffNotification(
                booking.spaId,
                'modification',
                { email: staff.email || undefined, phone: staff.phone || undefined },
                updated!.id,
                templateData
              );
            }
          } catch (error) {
            console.error('Failed to send booking modification notification:', error);
          }
        })();
      }

      res.json(updated);
    } catch (error) {
      handleRouteError(res, error, "Failed to modify booking");
    }
  });

  // Super Admin-only routes (protected with isSuperAdmin middleware)
  app.get("/api/super-admin/applications", isSuperAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      
      let applications;
      if (status && typeof status === 'string') {
        applications = await storage.getAdminApplicationsByStatus(status);
      } else {
        applications = await storage.getAllAdminApplications();
      }

      // Enrich applications with user data and reviewer data
      const enrichedApplications = await Promise.all(
        applications.map(async (app) => {
          const user = await storage.getUser(app.userId);
          let reviewer = null;
          if (app.reviewedBy) {
            const reviewerUser = await storage.getUser(app.reviewedBy);
            if (reviewerUser) {
              reviewer = {
                id: reviewerUser.id,
                email: reviewerUser.email,
                firstName: reviewerUser.firstName,
                lastName: reviewerUser.lastName,
              };
            }
          }
          return {
            ...app,
            user: user ? {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            } : null,
            reviewer,
          };
        })
      );

      res.json(enrichedApplications);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch admin applications");
    }
  });

  app.post("/api/super-admin/applications/:id/approve", isSuperAdmin, async (req, res) => {
    const id = parseNumericId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid application ID" });
    }

    try {

      const application = await storage.getAdminApplicationById(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      // Check if already reviewed
      if (application.status !== "pending") {
        return res.status(409).json({ message: "Application already reviewed" });
      }

      // Require business license for approval
      if (!application.licenseUrl) {
        return res.status(400).json({ message: "License document is required for approval" });
      }

      // Idempotent spa creation: check if spa already exists for this user
      let spa = await storage.getSpaByOwnerUserId(application.userId);
      
      if (!spa) {
        // Create new spa for this admin
        // Generate URL-friendly slug from business name
        const slug = application.businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') + '-' + Date.now();
        
        spa = await storage.createSpa({
          name: application.businessName,
          slug,
          businessType: application.businessType,
          ownerUserId: application.userId,
          setupComplete: false,
          setupSteps: {
            basicInfo: false,
            location: false,
            hours: false,
            services: false,
            staff: false,
            policies: false,
            inventory: false,
            activation: false,
          },
        } as any);
      }

      // Link admin to spa (idempotent - always update to ensure consistency)
      await storage.upsertUser({
        id: application.userId,
        status: 'approved',
        adminSpaId: spa.id,
      } as any);

      // Update application status with reviewer info
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      logger.info('Approving application', { applicationId: id, reviewerId: userId });
      
      await storage.updateAdminApplication(id, {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: userId,
      });
      
      await AuditLogger.logPrivilegeUse(req, 'approve_admin_application', application.userId, { applicationId: id, spaId: spa.id });

      res.json({ 
        message: "Admin application approved successfully",
        spaId: spa.id 
      });
    } catch (error) {
      logger.error('Approval error', {
        errorCode: (error as any).code,
        errorMessage: (error as any).message,
        applicationId: id,
      });
      handleRouteError(res, error, "Failed to approve admin application");
    }
  });

  app.post("/api/super-admin/applications/:id/reject", isSuperAdmin, async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      const { reason } = req.body;

      const application = await storage.getAdminApplicationById(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      // Update application status with reviewer info
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      logger.info('Rejecting application', { applicationId: id, reviewerId: userId, hasReason: !!reason });
      
      await storage.updateAdminApplication(id, {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: userId,
        rejectionReason: reason,
      });

      // Update user status
      await storage.upsertUser({
        id: application.userId,
        status: 'rejected',
      } as any);
      
      await AuditLogger.logPrivilegeUse(req, 'reject_admin_application', application.userId, { applicationId: id, reason });

      res.json({ message: "Admin application rejected successfully" });
    } catch (error) {
      logger.error('Error rejecting application', { error: error instanceof Error ? error.message : 'Unknown' });
      handleRouteError(res, error, "Failed to reject admin application");
    }
  });

  // Spa Setup Wizard endpoints (for approved admins)
  app.get("/api/admin/setup/status", isAdmin, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.adminSpaId) {
        return res.json({
          spaId: null,
          setupComplete: false,
          userEmail: user?.email, // Include user email for pre-filling contact email
          steps: {
            basicInfo: false,
            location: false,
            hours: false,
            services: false,
            staff: false,
            activation: false,
          },
        });
      }

      const spa = await storage.getSpaById(user.adminSpaId);
      if (!spa) {
        return res.status(404).json({ message: "Spa not found" });
      }

      const steps = (spa.setupSteps as any) || {
        basicInfo: false,
        location: false,
        hours: false,
        services: false,
        staff: false,
        activation: false,
      };

      res.json({
        spaId: spa.id,
        setupComplete: spa.setupComplete,
        userEmail: user.email, // Include user email for pre-filling contact email
        steps,
        spa,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch setup status");
    }
  });

  app.post("/api/admin/setup/step/:stepName", isAdmin, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      const { stepName } = req.params;
      const stepData = req.body;

      // If no spa exists yet, create one for basic info step
      let spaId = user?.adminSpaId;
      
      if (!spaId && stepName === "basicInfo") {
        // Atomically create spa and link admin user
        const result = await storage.createSpaWithAdmin(userId, {
          name: stepData.name,
          slug: stepData.slug || stepData.name.toLowerCase().replace(/\s+/g, '-'),
          description: stepData.description,
          contactEmail: stepData.contactEmail,
          contactPhone: stepData.contactPhone,
          currency: stepData.currency || 'AED',
          active: false, // Not active until setup is complete
          setupComplete: false,
          setupSteps: { basicInfo: true } as any,
        });
        
        spaId = result.spa.id;
      }

      if (!spaId) {
        return res.status(400).json({ message: "Spa not found. Please complete basic info first." });
      }

      const spa = await storage.getSpaById(spaId);
      if (!spa) {
        return res.status(404).json({ message: "Spa not found" });
      }

      const currentSteps = (spa.setupSteps as any) || {};
      
      // Update spa data based on step
      let updateData: any = {
        setupSteps: { ...currentSteps, [stepName]: true },
      };

      if (stepName === "basicInfo") {
        updateData = {
          ...updateData,
          name: stepData.name,
          slug: stepData.slug || stepData.name.toLowerCase().replace(/\s+/g, '-'),
          description: stepData.description,
          contactEmail: stepData.contactEmail,
          contactPhone: stepData.contactPhone,
          currency: stepData.currency || 'AED',
        };
      } else if (stepName === "location") {
        updateData = {
          ...updateData,
          address: stepData.address,
          city: stepData.city,
          area: stepData.area,
          latitude: stepData.latitude,
          longitude: stepData.longitude,
        };
      } else if (stepName === "hours") {
        updateData = {
          ...updateData,
          businessHours: stepData.businessHours,
        };
      } else if (stepName === "services") {
        // Create first service for the spa
        if (stepData.serviceName && stepData.serviceDuration && stepData.servicePrice) {
          await storage.createService({
            spaId,
            name: stepData.serviceName,
            description: stepData.serviceDescription || null,
            duration: parseInt(stepData.serviceDuration),
            price: stepData.servicePrice,
            categoryId: null, // Will be set later from dashboard
          });
        }
      } else if (stepName === "staff") {
        // Create first staff member for the spa
        if (stepData.staffFirstName && stepData.staffEmail) {
          const staffName = stepData.staffLastName 
            ? `${stepData.staffFirstName} ${stepData.staffLastName}`.trim()
            : stepData.staffFirstName;
          
          await storage.createStaff({
            spaId,
            name: staffName,
            email: stepData.staffEmail,
            phone: stepData.staffPhone || null,
            role: 'basic',
          });
        }
      } else if (stepName === "activation") {
        // Activation step just marks the step as complete
        // No additional data to update
      }

      const updated = await storage.updateSpa(spaId, updateData);
      res.json(updated);
    } catch (error) {
      handleRouteError(res, error, "Failed to save setup step");
    }
  });

  app.post("/api/admin/setup/complete", isAdmin, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }

      const spa = await storage.getSpaById(user.adminSpaId);
      if (!spa) {
        return res.status(404).json({ message: "Spa not found" });
      }

      const steps = (spa.setupSteps as any) || {};
      // Require all essential steps except activation (which is being completed now)
      const allStepsComplete = steps.basicInfo && steps.location && steps.hours && steps.services && steps.staff;

      if (!allStepsComplete) {
        const requiredSteps = ['basicInfo', 'location', 'hours', 'services', 'staff'];
        const missingRequiredSteps = requiredSteps.filter(step => !steps[step]);
        
        return res.status(400).json({ 
          message: "All required setup steps must be completed first",
          missingSteps: missingRequiredSteps
        });
      }

      const updated = await storage.updateSpa(user.adminSpaId, {
        setupComplete: true,
        active: true, // Activate spa after setup
        setupSteps: {
          ...(spa.setupSteps as any),
          activation: true, // Mark activation step as complete
        },
      });

      res.json({ message: "Spa setup completed successfully", spa: updated });
    } catch (error) {
      handleRouteError(res, error, "Failed to complete setup");
    }
  });

  // Admin-only routes (protected with isAdmin middleware)
  app.get("/api/admin/check", isAdmin, async (req, res) => {
    res.json({ message: "Admin access granted" });
  });

  // Spa Settings routes
  app.get("/api/admin/settings", isAdmin, async (req, res) => {
    try {
      const settings = await storage.getSpaSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Error fetching spa settings", { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).json({ message: "Failed to fetch spa settings" });
    }
  });

  app.put("/api/admin/settings", isAdmin, async (req, res) => {
    try {
      logger.debug("PUT /api/admin/settings - updating settings");
      const validatedData = insertSpaSettingsSchema.partial().parse(req.body);
      const settings = await storage.updateSpaSettings(validatedData as any);
      logger.info("Spa settings updated successfully");
      res.json(settings);
    } catch (error) {
      logger.error("PUT /api/admin/settings - Error", { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).json({ message: "Failed to update spa settings" });
    }
  });

  // VAT Settings routes
  app.get("/api/admin/vat-settings", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }
      
      const spa = await storage.getSpaById(user.adminSpaId);
      if (!spa) {
        return res.status(404).json({ message: "Spa not found" });
      }
      
      res.json({
        vatEnabled: spa.vatEnabled || false,
        taxRegistrationNumber: spa.taxRegistrationNumber || null,
        vatRegistrationDate: spa.vatRegistrationDate || null,
      });
    } catch (error) {
      logger.error("Error fetching VAT settings", { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).json({ message: "Failed to fetch VAT settings" });
    }
  });

  app.put("/api/admin/vat-settings", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }

      const { vatEnabled, taxRegistrationNumber } = req.body;

      // Validate TRN if VAT is being enabled
      if (vatEnabled && taxRegistrationNumber) {
        const { validateTRN } = await import("./invoiceUtils");
        const validation = validateTRN(taxRegistrationNumber);
        if (!validation.valid) {
          return res.status(400).json({ message: validation.error });
        }
      }

      // If enabling VAT, TRN is required
      if (vatEnabled && !taxRegistrationNumber) {
        return res.status(400).json({ 
          message: "Tax Registration Number is required when enabling VAT" 
        });
      }

      const updateData: any = {
        vatEnabled: vatEnabled || false,
        taxRegistrationNumber: taxRegistrationNumber || null,
      };

      // Set registration date only when first enabling VAT
      if (vatEnabled && taxRegistrationNumber) {
        const spa = await storage.getSpaById(user.adminSpaId);
        if (!spa?.vatEnabled) {
          updateData.vatRegistrationDate = new Date();
        }
      }

      const updatedSpa = await storage.updateSpa(user.adminSpaId, updateData);
      
      res.json({
        vatEnabled: updatedSpa?.vatEnabled || false,
        taxRegistrationNumber: updatedSpa?.taxRegistrationNumber || null,
        vatRegistrationDate: updatedSpa?.vatRegistrationDate || null,
      });
    } catch (error) {
      console.error("Error updating VAT settings:", error);
      res.status(500).json({ message: "Failed to update VAT settings" });
    }
  });

  // VAT Threshold Reminder routes
  app.get("/api/admin/vat-threshold-reminder", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }

      const spa = await storage.getSpaById(user.adminSpaId);
      if (!spa) {
        return res.status(404).json({ message: "Spa not found" });
      }

      // Get all invoices for the spa to calculate current year revenue
      const invoices = await storage.getInvoicesBySpaId(user.adminSpaId);
      
      const { checkVATThreshold } = await import("./revenueUtils");
      const thresholdAmount = parseFloat(spa.vatThresholdAmount || "375000");
      const thresholdCheck = checkVATThreshold(invoices, thresholdAmount);

      res.json({
        vatThresholdReminderEnabled: spa.vatThresholdReminderEnabled || false,
        vatThresholdAmount: spa.vatThresholdAmount || "375000.00",
        currentYearRevenue: thresholdCheck.annualRevenue,
        percentageOfThreshold: thresholdCheck.percentageOfThreshold,
        thresholdReached: thresholdCheck.thresholdReached,
        remainingToThreshold: thresholdCheck.remainingToThreshold,
      });
    } catch (error) {
      console.error("Error fetching VAT threshold reminder settings:", error);
      res.status(500).json({ message: "Failed to fetch threshold reminder settings" });
    }
  });

  app.put("/api/admin/vat-threshold-reminder", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }

      const { vatThresholdReminderEnabled, vatThresholdAmount } = req.body;

      // Validate threshold amount
      const amount = parseFloat(vatThresholdAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ 
          message: "Invalid threshold amount. Must be a positive number." 
        });
      }

      const updateData: any = {
        vatThresholdReminderEnabled: vatThresholdReminderEnabled || false,
        vatThresholdAmount: vatThresholdAmount,
      };

      const updatedSpa = await storage.updateSpa(user.adminSpaId, updateData);
      
      res.json({
        vatThresholdReminderEnabled: updatedSpa?.vatThresholdReminderEnabled || false,
        vatThresholdAmount: updatedSpa?.vatThresholdAmount || "375000.00",
      });
    } catch (error) {
      console.error("Error updating VAT threshold reminder settings:", error);
      res.status(500).json({ message: "Failed to update threshold reminder settings" });
    }
  });

  // Invoice Management routes
  app.delete("/api/admin/invoices/:id", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }

      const invoiceId = parseNumericId(req.params.id);
      if (invoiceId === null) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      // Get invoice to check retention requirements
      const invoice = await storage.getInvoiceById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Verify invoice belongs to admin's spa
      if (invoice.spaId !== user.adminSpaId) {
        return res.status(403).json({ message: "Unauthorized access to invoice" });
      }

      // Check FTA retention requirements
      const { canDeleteInvoice } = await import("./invoiceUtils");
      const retentionCheck = canDeleteInvoice({
        retentionDate: invoice.retentionDate,
        issueDate: invoice.issueDate,
      });

      if (!retentionCheck.canDelete) {
        return res.status(400).json({ 
          message: retentionCheck.reason,
          retentionRequired: true,
        });
      }

      // Delete invoice
      const deleted = await storage.deleteInvoice(invoiceId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete invoice" });
      }

      // Log deletion to audit trail
      await AuditLogger.logDelete(req, "invoice", invoiceId, {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        customerId: invoice.customerId,
      }, user.adminSpaId);

      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // Notification Settings routes
  app.get("/api/admin/notification-settings", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }
      
      const settings = await storage.getNotificationSettings(user.adminSpaId);
      res.json(settings || {});
    } catch (error) {
      console.error("Error fetching notification settings:", error);
      res.status(500).json({ message: "Failed to fetch notification settings" });
    }
  });

  app.put("/api/admin/notification-settings", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as any)?.id);
      if (!user?.adminSpaId) {
        return res.status(400).json({ message: "No spa found" });
      }
      
      const settings = await storage.upsertNotificationSettings(user.adminSpaId, req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ message: "Failed to update notification settings" });
    }
  });

  // Service Category routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/service-categories", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const categories = await storage.getServiceCategoriesBySpaId(req.adminSpa.id);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching service categories:", error);
      res.status(500).json({ message: "Failed to fetch service categories" });
    }
  });

  app.post("/api/admin/service-categories", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      // Inject spaId from admin's spa (from middleware)
      const validatedData = insertServiceCategorySchema.parse({
        ...req.body,
        spaId: req.adminSpa.id,
      });
      const category = await storage.createServiceCategory(validatedData);
      res.json(category);
    } catch (error) {
      console.error("Error creating service category:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
      }
      handleRouteError(res, error, "Failed to create service category");
    }
  });

  app.put("/api/admin/service-categories/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      
      const validatedData = insertServiceCategorySchema.partial().parse(req.body);
      const category = await storage.updateServiceCategory(id, validatedData);
      if (!category) {
        return res.status(404).json({ message: "Service category not found" });
      }
      res.json(category);
    } catch (error) {
      handleRouteError(res, error, "Failed to update service category");
    }
  });

  app.delete("/api/admin/service-categories/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      
      const deleted = await storage.deleteServiceCategory(id);
      if (!deleted) {
        return res.status(404).json({ message: "Service category not found" });
      }
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete service category");
    }
  });

  // Service routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/services", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const services = await storage.getServicesBySpaId(req.adminSpa.id);
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.post("/api/admin/services", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      // Inject spaId from admin's spa (from middleware)
      const validatedData = insertServiceSchema.parse({
        ...req.body,
        spaId: req.adminSpa.id,
      });
      const service = await storage.createService(validatedData);
      
      // Log service creation to audit trail
      await AuditLogger.logCreate(req, "service", service.id, validatedData, validatedData.spaId);
      
      res.json(service);
    } catch (error) {
      console.error("Error creating service:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
      }
      handleRouteError(res, error, "Failed to create service");
    }
  });

  app.put("/api/admin/services/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
      
      const before = await storage.getService(id);
      const validatedData = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(id, validatedData);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      // Log service update to audit trail
      if (before) {
        await AuditLogger.logUpdate(req, "service", id, before, validatedData, service.spaId);
      }
      
      res.json(service);
    } catch (error) {
      handleRouteError(res, error, "Failed to update service");
    }
  });

  app.delete("/api/admin/services/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
      
      const service = await storage.getService(id);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      // IDOR Protection: Verify ownership before delete
      if (service.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteService(id);
      if (!deleted) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      // Log service deletion to audit trail
      await AuditLogger.logDelete(req, "service", id, service, service.spaId);
      
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete service");
    }
  });

  // Membership routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/memberships", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const memberships = await storage.getMembershipsBySpaId(req.adminSpa.id);
      res.json(memberships);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch memberships");
    }
  });

  app.get("/api/admin/memberships/:id", isAdmin, async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid membership ID" });
      }
      
      const membership = await storage.getMembershipById(id);
      if (!membership) {
        return res.status(404).json({ message: "Membership not found" });
      }
      
      // Get linked services for this membership
      const membershipServices = await storage.getMembershipServices(id);
      
      res.json({ ...membership, linkedServices: membershipServices });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch membership");
    }
  });

  app.post("/api/admin/memberships", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const { serviceIds, ...membershipData } = req.body;
      
      // Inject spaId from admin's spa
      const validatedData = insertMembershipSchema.parse({
        ...membershipData,
        spaId: req.adminSpa.id,
      });
      
      const membership = await storage.createMembership(validatedData);
      
      // Link services to membership
      if (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) {
        for (const serviceId of serviceIds) {
          await storage.createMembershipService({
            membershipId: membership.id,
            serviceId: Number(serviceId),
          });
        }
      }
      
      // Log membership creation
      await AuditLogger.logCreate(req, "membership", membership.id, validatedData, validatedData.spaId);
      
      res.json(membership);
    } catch (error) {
      handleRouteError(res, error, "Failed to create membership");
    }
  });

  app.put("/api/admin/memberships/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid membership ID" });
      }
      
      const { serviceIds, ...membershipData } = req.body;
      
      const before = await storage.getMembershipById(id);
      const validatedData = insertMembershipSchema.partial().parse(membershipData);
      const membership = await storage.updateMembership(id, validatedData);
      
      if (!membership) {
        return res.status(404).json({ message: "Membership not found" });
      }
      
      // Update linked services if provided
      if (serviceIds !== undefined && Array.isArray(serviceIds)) {
        // Remove all existing services
        await storage.deleteMembershipServicesByMembershipId(id);
        
        // Add new services
        for (const serviceId of serviceIds) {
          await storage.createMembershipService({
            membershipId: id,
            serviceId: Number(serviceId),
          });
        }
      }
      
      // Log membership update
      if (before) {
        await AuditLogger.logUpdate(req, "membership", id, before, validatedData, membership.spaId);
      }
      
      res.json(membership);
    } catch (error) {
      handleRouteError(res, error, "Failed to update membership");
    }
  });

  app.delete("/api/admin/memberships/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid membership ID" });
      }
      
      const membership = await storage.getMembershipById(id);
      
      // Delete linked services first
      await storage.deleteMembershipServicesByMembershipId(id);
      
      const deleted = await storage.deleteMembership(id);
      if (!deleted) {
        return res.status(404).json({ message: "Membership not found" });
      }
      
      // Log membership deletion
      if (membership) {
        await AuditLogger.logDelete(req, "membership", id, membership, membership.spaId);
      }
      
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete membership");
    }
  });

  // Customer Membership routes
  app.get("/api/admin/customer-memberships", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const customerMemberships = await storage.getCustomerMembershipsBySpaId(req.adminSpa.id);
      res.json(customerMemberships);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch customer memberships");
    }
  });

  app.get("/api/admin/customer-memberships/customer/:customerId", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const customerId = parseNumericId(req.params.customerId);
      if (!customerId) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      // IDOR protection: verify customer belongs to admin's spa
      const customer = await storage.getCustomerById(customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const customerMemberships = await storage.getCustomerMembershipsByCustomerId(customerId);
      res.json(customerMemberships);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch customer memberships");
    }
  });

  app.post("/api/admin/customer-memberships", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const validatedData = insertCustomerMembershipSchema.parse(req.body);
      const customerMembership = await storage.createCustomerMembership(validatedData);
      
      // Log customer membership creation
      await AuditLogger.logCreate(req, "customer_membership", customerMembership.id, validatedData, req.adminSpa.id);
      
      res.json(customerMembership);
    } catch (error) {
      handleRouteError(res, error, "Failed to create customer membership");
    }
  });

  app.put("/api/admin/customer-memberships/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid customer membership ID" });
      }
      
      const before = await storage.getCustomerMembershipById(id);
      if (!before) {
        return res.status(404).json({ message: "Customer membership not found" });
      }
      // IDOR protection: verify ownership via customer's spaId
      const customer = await storage.getCustomerById(before.customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertCustomerMembershipSchema.partial().parse(req.body);
      const customerMembership = await storage.updateCustomerMembership(id, validatedData);
      
      if (!customerMembership) {
        return res.status(404).json({ message: "Customer membership not found or deleted" });
      }
      
      // Log update
      await AuditLogger.logUpdate(req, "customer_membership", id, before, validatedData, req.adminSpa.id);
      
      res.json(customerMembership);
    } catch (error) {
      handleRouteError(res, error, "Failed to update customer membership");
    }
  });

  // Membership usage tracking
  app.get("/api/admin/membership-usage/:customerMembershipId", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const customerMembershipId = parseNumericId(req.params.customerMembershipId);
      if (!customerMembershipId) {
        return res.status(400).json({ message: "Invalid customer membership ID" });
      }
      // IDOR protection: verify ownership via customer membership's customer
      const membership = await storage.getCustomerMembershipById(customerMembershipId);
      if (!membership) {
        return res.status(404).json({ message: "Customer membership not found" });
      }
      const customer = await storage.getCustomerById(membership.customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const usage = await storage.getMembershipUsageByCustomerMembershipId(customerMembershipId);
      res.json(usage);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch membership usage");
    }
  });

  app.post("/api/admin/membership-usage", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const validatedData = insertMembershipUsageSchema.parse(req.body);
      
      // IDOR protection: verify ownership via customer membership's customer
      const customerMembership = await storage.getCustomerMembershipById(validatedData.customerMembershipId);
      if (!customerMembership) {
        return res.status(404).json({ message: "Customer membership not found" });
      }
      const customer = await storage.getCustomerById(customerMembership.customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const usage = await storage.createMembershipUsage(validatedData);
      
      // Update remaining sessions for limited memberships
      if (customerMembership.sessionsRemaining !== null) {
        await storage.updateCustomerMembership(validatedData.customerMembershipId, {
          sessionsRemaining: Math.max(0, customerMembership.sessionsRemaining - 1),
        });
      }
      
      res.json(usage);
    } catch (error) {
      handleRouteError(res, error, "Failed to record membership usage");
    }
  });

  // Staff routes
  // Staff routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/staff", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const staff = await storage.getStaffBySpaId(req.adminSpa.id);
      res.json(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.post("/api/admin/staff", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      // Inject spaId from admin's spa (from middleware)
      const validatedData = insertStaffSchema.parse({
        ...req.body,
        spaId: req.adminSpa.id,
      });
      const staffMember = await storage.createStaff(validatedData);
      
      // Log staff creation to audit trail
      await AuditLogger.logCreate(req, "staff", staffMember.id, validatedData, validatedData.spaId);
      
      res.json(staffMember);
    } catch (error) {
      console.error("Error creating staff member:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
      }
      handleRouteError(res, error, "Failed to create staff member");
    }
  });

  app.put("/api/admin/staff/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      
      const before = await storage.getStaffById(id);
      const validatedData = insertStaffSchema.partial().parse(req.body);
      const staffMember = await storage.updateStaff(id, validatedData);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      
      // Log staff update to audit trail
      if (before) {
        await AuditLogger.logUpdate(req, "staff", id, before, validatedData, staffMember.spaId);
      }
      
      res.json(staffMember);
    } catch (error) {
      handleRouteError(res, error, "Failed to update staff member");
    }
  });

  app.delete("/api/admin/staff/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      
      const staffMember = await storage.getStaffById(id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      
      // IDOR Protection: Verify ownership before delete
      if (staffMember.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteStaff(id);
      if (!deleted) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      
      // Log staff deletion to audit trail
      await AuditLogger.logDelete(req, "staff", id, staffMember, staffMember.spaId);
      
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete staff member");
    }
  });

  // Staff Schedule routes
  app.get("/api/admin/staff/:staffId/schedules", isAdmin, async (req, res) => {
    try {
      const staffId = parseNumericId(req.params.staffId);
      if (staffId === null) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const schedules = await storage.getStaffSchedules(staffId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching staff schedules:", error);
      res.status(500).json({ message: "Failed to fetch staff schedules" });
    }
  });

  app.post("/api/admin/staff/:staffId/schedules", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const staffId = parseNumericId(req.params.staffId);
      if (staffId === null) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const validatedData = insertStaffScheduleSchema.parse({ ...req.body, staffId });
      const schedule = await storage.createStaffSchedule(validatedData);
      res.json(schedule);
    } catch (error) {
      console.error("Error creating staff schedule:", error);
      res.status(500).json({ message: "Failed to create staff schedule" });
    }
  });

  app.delete("/api/admin/staff/:staffId/schedules/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid schedule ID" });
      }
      const deleted = await storage.deleteStaffSchedule(id);
      if (!deleted) {
        return res.status(404).json({ message: "Staff schedule not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting staff schedule:", error);
      res.status(500).json({ message: "Failed to delete staff schedule" });
    }
  });

  // Staff Timesheet routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/timesheets", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const filters: any = {
        spaId: req.adminSpa.id  // Always filter by admin's spa
      };
      
      if (req.query.staffId) {
        filters.staffId = parseNumericId(req.query.staffId);
      }
      if (req.query.status) {
        filters.status = req.query.status;
      }
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate);
      }
      
      const timesheets = await storage.getAllTimesheets(filters);
      res.json(timesheets);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch timesheets");
    }
  });

  app.get("/api/admin/staff/:staffId/timesheets", isAdmin, async (req, res) => {
    try {
      const staffId = parseNumericId(req.params.staffId);
      if (!staffId) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const timesheets = await storage.getStaffTimesheets(staffId, startDate, endDate);
      res.json(timesheets);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch staff timesheets");
    }
  });

  app.post("/api/admin/timesheets", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const validatedData = insertStaffTimeEntrySchema.parse({ ...req.body, spaId: req.adminSpaId });
      const timesheet = await storage.createTimesheet(validatedData);
      
      // Log to audit trail
      await AuditLogger.logCreate(req, "staff_timesheet", timesheet.id, timesheet, req.adminSpaId);
      
      res.json(timesheet);
    } catch (error) {
      handleRouteError(res, error, "Failed to create timesheet");
    }
  });

  app.put("/api/admin/timesheets/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid timesheet ID" });
      }
      
      const validatedData = insertStaffTimeEntrySchema.partial().parse(req.body);
      const timesheet = await storage.updateTimesheet(id, validatedData);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Log to audit trail
      await AuditLogger.logUpdate(req, "staff_timesheet", id, validatedData, timesheet, req.adminSpaId);
      
      res.json(timesheet);
    } catch (error) {
      handleRouteError(res, error, "Failed to update timesheet");
    }
  });

  app.post("/api/admin/timesheets/:id/approve", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid timesheet ID" });
      }
      
      const userId = req.user.claims.sub;
      const timesheet = await storage.approveTimesheet(id, userId);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Log to audit trail
      await AuditLogger.logUpdate(req, "staff_timesheet", id, { status: 'approved' }, timesheet, req.adminSpaId);
      
      res.json(timesheet);
    } catch (error) {
      handleRouteError(res, error, "Failed to approve timesheet");
    }
  });

  app.post("/api/admin/timesheets/:id/reject", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid timesheet ID" });
      }
      
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      
      const userId = req.user.claims.sub;
      const timesheet = await storage.rejectTimesheet(id, userId, reason);
      
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Log to audit trail
      await AuditLogger.logUpdate(req, "staff_timesheet", id, { status: 'rejected', notes: reason }, timesheet, req.adminSpaId);
      
      res.json(timesheet);
    } catch (error) {
      handleRouteError(res, error, "Failed to reject timesheet");
    }
  });

  app.delete("/api/admin/timesheets/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "Invalid timesheet ID" });
      }
      
      const timesheet = await storage.getTimesheetById(id);
      const deleted = await storage.deleteTimesheet(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      
      // Log to audit trail
      if (timesheet) {
        await AuditLogger.logDelete(req, "staff_timesheet", id, timesheet, req.adminSpaId);
      }
      
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete timesheet");
    }
  });

  // Staff clock in/out routes (for mobile/staff portal)
  app.post("/api/staff/clock-in", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const staffMember = await getStaffByUserId(userId);
      
      if (!staffMember) {
        return res.status(404).json({ error: "Staff profile not found" });
      }
      
      const { latitude, longitude } = req.body;
      const location = (latitude && longitude) ? { latitude, longitude } : undefined;
      
      const timesheet = await storage.clockIn(staffMember.id, staffMember.spaId, location);
      res.json(timesheet);
    } catch (error) {
      handleRouteError(res, error, "Failed to clock in");
    }
  });

  app.post("/api/staff/clock-out", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const staffMember = await getStaffByUserId(userId);
      
      if (!staffMember) {
        return res.status(404).json({ error: "Staff profile not found" });
      }
      
      // Find the open timesheet for this staff member
      const timesheets = await storage.getStaffTimesheets(staffMember.id);
      const openTimesheet = timesheets.find(t => !t.clockOut);
      
      if (!openTimesheet) {
        return res.status(400).json({ error: "No open timesheet found. Please clock in first." });
      }
      
      const { latitude, longitude } = req.body;
      const location = (latitude && longitude) ? { latitude, longitude } : undefined;
      
      const timesheet = await storage.clockOut(openTimesheet.id, location);
      res.json(timesheet);
    } catch (error) {
      handleRouteError(res, error, "Failed to clock out");
    }
  });

  // Product routes
  // Product routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/products", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const products = await storage.getProductsBySpaId(req.adminSpa.id);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/admin/products", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const validatedData = insertProductSchema.parse({
        ...req.body,
        spaId: req.adminSpa.id  // Enforce tenant isolation
      });
      const product = await storage.createProduct(validatedData);
      res.json(product);
    } catch (error) {
      handleRouteError(res, error, "Failed to create product");
    }
  });

  app.put("/api/admin/products/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      // IDOR Protection: Verify ownership before update
      const existingProduct = await storage.getProductById(id);
      if (!existingProduct) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (existingProduct.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(id, validatedData);
      res.json(product);
    } catch (error) {
      handleRouteError(res, error, "Failed to update product");
    }
  });

  app.delete("/api/admin/products/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const product = await storage.getProductById(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // IDOR Protection: Verify ownership before delete
      if (product.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Promo Code routes - with tenant isolation
  app.get("/api/admin/promo-codes", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const promoCodes = await storage.getAllPromoCodes(req.adminSpa.id);
      res.json(promoCodes);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch promo codes");
    }
  });

  app.post("/api/admin/promo-codes", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertPromoCodeSchema.parse({
        ...req.body,
        spaId: req.adminSpa.id,
        createdBy: userId,
      });
      const promoCode = await storage.createPromoCode(validatedData);
      
      await AuditLogger.logCreate(req, "promo_code", promoCode.id, validatedData, req.adminSpa.id);
      
      res.json(promoCode);
    } catch (error) {
      handleRouteError(res, error, "Failed to create promo code");
    }
  });

  app.put("/api/admin/promo-codes/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid promo code ID" });
      }
      
      // IDOR Protection: Verify ownership before update
      const existing = await storage.getPromoCodeById(id);
      if (!existing) {
        return res.status(404).json({ message: "Promo code not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertPromoCodeSchema.partial().parse(req.body);
      const promoCode = await storage.updatePromoCode(id, validatedData);
      
      await AuditLogger.logUpdate(req, "promo_code", id, existing, validatedData, req.adminSpa.id);
      
      res.json(promoCode);
    } catch (error) {
      handleRouteError(res, error, "Failed to update promo code");
    }
  });

  app.delete("/api/admin/promo-codes/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid promo code ID" });
      }
      
      // IDOR Protection: Verify ownership before delete
      const existing = await storage.getPromoCodeById(id);
      if (!existing) {
        return res.status(404).json({ message: "Promo code not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deletePromoCode(id);
      
      await AuditLogger.logDelete(req, "promo_code", id, existing, req.adminSpa.id);
      
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete promo code");
    }
  });

  // Customer-facing promo code validation
  app.post("/api/promo-codes/validate", async (req, res) => {
    try {
      const { code, spaId, serviceIds } = req.body;
      
      if (!code || !spaId || !serviceIds || !Array.isArray(serviceIds)) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const validation = await storage.validatePromoCode(code, spaId, serviceIds);
      res.json(validation);
    } catch (error) {
      handleRouteError(res, error, "Failed to validate promo code");
    }
  });

  // Booking routes - with staff permission enforcement
  app.get("/api/admin/bookings", requireStaffRole(staffRoles.VIEW_OWN), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admins see all bookings
      const isAdminUser = user?.role === "admin" || user?.role === "super_admin";
      
      let bookings = await storage.getAllBookings();
      
      // For staff, filter based on role
      if (!isAdminUser) {
        const staffMember = await getStaffByUserId(userId);
        if (!staffMember) {
          return res.status(403).json({ error: "Access denied" });
        }

        const role = staffMember.role || staffRoles.BASIC;
        
        // If VIEW_OWN, only show own bookings
        if (!canViewStaffCalendar(role, staffMember.id, -1)) {
          bookings = bookings.filter(b => b.staffId === staffMember.id);
        }
        // If VIEW_ALL or higher, show all bookings (no filter needed)
      }
      
      // Enrich bookings with related data
      const enrichedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const customer = await storage.getCustomerById(booking.customerId);
          const staff = booking.staffId ? await storage.getStaffById(booking.staffId) : null;
          const bookingItems = await storage.getBookingItemsByBookingId(booking.id);
          
          const allServices = await storage.getAllServices();
          const services = bookingItems.map((item) => {
            return allServices.find((s: any) => s.id === item.serviceId);
          }).filter(Boolean);

          return {
            ...booking,
            customer,
            staff,
            services,
            bookingItems,
          };
        })
      );

      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const validatedBooking = insertBookingSchema.parse(req.body.booking);
      const booking = await storage.createBooking(validatedBooking);
      
      // Create booking items
      const createdItems = [];
      if (req.body.items && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
          const validatedItem = insertBookingItemSchema.parse({
            ...item,
            bookingId: booking.id,
          });
          const createdItem = await storage.createBookingItem(validatedItem);
          createdItems.push(createdItem);
        }
      }
      
      res.json(booking);
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.put("/api/admin/bookings/:id", requireStaffRole(staffRoles.MANAGE_BOOKINGS), async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid booking ID" });
      }

      // Extract services BEFORE Zod parsing (which strips unknown fields)
      const services = req.body.services;

      const validatedData = insertBookingSchema.partial().parse(req.body);
      const booking = await storage.updateBooking(id, validatedData);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const updatedItems = [];
      // Update booking items if services are provided
      if (services && Array.isArray(services)) {
        // Delete existing booking items
        const existingItems = await storage.getBookingItemsByBookingId(id);
        for (const item of existingItems) {
          await storage.deleteBookingItem(item.id);
        }

        // Create new booking items
        for (const service of services) {
          const serviceDetails = await storage.getService(service.serviceId);
          const validatedItem = insertBookingItemSchema.parse({
            bookingId: id,
            serviceId: service.serviceId,
            staffId: validatedData.staffId || null,
            price: serviceDetails?.price || "0",
            duration: service.duration,
          });
          const item = await storage.createBookingItem(validatedItem);
          updatedItems.push(item);
        }
      }

      res.json(booking);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid booking data", errors: error.errors });
      }
      console.error("Error updating booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  app.delete("/api/admin/bookings/:id", requireStaffRole(staffRoles.MANAGE_BOOKINGS), async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid booking ID" });
      }

      // Get booking before deletion to check for calendar event
      const booking = await storage.getBookingById(id);

      const deleted = await storage.deleteBooking(id);
      if (!deleted) {
        return res.status(404).json({ message: "Booking not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ message: "Failed to delete booking" });
    }
  });

  // Booking Items routes
  app.get("/api/admin/booking-items", isAdmin, async (req, res) => {
    try {
      const items = await storage.getAllBookingItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching booking items:", error);
      res.status(500).json({ message: "Failed to fetch booking items" });
    }
  });

  app.get("/api/admin/bookings/:bookingId/items", isAdmin, async (req, res) => {
    try {
      const bookingId = parseNumericId(req.params.bookingId);
      if (bookingId === null) {
        return res.status(400).json({ message: "Invalid booking ID" });
      }
      const items = await storage.getBookingItemsByBookingId(bookingId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching booking items:", error);
      res.status(500).json({ message: "Failed to fetch booking items" });
    }
  });

  // Customer routes
  // Customer routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/customers", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const customers = await storage.getCustomersBySpaId(req.adminSpa.id);
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.post("/api/admin/customers", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const validatedData = insertCustomerSchema.parse({
        ...req.body,
        spaId: req.adminSpa.id  // Enforce tenant isolation
      });
      const customer = await storage.createCustomer(validatedData);
      await AuditLogger.logCreate(req, "customer", customer.id, validatedData, req.adminSpa.id);
      res.json(customer);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to create customer");
    }
  });

  app.put("/api/admin/customers/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      
      // IDOR Protection: Verify ownership before update
      const existing = await storage.getCustomerById(id);
      if (!existing) {
        return res.status(404).json({ message: "Customer not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(id, validatedData);
      res.json(customer);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to update customer");
    }
  });

  app.delete("/api/admin/customers/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      
      const customer = await storage.getCustomerById(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      // IDOR Protection: Verify ownership before delete
      if (customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteCustomer(id);
      if (!deleted) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      handleRouteError(res, error, "Failed to delete customer");
    }
  });

  // Block customer
  app.post("/api/admin/customers/:id/block", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      
      const { reason } = req.body;
      if (!reason || reason.trim() === "") {
        return res.status(400).json({ message: "Blocking reason is required" });
      }

      const user = req.user as any;
      const customer = await storage.blockCustomer(id, reason, user.claims.sub);
      
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Audit log
      await AuditLogger.logAction(req, 'BLOCK', 'customer', id, {
        customerId: id,
        reason,
        customerName: customer.name,
      });

      res.json(customer);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to block customer");
    }
  });

  // Unblock customer
  app.post("/api/admin/customers/:id/unblock", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const customer = await storage.unblockCustomer(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Audit log
      await AuditLogger.logAction(req, 'UNBLOCK', 'customer', id, {
        customerId: id,
        customerName: customer.name,
      });

      res.json(customer);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to unblock customer");
    }
  });

  // Merge customers
  app.post("/api/admin/customers/merge", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const { primaryId, duplicateId } = req.body;
      
      if (!primaryId || !duplicateId) {
        return res.status(400).json({ message: "Both primaryId and duplicateId are required" });
      }

      if (primaryId === duplicateId) {
        return res.status(400).json({ message: "Cannot merge a customer with itself" });
      }

      const customer = await storage.mergeCustomers(primaryId, duplicateId);
      
      if (!customer) {
        return res.status(404).json({ message: "One or both customers not found" });
      }

      // Audit log
      await AuditLogger.logAction(req, 'MERGE', 'customer', primaryId, {
        primaryId,
        duplicateId,
        resultCustomerName: customer.name,
      });

      res.json(customer);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to merge customers");
    }
  });

  // Get wallet transactions for a customer
  app.get("/api/admin/customers/:id/wallet", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const customerId = parseNumericId(req.params.id);
      if (customerId === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const transactions = await storage.getWalletTransactions(customerId);
      res.json(transactions);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to fetch wallet transactions");
    }
  });

  // Add wallet credit to customer
  app.post("/api/admin/customers/:id/wallet/credit", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const customerId = parseNumericId(req.params.id);
      if (customerId === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const { amount, description, source, referenceId } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than zero" });
      }

      if (!description) {
        return res.status(400).json({ message: "Description is required" });
      }

      const user = req.user as any;
      const spaId = (req as any).adminSpa?.id;

      const transaction = await storage.addWalletCredit(
        customerId,
        parseFloat(amount),
        spaId,
        source || 'manual_adjustment',
        description,
        user.claims.sub,
        referenceId
      );

      // Audit log
      await AuditLogger.logAction(req, 'CREATE', 'customer', customerId, {
        action: 'wallet_credit_add',
        amount,
        description,
        newBalance: transaction.balanceAfter,
      });

      res.json(transaction);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to add wallet credit");
    }
  });

  // Deduct wallet credit from customer
  app.post("/api/admin/customers/:id/wallet/debit", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const customerId = parseNumericId(req.params.id);
      if (customerId === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const { amount, description, source, referenceId } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than zero" });
      }

      if (!description) {
        return res.status(400).json({ message: "Description is required" });
      }

      const user = req.user as any;
      const spaId = (req as any).adminSpa?.id;

      const transaction = await storage.deductWalletCredit(
        customerId,
        parseFloat(amount),
        spaId,
        source || 'manual_adjustment',
        description,
        user.claims.sub,
        referenceId
      );

      // Audit log
      await AuditLogger.logAction(req, 'UPDATE', 'customer', customerId, {
        action: 'wallet_credit_deduct',
        amount,
        description,
        newBalance: transaction.balanceAfter,
      });

      res.json(transaction);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to deduct wallet credit");
    }
  });

  // Export customers to CSV
  app.get("/api/admin/customers/export", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const { parseCustomersCSV, customersToCSV } = await import('./csvUtils');
      const customers = await storage.getAllCustomers();
      const csvContent = customersToCSV(customers);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="customers-export-${Date.now()}.csv"`);
      res.send(csvContent);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to export customers");
    }
  });

  // Import customers from CSV
  app.post("/api/admin/customers/import", isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const { csvContent } = req.body;
      
      if (!csvContent) {
        return res.status(400).json({ message: "CSV content is required" });
      }

      const { parseCustomersCSV } = await import('./csvUtils');
      const rows = parseCustomersCSV(csvContent);
      
      const results = {
        total: rows.length,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ row: number; error: string; data: any }>,
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        try {
          // Check for required fields
          if (!row.name || row.name.trim() === '') {
            results.skipped++;
            results.errors.push({
              row: i + 2, // +2 because CSV is 1-indexed and has header row
              error: 'Name is required',
              data: row,
            });
            continue;
          }

          // Check if customer already exists by email or phone
          let existing = null;
          if (row.email) {
            existing = await storage.getCustomerByEmail(row.email);
          }
          if (!existing && row.phone) {
            existing = await storage.getCustomerByPhone(row.phone);
          }

          if (existing) {
            results.skipped++;
            results.errors.push({
              row: i + 2,
              error: 'Customer already exists with this email or phone',
              data: row,
            });
            continue;
          }

          // Create customer
          const customerData: any = {
            name: row.name,
            email: row.email || null,
            phone: row.phone || null,
            gender: row.gender || null,
            birthday: row.birthday ? new Date(row.birthday) : null,
            address: {
              street: row.address_street || '',
              city: row.address_city || '',
              area: row.address_area || '',
              emirate: row.address_emirate || '',
            },
            notes: row.notes || null,
          };

          await storage.createCustomer(customerData);
          results.imported++;
        } catch (error: any) {
          results.errors.push({
            row: i + 2,
            error: error.message || 'Unknown error',
            data: row,
          });
        }
      }

      // Audit log
      await AuditLogger.logAction(req, 'IMPORT', 'customer', 0, {
        total: results.total,
        imported: results.imported,
        skipped: results.skipped,
        errors: results.errors.length,
      });

      res.json(results);
    } catch (error: any) {
      handleRouteError(res, error, "Failed to import customers");
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.json(customer);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      console.error("Error creating customer:", error);
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // Transaction routes (for manual sales) - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/transactions", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const transactions = await storage.getTransactionsBySpaId(req.adminSpa.id);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.post("/api/admin/sales", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const validatedData = insertTransactionSchema.parse(req.body);
      const transaction = await storage.createTransaction({ ...validatedData, spaId: req.adminSpa.id });
      res.json(transaction);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid transaction data", errors: error.errors });
      }
      console.error("Error creating sale:", error);
      res.status(500).json({ message: "Failed to create sale" });
    }
  });

  // Loyalty Card routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/loyalty-cards", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const cards = await storage.getLoyaltyCardsBySpaId(req.adminSpa.id);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching loyalty cards:", error);
      res.status(500).json({ message: "Failed to fetch loyalty cards" });
    }
  });

  app.get("/api/admin/loyalty-cards/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid loyalty card ID" });
      }
      const card = await storage.getLoyaltyCardById(id);
      if (!card) {
        return res.status(404).json({ message: "Loyalty card not found" });
      }
      // IDOR protection: verify ownership via customer's spaId
      const customer = await storage.getCustomerById(card.customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(card);
    } catch (error) {
      console.error("Error fetching loyalty card:", error);
      res.status(500).json({ message: "Failed to fetch loyalty card" });
    }
  });

  app.get("/api/admin/customers/:customerId/loyalty-cards", isAdmin, async (req, res) => {
    try {
      const customerId = parseNumericId(req.params.customerId);
      if (customerId === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      const cards = await storage.getLoyaltyCardsByCustomerId(customerId);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching customer loyalty cards:", error);
      res.status(500).json({ message: "Failed to fetch customer loyalty cards" });
    }
  });

  app.post("/api/admin/loyalty-cards", isAdmin, async (req, res) => {
    try {
      const validatedData = insertLoyaltyCardSchema.parse(req.body);
      const card = await storage.createLoyaltyCard(validatedData);
      res.json(card);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid loyalty card data", errors: error.errors });
      }
      console.error("Error creating loyalty card:", error);
      res.status(500).json({ message: "Failed to create loyalty card" });
    }
  });

  app.put("/api/admin/loyalty-cards/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid loyalty card ID" });
      }
      // IDOR protection: verify ownership via customer's spaId
      const existing = await storage.getLoyaltyCardById(id);
      if (!existing) {
        return res.status(404).json({ message: "Loyalty card not found" });
      }
      const customer = await storage.getCustomerById(existing.customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validatedData = insertLoyaltyCardSchema.partial().parse(req.body);
      const card = await storage.updateLoyaltyCard(id, validatedData);
      res.json(card);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid loyalty card data", errors: error.errors });
      }
      console.error("Error updating loyalty card:", error);
      res.status(500).json({ message: "Failed to update loyalty card" });
    }
  });

  app.delete("/api/admin/loyalty-cards/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid loyalty card ID" });
      }
      // IDOR protection: verify ownership via customer's spaId
      const existing = await storage.getLoyaltyCardById(id);
      if (!existing) {
        return res.status(404).json({ message: "Loyalty card not found" });
      }
      const customer = await storage.getCustomerById(existing.customerId);
      if (!customer || customer.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const deleted = await storage.deleteLoyaltyCard(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting loyalty card:", error);
      res.status(500).json({ message: "Failed to delete loyalty card" });
    }
  });

  // Loyalty Card Usage routes
  app.get("/api/admin/loyalty-cards/:cardId/usage", isAdmin, async (req, res) => {
    try {
      const cardId = parseNumericId(req.params.cardId);
      if (cardId === null) {
        return res.status(400).json({ message: "Invalid loyalty card ID" });
      }
      const usage = await storage.getLoyaltyCardUsageByCardId(cardId);
      res.json(usage);
    } catch (error) {
      console.error("Error fetching loyalty card usage:", error);
      res.status(500).json({ message: "Failed to fetch loyalty card usage" });
    }
  });

  app.post("/api/admin/loyalty-cards/:cardId/use", isAdmin, async (req, res) => {
    try {
      const cardId = parseNumericId(req.params.cardId);
      if (cardId === null) {
        return res.status(400).json({ message: "Invalid loyalty card ID" });
      }

      const validatedData = insertLoyaltyCardUsageSchema.parse({
        ...req.body,
        loyaltyCardId: cardId,
      });
      
      // Get the card to update used sessions
      const card = await storage.getLoyaltyCardById(cardId);
      if (!card) {
        return res.status(404).json({ message: "Loyalty card not found" });
      }

      // Check if card has sessions remaining
      if (card.usedSessions >= card.totalSessions) {
        return res.status(400).json({ message: "No sessions remaining on this card" });
      }

      // Create usage record
      const usage = await storage.createLoyaltyCardUsage(validatedData);

      // Update card's used sessions
      await storage.updateLoyaltyCard(cardId, {
        usedSessions: card.usedSessions + 1,
        status: card.usedSessions + 1 >= card.totalSessions ? "fully_used" : "active",
      });

      res.json(usage);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid usage data", errors: error.errors });
      }
      console.error("Error recording loyalty card usage:", error);
      res.status(500).json({ message: "Failed to record loyalty card usage" });
    }
  });

  // Product Sales routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/product-sales", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const sales = await storage.getProductSalesBySpaId(req.adminSpa.id);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching product sales:", error);
      res.status(500).json({ message: "Failed to fetch product sales" });
    }
  });

  app.get("/api/admin/product-sales/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid product sale ID" });
      }
      const sale = await storage.getProductSaleById(id);
      if (!sale) {
        return res.status(404).json({ message: "Product sale not found" });
      }
      // IDOR protection: verify ownership via customer's spaId
      if (sale.customerId) {
        const customer = await storage.getCustomerById(sale.customerId);
        if (!customer || customer.spaId !== req.adminSpa.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      res.json(sale);
    } catch (error) {
      console.error("Error fetching product sale:", error);
      res.status(500).json({ message: "Failed to fetch product sale" });
    }
  });

  app.get("/api/admin/customers/:customerId/product-sales", isAdmin, async (req, res) => {
    try {
      const customerId = parseNumericId(req.params.customerId);
      if (customerId === null) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      const sales = await storage.getProductSalesByCustomerId(customerId);
      res.json(sales);
    } catch (error) {
      console.error("Error fetching customer product sales:", error);
      res.status(500).json({ message: "Failed to fetch customer product sales" });
    }
  });

  app.post("/api/admin/product-sales", isAdmin, async (req, res) => {
    try {
      const validatedData = insertProductSaleSchema.parse(req.body);
      const sale = await storage.createProductSale(validatedData);
      res.json(sale);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid product sale data", errors: error.errors });
      }
      console.error("Error creating product sale:", error);
      res.status(500).json({ message: "Failed to create product sale" });
    }
  });

  app.put("/api/admin/product-sales/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid product sale ID" });
      }
      // IDOR protection: verify ownership via customer's spaId
      const existing = await storage.getProductSaleById(id);
      if (!existing) {
        return res.status(404).json({ message: "Product sale not found" });
      }
      if (existing.customerId) {
        const customer = await storage.getCustomerById(existing.customerId);
        if (!customer || customer.spaId !== req.adminSpa.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const validatedData = insertProductSaleSchema.partial().parse(req.body);
      const sale = await storage.updateProductSale(id, validatedData);
      res.json(sale);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid product sale data", errors: error.errors });
      }
      console.error("Error updating product sale:", error);
      res.status(500).json({ message: "Failed to update product sale" });
    }
  });

  app.delete("/api/admin/product-sales/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid product sale ID" });
      }
      // IDOR protection: verify ownership via customer's spaId
      const existing = await storage.getProductSaleById(id);
      if (!existing) {
        return res.status(404).json({ message: "Product sale not found" });
      }
      if (existing.customerId) {
        const customer = await storage.getCustomerById(existing.customerId);
        if (!customer || customer.spaId !== req.adminSpa.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const deleted = await storage.deleteProductSale(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product sale:", error);
      res.status(500).json({ message: "Failed to delete product sale" });
    }
  });

  // Finance: Vendors routes
  // Vendor routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/vendors", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const vendors = await storage.getVendorsBySpaId(req.adminSpa.id);
      res.json(vendors);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch vendors");
    }
  });

  app.get("/api/admin/vendors/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }
      const vendor = await storage.getVendorById(id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      // IDOR protection: verify ownership
      if (vendor.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(vendor);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch vendor");
    }
  });

  app.post("/api/admin/vendors", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const validatedData = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor({ ...validatedData, spaId: req.adminSpa.id });
      res.json(vendor);
    } catch (error) {
      handleRouteError(res, error, "Failed to create vendor");
    }
  });

  app.put("/api/admin/vendors/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }
      // IDOR protection: verify ownership before update
      const existing = await storage.getVendorById(id);
      if (!existing) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validatedData = insertVendorSchema.partial().parse(req.body);
      const vendor = await storage.updateVendor(id, validatedData);
      res.json(vendor);
    } catch (error) {
      handleRouteError(res, error, "Failed to update vendor");
    }
  });

  app.delete("/api/admin/vendors/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }
      // IDOR protection: verify ownership before delete
      const existing = await storage.getVendorById(id);
      if (!existing) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const deleted = await storage.deleteVendor(id);
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete vendor");
    }
  });

  // Finance: Expenses routes
  // Expense routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/expenses", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const expenses = await storage.getExpensesBySpaId(req.adminSpa.id);
      res.json(expenses);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch expenses");
    }
  });

  app.get("/api/admin/expenses/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      const expense = await storage.getExpenseById(id);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      // IDOR protection: verify ownership
      if (expense.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(expense);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch expense");
    }
  });

  app.post("/api/admin/expenses", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const validatedData = insertExpenseSchema.parse(req.body);
      const expense = await storage.createExpense({ ...validatedData, spaId: req.adminSpa.id });
      res.json(expense);
    } catch (error) {
      handleRouteError(res, error, "Failed to create expense");
    }
  });

  app.put("/api/admin/expenses/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      // IDOR protection: verify ownership before update
      const existing = await storage.getExpenseById(id);
      if (!existing) {
        return res.status(404).json({ message: "Expense not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validatedData = insertExpenseSchema.partial().parse(req.body);
      const expense = await storage.updateExpense(id, validatedData);
      res.json(expense);
    } catch (error) {
      handleRouteError(res, error, "Failed to update expense");
    }
  });

  app.delete("/api/admin/expenses/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      // IDOR protection: verify ownership before delete
      const existing = await storage.getExpenseById(id);
      if (!existing) {
        return res.status(404).json({ message: "Expense not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const deleted = await storage.deleteExpense(id);
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete expense");
    }
  });

  // Finance: Bills routes
  // Bill routes - Filter by admin's spaId for multi-tenant isolation
  app.get("/api/admin/bills", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const bills = await storage.getBillsBySpaId(req.adminSpa.id);
      res.json(bills);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch bills");
    }
  });

  app.get("/api/admin/bills/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid bill ID" });
      }
      const bill = await storage.getBillById(id);
      if (!bill) {
        return res.status(404).json({ message: "Bill not found" });
      }
      // IDOR protection: verify ownership
      if (bill.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(bill);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch bill");
    }
  });

  app.post("/api/admin/bills", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const validatedData = insertBillSchema.parse(req.body);
      const bill = await storage.createBill({ ...validatedData, spaId: req.adminSpa.id });
      res.json(bill);
    } catch (error) {
      handleRouteError(res, error, "Failed to create bill");
    }
  });

  app.put("/api/admin/bills/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid bill ID" });
      }
      // IDOR protection: verify ownership before update
      const existing = await storage.getBillById(id);
      if (!existing) {
        return res.status(404).json({ message: "Bill not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validatedData = insertBillSchema.partial().parse(req.body);
      const bill = await storage.updateBill(id, validatedData);
      res.json(bill);
    } catch (error) {
      handleRouteError(res, error, "Failed to update bill");
    }
  });

  app.delete("/api/admin/bills/:id", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid bill ID" });
      }
      // IDOR protection: verify ownership before delete
      const existing = await storage.getBillById(id);
      if (!existing) {
        return res.status(404).json({ message: "Bill not found" });
      }
      if (existing.spaId !== req.adminSpa.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const deleted = await storage.deleteBill(id);
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete bill");
    }
  });

  // Revenue and VAT routes (admin only)
  app.get("/api/admin/revenue-summary", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      const spaId = req.adminSpa.id;
      
      const filters: any = { spaId };
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      const summary = await storage.getRevenueSummary(filters);
      res.json(summary);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch revenue summary");
    }
  });

  app.get("/api/admin/vat-payable", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      const spaId = req.adminSpa.id;
      
      const filters: any = { spaId };
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      const summary = await storage.getVATPayableSummary(filters);
      res.json(summary);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch VAT payable summary");
    }
  });

  // FTA Audit File (FAF) Export for UAE Tax Compliance
  app.get("/api/admin/faf-export", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const { startDate, endDate, format } = req.query;
      const spaId = req.adminSpa.id;
      const { generateFAFExport, convertFAFToCSV } = await import('./fafExport');
      
      const filters: any = { spaId };
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      const records = await generateFAFExport(filters);
      
      if (format === 'csv') {
        const csv = convertFAFToCSV(records);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="FTA_Audit_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csv);
      }
      
      res.json(records);
    } catch (error) {
      handleRouteError(res, error, "Failed to generate FTA audit file");
    }
  });

  // Audit Logs routes (admin only)
  app.get("/api/admin/audit-logs", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const { userId, action, entityType, entityId, startDate, endDate, limit } = req.query;
      const spaId = req.adminSpa.id;
      
      const filters: any = { spaId };
      if (userId) filters.userId = userId as string;
      if (action) filters.action = action as string;
      if (entityType) filters.entityType = entityType as string;
      if (entityId) filters.entityId = parseInt(entityId as string);
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (limit) filters.limit = parseInt(limit as string);
      
      const logs = await storage.getAuditLogs(filters);
      res.json(logs);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch audit logs");
    }
  });

  // ==================== NOTIFICATION PROVIDER MANAGEMENT ====================
  
  // Validate provider credentials (admin only)
  app.post("/api/admin/notification-providers/validate", isAdmin, async (req, res) => {
    try {
      const { provider, channel, credentials } = req.body;
      
      let result;
      
      if (channel === 'email') {
        if (provider === 'sendgrid' || provider === 'resend') {
          result = await validateEmailCredentials(provider, credentials.apiKey);
        } else if (provider === 'msg91') {
          result = await validateMsg91Credentials(credentials.authKey);
        } else {
          return res.status(400).json({ message: "Unsupported email provider" });
        }
      } else if (channel === 'sms' || channel === 'whatsapp') {
        if (provider === 'twilio') {
          result = await validateTwilioCredentials(
            credentials.accountSid,
            credentials.authToken
          );
        } else if (provider === 'msg91') {
          result = await validateMsg91Credentials(credentials.authKey);
        } else {
          return res.status(400).json({ message: "Unsupported SMS/WhatsApp provider" });
        }
      } else {
        return res.status(400).json({ message: "Unsupported channel" });
      }
      
      if (result.valid) {
        res.json({ valid: true, details: result.details });
      } else {
        res.status(400).json({ valid: false, error: result.error });
      }
    } catch (error) {
      handleRouteError(res, error, "Failed to validate credentials");
    }
  });

  // Get all configured notification providers for a spa (admin only)
  app.get("/api/admin/notification-providers", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const spaId = req.adminSpa.id;
      const providers = await storage.getNotificationProviders(spaId);
      
      // Don't expose encrypted credentials in response
      const sanitized = providers.map(p => ({
        id: p.id,
        spaId: p.spaId,
        provider: p.provider,
        channel: p.channel,
        isActive: p.isActive,
        fromEmail: p.fromEmail,
        fromPhone: p.fromPhone,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      
      res.json(sanitized);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch notification providers");
    }
  });

  // Save or update notification provider credentials (admin only)
  app.post("/api/admin/notification-providers", isAdmin, injectAdminSpa, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const spaId = req.adminSpa.id;
      const { provider, channel, credentials, fromEmail, fromPhone } = req.body;
      
      // Validate credentials first
      let validationResult;
      if (channel === 'email') {
        if (provider === 'msg91') {
          validationResult = await validateMsg91Credentials(credentials.authKey);
        } else {
          validationResult = await validateEmailCredentials(provider, credentials.apiKey);
        }
      } else if (provider === 'twilio') {
        validationResult = await validateTwilioCredentials(
          credentials.accountSid,
          credentials.authToken
        );
      } else if (provider === 'msg91') {
        validationResult = await validateMsg91Credentials(credentials.authKey);
      } else {
        return res.status(400).json({ message: "Unsupported provider" });
      }
      
      if (!validationResult.valid) {
        return res.status(400).json({ 
          message: "Invalid credentials", 
          error: validationResult.error 
        });
      }
      
      // Encrypt credentials
      const encryptedCredentials = encryptJSON({ ...credentials, provider });
      
      // Check if provider already exists for this spa and channel
      const existing = await storage.getNotificationProviderByChannel(spaId, channel);
      
      let savedProvider;
      if (existing) {
        // Update existing
        savedProvider = await storage.updateNotificationProvider(existing.id, {
          provider,
          encryptedCredentials,
          fromEmail: fromEmail || null,
          fromPhone: fromPhone || null,
          isActive: true,
          updatedAt: new Date(),
        });
      } else {
        // Create new
        savedProvider = await storage.createNotificationProvider({
          spaId,
          provider,
          channel,
          encryptedCredentials,
          fromEmail: fromEmail || null,
          fromPhone: fromPhone || null,
          isActive: true,
        });
      }
      
      // Log audit trail
      await AuditLogger.log({
        userId,
        spaId,
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'notification_provider',
        entityId: savedProvider.id,
        changes: {
          after: {
            provider,
            channel,
            isActive: true,
          },
        },
      });
      
      // Return sanitized response
      res.json({
        id: savedProvider.id,
        spaId: savedProvider.spaId,
        provider: savedProvider.provider,
        channel: savedProvider.channel,
        isActive: savedProvider.isActive,
        fromEmail: savedProvider.fromEmail,
        fromPhone: savedProvider.fromPhone,
        validationDetails: validationResult.details,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to save notification provider");
    }
  });

  // Delete notification provider (admin only)
  app.delete("/api/admin/notification-providers/:id", isAdmin, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: "Invalid provider ID" });
      }
      
      const provider = await storage.getNotificationProviderById(id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      await storage.deleteNotificationProvider(id);
      
      // Log audit trail
      await AuditLogger.log({
        userId,
        spaId: provider.spaId,
        action: 'DELETE',
        entityType: 'notification_provider',
        entityId: id,
      });
      
      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete notification provider");
    }
  });

  // ==================== UAE FTA COMPLIANCE ROUTES ====================
  
  // Get VAT Return Report (aggregates all revenue streams)
  app.get("/api/admin/vat-report", isAdmin, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.adminSpaId) {
        return res.status(403).json({ message: "Access denied: No spa assignment" });
      }

      const { from, to, taxCode } = req.query;
      const filters: any = { spaId: user.adminSpaId };
      
      if (from) filters.startDate = new Date(from as string);
      if (to) filters.endDate = new Date(to as string);
      if (taxCode) filters.taxCode = taxCode as string;
      
      const { getVATReturnReport } = await import("./vatReport");
      const report = await getVATReturnReport(filters);
      
      res.json(report);
    } catch (error) {
      handleRouteError(res, error, "Failed to generate VAT report");
    }
  });
  
  // Export FAF (FTA Audit File)
  app.post("/api/admin/export-faf", isAdmin, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || !user.adminSpaId) {
        return res.status(403).json({ message: "Access denied: No spa assignment" });
      }

      const { startDate, endDate } = req.body;
      const filters: any = { spaId: user.adminSpaId };
      
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      
      const { generateFAFExport } = await import("./fafExport");
      const csvContent = await generateFAFExport(filters);
      
      // Return CSV content directly
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="FAF_Export_${Date.now()}.csv"`);
      res.send(csvContent);
    } catch (error) {
      handleRouteError(res, error, "Failed to export FAF file");
    }
  });
  
  // Get Amendment Logs (audit trail)
  app.get("/api/admin/amendments", isAdmin, async (req, res) => {
    try {
      const { type, tableName, from, to, recordId } = req.query;
      const filters: any = {};
      
      if (type) filters.changeType = type as string;
      if (tableName) filters.tableName = tableName as string;
      if (from) filters.startDate = new Date(from as string);
      if (to) filters.endDate = new Date(to as string);
      if (recordId) filters.recordId = parseInt(recordId as string);
      
      const { getAmendmentLogs } = await import("./amendmentLogger");
      const logs = await getAmendmentLogs(filters);
      
      res.json(logs);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch amendment logs");
    }
  });
  
  // Get Audit Trail for specific record
  app.get("/api/admin/audit-trail/:tableName/:recordId", isAdmin, async (req, res) => {
    try {
      const { tableName, recordId } = req.params;
      const { getRecordAuditTrail } = await import("./amendmentLogger");
      const trail = await getRecordAuditTrail(tableName, parseInt(recordId));
      
      res.json(trail);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch audit trail");
    }
  });
  
  // Get Backup Logs
  app.get("/api/admin/backup-logs", isAdmin, async (req, res) => {
    try {
      const logs = await storage.getBackupLogs();
      res.json(logs);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch backup logs");
    }
  });
  
  // Create Backup Log (for automated backup systems)
  app.post("/api/admin/backup-logs", isAdmin, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const logData = {
        ...req.body,
        createdBy: parseInt(userId),
      };
      
      const log = await storage.createBackupLog(logData);
      res.json(log);
    } catch (error) {
      handleRouteError(res, error, "Failed to create backup log");
    }
  });
  
  // Import FTA Test Data (for certification testing)
  app.post("/api/admin/import-test-data", isAdmin, async (req, res) => {
    try {
      const { data } = req.body;
      
      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ message: "Invalid test data format: expected array" });
      }
      
      const { importFTATestData } = await import("./testDataImport");
      const result = await importFTATestData(data);
      
      res.json(result);
    } catch (error) {
      handleRouteError(res, error, "Failed to import test data");
    }
  });
  
  // Generate Sample Test Data (for testing)
  app.get("/api/admin/sample-test-data", isAdmin, async (req, res) => {
    try {
      const { generateSampleTestData } = await import("./testDataImport");
      const sampleData = generateSampleTestData();
      
      res.json(sampleData);
    } catch (error) {
      handleRouteError(res, error, "Failed to generate sample test data");
    }
  });

  // ==================== FINANCE & ACCOUNTING REPORTS ====================
  
  // Finance Summary Report
  app.get("/api/admin/reports/finance-summary", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Step 1: Get all bookings for this spa in the date range
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      const spaBookingIds = new Set(spaBookings.map((b: any) => b.id));
      
      // Step 2: Get staff for this spa (for product sales)
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      // Step 3: Get product sales by this spa's staff
      const allProductSales = await storage.getAllProductSales();
      const spaProductSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        const isInDateRange = saleDate >= start && saleDate <= end;
        const isForSpa = sale.soldBy && spaStaffIds.has(sale.soldBy);
        return isInDateRange && isForSpa;
      });
      const productSaleInvoiceIds = new Set(spaProductSales.map((ps: any) => ps.invoiceId).filter(Boolean));
      
      // Step 4: Get membership purchases for this spa
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const allMemberships = await storage.getAllCustomerMemberships();
      const spaMemberships = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        const isInDateRange = purchaseDate >= start && purchaseDate <= end;
        const isForSpa = membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
        return isInDateRange && isForSpa;
      });
      const membershipInvoiceIds = new Set(spaMemberships.map((m: any) => m.invoiceId).filter(Boolean));
      
      // Step 5: Get all invoices for this spa (booking-linked, product sales, membership purchases)
      const allInvoices = await storage.getAllInvoices();
      const spaInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.issueDate);
        const isInDateRange = invDate >= start && invDate <= end;
        const isForSpa = 
          (inv.bookingId && spaBookingIds.has(inv.bookingId)) ||
          productSaleInvoiceIds.has(inv.id) ||
          membershipInvoiceIds.has(inv.id);
        return isInDateRange && isForSpa;
      });
      const spaInvoiceIds = new Set(spaInvoices.map((inv: any) => inv.id));
      
      // Step 3: Get transactions linked to these invoices (spa-filtered payments)
      const allTransactions = await storage.getAllTransactions();
      const spaTransactions = allTransactions.filter((txn: any) => {
        const txnDate = new Date(txn.transactionDate);
        const isInDateRange = txnDate >= start && txnDate <= end;
        const isForSpa = txn.invoiceId && spaInvoiceIds.has(txn.invoiceId);
        return isInDateRange && isForSpa;
      });
      
      // Step 4: Get services for this spa to filter loyalty cards
      const allServices = await storage.getAllServices();
      const spaServices = allServices.filter((service: any) => service.spaId === spaId);
      const spaServiceIds = new Set(spaServices.map((s: any) => s.id));
      
      // Step 5: Get loyalty cards for this spa's services in date range
      const allLoyaltyCards = await storage.getAllLoyaltyCards();
      const spaLoyaltyCards = allLoyaltyCards.filter((card: any) => {
        const purchaseDate = new Date(card.purchaseDate);
        const isInDateRange = purchaseDate >= start && purchaseDate <= end;
        const isForSpa = card.serviceId && spaServiceIds.has(card.serviceId);
        return isInDateRange && isForSpa;
      });
      const spaLoyaltyCardIds = new Set(spaLoyaltyCards.map((c: any) => c.id));
      
      // Step 6: Get loyalty usage for this spa's bookings
      const allLoyaltyUsage = await storage.getAllLoyaltyCardUsage();
      const spaLoyaltyUsage = allLoyaltyUsage.filter((usage: any) => {
        const usedAt = new Date(usage.usedAt);
        const isInDateRange = usedAt >= start && usedAt <= end;
        const isForSpa = usage.bookingId && spaBookingIds.has(usage.bookingId);
        return isInDateRange && isForSpa;
      });
      
      // Calculate sales metrics from spa-filtered data
      let grossSales = 0;
      let totalDiscounts = 0;
      let refunds = 0;
      let giftCardSales = 0;
      let serviceCharges = 0;
      
      spaInvoices.forEach((inv: any) => {
        const subtotal = parseFloat(inv.subtotal || '0');
        const discount = parseFloat(inv.discountAmount || '0');
        grossSales += subtotal;
        totalDiscounts += discount;
        
        if (inv.status === 'refunded') {
          refunds += parseFloat(inv.totalAmount || '0');
        }
      });
      
      spaLoyaltyCards.forEach((card: any) => {
        giftCardSales += parseFloat(card.purchasePrice || '0');
      });
      
      const netSales = grossSales - totalDiscounts - refunds;
      const totalSales = netSales + giftCardSales + serviceCharges;
      
      // Calculate payments by method (spa-filtered)
      let cardPayments = 0;
      let cashPayments = 0;
      let onlinePayments = 0;
      
      spaTransactions.forEach((txn: any) => {
        const amount = parseFloat(txn.amount || '0');
        if (txn.transactionType === 'payment') {
          switch (txn.paymentMethod) {
            case 'card':
              cardPayments += amount;
              break;
            case 'cash':
              cashPayments += amount;
              break;
            case 'online':
              onlinePayments += amount;
              break;
          }
        }
      });
      
      // Calculate redemptions (spa-filtered)
      let redemptions = 0;
      spaLoyaltyUsage.forEach((usage: any) => {
        redemptions += parseFloat(usage.sessionValue || '0');
      });
      
      res.json({
        sales: {
          grossSales,
          discounts: totalDiscounts,
          refunds,
          netSales,
        },
        totalSales: {
          giftCardSales,
          serviceCharges,
          tips: 0, // Can be added later
        },
        payments: {
          card: cardPayments,
          cash: cashPayments,
          online: onlinePayments,
        },
        redemptions,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch finance summary");
    }
  });
  
  // Sales Summary Report
  app.get("/api/admin/reports/sales-summary", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get bookings (services) for this spa
      const allBookings = await storage.getAllBookings();
      const bookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      
      // Get staff for this spa to filter product sales
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      // Get product sales sold by this spa's staff
      const allProductSales = await storage.getAllProductSales();
      const productSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        const isInDateRange = saleDate >= start && saleDate <= end;
        const isForSpa = sale.soldBy && spaStaffIds.has(sale.soldBy);
        return isInDateRange && isForSpa;
      });
      
      // Get memberships for this spa (through membership definition's spaId)
      const allMemberships = await storage.getAllCustomerMemberships();
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const membershipPurchases = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        const isInDateRange = purchaseDate >= start && purchaseDate <= end;
        const isForSpa = membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
        return isInDateRange && isForSpa;
      });
      
      // Calculate service metrics
      const serviceGrossSales = bookings.reduce((sum: number, booking: any) => sum + parseFloat(booking.totalPrice || '0'), 0);
      const serviceDiscounts = bookings.reduce((sum: number, booking: any) => sum + parseFloat(booking.discountAmount || '0'), 0);
      const serviceRefunds = bookings.filter((b: any) => b.status === 'cancelled').reduce((sum: number, b: any) => sum + parseFloat(b.totalPrice || '0'), 0);
      const serviceNetSales = serviceGrossSales - serviceDiscounts - serviceRefunds;
      const serviceTaxes = serviceNetSales * 0.05; // 5% VAT
      const serviceTotal = serviceNetSales + serviceTaxes;
      
      const serviceMetrics = {
        quantity: bookings.length,
        itemsSold: bookings.reduce((sum: number, booking: any) => sum + (booking.totalServices || 1), 0),
        grossSales: serviceGrossSales,
        discounts: serviceDiscounts,
        refunds: serviceRefunds,
        netSales: serviceNetSales,
        taxes: serviceTaxes,
        total: serviceTotal,
      };
      
      // Calculate product metrics
      const productGrossSales = productSales.reduce((sum: number, sale: any) => sum + parseFloat(sale.totalPrice || '0'), 0);
      const productDiscounts = productSales.reduce((sum: number, sale: any) => sum + parseFloat(sale.discountAmount || '0'), 0);
      const productNetSales = productGrossSales - productDiscounts;
      const productTaxes = productNetSales * 0.05;
      const productTotal = productNetSales + productTaxes;
      
      const productMetrics = {
        quantity: productSales.length,
        itemsSold: productSales.reduce((sum: number, sale: any) => sum + (sale.quantity || 1), 0),
        grossSales: productGrossSales,
        discounts: productDiscounts,
        refunds: 0,
        netSales: productNetSales,
        taxes: productTaxes,
        total: productTotal,
      };
      
      // Calculate membership metrics
      const membershipGrossSales = membershipPurchases.reduce((sum: number, m: any) => sum + parseFloat(m.paidAmount || '0'), 0);
      const membershipNetSales = membershipGrossSales;
      const membershipTaxes = membershipNetSales * 0.05;
      const membershipTotal = membershipNetSales + membershipTaxes;
      
      const membershipMetrics = {
        quantity: membershipPurchases.length,
        itemsSold: membershipPurchases.length,
        grossSales: membershipGrossSales,
        discounts: 0,
        refunds: 0,
        netSales: membershipNetSales,
        taxes: membershipTaxes,
        total: membershipTotal,
      };
      
      res.json({
        service: serviceMetrics,
        product: productMetrics,
        membership: membershipMetrics,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch sales summary");
    }
  });
  
  // Sales List Report
  app.get("/api/admin/reports/sales-list", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get all spa-related data for invoice filtering
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      const spaBookingIds = new Set(spaBookings.map((b: any) => b.id));
      
      // Get staff for this spa (for product sales)
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      // Get product sales by this spa's staff
      const allProductSales = await storage.getAllProductSales();
      const spaProductSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        const isInDateRange = saleDate >= start && saleDate <= end;
        const isForSpa = sale.soldBy && spaStaffIds.has(sale.soldBy);
        return isInDateRange && isForSpa;
      });
      const productSaleInvoiceIds = new Set(spaProductSales.map((ps: any) => ps.invoiceId).filter(Boolean));
      
      // Get membership purchases for this spa
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const allMemberships = await storage.getAllCustomerMemberships();
      const spaMemberships = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        const isInDateRange = purchaseDate >= start && purchaseDate <= end;
        const isForSpa = membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
        return isInDateRange && isForSpa;
      });
      const membershipInvoiceIds = new Set(spaMemberships.map((m: any) => m.invoiceId).filter(Boolean));
      
      // Get all invoices for this spa (booking-linked, product sales, membership purchases)
      const allInvoices = await storage.getAllInvoices();
      const spaInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.issueDate);
        const isInDateRange = invDate >= start && invDate <= end;
        const isForSpa = 
          (inv.bookingId && spaBookingIds.has(inv.bookingId)) ||
          productSaleInvoiceIds.has(inv.id) ||
          membershipInvoiceIds.has(inv.id);
        return isInDateRange && isForSpa;
      });
      
      // Get all customers for lookup
      const allCustomers = await storage.getAllCustomers();
      const customerMap = new Map(allCustomers.map((c: any) => [c.id, c]));
      
      // Get spa info
      const spa = await storage.getSpaById(spaId);
      
      // Format sales list
      const salesList = spaInvoices.map((inv: any) => {
        const customer = customerMap.get(inv.customerId);
        return {
          saleNumber: inv.invoiceNumber,
          date: inv.issueDate,
          status: inv.status,
          location: spa?.name || 'Unknown',
          client: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
          channel: 'In-store', // Can be enhanced later
          itemsSold: 1, // Can be calculated from invoice items
          totalSales: parseFloat(inv.totalAmount || '0'),
          giftCards: 0,
          serviceCharges: 0,
          amountDue: inv.status === 'paid' ? 0 : parseFloat(inv.totalAmount || '0'),
        };
      });
      
      res.json(salesList);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch sales list");
    }
  });
  
  // Appointments Summary Report
  app.get("/api/admin/reports/appointments-summary", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get all bookings
      const allBookings = await storage.getAllBookings();
      const bookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      
      // Get spa info
      const spa = await storage.getSpaById(spaId);
      
      // Calculate metrics
      const totalAppointments = bookings.length;
      const totalServices = bookings.reduce((sum: number, booking: any) => sum + (booking.totalServices || 1), 0);
      const requestedAppointments = bookings.filter((b: any) => b.staffPreference === 'specific').length;
      const percentRequested = totalAppointments > 0 ? (requestedAppointments / totalAppointments * 100).toFixed(1) : '0';
      
      const totalValue = bookings.reduce((sum: number, booking: any) => sum + parseFloat(booking.totalPrice || '0'), 0);
      const averageValue = totalAppointments > 0 ? (totalValue / totalAppointments).toFixed(2) : '0';
      
      const onlineBookings = bookings.filter((b: any) => b.source === 'online').length;
      const percentOnline = totalAppointments > 0 ? (onlineBookings / totalAppointments * 100).toFixed(1) : '0';
      
      const cancelledBookings = bookings.filter((b: any) => b.status === 'cancelled').length;
      const percentCancelled = totalAppointments > 0 ? (cancelledBookings / totalAppointments * 100).toFixed(1) : '0';
      
      const noShowBookings = bookings.filter((b: any) => b.status === 'no-show').length;
      const percentNoShow = totalAppointments > 0 ? (noShowBookings / totalAppointments * 100).toFixed(1) : '0';
      
      // Get unique customers
      const uniqueCustomers = new Set(bookings.map((b: any) => b.customerId));
      const totalClients = uniqueCustomers.size;
      
      // For new clients, we'd need to check if this was their first booking
      // For now, estimating as 30% new (can be enhanced later)
      const newClients = Math.floor(totalClients * 0.3);
      const returningClients = totalClients - newClients;
      const percentNew = totalClients > 0 ? (newClients / totalClients * 100).toFixed(1) : '0';
      const percentReturning = totalClients > 0 ? (returningClients / totalClients * 100).toFixed(1) : '0';
      
      res.json({
        location: spa?.name || 'All Locations',
        appointments: totalAppointments,
        services: totalServices,
        percentRequested: parseFloat(percentRequested),
        totalValue,
        averageValue: parseFloat(averageValue),
        percentOnline: parseFloat(percentOnline),
        percentCancelled: parseFloat(percentCancelled),
        percentNoShow: parseFloat(percentNoShow),
        totalClients,
        newClients,
        percentNew: parseFloat(percentNew),
        percentReturning: parseFloat(percentReturning),
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch appointments summary");
    }
  });
  
  // Payment Summary Report
  app.get("/api/admin/reports/payment-summary", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get all spa-related data for invoice filtering
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      const spaBookingIds = new Set(spaBookings.map((b: any) => b.id));
      
      // Get staff for this spa (for product sales)
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      // Get product sales by this spa's staff
      const allProductSales = await storage.getAllProductSales();
      const spaProductSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        const isInDateRange = saleDate >= start && saleDate <= end;
        const isForSpa = sale.soldBy && spaStaffIds.has(sale.soldBy);
        return isInDateRange && isForSpa;
      });
      const productSaleInvoiceIds = new Set(spaProductSales.map((ps: any) => ps.invoiceId).filter(Boolean));
      
      // Get membership purchases for this spa
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const allMemberships = await storage.getAllCustomerMemberships();
      const spaMemberships = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        const isInDateRange = purchaseDate >= start && purchaseDate <= end;
        const isForSpa = membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
        return isInDateRange && isForSpa;
      });
      const membershipInvoiceIds = new Set(spaMemberships.map((m: any) => m.invoiceId).filter(Boolean));
      
      // Get all invoices for this spa (booking-linked, product sales, membership purchases)
      const allInvoices = await storage.getAllInvoices();
      const spaInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.issueDate);
        const isInDateRange = invDate >= start && invDate <= end;
        const isForSpa = 
          (inv.bookingId && spaBookingIds.has(inv.bookingId)) ||
          productSaleInvoiceIds.has(inv.id) ||
          membershipInvoiceIds.has(inv.id);
        return isInDateRange && isForSpa;
      });
      const spaInvoiceIds = new Set(spaInvoices.map((inv: any) => inv.id));
      
      // Get transactions linked to these invoices (spa-filtered)
      const allTransactions = await storage.getAllTransactions();
      const spaTransactions = allTransactions.filter((txn: any) => {
        const txnDate = new Date(txn.transactionDate);
        const isInDateRange = txnDate >= start && txnDate <= end;
        const isForSpa = txn.invoiceId && spaInvoiceIds.has(txn.invoiceId);
        return isInDateRange && isForSpa;
      });
      
      // Group by payment method
      const paymentMethods = ['card', 'cash', 'online'];
      const summary = paymentMethods.map(method => {
        const methodTransactions = spaTransactions.filter((t: any) => t.paymentMethod === method);
        const payments = methodTransactions.filter((t: any) => t.transactionType === 'payment');
        const refunds = methodTransactions.filter((t: any) => t.transactionType === 'refund');
        
        const paymentAmount = payments.reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);
        const refundAmount = refunds.reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);
        
        return {
          paymentMethod: method.charAt(0).toUpperCase() + method.slice(1),
          numberOfPayments: payments.length,
          paymentAmount,
          numberOfRefunds: refunds.length,
          refunds: refundAmount,
          netPayments: paymentAmount - refundAmount,
        };
      });
      
      res.json(summary);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch payment summary");
    }
  });

  // ==================== REPORT EXPORTS ====================
  
  // Export Finance Summary Report
  app.get("/api/admin/reports/finance-summary/export/:format", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      const { format } = req.params;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      // Fetch report data with proper spa filtering
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get all spa-related data for comprehensive invoice filtering
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      const spaBookingIds = new Set(spaBookings.map((b: any) => b.id));
      
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      const allProductSales = await storage.getAllProductSales();
      const spaProductSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        return saleDate >= start && saleDate <= end && sale.soldBy && spaStaffIds.has(sale.soldBy);
      });
      const productSaleInvoiceIds = new Set(spaProductSales.map((ps: any) => ps.invoiceId).filter(Boolean));
      
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const allMemberships = await storage.getAllCustomerMemberships();
      const spaMemberships = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        return purchaseDate >= start && purchaseDate <= end && membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
      });
      const membershipInvoiceIds = new Set(spaMemberships.map((m: any) => m.invoiceId).filter(Boolean));
      
      // Get all invoices for this spa (booking-linked, product sales, membership purchases)
      const allInvoices = await storage.getAllInvoices();
      const spaInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.issueDate);
        const isInDateRange = invDate >= start && invDate <= end;
        const isForSpa = 
          (inv.bookingId && spaBookingIds.has(inv.bookingId)) ||
          productSaleInvoiceIds.has(inv.id) ||
          membershipInvoiceIds.has(inv.id);
        return isInDateRange && isForSpa;
      });
      
      // Calculate totals
      const grossSales = spaInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.subtotal || '0'), 0);
      const discounts = spaInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.discountAmount || '0'), 0);
      const refunds = spaInvoices.filter((inv: any) => inv.status === 'refunded').reduce((sum: number, inv: any) => sum + parseFloat(inv.totalAmount || '0'), 0);
      const netSales = grossSales - discounts - refunds;
      
      // Prepare export data
      const exportData = [
        { category: 'Gross Sales', amount: formatCurrency(grossSales) },
        { category: 'Discounts', amount: formatCurrency(discounts) },
        { category: 'Refunds', amount: formatCurrency(refunds) },
        { category: 'Net Sales', amount: formatCurrency(netSales) },
      ];
      
      const filename = `finance-summary-${formatDate(start)}-to-${formatDate(end)}`;
      
      await AuditLogger.logExport(req, 'finance-summary', exportData.length, format, spaId);
      
      if (format === 'csv') {
        await exportToCSV(
          exportData,
          [{ id: 'category', title: 'Category' }, { id: 'amount', title: 'Amount' }],
          filename,
          res
        );
      } else if (format === 'excel') {
        await exportToExcel(
          exportData,
          [{ key: 'category', header: 'Category', width: 30 }, { key: 'amount', header: 'Amount', width: 20 }],
          filename,
          'Finance Summary',
          res
        );
      } else if (format === 'pdf') {
        await exportToPDF(
          exportData,
          ['category', 'amount'],
          'Finance Summary Report',
          filename,
          res
        );
      } else {
        res.status(400).json({ message: 'Invalid format. Use csv, excel, or pdf' });
      }
    } catch (error) {
      handleRouteError(res, error, "Failed to export finance summary");
    }
  });
  
  // Export Sales Summary Report
  app.get("/api/admin/reports/sales-summary/export/:format", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      const { format } = req.params;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get bookings for this spa
      const allBookings = await storage.getAllBookings();
      const bookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      
      // Get staff for this spa to filter product sales
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      // Get product sales sold by this spa's staff
      const allProductSales = await storage.getAllProductSales();
      const productSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        const isInDateRange = saleDate >= start && saleDate <= end;
        const isForSpa = sale.soldBy && spaStaffIds.has(sale.soldBy);
        return isInDateRange && isForSpa;
      });
      
      const serviceGrossSales = bookings.reduce((sum: number, booking: any) => sum + parseFloat(booking.totalPrice || '0'), 0);
      const productGrossSales = productSales.reduce((sum: number, sale: any) => sum + parseFloat(sale.totalPrice || '0'), 0);
      
      const exportData = [
        { type: 'Service', quantity: bookings.length, grossSales: formatCurrency(serviceGrossSales) },
        { type: 'Product', quantity: productSales.length, grossSales: formatCurrency(productGrossSales) },
      ];
      
      const filename = `sales-summary-${formatDate(start)}-to-${formatDate(end)}`;
      
      if (format === 'csv') {
        await exportToCSV(
          exportData,
          [
            { id: 'type', title: 'Type' },
            { id: 'quantity', title: 'Quantity' },
            { id: 'grossSales', title: 'Gross Sales' }
          ],
          filename,
          res
        );
      } else if (format === 'excel') {
        await exportToExcel(
          exportData,
          [
            { key: 'type', header: 'Type', width: 20 },
            { key: 'quantity', header: 'Quantity', width: 15 },
            { key: 'grossSales', header: 'Gross Sales', width: 20 }
          ],
          filename,
          'Sales Summary',
          res
        );
      } else if (format === 'pdf') {
        await exportToPDF(
          exportData,
          ['type', 'quantity', 'grossSales'],
          'Sales Summary Report',
          filename,
          res
        );
      } else {
        res.status(400).json({ message: 'Invalid format. Use csv, excel, or pdf' });
      }
    } catch (error) {
      handleRouteError(res, error, "Failed to export sales summary");
    }
  });
  
  // Export Sales List Report
  app.get("/api/admin/reports/sales-list/export/:format", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      const { format } = req.params;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get all spa-related data for comprehensive invoice filtering
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      const spaBookingIds = new Set(spaBookings.map((b: any) => b.id));
      
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      const allProductSales = await storage.getAllProductSales();
      const spaProductSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        return saleDate >= start && saleDate <= end && sale.soldBy && spaStaffIds.has(sale.soldBy);
      });
      const productSaleInvoiceIds = new Set(spaProductSales.map((ps: any) => ps.invoiceId).filter(Boolean));
      
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const allMemberships = await storage.getAllCustomerMemberships();
      const spaMemberships = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        return purchaseDate >= start && purchaseDate <= end && membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
      });
      const membershipInvoiceIds = new Set(spaMemberships.map((m: any) => m.invoiceId).filter(Boolean));
      
      // Get all invoices for this spa (booking-linked, product sales, membership purchases)
      const allInvoices = await storage.getAllInvoices();
      const spaInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.issueDate);
        const isInDateRange = invDate >= start && invDate <= end;
        const isForSpa = 
          (inv.bookingId && spaBookingIds.has(inv.bookingId)) ||
          productSaleInvoiceIds.has(inv.id) ||
          membershipInvoiceIds.has(inv.id);
        return isInDateRange && isForSpa;
      });
      
      // Get all customers for lookup
      const allCustomers = await storage.getAllCustomers();
      const customerMap = new Map(allCustomers.map((c: any) => [c.id, c]));
      
      // Get spa info
      const spa = await storage.getSpaById(spaId);
      
      // Format sales list
      const exportData = spaInvoices.map((inv: any) => {
        const customer = customerMap.get(inv.customerId);
        return {
          saleNumber: inv.invoiceNumber,
          date: formatDate(new Date(inv.issueDate)),
          status: inv.status,
          location: spa?.name || 'Unknown',
          client: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
          totalSales: formatCurrency(parseFloat(inv.totalAmount || '0')),
        };
      });
      
      const filename = `sales-list-${formatDate(start)}-to-${formatDate(end)}`;
      
      if (format === 'csv') {
        await exportToCSV(
          exportData,
          [
            { id: 'saleNumber', title: 'Sale Number' },
            { id: 'date', title: 'Date' },
            { id: 'status', title: 'Status' },
            { id: 'client', title: 'Client' },
            { id: 'totalSales', title: 'Total Sales' }
          ],
          filename,
          res
        );
      } else if (format === 'excel') {
        await exportToExcel(
          exportData,
          [
            { key: 'saleNumber', header: 'Sale Number', width: 20 },
            { key: 'date', header: 'Date', width: 15 },
            { key: 'status', header: 'Status', width: 12 },
            { key: 'client', header: 'Client', width: 25 },
            { key: 'totalSales', header: 'Total Sales', width: 15 }
          ],
          filename,
          'Sales List',
          res
        );
      } else if (format === 'pdf') {
        await exportToPDF(
          exportData,
          ['saleNumber', 'date', 'status', 'client', 'totalSales'],
          'Sales List Report',
          filename,
          res
        );
      } else {
        res.status(400).json({ message: 'Invalid format. Use csv, excel, or pdf' });
      }
    } catch (error) {
      handleRouteError(res, error, "Failed to export sales list");
    }
  });
  
  // Export Appointments Summary Report
  app.get("/api/admin/reports/appointments-summary/export/:format", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      const { format } = req.params;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get bookings for this spa
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      
      // Calculate metrics
      const totalAppointments = spaBookings.length;
      const totalValue = spaBookings.reduce((sum: number, b: any) => sum + parseFloat(b.totalPrice || '0'), 0);
      const averageValue = totalAppointments > 0 ? totalValue / totalAppointments : 0;
      const onlineBookings = spaBookings.filter((b: any) => b.bookingChannel === 'online').length;
      const cancelledBookings = spaBookings.filter((b: any) => b.status === 'cancelled').length;
      const percentOnline = totalAppointments > 0 ? (onlineBookings / totalAppointments) * 100 : 0;
      const percentCancelled = totalAppointments > 0 ? (cancelledBookings / totalAppointments) * 100 : 0;
      
      // Format export data
      const exportData = [
        { metric: 'Total Appointments', value: totalAppointments.toString() },
        { metric: 'Total Value', value: formatCurrency(totalValue) },
        { metric: 'Average Value', value: formatCurrency(averageValue) },
        { metric: '% Online', value: formatPercentage(percentOnline / 100) },
        { metric: '% Cancelled', value: formatPercentage(percentCancelled / 100) },
      ];
      
      const filename = `appointments-summary-${formatDate(start)}-to-${formatDate(end)}`;
      
      if (format === 'csv') {
        await exportToCSV(
          exportData,
          [
            { id: 'metric', title: 'Metric' },
            { id: 'value', title: 'Value' }
          ],
          filename,
          res
        );
      } else if (format === 'excel') {
        await exportToExcel(
          exportData,
          [
            { key: 'metric', header: 'Metric', width: 30 },
            { key: 'value', header: 'Value', width: 20 }
          ],
          filename,
          'Appointments Summary',
          res
        );
      } else if (format === 'pdf') {
        await exportToPDF(
          exportData,
          ['metric', 'value'],
          'Appointments Summary Report',
          filename,
          res
        );
      } else {
        res.status(400).json({ message: 'Invalid format. Use csv, excel, or pdf' });
      }
    } catch (error) {
      handleRouteError(res, error, "Failed to export appointments summary");
    }
  });
  
  // Export Payment Summary Report
  app.get("/api/admin/reports/payment-summary/export/:format", isAuthenticated, isAdmin, injectAdminSpa, async (req, res) => {
    try {
      const spaId = (req as any).adminSpaId;
      const { startDate, endDate } = req.query;
      const { format } = req.params;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      // Get all spa-related data for comprehensive invoice filtering
      const allBookings = await storage.getAllBookings();
      const spaBookings = allBookings.filter((booking: any) => {
        const bookingDate = new Date(booking.bookingDate);
        return bookingDate >= start && bookingDate <= end && booking.spaId === spaId;
      });
      const spaBookingIds = new Set(spaBookings.map((b: any) => b.id));
      
      const allStaff = await storage.getAllStaff();
      const spaStaff = allStaff.filter((staff: any) => staff.spaId === spaId);
      const spaStaffIds = new Set(spaStaff.map((s: any) => s.id));
      
      const allProductSales = await storage.getAllProductSales();
      const spaProductSales = allProductSales.filter((sale: any) => {
        const saleDate = new Date(sale.saleDate);
        return saleDate >= start && saleDate <= end && sale.soldBy && spaStaffIds.has(sale.soldBy);
      });
      const productSaleInvoiceIds = new Set(spaProductSales.map((ps: any) => ps.invoiceId).filter(Boolean));
      
      const allMembershipDefs = await storage.getAllMemberships();
      const spaMembershipDefs = allMembershipDefs.filter((def: any) => def.spaId === spaId);
      const spaMembershipDefIds = new Set(spaMembershipDefs.map((def: any) => def.id));
      
      const allMemberships = await storage.getAllCustomerMemberships();
      const spaMemberships = allMemberships.filter((membership: any) => {
        const purchaseDate = new Date(membership.purchaseDate);
        return purchaseDate >= start && purchaseDate <= end && membership.membershipId && spaMembershipDefIds.has(membership.membershipId);
      });
      const membershipInvoiceIds = new Set(spaMemberships.map((m: any) => m.invoiceId).filter(Boolean));
      
      // Get all invoices for this spa (booking-linked, product sales, membership purchases)
      const allInvoices = await storage.getAllInvoices();
      const spaInvoices = allInvoices.filter((inv: any) => {
        const invDate = new Date(inv.issueDate);
        const isInDateRange = invDate >= start && invDate <= end;
        const isForSpa = 
          (inv.bookingId && spaBookingIds.has(inv.bookingId)) ||
          productSaleInvoiceIds.has(inv.id) ||
          membershipInvoiceIds.has(inv.id);
        return isInDateRange && isForSpa;
      });
      const spaInvoiceIds = new Set(spaInvoices.map((inv: any) => inv.id));
      
      // Get transactions linked to these invoices
      const allTransactions = await storage.getAllTransactions();
      const spaTransactions = allTransactions.filter((txn: any) => {
        const txnDate = new Date(txn.transactionDate);
        const isInDateRange = txnDate >= start && txnDate <= end;
        const isForSpa = txn.invoiceId && spaInvoiceIds.has(txn.invoiceId);
        return isInDateRange && isForSpa;
      });
      
      // Group by payment method
      const paymentMethods = ['card', 'cash', 'online'];
      const exportData = paymentMethods.map(method => {
        const methodTransactions = spaTransactions.filter((t: any) => t.paymentMethod === method);
        const payments = methodTransactions.filter((t: any) => t.transactionType === 'payment');
        const refunds = methodTransactions.filter((t: any) => t.transactionType === 'refund');
        
        const paymentAmount = payments.reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);
        const refundAmount = refunds.reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);
        
        return {
          paymentMethod: method.charAt(0).toUpperCase() + method.slice(1),
          numberOfPayments: payments.length,
          paymentAmount: formatCurrency(paymentAmount),
          numberOfRefunds: refunds.length,
          refunds: formatCurrency(refundAmount),
          netPayments: formatCurrency(paymentAmount - refundAmount),
        };
      });
      
      const filename = `payment-summary-${formatDate(start)}-to-${formatDate(end)}`;
      
      if (format === 'csv') {
        await exportToCSV(
          exportData,
          [
            { id: 'paymentMethod', title: 'Payment Method' },
            { id: 'numberOfPayments', title: 'Number of Payments' },
            { id: 'paymentAmount', title: 'Payment Amount' },
            { id: 'numberOfRefunds', title: 'Number of Refunds' },
            { id: 'refunds', title: 'Refunds' },
            { id: 'netPayments', title: 'Net Payments' }
          ],
          filename,
          res
        );
      } else if (format === 'excel') {
        await exportToExcel(
          exportData,
          [
            { key: 'paymentMethod', header: 'Payment Method', width: 20 },
            { key: 'numberOfPayments', header: 'Number of Payments', width: 18 },
            { key: 'paymentAmount', header: 'Payment Amount', width: 18 },
            { key: 'numberOfRefunds', header: 'Number of Refunds', width: 18 },
            { key: 'refunds', header: 'Refunds', width: 15 },
            { key: 'netPayments', header: 'Net Payments', width: 18 }
          ],
          filename,
          'Payment Summary',
          res
        );
      } else if (format === 'pdf') {
        await exportToPDF(
          exportData,
          ['paymentMethod', 'numberOfPayments', 'paymentAmount', 'numberOfRefunds', 'refunds', 'netPayments'],
          'Payment Summary Report',
          filename,
          res
        );
      } else {
        res.status(400).json({ message: 'Invalid format. Use csv, excel, or pdf' });
      }
    } catch (error) {
      handleRouteError(res, error, "Failed to export payment summary");
    }
  });

  // ==================== NOTIFICATION WEBHOOKS ====================
  
  // Note: Stripe webhook is registered in index.ts before express.json() middleware
  // to ensure raw body access for signature verification

  // Helper: Verify Twilio webhook signature
  async function verifyTwilioWebhook(req: any): Promise<{ valid: boolean; error?: string }> {
    try {
      const twilioSignature = req.headers['x-twilio-signature'] as string;
      if (!twilioSignature) {
        return { valid: false, error: 'Missing X-Twilio-Signature header' };
      }

      const accountSid = req.body.AccountSid;
      if (!accountSid) {
        return { valid: false, error: 'Missing AccountSid in webhook payload' };
      }

      // Get all Twilio credentials and find matching one by AccountSid
      const allTwilioCredentials = await storage.getAllTwilioCredentials();
      let matchingCredential = null;

      for (const cred of allTwilioCredentials) {
        try {
          const decrypted = decryptJSON<{ accountSid: string; authToken: string }>(cred.encryptedCredentials);
          if (decrypted.accountSid === accountSid) {
            matchingCredential = { ...cred, decrypted };
            break;
          }
        } catch {
          continue;
        }
      }

      if (!matchingCredential) {
        return { valid: false, error: 'No matching Twilio credentials found for AccountSid' };
      }

      // Reconstruct the webhook URL (accounting for reverse proxies)
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      // Validate the request signature
      const isValid = twilio.validateRequest(
        matchingCredential.decrypted.authToken,
        twilioSignature,
        fullUrl,
        req.body
      );

      if (!isValid) {
        securityLogger.suspiciousActivity('Twilio webhook signature validation failed', { 
          accountSid: accountSid.substring(0, 8) + '...',
          url: fullUrl 
        });
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Twilio webhook verification error', { error: error instanceof Error ? error.message : 'Unknown' });
      return { valid: false, error: 'Verification failed' };
    }
  }

  // Twilio delivery status webhook (with signature verification)
  app.post("/api/webhooks/twilio", async (req, res) => {
    try {
      // Verify Twilio signature
      const verification = await verifyTwilioWebhook(req);
      if (!verification.valid) {
        securityLogger.suspiciousActivity('Twilio webhook rejected', { reason: verification.error });
        return res.status(403).send('Forbidden');
      }

      const { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage } = req.body;
      
      // Update message status in database
      await storage.updateNotificationEventStatus(MessageSid, {
        status: MessageStatus,
        errorMessage: ErrorMessage || null,
        deliveredAt: MessageStatus === 'delivered' ? new Date() : null,
      });
      
      logger.debug('Twilio webhook received', { messageSid: MessageSid, status: MessageStatus });
      res.status(200).send('OK');
    } catch (error) {
      logger.error('Twilio webhook error', { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).send('Error');
    }
  });
  
  // Twilio WhatsApp inbound message webhook (with signature verification)
  app.post("/api/webhooks/whatsapp/inbound", async (req, res) => {
    try {
      // Verify Twilio signature
      const verification = await verifyTwilioWebhook(req);
      if (!verification.valid) {
        securityLogger.suspiciousActivity('WhatsApp webhook rejected', { reason: verification.error });
        return res.status(403).send('Forbidden');
      }

      const { MessageSid, From, To, Body, ButtonPayload, ListId, ListTitle } = req.body;
      
      logger.debug('WhatsApp inbound message', { from: From, hasBody: !!Body });
      
      // Import and use the WhatsApp booking service
      const { whatsappBookingService } = await import('./whatsappBookingService');
      
      // Handle the inbound message
      const response = await whatsappBookingService.handleInboundMessage({
        MessageSid,
        From,
        To,
        Body: Body || '',
        ButtonPayload,
        ListId,
        ListTitle,
      });
      
      // Twilio expects TwiML response or empty 200
      res.status(200).send('');
    } catch (error) {
      logger.error('WhatsApp inbound webhook error', { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).send('Error');
    }
  });

  // MSG91 delivery status webhook
  // Note: MSG91 does not support cryptographic signature verification
  // Security relies on: 1) IP whitelisting in MSG91 dashboard, 2) Optional custom header verification
  app.post("/api/webhooks/msg91", async (req, res) => {
    try {
      // Optional: Verify custom header if MSG91_WEBHOOK_SECRET is configured
      const expectedSecret = process.env.MSG91_WEBHOOK_SECRET;
      if (expectedSecret) {
        const providedSecret = req.headers['x-msg91-webhook-secret'] as string;
        if (providedSecret !== expectedSecret) {
          securityLogger.suspiciousActivity('MSG91 webhook rejected', { reason: 'invalid secret header' });
          return res.status(403).send('Forbidden');
        }
      }

      const { requestId, status, mobile, errorCode, errorMessage } = req.body;
      
      // Update message status in database
      await storage.updateNotificationEventStatus(requestId, {
        status: status,
        errorMessage: errorMessage || null,
        deliveredAt: status === 'DELIVRD' ? new Date() : null,
      });
      
      logger.debug('MSG91 webhook received', { requestId, status });
      res.status(200).send('OK');
    } catch (error) {
      logger.error('MSG91 webhook error', { error: error instanceof Error ? error.message : 'Unknown' });
      res.status(500).send('Error');
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
