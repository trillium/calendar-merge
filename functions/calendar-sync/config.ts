export const CONFIG = {
    PROJECT_ID: process.env.PROJECT_ID || '',
    OAUTH_SECRET_NAME: 'calendar-oauth-tokens',
    FIRESTORE_COLLECTIONS: {
        WATCHES: 'watches',
        EVENT_MAPPINGS: 'event_mappings',
        CONFIG: 'config',
    },
    WATCH_EXPIRATION_DAYS: 7,
} as const;
