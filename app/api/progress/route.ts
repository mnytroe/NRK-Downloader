import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { logger, generateRequestId } from '@/lib/logger';

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
 * GET handler - get download progress
 */
export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  logger.setRequestId(requestId);
  
  const url = new URL(req.url);
  const videoUrl = url.searchParams.get('url');
  
  if (!videoUrl || !isAllowedNrk(videoUrl)) {
    return new NextResponse('Invalid or non-NRK URL', { status: 400 });
  }

  logger.debug('Progress check request', { videoUrl, requestId });

  return new Promise<NextResponse>((resolve) => {
    // Start yt-dlp with progress output
    const child = spawn('yt-dlp', [
      '--no-playlist',
      '--print', '%(progress.downloaded_bytes)s/%(progress.total_bytes)s %(progress.eta)s',
      '--newline',
      videoUrl
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let progressData = '';
    let lastProgress = { downloaded: 0, total: 0, eta: 0 };

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk) => {
      progressData += chunk;
      const lines = progressData.split('\n');
      
      for (const line of lines) {
        if (line.includes('/') && line.includes(' ')) {
          const parts = line.trim().split(' ');
          if (parts.length >= 2) {
            const bytesPart = parts[0];
            const etaPart = parts[1];
            
            if (bytesPart.includes('/')) {
              const [downloaded, total] = bytesPart.split('/').map(Number);
              const eta = parseInt(etaPart) || 0;
              
              if (!isNaN(downloaded) && !isNaN(total) && total > 0) {
                lastProgress = { downloaded, total, eta };
                
                const progress = (downloaded / total) * 100;
                logger.debug('Progress update', { 
                  downloaded, 
                  total, 
                  progress: Math.round(progress * 100) / 100,
                  eta 
                });
              }
            }
          }
        }
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(new NextResponse(JSON.stringify({
          progress: 100,
          downloaded: lastProgress.total,
          total: lastProgress.total,
          eta: 0,
          status: 'completed'
        }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      } else {
        logger.error('Progress check failed', new Error(`yt-dlp exit code: ${code}`), { videoUrl });
        resolve(new NextResponse(JSON.stringify({
          progress: 0,
          downloaded: 0,
          total: 0,
          eta: 0,
          status: 'error'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500
        }));
      }
    });

    child.on('error', (err) => {
      logger.error('Progress check error', err, { videoUrl });
      resolve(new NextResponse(JSON.stringify({
        progress: 0,
        downloaded: 0,
        total: 0,
        eta: 0,
        status: 'error'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }));
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve(new NextResponse(JSON.stringify({
        progress: lastProgress.total > 0 ? (lastProgress.downloaded / lastProgress.total) * 100 : 0,
        downloaded: lastProgress.downloaded,
        total: lastProgress.total,
        eta: lastProgress.eta,
        status: 'timeout'
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }, 30000);
  });
}
