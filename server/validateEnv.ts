import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().regex(/^\d+$/).transform(Number).default("5000"),
  // ENCRYPTION_KEY is optional but validated if present (required for OAuth token encryption)
  ENCRYPTION_KEY: z.string()
    .min(32, "ENCRYPTION_KEY must be at least 32 characters for 256-bit security")
    .optional(),
});

export function validateEnvironment() {
  try {
    const env = envSchema.parse(process.env);
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
