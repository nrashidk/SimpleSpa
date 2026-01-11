import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateEnvironment } from "./validateEnv";
import { appointmentScheduler } from "./appointmentScheduler";
import { logger } from "./logger";

// Validate environment variables on startup
validateEnvironment();

const app = express();

// CORS configuration - restrict to allowed origins
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, same-origin)
    if (!origin) return callback(null, true);
    
    // In development, allow localhost origins
    if (!isProduction && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('.replit.dev'))) {
      return callback(null, true);
    }
    
    // In production, only allow configured origins
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// Security headers (configured for development and production)
const isProductionEnv = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
app.use(helmet({
  contentSecurityPolicy: isProductionEnv ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com", "https://*.firebaseapp.com", "https://www.gstatic.com", "https://www.google.com", "https://www.recaptcha.net", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "https://identitytoolkit.googleapis.com", "wss:", "https://api.stripe.com", "https://*.stripe.com", "https://hooks.stripe.com", "https://www.google.com", "https://www.recaptcha.net", "https://m.stripe.network"],
      frameSrc: ["'self'", "https://*.firebaseapp.com", "https://js.stripe.com", "https://*.stripe.com", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://*.stripe.com", "https://hooks.stripe.com"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  hsts: isProductionEnv ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
}));

// Rate limiters for different endpoint types
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: { message: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for general API
  message: { message: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 booking attempts per minute
  message: { message: "Too many booking attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 OTP requests per 15 minutes per IP
  message: { message: "Too many OTP requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 OTP verification attempts per 15 minutes
  message: { message: "Too many verification attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// CRITICAL: Register Stripe webhook BEFORE express.json() middleware
// Stripe requires raw body for signature verification
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      logger.warn('[Stripe Webhook] Missing signature');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const { handleStripeWebhook } = await import('./stripeWebhook');
    const result = await handleStripeWebhook(req.body as Buffer, signature);
    
    if (result.success) {
      res.status(200).json({ received: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error: any) {
    logger.error('[Stripe Webhook] Error', { error: error.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// XSS Protection Strategy:
// 1. Helmet CSP headers prevent inline script execution
// 2. React automatically escapes HTML in JSX (output encoding)
// 3. API responses are JSON (not HTML), preventing reflected XSS
// 4. Input validation via Zod schemas rejects malformed data
// Note: Server-side input sanitization was removed as it corrupts legitimate
// data (O'Brien -> O&#x27;Brien). Output encoding is the correct approach.

// CSRF Protection - Session-bound synchronizer token pattern
// Routes that are exempt from CSRF protection (webhooks, pre-auth endpoints)
const CSRF_EXEMPT_ROUTES = [
  '/api/webhooks/stripe',
  '/api/webhooks/whatsapp',
  '/api/webhooks/twilio',
  '/api/auth/firebase', // Firebase token auth has its own verification
  '/api/auth/customer/register', // Customer registration - pre-authentication
  '/api/auth/customer/login', // Customer login - pre-authentication
  '/api/auth/customer/phone/request-otp', // Phone OTP request - pre-authentication
  '/api/auth/customer/phone/verify-otp', // Phone OTP verify - pre-authentication
  '/api/admin/login', // Login endpoint - pre-authentication, protected by rate limiting
  '/api/admin/register', // Registration endpoint - pre-authentication
  '/api/admin/apply', // Admin application - pre-authentication
  '/api/admin/forgot-password', // Password reset request - pre-authentication
  '/api/admin/reset-password', // Password reset with token - pre-authentication
  '/api/upload/license', // License upload for admin application - pre-authentication
];

// Middleware to ensure CSRF token exists in session
function ensureCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any).csrfToken) {
    (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
}

// Middleware to validate CSRF token on state-changing requests
function validateCsrf(req: Request, res: Response, next: NextFunction) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for exempt routes - use originalUrl which includes full path
  if (CSRF_EXEMPT_ROUTES.some(route => req.originalUrl.startsWith(route))) {
    return next();
  }
  
  // At this point ensureCsrfToken has run, so session token should exist
  // Validate the token - reject if missing or mismatched
  const token = req.headers['x-csrf-token'] as string;
  const sessionToken = (req.session as any).csrfToken;
  
  if (!sessionToken || !token || token !== sessionToken) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  
  next();
}

// Export for use in routes
export { ensureCsrfToken, validateCsrf };

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    appointmentScheduler.start();

    // Initialize WhatsApp booking service with spa credentials
    (async () => {
      try {
        const { whatsappBookingService } = await import('./whatsappBookingService');
        const { spaNotificationCredentials } = await import('../shared/schema');
        const { db } = await import('./db');
        const { eq, and } = await import('drizzle-orm');
        const { decryptJSON } = await import('./encryptionService');

        // Load first active WhatsApp credentials
        const [creds] = await db
          .select()
          .from(spaNotificationCredentials)
          .where(
            and(
              eq(spaNotificationCredentials.channel, 'whatsapp'),
              eq(spaNotificationCredentials.isActive, true)
            )
          )
          .limit(1);

        if (creds) {
          const decrypted = decryptJSON(creds.encryptedCredentials);
          await whatsappBookingService.initialize(
            decrypted.accountSid,
            decrypted.authToken,
            creds.fromPhone
          );
          logger.info('✅ WhatsApp service initialized', {
            spaId: creds.spaId,
            fromPhone: creds.fromPhone
          });
        } else {
          logger.warn('⚠️  No WhatsApp credentials configured - service in DEV MODE');
        }
      } catch (error: any) {
        logger.error('❌ Failed to initialize WhatsApp service', { error: error.message });
      }
    })();
  });
})();
