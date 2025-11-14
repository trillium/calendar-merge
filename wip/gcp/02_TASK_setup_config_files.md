# Task 02: Set Up Configuration Files

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 1-2 hours
**Dependencies:** Task 01 (TypeScript setup)

---

## Objective

Create centralized configuration files for the application to manage environment variables, database connections, and Google Cloud settings.

## Why This Task?

- Config files are needed by all services
- Centralizes environment variable management
- Makes code more maintainable and testable

## Files to Create

```
gcp/src/config/
├── app.config.ts         (Express app settings)
├── database.config.ts    (Firestore collections)
└── google.config.ts      (Google Calendar API settings)
```

## Steps

### 1. Create app.config.ts

**File:** `gcp/src/config/app.config.ts`

```typescript
/**
 * Application configuration
 * Centralized settings for the Express app and Cloud Function
 */

export const APP_CONFIG = {
  // Node environment
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Cloud Function settings
  PORT: parseInt(process.env.PORT || '8080', 10),
  FUNCTION_REGION: process.env.FUNCTION_REGION || 'us-central1',

  // GCP Project
  GCP_PROJECT_ID: process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || '',

  // CORS settings
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Rate limiting
  RATE_LIMIT_DELAY_MS: 150, // 150ms between API calls (~6-7 req/sec)

  // Batch sync settings
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '10', 10),
  WEBHOOK_EVENT_LIMIT: 50, // Max events to process in webhook before deferring to batch

  // Watch renewal
  WATCH_RENEWAL_BUFFER_HOURS: 24, // Renew watches 24h before expiry

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Frontend URL (for OAuth redirects)
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Cloud Function URL (for webhooks)
  CLOUD_FUNCTION_URL: process.env.CLOUD_FUNCTION_URL || '',
} as const;

/**
 * Validate required environment variables
 */
export function validateAppConfig(): void {
  const required = ['GCP_PROJECT_ID', 'CLOUD_FUNCTION_URL'];
  const missing = required.filter(key => !APP_CONFIG[key as keyof typeof APP_CONFIG]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### 2. Create database.config.ts

**File:** `gcp/src/config/database.config.ts`

```typescript
/**
 * Database configuration
 * Firestore collection names and database settings
 */

export const DB_CONFIG = {
  // Firestore collections
  COLLECTIONS: {
    USERS: 'users',
    WATCHES: 'watches',
    EVENT_MAPPINGS: 'eventMappings',
    SYNC_STATE: 'syncState',
    OAUTH_STATE: 'oauthState',
  },

  // Firestore settings
  SETTINGS: {
    ignoreUndefinedProperties: true,
  },

  // Document field limits
  LIMITS: {
    MAX_CALENDARS_PER_USER: 10,
    MAX_EVENTS_PER_SYNC: 2500,
  },
} as const;

/**
 * Helper to get collection path
 */
export function getCollectionPath(collection: keyof typeof DB_CONFIG.COLLECTIONS): string {
  return DB_CONFIG.COLLECTIONS[collection];
}
```

### 3. Create google.config.ts

**File:** `gcp/src/config/google.config.ts`

```typescript
/**
 * Google API configuration
 * Settings for Google Calendar API, OAuth, and Cloud services
 */

export const GOOGLE_CONFIG = {
  // OAuth 2.0 settings
  OAUTH: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',
    SCOPES: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },

  // Calendar API settings
  CALENDAR: {
    API_VERSION: 'v3',
    // Rate limiting (Google allows 10 requests/second per user)
    RATE_LIMIT_PER_SECOND: 10,
    // Quota limits
    DAILY_QUOTA_LIMIT: 1000000, // 1M requests/day
  },

  // Watch channel settings
  WATCH: {
    // Watch expiration (7 days in milliseconds)
    EXPIRATION_MS: 7 * 24 * 60 * 60 * 1000,
    // Webhook endpoint path
    WEBHOOK_PATH: '/webhook',
  },

  // Cloud Tasks settings (for batch sync)
  TASKS: {
    QUEUE_NAME: process.env.CLOUD_TASKS_QUEUE || 'calendar-sync-queue',
    LOCATION: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
  },
} as const;

/**
 * Validate required Google configuration
 */
export function validateGoogleConfig(): void {
  const required = [
    'OAUTH.CLIENT_ID',
    'OAUTH.CLIENT_SECRET',
    'OAUTH.REDIRECT_URI',
  ];

  const missing = required.filter(key => {
    const parts = key.split('.');
    let value: any = GOOGLE_CONFIG;
    for (const part of parts) {
      value = value[part];
      if (!value) return true;
    }
    return false;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required Google config: ${missing.join(', ')}`);
  }
}
```

### 4. Create index.ts to export all configs

**File:** `gcp/src/config/index.ts`

```typescript
/**
 * Configuration exports
 * Centralized export for all configuration modules
 */

export { APP_CONFIG, validateAppConfig } from './app.config';
export { DB_CONFIG, getCollectionPath } from './database.config';
export { GOOGLE_CONFIG, validateGoogleConfig } from './google.config';

/**
 * Validate all configurations
 */
export function validateAllConfig(): void {
  validateAppConfig();
  validateGoogleConfig();
}
```

### 5. Update existing config references

The old `functions/calendar-sync/config.ts` had:

```typescript
export const CONFIG = {
  FIRESTORE_COLLECTIONS: {
    USERS: 'users',
    WATCHES: 'watches',
    EVENT_MAPPINGS: 'eventMappings',
    OAUTH_STATE: 'oauthState',
  },
};
```

Our new config is more comprehensive and follows the same pattern.

## Validation Checklist

- [ ] All 4 config files created
- [ ] TypeScript compiles without errors: `pnpm build`
- [ ] No hardcoded values (all from env vars with defaults)
- [ ] Validation functions exist
- [ ] Config exports work from index.ts

## Testing

Create a quick test file to verify configs load:

```typescript
// gcp/src/config/test-config.ts (temporary)
import { APP_CONFIG, DB_CONFIG, GOOGLE_CONFIG } from './index';

console.log('App Config:', APP_CONFIG);
console.log('DB Collections:', DB_CONFIG.COLLECTIONS);
console.log('Google OAuth Scopes:', GOOGLE_CONFIG.OAUTH.SCOPES);
```

Run: `tsx gcp/src/config/test-config.ts`

## Next Task

→ **03_TASK_create_type_definitions.md** - Port types from functions/calendar-sync/types.ts

## Notes

- These configs replace the old `functions/calendar-sync/config.ts`
- Environment variables should be set in `.env` or Cloud Function env config
- Configs are immutable (`as const`) to prevent accidental modification
