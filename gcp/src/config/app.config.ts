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

  // CORS settings (supports comma-separated list or *)
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN === '*'
      ? '*'
      : process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : '*',

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
  const required = ['GCP_PROJECT_ID'];
  const missing = required.filter(key => !APP_CONFIG[key as keyof typeof APP_CONFIG]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Warn about CLOUD_FUNCTION_URL in production
  if (APP_CONFIG.NODE_ENV === 'production' && !APP_CONFIG.CLOUD_FUNCTION_URL) {
    console.warn('WARNING: CLOUD_FUNCTION_URL is not set. Watch channels will not work.');
  }
}
