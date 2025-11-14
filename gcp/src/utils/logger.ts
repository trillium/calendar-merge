/**
 * Logging utility
 * Provides structured logging for Cloud Functions
 */

import { APP_CONFIG } from '../config';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = LOG_LEVEL_MAP[APP_CONFIG.LOG_LEVEL] || LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMeta = error instanceof Error
        ? { error: error.message, stack: error.stack, ...meta }
        : { error, ...meta };
      console.error(this.formatMessage('ERROR', message, errorMeta));
    }
  }

  /**
   * Log with custom severity (for GCP Cloud Logging)
   */
  log(severity: string, message: string, meta?: any): void {
    const logEntry = {
      severity: severity.toUpperCase(),
      message,
      ...meta,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logEntry));
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Create a child logger with context
 */
export function createLogger(context: string): {
  debug: (msg: string, meta?: any) => void;
  info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  error: (msg: string, error?: Error | any, meta?: any) => void;
} {
  return {
    debug: (msg, meta) => logger.debug(`[${context}] ${msg}`, meta),
    info: (msg, meta) => logger.info(`[${context}] ${msg}`, meta),
    warn: (msg, meta) => logger.warn(`[${context}] ${msg}`, meta),
    error: (msg, error, meta) => logger.error(`[${context}] ${msg}`, error, meta),
  };
}
