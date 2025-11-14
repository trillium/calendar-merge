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
