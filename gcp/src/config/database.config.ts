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
