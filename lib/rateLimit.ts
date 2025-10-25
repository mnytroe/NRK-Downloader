/**
 * Simple in-memory rate limiter (MVP)
 * 
 * PRODUCTION IMPROVEMENTS NEEDED:
 * - Use Redis or similar distributed store for horizontal scaling
 * - Implement per-route rate limiting (different limits for different endpoints)
 * - Add rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
 * - Consider sliding window vs fixed window algorithms
 * - Add rate limit bypass for authenticated users
 * - Implement distributed rate limiting across multiple server instances
 * 
 * Example Redis implementation:
 * ```typescript
 * const key = `rate_limit:${ip}:${route}`;
 * const current = await redis.incr(key);
 * if (current === 1) await redis.expire(key, WINDOW_SECONDS);
 * return current <= MAX_REQUESTS;
 * ```
 */

import { logger } from './logger';

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
  }, WINDOW_MS);
}

