import { z } from "zod";

const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().regex(/^\d+$/).transform(Number).default("5000"),
  // ENCRYPTION_KEY is required for secure credential storage (OAuth tokens, notification provider credentials)
  ENCRYPTION_KEY: z.string()
    .min(32, "ENCRYPTION_KEY is required and must be at least 32 characters for 256-bit security"),
});

// Additional validation for production environment
const productionEnvSchema = z.object({
  // SMTP configuration - required in production for password reset and notifications
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required in production for email functionality"),
  SMTP_USER: z.string().min(1, "SMTP_USER is required in production"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required in production"),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_FROM: z.string().email().optional(),
});

export function validateEnvironment() {
  try {
    // Always validate core requirements
    const env = envSchema.parse(process.env);
    
    // In production, also validate SMTP settings (warn but don't fail)
    if (isProduction) {
      try {
        productionEnvSchema.parse(process.env);
      } catch (smtpError) {
        if (smtpError instanceof z.ZodError) {
          console.warn("⚠️ Production environment missing recommended settings:");
          smtpError.errors.forEach((err) => {
            console.warn(`  - ${err.path.join(".")}: ${err.message}`);
          });
          console.warn("  Email functionality (password reset, notifications) may not work.");
        }
      }
    }
    
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment validation failed:");
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export type ValidatedEnv = z.infer<typeof envSchema>;
