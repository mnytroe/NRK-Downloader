/**
 * Structured logging utility for better error tracking and monitoring
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
  requestId?: string;
  userId?: string;
  ip?: string;
}

class Logger {
  private level: LogLevel;
  private requestId: string | null = null;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  setRequestId(id: string) {
    this.requestId = id;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatLog(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } as Error : undefined,
      requestId: this.requestId || undefined,
    };
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry = this.formatLog(level, message, context, error);
    
    // Console output with colors
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const colors = ['\x1b[36m', '\x1b[32m', '\x1b[33m', '\x1b[31m'];
    const reset = '\x1b[0m';
    
    const prefix = `${colors[level]}${levelNames[level]}${reset}`;
    const timestamp = `[${entry.timestamp}]`;
    const requestId = entry.requestId ? `[${entry.requestId}]` : '';
    
    console.log(`${prefix} ${timestamp} ${requestId} ${message}`);
    
    if (context && Object.keys(context).length > 0) {
      console.log('  Context:', JSON.stringify(context, null, 2));
    }
    
    if (error) {
      console.log('  Error:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.log('  Stack:', error.stack);
      }
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // Specialized logging methods
  downloadStart(url: string, filename: string, ip?: string) {
    this.info('Download started', {
      url,
      filename,
      ip,
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : undefined,
    });
  }

  downloadProgress(url: string, progress: number, bytesDownloaded?: number, totalBytes?: number) {
    this.debug('Download progress', {
      url,
      progress: Math.round(progress * 100) / 100,
      bytesDownloaded,
      totalBytes,
    });
  }

  downloadComplete(url: string, filename: string, duration: number, fileSize?: number) {
    this.info('Download completed', {
      url,
      filename,
      duration: Math.round(duration),
      fileSize,
    });
  }

  downloadError(url: string, error: Error, context?: Record<string, any>) {
    this.error('Download failed', error, {
      url,
      ...context,
    });
  }

  rateLimitHit(ip: string, count: number) {
    this.warn('Rate limit exceeded', {
      ip,
      count,
    });
  }

  ytDlpError(url: string, stderr: string, exitCode: number) {
    this.error('yt-dlp process failed', new Error(`Exit code: ${exitCode}`), {
      url,
      stderr: stderr.substring(0, 500), // Truncate long error messages
      exitCode,
    });
  }
}

// Create singleton instance
export const logger = new Logger(
  process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
);

// Utility function to generate request IDs
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
