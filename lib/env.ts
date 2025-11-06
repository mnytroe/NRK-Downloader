import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["production", "development"]).default("production"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ALLOW_DOMAINS: z.string()
    .default("nrk.no,tv.nrk.no,www.nrk.no,radio.nrk.no,nrkbeta.no")
    .transform(s => s.split(",").map(x => x.trim().toLowerCase()).filter(Boolean)),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  REDIS_URL: z.string().optional(),
  TMP_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

// Parse with error handling - wrap in function to avoid evaluation at import time
function getEnv() {
  try {
    return EnvSchema.parse(process.env);
  } catch (error: any) {
    console.error("❌ Environment variable validation failed:", error?.message || error);
    // Fallback to defaults
    return {
      NODE_ENV: (process.env.NODE_ENV === "development" ? "development" : "production") as "production" | "development",
      PORT: Number(process.env.PORT) || 3000,
      ALLOW_DOMAINS: (process.env.ALLOW_DOMAINS || "nrk.no,tv.nrk.no,www.nrk.no,radio.nrk.no,nrkbeta.no")
        .split(",").map(x => x.trim().toLowerCase()).filter(Boolean),
      RATE_LIMIT_PER_MINUTE: Number(process.env.RATE_LIMIT_PER_MINUTE) || 30,
      REDIS_URL: process.env.REDIS_URL,
      TMP_DIR: process.env.TMP_DIR,
      LOG_LEVEL: (process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info" || process.env.LOG_LEVEL === "warn" || process.env.LOG_LEVEL === "error") 
        ? process.env.LOG_LEVEL 
        : undefined,
    };
  }
}

// Lazy evaluation - only parse when accessed
// Use a getter function instead of Proxy for better hot reload compatibility
let _env: ReturnType<typeof getEnv> | null = null;

function getEnvValue(): ReturnType<typeof getEnv> {
  if (!_env) {
    try {
      _env = getEnv();
    } catch (error: any) {
      console.error("❌ Failed to get env, using defaults:", error?.message || error);
      // Return safe defaults if getEnv fails
      _env = {
        NODE_ENV: (process.env.NODE_ENV === "development" ? "development" : "production") as "production" | "development",
        PORT: Number(process.env.PORT) || 3000,
        ALLOW_DOMAINS: (process.env.ALLOW_DOMAINS || "nrk.no,tv.nrk.no,www.nrk.no,radio.nrk.no,nrkbeta.no")
          .split(",").map(x => x.trim().toLowerCase()).filter(Boolean),
        RATE_LIMIT_PER_MINUTE: Number(process.env.RATE_LIMIT_PER_MINUTE) || 30,
        REDIS_URL: process.env.REDIS_URL,
        TMP_DIR: process.env.TMP_DIR,
        LOG_LEVEL: (process.env.LOG_LEVEL === "debug" || process.env.LOG_LEVEL === "info" || process.env.LOG_LEVEL === "warn" || process.env.LOG_LEVEL === "error") 
          ? process.env.LOG_LEVEL 
          : undefined,
      };
    }
  }
  return _env;
}

// Export as object with getters for better hot reload support
export const env = {
  get NODE_ENV() { return getEnvValue().NODE_ENV; },
  get PORT() { return getEnvValue().PORT; },
  get ALLOW_DOMAINS() { return getEnvValue().ALLOW_DOMAINS; },
  get RATE_LIMIT_PER_MINUTE() { return getEnvValue().RATE_LIMIT_PER_MINUTE; },
  get REDIS_URL() { return getEnvValue().REDIS_URL; },
  get TMP_DIR() { return getEnvValue().TMP_DIR; },
  get LOG_LEVEL() { return getEnvValue().LOG_LEVEL; },
} as ReturnType<typeof getEnv>;

