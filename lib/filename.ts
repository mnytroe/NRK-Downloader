/**
 * Sanitize a filename to be safe for download
 * - Remove path separators and special characters
 * - Collapse multiple spaces
 * - Limit length to 120 characters
 * - Handle Norwegian characters properly
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_') // Remove path and invalid chars
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/[^\x20-\x7E\u00C0-\u017F]/g, '_') // Keep Latin chars including Norwegian
    .trim()
    .slice(0, 120);                 // Max 120 chars
}

