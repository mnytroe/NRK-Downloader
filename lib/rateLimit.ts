/**
 * Rate limiter with Redis support and in-memory fallback
 * 
 * Features:
 * - Redis-based sliding window for distributed rate limiting
 * - In-memory fallback when Redis is unavailable
 * - Configurable rate limits via environment variables
 * - Rate limit headers support
 */

import { NextRequest } from "next/server";
import { logger } from './logger';
import { env } from "./env";
import { getRedis } from "./redis";

interface RateLimitRecord {
  count: number;
  ts: number;
}

const hits = new Map<string, RateLimitRecord>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5;   // 5 requests per window

/**
 * Check if request is within rate limit
 * @param req - Request object with headers
 * @returns true if request is allowed, false if rate limited
 */
export function rateLimitOk(req: Request): boolean {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip);
  
  // No record or window expired - allow and reset
  if (!rec || now - rec.ts > WINDOW_MS) {
    hits.set(ip, { count: 1, ts: now });
    logger.debug('Rate limit: new window started', { ip, count: 1 });
    return true;
  }
  
  // Within window and over limit - deny
  if (rec.count >= MAX_REQUESTS) {
    logger.warn('Rate limit exceeded', { ip, count: rec.count, maxRequests: MAX_REQUESTS });
    return false;
  }
  
  // Within window and under limit - allow and increment
  rec.count += 1;
  logger.debug('Rate limit: request allowed', { ip, count: rec.count, maxRequests: MAX_REQUESTS });
  return true;
}

// ===== NY FUNKSJON (med Redis-støtte) =====
interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
}

// Sliding window (Redis) med fallback til in-memory per prosess
const memoryHits = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(req: NextRequest): Promise<RateLimitResult> {
  const limit = env.RATE_LIMIT_PER_MINUTE;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
  const key = `rl:${ip}`;
  const now = Date.now();
  const windowMs = 60_000;
  const redis = getRedis();

  try {
    if (redis) {
      const pipeline = redis.pipeline();
      pipeline.zadd(key, now, `${now}`);
      pipeline.zremrangebyscore(key, 0, now - windowMs);
      pipeline.zcard(key);
      pipeline.pexpire(key, windowMs);
      const results = await pipeline.exec();
      
      if (results) {
        const cardResult = results[2];
        const current = Number((cardResult as any[])?.[1] ?? 0);
        
        if (current > limit) {
          return { 
            allowed: false, 
            limit, 
            remaining: 0, 
            retryAfter: 60 
          };
        }
        
        return { 
          allowed: true, 
          limit, 
          remaining: Math.max(0, limit - current) 
        };
      }
    }
  } catch (e) {
    logger.warn("[rateLimit] Redis unavailable, falling back to memory", { error: e });
  }

  // Fallback til in-memory
  const rec = memoryHits.get(key) ?? { count: 0, resetAt: now + windowMs };
  if (now > rec.resetAt) { 
    rec.count = 0; 
    rec.resetAt = now + windowMs; 
  }
  rec.count++; 
  memoryHits.set(key, rec);
  const remaining = Math.max(0, limit - rec.count);
  
  return { 
    allowed: rec.count <= limit, 
    limit, 
    remaining, 
    retryAfter: Math.ceil((rec.resetAt - now) / 1000) 
  };
}

/**
 * Periodic cleanup of old entries (optional, for memory efficiency)
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits.entries()) {
      if (now - rec.ts > WINDOW_MS) {
        hits.delete(ip);
      }
    }
    for (const [key, rec] of memoryHits.entries()) {
      if (now > rec.resetAt) {
        memoryHits.delete(key);
      }
    }
  }, WINDOW_MS);
}

