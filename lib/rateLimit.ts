/**
 * Simple in-memory rate limiter (MVP)
 * For production, use Redis or similar distributed store
 */

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
    return true;
  }
  
  // Within window and over limit - deny
  if (rec.count >= MAX_REQUESTS) {
    return false;
  }
  
  // Within window and under limit - allow and increment
  rec.count += 1;
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

