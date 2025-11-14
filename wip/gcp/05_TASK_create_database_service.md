# Task 05: Create Database Service

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 1-2 hours
**Dependencies:** Task 02 (Config), Task 03 (Types), Task 04 (Utils)

---

## Objective

Create a centralized Firestore database service for managing all database operations.

## Why This Task?

- Database service is used by all other services
- Centralizes Firestore initialization and configuration
- Provides type-safe database operations
- Makes testing easier (can mock the database)

## File to Create

```
gcp/src/db/
├── firestore.ts        (Firestore client and helpers)
└── index.ts            (Exports)
```

## Steps

### 1. Create firestore.ts

**File:** `gcp/src/db/firestore.ts`

```typescript
/**
 * Firestore database service
 * Centralized Firestore client and database operations
 */

import { Firestore, Settings } from '@google-cloud/firestore';
import { DB_CONFIG } from '../config';
import { logger } from '../utils';

/**
 * Firestore singleton instance
 */
let firestoreInstance: Firestore | null = null;

/**
 * Initialize Firestore with settings
 */
export function initializeFirestore(settings?: Settings): Firestore {
  if (!firestoreInstance) {
    logger.info('Initializing Firestore');
    firestoreInstance = new Firestore({
      ...DB_CONFIG.SETTINGS,
      ...settings,
    });
  }
  return firestoreInstance;
}

/**
 * Get Firestore instance (creates if not exists)
 */
export function getFirestore(): Firestore {
  if (!firestoreInstance) {
    return initializeFirestore();
  }
  return firestoreInstance;
}

/**
 * Get a collection reference
 */
export function getCollection(collectionName: string) {
  return getFirestore().collection(collectionName);
}

/**
 * Get a typed collection reference
 */
export function getTypedCollection<T>(
  collectionName: keyof typeof DB_CONFIG.COLLECTIONS
) {
  const path = DB_CONFIG.COLLECTIONS[collectionName];
  return getFirestore().collection(path) as FirebaseFirestore.CollectionReference<T>;
}

/**
 * Database helper functions
 */
export const db = {
  /**
   * Users collection
   */
  users: () => getCollection(DB_CONFIG.COLLECTIONS.USERS),

  /**
   * Watches collection
   */
  watches: () => getCollection(DB_CONFIG.COLLECTIONS.WATCHES),

  /**
   * Event mappings collection
   */
  eventMappings: () => getCollection(DB_CONFIG.COLLECTIONS.EVENT_MAPPINGS),

  /**
   * Sync state collection
   */
  syncState: () => getCollection(DB_CONFIG.COLLECTIONS.SYNC_STATE),

  /**
   * OAuth state collection
   */
  oauthState: () => getCollection(DB_CONFIG.COLLECTIONS.OAUTH_STATE),

  /**
   * Get document by ID
   */
  async getDoc<T = any>(collection: string, docId: string): Promise<T | null> {
    const doc = await getCollection(collection).doc(docId).get();
    return doc.exists ? (doc.data() as T) : null;
  },

  /**
   * Set document
   */
  async setDoc<T = any>(collection: string, docId: string, data: T): Promise<void> {
    await getCollection(collection).doc(docId).set(data);
  },

  /**
   * Update document
   */
  async updateDoc(collection: string, docId: string, data: Partial<any>): Promise<void> {
    await getCollection(collection).doc(docId).update(data);
  },

  /**
   * Delete document
   */
  async deleteDoc(collection: string, docId: string): Promise<void> {
    await getCollection(collection).doc(docId).delete();
  },

  /**
   * Check if document exists
   */
  async docExists(collection: string, docId: string): Promise<boolean> {
    const doc = await getCollection(collection).doc(docId).get();
    return doc.exists;
  },

  /**
   * Query documents with filter
   */
  async query<T = any>(
    collection: string,
    field: string,
    operator: FirebaseFirestore.WhereFilterOp,
    value: any
  ): Promise<T[]> {
    const snapshot = await getCollection(collection).where(field, operator, value).get();
    return snapshot.docs.map(doc => doc.data() as T);
  },

  /**
   * Get all documents in a collection
   */
  async getAll<T = any>(collection: string): Promise<T[]> {
    const snapshot = await getCollection(collection).get();
    return snapshot.docs.map(doc => doc.data() as T);
  },

  /**
   * Batch operations
   */
  batch: () => getFirestore().batch(),

  /**
   * Transaction
   */
  runTransaction: <T>(
    updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<T>
  ) => getFirestore().runTransaction(updateFunction),
};

/**
 * Close Firestore connection (for cleanup)
 */
export async function closeFirestore(): Promise<void> {
  if (firestoreInstance) {
    logger.info('Closing Firestore connection');
    await firestoreInstance.terminate();
    firestoreInstance = null;
  }
}
```

### 2. Create db/index.ts

**File:** `gcp/src/db/index.ts`

```typescript
/**
 * Database exports
 */

export {
  getFirestore,
  initializeFirestore,
  getCollection,
  getTypedCollection,
  db,
  closeFirestore,
} from './firestore';
```

### 3. Create database migration helper (optional)

**File:** `gcp/src/db/migrations/README.md`

```markdown
# Database Migrations

This directory contains database migration scripts for Firestore.

## Running Migrations

Migrations are run manually using Node.js scripts. Each migration file should:

1. Export a `migrate()` function
2. Be idempotent (safe to run multiple times)
3. Log all operations
4. Handle errors gracefully

## Example Migration

```typescript
// 001_add_stats_to_watches.ts
import { db } from '../firestore';

export async function migrate() {
  const watches = await db.watches().get();

  for (const doc of watches.docs) {
    const data = doc.data();
    if (!data.stats) {
      await doc.ref.update({
        stats: {
          totalEventsSynced: 0,
          lastSyncTime: null,
          lastSyncEventCount: 0,
        },
      });
      console.log(`Added stats to watch ${doc.id}`);
    }
  }
}

// Run: tsx gcp/src/db/migrations/001_add_stats_to_watches.ts
if (require.main === module) {
  migrate().then(() => console.log('Migration complete'));
}
```
```

## Validation Checklist

- [ ] firestore.ts created with db helpers
- [ ] db/index.ts exports database functions
- [ ] TypeScript compiles: `pnpm build`
- [ ] Firestore initializes correctly (test with simple script)

## Testing

Create a test script:

```typescript
// gcp/src/db/test-db.ts (temporary)
import { db, closeFirestore } from './index';

async function testDatabase() {
  try {
    // Test collection access
    const users = db.users();
    console.log('Users collection:', users.path);

    // Test helpers
    const watches = db.watches();
    console.log('Watches collection:', watches.path);

    // Test getDoc (should return null if doesn't exist)
    const doc = await db.getDoc('users', 'test-user-123');
    console.log('Test doc:', doc);

    console.log('Database test successful!');
  } catch (error) {
    console.error('Database test failed:', error);
  } finally {
    await closeFirestore();
  }
}

testDatabase();
```

Run:
```bash
# Make sure GCP credentials are set
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
tsx gcp/src/db/test-db.ts
```

## Next Task

→ **06_TASK_create_google_auth_service.md** - Port OAuth logic from functions/calendar-sync/auth.ts

## Notes

- The `db` helper object provides convenient shortcuts for common operations
- Firestore is lazily initialized on first use
- The singleton pattern ensures only one Firestore instance exists
- Collection names come from centralized config (DB_CONFIG)
