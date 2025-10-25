/**
 * Sanitize a filename to be safe for download
 * - Normalize Unicode (NFKC) to handle composed characters
 * - Remove path separators and special characters
 * - Collapse multiple spaces
 * - Limit length to 120 characters
 * - Preserve Norwegian characters (æ, ø, å) and emoji
 */
export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFKC')              // Normalize Unicode (handles composed characters)
    .replace(/[\/\\:*?"<>|]/g, '_') // Remove path and invalid chars
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '_') // Keep printable chars + Unicode
    .trim()
    .slice(0, 120);                 // Max 120 chars
}

