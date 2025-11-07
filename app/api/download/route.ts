import { NextRequest, NextResponse } from 'next/server';
import { spawnSync, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join, sep } from 'node:path';
import { sanitizeFilename } from '@/lib/filename';
import { rateLimitOk, rateLimit } from '@/lib/rateLimit';
import { logger, generateRequestId } from '@/lib/logger';
import { env } from '@/lib/env';
import { isAllowedUrl, normalizeHost } from '@/lib/host';

/**
 * Generate Content-Disposition header with proper encoding for Norwegian characters (æøå)
 * Uses RFC 5987 encoding (filename*) for UTF-8 support with ASCII fallback
 */
function getContentDisposition(filename: string): string {
  // ASCII-safe version (fallback for older browsers)
  const asciiName = filename
    .replace(/[æøåÆØÅ]/g, (char) => {
      const map: Record<string, string> = {
        'æ': 'ae', 'ø': 'o', 'å': 'aa',
        'Æ': 'Ae', 'Ø': 'O', 'Å': 'Aa'
      };
      return map[char] || char;
    })
    .replace(/[^\x20-\x7E]/g, '_'); // Replace non-ASCII with underscore
  
  // RFC 5987 encoding for UTF-8 (filename*)
  const utf8Encoded = encodeURIComponent(filename)
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  
  // Use both filename (ASCII) and filename* (UTF-8) for maximum compatibility
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Encoded}`;
}

/**
 * Get MIME type based on file extension
 * Returns safe default (video/mp4) if extension is unknown
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'flv': 'video/x-flv',
    'wmv': 'video/x-ms-wmv',
    'm4v': 'video/x-m4v',
    '3gp': 'video/3gpp',
  };
  
  return mimeTypes[ext] || 'video/mp4'; // Safe default
}

function apiError(
  code: string,
  message: string,
  opts?: { status?: number; details?: string; requestId?: string; hint?: string; retryAfterMs?: number },
) {
  return NextResponse.json(
    {
      code,
      message,
      details: opts?.details,
      requestId: opts?.requestId,
      hint: opts?.hint,
      retryAfterMs: opts?.retryAfterMs,
    },
    { status: opts?.status ?? 400 },
  );
}

const TMP_DIR = env.TMP_DIR || '/tmp/nrk';

async function ensureTmpDir() {
  await fs.mkdir(TMP_DIR, { recursive: true, mode: 0o777 });
}

const BASE_ARGS = [
  '--no-playlist',
  '--force-ipv4',
  '--add-header', 'Referer: https://tv.nrk.no/',
  '--add-header', 'User-Agent: Mozilla/5.0',
];

function normalizeForYtDlp(p: string): string {
  return p.split(sep).join('/');
}

function streamArgs(url: string, format?: string): string[] {
  return [
    ...BASE_ARGS,
    '--downloader', 'ffmpeg',
    '--no-part',
    '--merge-output-format', 'mp4',
    '-f', format || 'best/bestvideo+bestaudio',
    '-o', '-',
    url,
  ];
}

function fileArgs(url: string, outBase: string, format?: string): string[] {
  const outputPattern = normalizeForYtDlp(join(TMP_DIR, `${outBase}.%(ext)s`));
  const tempDir = normalizeForYtDlp(TMP_DIR);
  return [
    ...BASE_ARGS,
    '--no-part',
    '--merge-output-format', 'mp4',
    '--concurrent-fragments', '4',
    '-f', format || 'best/bestvideo+bestaudio',
    '-P', `temp:${tempDir}`,
    '-o', outputPattern,
    url,
  ];
}


async function cleanupTempFiles(prefix: string) {
  try {
    const entries = await fs.readdir(TMP_DIR);
    await Promise.all(entries
      .filter((entry) => entry.startsWith(`${prefix}.`))
      .map((entry) => fs.unlink(join(TMP_DIR, entry)).catch(() => undefined)));
  } catch (error) {
    logger.warn('Failed to cleanup temp files', { prefix, error: (error as Error).message });
  }
}

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Set longer timeout for video downloads
export const maxDuration = 600; // 10 minutes

const ALLOWED_HOSTS = new Set(['tv.nrk.no', 'www.nrk.no', 'nrk.no', 'radio.nrk.no']);

/**
 * Validate that URL is from allowed NRK domains and looks like a video URL
 * Blocks URL tricks like userinfo@host, IP literals, and non-HTTP schemes
 * Also blocks generic pages like the front page (nrk.no or www.nrk.no without path)
 */
function isAllowedNrk(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    
    // Block non-HTTP schemes
    if (!['http:', 'https:'].includes(u.protocol)) {
      return false;
    }
    
    // Block IP literals (IPv4 and IPv6)
    if (u.hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || u.hostname.includes(':')) {
      return false;
    }
    
    // Block localhost and local domains
    if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) {
      return false;
    }
    
    // Block userinfo in URL (e.g., https://nrk.no@evil.tld/)
    if (u.username || u.password) {
      return false;
    }
    
    // Check if hostname is in allowed list (exact match only)
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return false;
    }
    
    // Additional validation: Block generic front pages that aren't video URLs
    // tv.nrk.no and radio.nrk.no are always OK (they only host media)
    if (u.hostname === 'tv.nrk.no' || u.hostname === 'radio.nrk.no') {
      // Check if it's a series page (not a specific episode)
      // Series pages typically have pattern: /serie/serie-name (without episode ID)
      // Episodes have: /serie/serie-name/episode-id or /serie/serie-name/season/episode
      const path = u.pathname.toLowerCase();
      if (path.startsWith('/serie/')) {
        const pathParts = path.split('/').filter(p => p.length > 0);
        // If it's just /serie/serie-name (2 parts), it's a series page, not an episode
        if (pathParts.length === 2) {
          return false; // Block series pages, require specific episode
        }
      }
      return true;
    }
    
    // For nrk.no and www.nrk.no, require a path that looks like a video URL
    if (u.hostname === 'nrk.no' || u.hostname === 'www.nrk.no') {
      const path = u.pathname.toLowerCase();
      
      // Block root path (front page)
      if (path === '/' || path === '') {
        return false;
      }
      
      // Allow paths that look like video URLs
      // Common patterns: /video/, /serie/, /program/, /podkast/, etc.
      const videoPathPatterns = [
        /^\/video\//,
        /^\/serie\//,
        /^\/program\//,
        /^\/podkast\//,
        /^\/radio\//,
        /^\/tv\//,
        /^\/super\//,
        /^\/p3\//,
      ];
      
      return videoPathPatterns.some(pattern => pattern.test(path));
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Get video title from yt-dlp for filename
 */
function getVideoTitle(url: string): string {
  try {
    const meta = spawnSync('yt-dlp', ['--no-warnings', '--print', '%(title)s', url], {
      encoding: 'utf-8',
      timeout: 10000, // 10s timeout
      env: { 
        ...process.env, 
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8'
      }, // Ensure UTF-8 output
    });
    if (meta.status === 0 && meta.stdout) {
      // Clean up any encoding issues and normalize Norwegian characters
      let title = meta.stdout.trim();
      
      // Handle common encoding issues - preserve Norwegian characters
      title = title
        .replace(/[^\x20-\x7E\u00C0-\u017F]/g, '') // Keep Latin chars including Norwegian
        .replace(/[^\w\s\-\.æøåÆØÅ]/g, '') // Keep safe chars + Norwegian
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
      
      return title || 'nrk-video';
    }
  } catch (err) {
    console.error('Failed to get video title:', err);
  }
  return 'nrk-video';
}

/**
 * Primary strategy: Stream yt-dlp stdout directly to response
 * Abort-safe implementation with proper cleanup
 */
async function streamFromStdout(url: string, safeName: string, req: NextRequest, format?: string): Promise<NextResponse> {
  const args = streamArgs(url, format);
  const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // Capture stderr for debugging
  let stderrBuf = '';
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
  });

  const onAbort = () => {
    try {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 3000);
    } catch (err) {
      logger.warn('Failed to kill yt-dlp process on abort', { error: err });
    }
  };

  req.signal.addEventListener('abort', onAbort, { once: true });

  const stream = new ReadableStream({
    start(controller) {
      child.stdout.on('data', (data) => {
        try {
          controller.enqueue(data);
        } catch (err) {
          logger.warn('Failed to enqueue data', { error: err });
        }
      });

      child.on('close', (code, signal) => {
        try {
          if (code !== 0 && code !== null) {
            logger.ytDlpError(url, stderrBuf, code);
          }
          if (signal) {
            logger.info(`yt-dlp killed with signal ${signal}`, { url });
          }
          controller.close();
        } catch (err) {
          logger.warn('Error closing stream controller', { error: err });
        }
      });

      child.on('error', (err) => {
        try {
          logger.error('yt-dlp process error', err, { url });
          controller.error(err);
        } catch (e) {
          logger.warn('Error in stream error handler', { error: e });
        }
      });
    },
    cancel() {
      onAbort();
    },
  });

  return new Promise<NextResponse>((resolve, reject) => {
    let hasStarted = false;
    let hasErrored = false;

    const timeout = setTimeout(() => {
      if (!hasStarted && !hasErrored) {
        hasErrored = true;
        onAbort();
        const timeoutError = new Error('Download timeout: yt-dlp did not start sending data');
        (timeoutError as any).code = 'YTDLP_START_TIMEOUT';
        (timeoutError as any).details = stderrBuf;
        reject(timeoutError);
      }
    }, 30000);

    child.stdout.once('data', () => {
      if (hasErrored) return;
      hasStarted = true;
      clearTimeout(timeout);

      const headers = new Headers();
      headers.set('Content-Type', getMimeType(safeName));
      headers.set('Content-Disposition', getContentDisposition(safeName));
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');

      resolve(new NextResponse(stream, { status: 200, headers }));
    });

    child.on('exit', (code, signal) => {
      if (hasErrored) return;

      if (code !== 0 && code !== null && !hasStarted) {
        hasErrored = true;
        clearTimeout(timeout);
        logger.ytDlpError(url, stderrBuf, code);

        let errorMsg = 'Download failed';
        if (stderrBuf.includes('ERROR')) {
          const errorMatch = stderrBuf.match(/ERROR:\s*(.+)/);
          if (errorMatch) {
            errorMsg = errorMatch[1].trim();
          }
        } else if (stderrBuf.includes('Unsupported URL')) {
          errorMsg = 'Unsupported URL or video not available';
        } else if (stderrBuf.includes('Private video')) {
          errorMsg = 'Video is private or not available';
        }

        const err = new Error(errorMsg);
        (err as any).code = 'YTDLP_FAILED';
        (err as any).details = stderrBuf;
        reject(err);
      }
    });

    child.on('error', (err) => {
      if (hasErrored) return;
      hasErrored = true;
      clearTimeout(timeout);
      logger.error('yt-dlp process error', err, { url });
      const wrapped = new Error(`Failed to start download: ${err.message}`);
      (wrapped as any).code = 'YTDLP_FAILED';
      (wrapped as any).details = stderrBuf || err.message;
      reject(wrapped);
    });
  });
}

/**
 * Fallback strategy: Download to temp file, then stream
 */
async function streamFromTempFile(url: string, safeName: string, req: NextRequest, format: string | undefined, requestId: string): Promise<NextResponse> {
  await ensureTmpDir();
  const outBase = requestId;
  const args = fileArgs(url, outBase, format);

  logger.debug('Downloading to temp file', { tmpDir: TMP_DIR, url, outBase });

  return new Promise<NextResponse>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (value: NextResponse) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const child = spawn('yt-dlp', args, { cwd: TMP_DIR, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrBuf = '';

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
      if (chunk.includes('[download]')) {
        logger.debug('yt-dlp progress', { progress: chunk.trim(), outBase });
      }
    });

    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      } catch (err) {
        logger.warn('Failed to kill process during fallback', { error: err });
      } finally {
        cleanupTempFiles(outBase).catch(() => undefined);
        rejectOnce(new Error('Aborted'));
      }
    };

    req.signal.addEventListener('abort', abortHandler, { once: true });

    child.on('exit', async (code) => {
      if (code !== 0 && code !== null) {
        logger.ytDlpError(url, stderrBuf, code);
        await cleanupTempFiles(outBase);
        resolveOnce(
          apiError('YTDLP_FAILED', 'Nedlasting feilet.', {
            status: 500,
            details: stderrBuf,
            requestId,
          }),
        );
        return;
      }

      try {
        const files = await fs.readdir(TMP_DIR);
        const downloadedFile = files.find((f) => f.startsWith(`${outBase}.`));

        if (!downloadedFile) {
          logger.error('No output file found after download', undefined, { tmpDir: TMP_DIR, files, outBase });
          await cleanupTempFiles(outBase);
          resolveOnce(
            apiError('YTDLP_FAILED', 'Nedlasting feilet - fant ingen utdatafil.', {
              status: 500,
              details: stderrBuf,
              requestId,
            }),
          );
          return;
        }

        const finalPath = join(TMP_DIR, downloadedFile);
        const nodeStream = createReadStream(finalPath);

        nodeStream.on('close', () => {
          cleanupTempFiles(outBase).catch(() => undefined);
        });

        nodeStream.on('error', (err) => {
          logger.error('Stream error', err, { finalPath });
          cleanupTempFiles(outBase).catch(() => undefined);
          resolveOnce(
            apiError('YTDLP_FAILED', 'Kunne ikke strømme filen.', {
              status: 500,
              details: err instanceof Error ? err.message : String(err),
              requestId,
            }),
          );
        });

        const contentType = getMimeType(downloadedFile);
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Disposition', getContentDisposition(safeName));
        headers.set('Cache-Control', 'no-store');
        headers.set('X-Content-Type-Options', 'nosniff');

        const webStream = Readable.toWeb(nodeStream) as ReadableStream;
        logger.debug('Starting fallback stream', { downloadedFile, contentType, outBase });

        resolveOnce(new NextResponse(webStream, { headers }));
      } catch (err) {
        logger.error('Stream error', err as Error, { tmpDir: TMP_DIR, outBase });
        await cleanupTempFiles(outBase);
        resolveOnce(
          apiError('YTDLP_FAILED', 'Kunne ikke strømme filen.', {
            status: 500,
            details: err instanceof Error ? err.message : String(err),
            requestId,
          }),
        );
      }
    });

    child.on('error', (err) => {
      logger.error('Process error', err, { url, outBase });
      cleanupTempFiles(outBase).catch(() => undefined);
      resolveOnce(
        apiError('YTDLP_FAILED', 'Nedlastingsprosessen feilet.', {
          status: 500,
          details: err instanceof Error ? err.message : String(err),
          requestId,
        }),
      );
    });
  });
}

/**
 * POST handler - download NRK video
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  logger.setRequestId(requestId);
  
  const startTime = Date.now();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  
  logger.info('Download request received', { ip, requestId });

  // Rate limiting - prøv ny funksjon først, fallback til gammel
  try {
    const rl = await rateLimit(req);
    if (!rl.allowed) {
      logger.rateLimitHit(ip, rl.limit);
      return apiError('RATE_LIMITED', 'For mange forespørsler. Prøv igjen senere.', {
        status: 429,
        requestId,
        retryAfterMs: 60_000,
      });
    }
  } catch (error) {
    // Fallback til gammel rate limiting hvis ny feiler
    logger.warn('Rate limit check failed, using fallback', { error });
    if (!rateLimitOk(req)) {
      logger.rateLimitHit(ip, 5);
      return apiError('RATE_LIMITED', 'For mange forespørsler. Prøv igjen senere.', {
        status: 429,
        requestId,
        retryAfterMs: 60_000,
      });
    }
  }

  // Parse and validate request
  let url: string;
  let format: string | undefined;
  try {
    const body = await req.json();
    url = body.url;
    format = body.format;
    
    // Debug: Log the raw URL from request body
    logger.debug('Raw URL from request body', { url, requestId });
    
    // Clean duplicated URL if needed
    if (url.includes('nrk.no') && url.split('nrk.no').length > 2) {
      const originalUrl = url;
      // Find the first complete URL by looking for the pattern - use non-greedy matching
      const nrkMatch = url.match(/https?:\/\/[^\/]*nrk\.no[^h]*?(?=https|$)/);
      if (nrkMatch) {
        url = nrkMatch[0];
        logger.debug('Cleaned duplicated URL', { originalUrl, cleanedUrl: url, requestId });
      } else {
        // Fallback: split by nrk.no and reconstruct
        const parts = url.split('nrk.no');
        if (parts.length >= 2) {
          url = parts[0] + 'nrk.no' + parts[1];
          logger.debug('Cleaned duplicated URL (fallback)', { originalUrl, cleanedUrl: url, requestId });
        }
      }
    }
  } catch (error) {
    logger.error('Invalid request body', error as Error, { ip });
    return apiError('INVALID_REQUEST', 'Ugyldig forespørsel.', {
      status: 400,
      requestId,
      details: error instanceof Error ? error.message : undefined,
    });
  }

  if (!url || typeof url !== 'string') {
    logger.warn('Missing or invalid URL', { url, ip });
    return apiError('INVALID_URL', 'Mangler eller ugyldig URL.', {
      status: 400,
      requestId,
    });
  }

  // URL validation - prøv ny funksjon først, fallback til gammel
  let urlValid = false;
  try {
    const allow = env.ALLOW_DOMAINS.map((h) => normalizeHost(h));
    urlValid = isAllowedUrl(url, allow);
  } catch (error) {
    logger.warn('New URL validation failed, using fallback', { error });
    urlValid = isAllowedNrk(url);
  }

  if (!urlValid) {
    logger.warn('Invalid NRK URL attempted', { url, ip });
    
    // Check for specific error cases
    try {
      const u = new URL(url);
      
      // Front page
      if ((u.hostname === 'nrk.no' || u.hostname === 'www.nrk.no') && (u.pathname === '/' || u.pathname === '')) {
        return apiError('NOT_VIDEO_PAGE', 'Forsiden (nrk.no) er ikke en video. Vennligst lim inn en direkte lenke til en video, serie eller program.', {
          status: 400,
          requestId,
          hint: 'Åpne videoen du vil laste ned, og kopier lenken fra nettleseren.',
        });
      }
      
      // Series page (not a specific episode)
      if (u.hostname === 'tv.nrk.no' && u.pathname.toLowerCase().startsWith('/serie/')) {
        const pathParts = u.pathname.split('/').filter(p => p.length > 0);
        if (pathParts.length === 2) {
          return apiError('SERIES_PAGE', 'Dette er en serie-side, ikke en spesifikk episode.', {
            status: 400,
            requestId,
            hint: 'Velg en konkret episode fra serien, og kopier lenken til den siden.',
          });
        }
      }
    } catch {
      // URL parsing failed, use generic message
    }
    
    return apiError('DOMAIN_NOT_ALLOWED', 'URL-en ser ikke ut som en gyldig NRK video-lenke.', {
      status: 400,
      requestId,
      hint: 'Bruk en lenke til en spesifikk video eller episode, for eksempel tv.nrk.no/serie/.../episode-id.',
    });
  }

  // Get video title for filename
  const title = getVideoTitle(url);
  const safeName = sanitizeFilename(title) + '.mp4';

  logger.downloadStart(url, safeName, ip);

  await ensureTmpDir();

  // Try direct streaming first (fastest), fallback to temp file if it fails
  logger.debug('Attempting direct stream from yt-dlp');
  
  try {
    const response = await streamFromStdout(url, safeName, req, format);
    const duration = Date.now() - startTime;
    logger.downloadComplete(url, safeName, duration);
    return response;
  } catch (err) {
    logger.warn('Direct streaming failed, falling back to temp file method', { error: (err as Error).message });
    try {
      const response = await streamFromTempFile(url, safeName, req, format, requestId);
      const duration = Date.now() - startTime;
      logger.downloadComplete(url, safeName, duration);
      return response;
    } catch (fallbackErr) {
      const duration = Date.now() - startTime;
      logger.downloadError(url, fallbackErr as Error, { duration, method: 'temp-file' });
      const fallbackCode = typeof (fallbackErr as any)?.code === 'string'
        ? (fallbackErr as any).code.toString().toUpperCase()
        : 'YTDLP_FAILED';
      const details = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      return apiError(fallbackCode, 'Nedlasting feilet.', {
        status: 500,
        details,
        requestId,
      });
    }
  }
}

