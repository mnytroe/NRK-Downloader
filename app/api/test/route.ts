import { NextResponse } from 'next/server';
import { spawnSync } from 'node:child_process';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Test yt-dlp availability
    const result = spawnSync('yt-dlp', ['--version'], { encoding: 'utf-8' });
    
    return NextResponse.json({
      success: result.status === 0,
      version: result.stdout,
      error: result.stderr,
      status: result.status,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}

