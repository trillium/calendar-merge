# Task 06: Create Google Auth Service

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 3-4 hours
**Dependencies:** Task 02 (Config), Task 03 (Types), Task 04 (Utils), Task 05 (Database)

---

## Objective

Port Google OAuth authentication logic from `functions/calendar-sync/auth.ts` and `oauth.ts` to the new service structure.

## Why This Task?

- Authentication is required by all calendar operations
- Core service that manages OAuth tokens
- Needed before implementing calendar services

## Source Files

- `functions/calendar-sync/auth.ts` (53 lines)
- `functions/calendar-sync/oauth.ts` (195 lines)

## Target File

```
gcp/src/services/
└── google-auth.service.ts  (Combines auth.ts + oauth.ts logic)
```

## Steps

### 1. Create google-auth.service.ts

**File:** `gcp/src/services/google-auth.service.ts`

```typescript
/**
 * Google OAuth authentication service
 * Handles OAuth2 flow, token management, and authenticated API clients
 */

import { google, Auth } from 'googleapis';
import { Timestamp } from '@google-cloud/firestore';
import { GOOGLE_CONFIG, APP_CONFIG } from '../config';
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
    scope: GOOGLE_CONFIG.OAUTH.SCOPES,
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
```

### 2. Update services/index.ts

**File:** `gcp/src/services/index.ts`

```typescript
/**
 * Services exports
 */

export {
  createOAuth2Client,
  generateAuthUrl,
  handleOAuthCallback,
  getAuthClient,
  revokeAccess,
  hasValidTokens,
  getUserData,
  setTargetCalendar,
} from './google-auth.service';
```

## Key Changes from Original

### Consolidated Files
- Merged `auth.ts` and `oauth.ts` into single service
- Removed duplicate OAuth client creation logic

### Improvements
- Uses centralized config (GOOGLE_CONFIG, DB_CONFIG)
- Uses centralized logger
- Uses database helper (db) instead of raw Firestore
- Better error handling and logging
- Type-safe with imported types

### Function Mapping

| Original (auth.ts/oauth.ts) | New (google-auth.service.ts) |
|----------------------------|------------------------------|
| `getAuthClient()` | `getAuthClient()` |
| `generateAuthUrl()` | `generateAuthUrl()` |
| `handleCallback()` | `handleOAuthCallback()` |
| `revokeAccess()` | `revokeAccess()` |
| N/A | `createOAuth2Client()` |
| N/A | `hasValidTokens()` |
| N/A | `getUserData()` |
| N/A | `setTargetCalendar()` |

## Validation Checklist

- [ ] google-auth.service.ts created
- [ ] All functions from auth.ts ported
- [ ] All functions from oauth.ts ported
- [ ] Uses centralized config
- [ ] Uses centralized logger
- [ ] Uses database service (db)
- [ ] TypeScript compiles: `pnpm build`
- [ ] Exports added to services/index.ts

## Testing

Create a test script:

```typescript
// gcp/src/services/test-auth.ts (temporary)
import { generateAuthUrl, createOAuth2Client } from './google-auth.service';

async function testAuth() {
  try {
    // Test OAuth client creation
    const client = createOAuth2Client();
    console.log('OAuth client created:', !!client);

    // Test auth URL generation
    const { url, state } = await generateAuthUrl('test-user-123');
    console.log('Auth URL generated:');
    console.log('  State:', state);
    console.log('  URL:', url.substring(0, 100) + '...');

    console.log('\nAuth service test successful!');
  } catch (error) {
    console.error('Auth service test failed:', error);
  }
}

testAuth();
```

Run:
```bash
# Set environment variables first
export GOOGLE_CLIENT_ID=your-client-id
export GOOGLE_CLIENT_SECRET=your-secret
export GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

tsx gcp/src/services/test-auth.ts
```

## Next Task

→ **07_TASK_create_calendar_service.md** - Create Google Calendar API service

## Notes

- This service combines auth.ts (53 lines) and oauth.ts (195 lines)
- OAuth state is stored in Firestore with 1-day expiration
- Tokens are automatically refreshed when expired
- The service handles all OAuth2 flow steps (URL generation → callback → token refresh)
