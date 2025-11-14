/**
 * Google OAuth authentication service
 * Handles OAuth2 flow, token management, and authenticated API clients
 */

import { google, Auth } from 'googleapis';
import { Timestamp } from '@google-cloud/firestore';
import { GOOGLE_CONFIG } from '../config';
import { db } from '../db';
import { UserData, OAuthState } from '../types';
import { logger, generateState, daysFromNow } from '../utils';

const log = logger;

/**
 * Create OAuth2 client
 */
export function createOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    GOOGLE_CONFIG.OAUTH.CLIENT_ID,
    GOOGLE_CONFIG.OAUTH.CLIENT_SECRET,
    GOOGLE_CONFIG.OAUTH.REDIRECT_URI
  );
}

/**
 * Generate authorization URL for OAuth flow
 */
export async function generateAuthUrl(userId?: string): Promise<{ url: string; state: string }> {
  const oauth2Client = createOAuth2Client();
  const state = generateState();

  // Store state in Firestore for CSRF protection
  const oauthState: OAuthState = {
    state,
    userId,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(daysFromNow(1)), // 1 day expiry
  };

  await db.setDoc(
    'oauthState',
    state,
    oauthState
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [...GOOGLE_CONFIG.OAUTH.SCOPES],
    state,
    prompt: 'consent', // Force consent to get refresh token
  });

  log.info('Generated auth URL', { state, userId });
  return { url, state };
}

/**
 * Handle OAuth callback and exchange code for tokens
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<{ userId: string; userData: UserData }> {
  // Verify state
  const stateDoc = await db.getDoc<OAuthState>('oauthState', state);

  if (!stateDoc) {
    throw new Error('Invalid or expired state parameter');
  }

  // Check expiration
  if (Date.now() > stateDoc.expiresAt.toMillis()) {
    await db.deleteDoc('oauthState', state);
    throw new Error('OAuth state expired');
  }

  const oauth2Client = createOAuth2Client();

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  oauth2Client.setCredentials(tokens);

  // Get user info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  if (!userInfo.email || !userInfo.id) {
    throw new Error('Failed to get user info from Google');
  }

  const userId = userInfo.id;
  const email = userInfo.email;

  // Store user data
  const userData: UserData = {
    userId,
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: tokens.expiry_date || Date.now() + 3600 * 1000,
    createdAt: Timestamp.now(),
    lastLogin: Timestamp.now(),
  };

  await db.setDoc('users', userId, userData);

  // Clean up state
  await db.deleteDoc('oauthState', state);

  log.info('OAuth callback successful', { userId, email });
  return { userId, userData };
}

/**
 * Get authenticated client for a user
 */
export async function getAuthClient(userId: string): Promise<Auth.OAuth2Client> {
  const userData = await db.getDoc<UserData>('users', userId);

  if (!userData) {
    throw new Error(`User ${userId} not found`);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: userData.accessToken,
    refresh_token: userData.refreshToken,
    expiry_date: userData.tokenExpiry,
  });

  // Refresh token if expired
  if (Date.now() >= userData.tokenExpiry) {
    log.info('Access token expired, refreshing', { userId });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update stored tokens
      await db.updateDoc('users', userId, {
        accessToken: credentials.access_token,
        tokenExpiry: credentials.expiry_date || Date.now() + 3600 * 1000,
        lastLogin: Timestamp.now(),
      });

      oauth2Client.setCredentials(credentials);
      log.info('Access token refreshed', { userId });
    } catch (error) {
      log.error('Failed to refresh token', error, { userId });
      throw new Error('Failed to refresh access token. User may need to re-authenticate.');
    }
  }

  return oauth2Client;
}

/**
 * Revoke user's OAuth tokens
 */
export async function revokeAccess(userId: string): Promise<void> {
  const userData = await db.getDoc<UserData>('users', userId);

  if (!userData) {
    log.warn('User not found for revocation', { userId });
    return;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: userData.accessToken,
    refresh_token: userData.refreshToken,
  });

  try {
    await oauth2Client.revokeCredentials();
    log.info('OAuth credentials revoked', { userId });
  } catch (error) {
    log.error('Failed to revoke credentials', error, { userId });
    // Continue to delete user data even if revoke fails
  }

  // Delete user data
  await db.deleteDoc('users', userId);
  log.info('User data deleted', { userId });
}

/**
 * Check if user has valid tokens
 */
export async function hasValidTokens(userId: string): Promise<boolean> {
  const userData = await db.getDoc<UserData>('users', userId);
  return !!(userData?.accessToken && userData?.refreshToken);
}

/**
 * Get user data
 */
export async function getUserData(userId: string): Promise<UserData | null> {
  return await db.getDoc<UserData>('users', userId);
}

/**
 * Update user's target calendar
 */
export async function setTargetCalendar(
  userId: string,
  targetCalendarId: string
): Promise<void> {
  await db.updateDoc('users', userId, {
    targetCalendarId,
  });
  log.info('Target calendar set', { userId, targetCalendarId });
}
