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
