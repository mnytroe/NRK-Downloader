import { NextRequest, NextResponse } from 'next/server';
import { spawnSync, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createReadStream, mkdtempSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeFilename } from '@/lib/filename';
import { rateLimitOk } from '@/lib/rateLimit';
import { logger, generateRequestId } from '@/lib/logger';

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Uncomment for Vercel with longer timeout:
// export const maxDuration = 300;

const ALLOWED_HOSTS = new Set(['tv.nrk.no', 'www.nrk.no', 'nrk.no', 'radio.nrk.no']);

/**
 * Validate that URL is from allowed NRK domains
 */
function isAllowedNrk(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return ALLOWED_HOSTS.has(u.hostname);
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
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, // Ensure UTF-8 output
    });
    if (meta.status === 0 && meta.stdout) {
      // Clean up any encoding issues
      return meta.stdout.trim().replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '');
    }
  } catch (err) {
    console.error('Failed to get video title:', err);
  }
  return 'nrk-video';
}

/**
 * Primary strategy: Stream yt-dlp stdout directly to response
 */
async function streamFromStdout(url: string, safeName: string, req: NextRequest): Promise<NextResponse> {
  const args = [
    '--no-playlist',
    '-f', 'bv*+ba/b', // More flexible format selector for HLS streams
    '--merge-output-format', 'mp4',
    '-o', '-', // Write to stdout
    url,
  ];

  const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // Kill process on abort
  req.signal.addEventListener('abort', () => {
    try {
      child.kill('SIGKILL');
    } catch (err) {
      console.error('Failed to kill yt-dlp process:', err);
    }
  });

  // Capture stderr for debugging
  let stderrBuf = '';
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
  });

  // Log errors on process exit
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.ytDlpError(url, stderrBuf, code);
    }
    if (signal) {
      logger.info(`yt-dlp killed with signal ${signal}`, { url });
    }
  });

  // Convert Node Readable to Web ReadableStream
  const webStream = Readable.toWeb(child.stdout) as ReadableStream;

  const headers = new Headers();
  headers.set('Content-Type', 'video/mp4');
  headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
  headers.set('Cache-Control', 'no-store');

  return new NextResponse(webStream, { status: 200, headers });
}

/**
 * Fallback strategy: Download to temp file, then stream
 */
async function streamFromTempFile(url: string, safeName: string, req: NextRequest): Promise<NextResponse> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nrk-'));
  const outTemplate = join(tmpDir, 'out.%(ext)s');

  const args = [
    '--no-playlist',
    '-f', 'bv*+ba/best',
    '--merge-output-format', 'mp4',
    '-o', outTemplate,
    url,
  ];

  logger.debug('Downloading to temp file', { tmpDir, url });
  
  return new Promise<NextResponse>((resolve, reject) => {
    const child = spawn('yt-dlp', args);
    let stderrBuf = '';

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
      // Log progress
      if (chunk.includes('[download]')) {
        logger.debug('yt-dlp progress', { progress: chunk.trim() });
      }
    });

    // Kill on abort
    req.signal.addEventListener('abort', () => {
      try {
        child.kill('SIGKILL');
        reject(new Error('Aborted'));
      } catch (err) {
        console.error('Failed to kill process:', err);
      }
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        logger.ytDlpError(url, stderrBuf, code);
        resolve(new NextResponse('Download failed', { status: 500 }));
        return;
      }

      try {
        // Find the downloaded file
        const files = readdirSync(tmpDir);
        const downloadedFile = files.find(f => f.startsWith('out.'));
        
        if (!downloadedFile) {
          logger.error('No output file found after download', undefined, { tmpDir, files });
          resolve(new NextResponse('Download failed - no output file', { status: 500 }));
          return;
        }

        const finalPath = join(tmpDir, downloadedFile);
        const stream = createReadStream(finalPath);

        // Cleanup on stream close
        stream.on('close', () => {
          try {
            unlinkSync(finalPath);
          } catch (err) {
            console.error('Failed to delete temp file:', err);
          }
        });

        // Determine Content-Type
        const ext = downloadedFile.split('.').pop()?.toLowerCase();
        const contentType = ext === 'mp4' ? 'video/mp4' :
                           ext === 'mkv' ? 'video/x-matroska' :
                           ext === 'webm' ? 'video/webm' :
                           'video/mp4';

        const webStream = Readable.toWeb(stream) as ReadableStream;

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
        headers.set('Cache-Control', 'no-store');

        logger.debug('Starting stream', { downloadedFile, contentType });
        resolve(new NextResponse(webStream, { headers }));
      } catch (err) {
        logger.error('Stream error', err as Error, { downloadedFile });
        resolve(new NextResponse('Failed to stream file', { status: 500 }));
      }
    });

    child.on('error', (err) => {
      logger.error('Process error', err, { url });
      resolve(new NextResponse('Download process failed', { status: 500 }));
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

  // Rate limiting
  if (!rateLimitOk(req)) {
    logger.rateLimitHit(ip, 5);
    return new NextResponse('Rate limit exceeded. Try again later.', { status: 429 });
  }

  // Parse and validate request
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
    
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
    return new NextResponse('Invalid request body', { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    logger.warn('Missing or invalid URL', { url, ip });
    return new NextResponse('Missing or invalid URL', { status: 400 });
  }

  if (!isAllowedNrk(url)) {
    logger.warn('Non-NRK URL attempted', { url, ip });
    return new NextResponse('Only NRK URLs are allowed (tv.nrk.no, www.nrk.no, nrk.no, radio.nrk.no)', { status: 400 });
  }

  // Get video title for filename
  const title = getVideoTitle(url);
  const safeName = sanitizeFilename(title) + '.mp4';

  logger.downloadStart(url, safeName, ip);

  // Try direct streaming first (fastest), fallback to temp file if it fails
  logger.debug('Attempting direct stream from yt-dlp');
  
  try {
    const response = await streamFromStdout(url, safeName, req);
    const duration = Date.now() - startTime;
    logger.downloadComplete(url, safeName, duration);
    return response;
  } catch (err) {
    logger.warn('Direct streaming failed, falling back to temp file method', { error: (err as Error).message });
    try {
      const response = await streamFromTempFile(url, safeName, req);
      const duration = Date.now() - startTime;
      logger.downloadComplete(url, safeName, duration);
      return response;
    } catch (fallbackErr) {
      const duration = Date.now() - startTime;
      logger.downloadError(url, fallbackErr as Error, { duration, method: 'temp-file' });
      return new NextResponse('Download failed', { status: 500 });
    }
  }
}

