import { NextRequest, NextResponse } from 'next/server';
import { spawnSync, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createReadStream, mkdtempSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeFilename } from '@/lib/filename';
import { rateLimitOk } from '@/lib/rateLimit';

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
      console.error(`yt-dlp exited with code ${code}`);
      console.error('stderr:', stderrBuf);
    }
    if (signal) {
      console.log(`yt-dlp killed with signal ${signal}`);
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

  console.log('Downloading to temp file:', tmpDir);
  
  return new Promise<NextResponse>((resolve, reject) => {
    const child = spawn('yt-dlp', args);
    let stderrBuf = '';

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
      // Log progress
      if (chunk.includes('[download]')) {
        console.log(chunk.trim());
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
        console.error('yt-dlp failed:', stderrBuf);
        resolve(new NextResponse('Download failed', { status: 500 }));
        return;
      }

      try {
        // Find the downloaded file
        const files = readdirSync(tmpDir);
        const downloadedFile = files.find(f => f.startsWith('out.'));
        
        if (!downloadedFile) {
          console.error('No output file found');
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

        console.log('Starting stream:', downloadedFile);
        resolve(new NextResponse(webStream, { headers }));
      } catch (err) {
        console.error('Stream error:', err);
        resolve(new NextResponse('Failed to stream file', { status: 500 }));
      }
    });

    child.on('error', (err) => {
      console.error('Process error:', err);
      resolve(new NextResponse('Download process failed', { status: 500 }));
    });
  });
}

/**
 * POST handler - download NRK video
 */
export async function POST(req: NextRequest) {
  // Rate limiting
  if (!rateLimitOk(req)) {
    return new NextResponse('Rate limit exceeded. Try again later.', { status: 429 });
  }

  // Parse and validate request
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
  } catch {
    return new NextResponse('Invalid request body', { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    return new NextResponse('Missing or invalid URL', { status: 400 });
  }

  if (!isAllowedNrk(url)) {
    return new NextResponse('Only NRK URLs are allowed (tv.nrk.no, www.nrk.no, nrk.no, radio.nrk.no)', { status: 400 });
  }

  // Get video title for filename
  const title = getVideoTitle(url);
  const safeName = sanitizeFilename(title) + '.mp4';

  console.log(`Download request: ${url}`);
  console.log(`Filename: ${safeName}`);

  // Try direct streaming first (fastest), fallback to temp file if it fails
  console.log('Attempting direct stream from yt-dlp...');
  
  try {
    return await streamFromStdout(url, safeName, req);
  } catch (err) {
    console.warn('Direct streaming failed, falling back to temp file method:', err);
    return await streamFromTempFile(url, safeName, req);
  }
}

