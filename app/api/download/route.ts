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
      child.kill('SIGTERM');
      // Force kill after 5 seconds if process doesn't exit gracefully
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
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

  // Wait for first data chunk or error to ensure yt-dlp is working
  return new Promise<NextResponse>((resolve, reject) => {
    let hasStarted = false;
    let hasErrored = false;

    // Check for early exit/error (before stream starts)
    const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
      if (hasErrored) return; // Already handled
      
      if (code !== 0 && code !== null && !hasStarted) {
        hasErrored = true;
        logger.ytDlpError(url, stderrBuf, code);
        
        // Extract error message from stderr
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
        
        reject(new Error(errorMsg));
      }
      
      // Always log exit for debugging (even if successful)
      if (code !== 0 && code !== null) {
        logger.ytDlpError(url, stderrBuf, code);
      }
      if (signal) {
        logger.info(`yt-dlp killed with signal ${signal}`, { url });
      }
    };

    child.on('exit', exitHandler);

    // Check for process errors
    child.on('error', (err) => {
      if (hasErrored) return;
      hasErrored = true;
      logger.error('yt-dlp process error', err, { url });
      reject(new Error(`Failed to start download: ${err.message}`));
    });

    // Wait for first data chunk to ensure stream is working
    const timeout = setTimeout(() => {
      if (!hasStarted && !hasErrored) {
        hasErrored = true;
        child.kill('SIGTERM');
        reject(new Error('Download timeout: yt-dlp did not start sending data'));
      }
    }, 30000); // 30 second timeout

    child.stdout.once('data', () => {
      if (hasErrored) return;
      hasStarted = true;
      clearTimeout(timeout);
      
      // Now we know the stream is working, create the response
      const webStream = Readable.toWeb(child.stdout) as ReadableStream;

      const headers = new Headers();
      headers.set('Content-Type', 'video/mp4');
      headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');

      resolve(new NextResponse(webStream, { status: 200, headers }));
    });
  });
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
        child.kill('SIGTERM');
        // Force kill after 5 seconds if process doesn't exit gracefully
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
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
        headers.set('X-Content-Type-Options', 'nosniff');

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
    logger.warn('Invalid NRK URL attempted', { url, ip });
    
    // Check for specific error cases
    try {
      const u = new URL(url);
      
      // Front page
      if ((u.hostname === 'nrk.no' || u.hostname === 'www.nrk.no') && (u.pathname === '/' || u.pathname === '')) {
        return new NextResponse('Forsiden (nrk.no) er ikke en video. Vennligst lim inn en direkte lenke til en video, serie eller program.', { status: 400 });
      }
      
      // Series page (not a specific episode)
      if (u.hostname === 'tv.nrk.no' && u.pathname.toLowerCase().startsWith('/serie/')) {
        const pathParts = u.pathname.split('/').filter(p => p.length > 0);
        if (pathParts.length === 2) {
          return new NextResponse('Dette er en serie-side, ikke en spesifikk episode. Vennligst velg en episode fra serien og lim inn lenken til den spesifikke episoden.', { status: 400 });
        }
      }
    } catch {
      // URL parsing failed, use generic message
    }
    
    return new NextResponse('URL-en ser ikke ut som en gyldig NRK video-lenke. Vennligst bruk en lenke til en spesifikk video eller episode (f.eks. tv.nrk.no/serie/.../episode-id eller www.nrk.no/video/...).', { status: 400 });
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

