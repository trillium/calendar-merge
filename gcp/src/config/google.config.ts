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
