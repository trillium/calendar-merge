# Task 04: Create Utility Functions

**Status:** Not Started
**Priority:** High
**Estimated Time:** 2-3 hours
**Dependencies:** Task 01 (TypeScript setup), Task 03 (Type definitions)

---

## Objective

Create utility functions for logging, cryptography, date handling, and other common operations used across the application.

## Why This Task?

- Utilities are used by services and controllers
- Centralized helpers improve code reusability
- Easier to test and maintain

## Files to Create

```
gcp/src/utils/
├── logger.ts          (Logging utility)
├── crypto.ts          (Cryptographic functions)
├── date-helpers.ts    (Date/time utilities)
└── index.ts           (Exports)
```

## Steps

### 1. Create logger.ts

**File:** `gcp/src/utils/logger.ts`

```typescript
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
```

### 2. Create crypto.ts

**File:** `gcp/src/utils/crypto.ts`

```typescript
/**
 * Cryptographic utility functions
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Generate a random state string for OAuth CSRF protection
 */
export function generateState(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a random channel ID for watch channels
 */
export function generateChannelId(): string {
  return `channel-${Date.now()}-${randomBytes(16).toString('hex')}`;
}

/**
 * Hash a string using SHA-256
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Create a secure random token
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Validate that a string is a valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Generate a composite key for Firestore documents
 */
export function generateCompositeKey(...parts: string[]): string {
  return parts.join('_');
}
```

### 3. Create date-helpers.ts

**File:** `gcp/src/utils/date-helpers.ts`

```typescript
/**
 * Date and time utility functions
 */

/**
 * Convert milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Get Unix timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Get Unix timestamp N days from now
 */
export function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

/**
 * Get Unix timestamp N hours from now
 */
export function hoursFromNow(hours: number): number {
  return Date.now() + hours * 60 * 60 * 1000;
}

/**
 * Get Unix timestamp N minutes from now
 */
export function minutesFromNow(minutes: number): number {
  return Date.now() + minutes * 60 * 1000;
}

/**
 * Check if a timestamp is in the past
 */
export function isExpired(timestamp: number): boolean {
  return Date.now() >= timestamp;
}

/**
 * Check if a timestamp will expire within a given buffer (in hours)
 */
export function isExpiringSoon(timestamp: number, bufferHours: number): boolean {
  const bufferMs = bufferHours * 60 * 60 * 1000;
  return Date.now() >= timestamp - bufferMs;
}

/**
 * Format a date for logging
 */
export function formatDate(date: Date | number | string): string {
  return new Date(date).toISOString();
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse Google Calendar date/time to JavaScript Date
 */
export function parseCalendarDateTime(
  dateTime?: { dateTime?: string; date?: string } | null
): Date | null {
  if (!dateTime) return null;

  if (dateTime.dateTime) {
    return new Date(dateTime.dateTime);
  }

  if (dateTime.date) {
    return new Date(dateTime.date);
  }

  return null;
}

/**
 * Convert Date to Google Calendar date/time format
 */
export function toCalendarDateTime(date: Date): { dateTime: string } {
  return { dateTime: date.toISOString() };
}

/**
 * Get time remaining until expiration
 */
export function timeUntilExpiration(expirationTimestamp: number): number {
  return Math.max(0, expirationTimestamp - Date.now());
}
```

### 4. Create utils/index.ts

**File:** `gcp/src/utils/index.ts`

```typescript
/**
 * Utility functions exports
 */

export { logger, createLogger, LogLevel } from './logger';
export {
  generateState,
  generateChannelId,
  sha256,
  generateToken,
  isValidUUID,
  generateCompositeKey,
} from './crypto';
export {
  formatDuration,
  now,
  daysFromNow,
  hoursFromNow,
  minutesFromNow,
  isExpired,
  isExpiringSoon,
  formatDate,
  sleep,
  parseCalendarDateTime,
  toCalendarDateTime,
  timeUntilExpiration,
} from './date-helpers';
```

## Validation Checklist

- [ ] logger.ts created with structured logging
- [ ] crypto.ts created with security functions
- [ ] date-helpers.ts created with date utilities
- [ ] utils/index.ts exports all utilities
- [ ] TypeScript compiles: `pnpm build`
- [ ] No external dependencies beyond Node.js built-ins (crypto)

## Testing

Create a test file to verify utilities:

```typescript
// gcp/src/utils/test-utils.ts (temporary)
import { logger, generateChannelId, formatDuration, sleep } from './index';

async function testUtils() {
  // Test logger
  logger.info('Testing logger');
  logger.debug('Debug message', { key: 'value' });

  // Test crypto
  const channelId = generateChannelId();
  console.log('Channel ID:', channelId);

  // Test date helpers
  console.log('Duration:', formatDuration(123456));

  // Test sleep
  logger.info('Sleeping for 1 second...');
  await sleep(1000);
  logger.info('Done sleeping');
}

testUtils();
```

Run:
```bash
tsx gcp/src/utils/test-utils.ts
```

## Next Task

→ **05_TASK_create_database_service.md** - Create Firestore database service

## Notes

- Logger uses Cloud Logging compatible format (JSON with severity)
- Crypto functions use Node.js built-in crypto (no external deps)
- Date helpers support Google Calendar date formats
- All utilities are stateless and side-effect free (except logger)
