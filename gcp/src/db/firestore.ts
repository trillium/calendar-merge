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
    await getCollection(collection).doc(docId).set(data as any);
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
