/**
 * Sanitize a filename to be safe for download
 * - Remove path separators and special characters
 * - Collapse multiple spaces
 * - Limit length to 120 characters
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_') // Remove path and invalid chars
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim()
    .slice(0, 120);                 // Max 120 chars
}

