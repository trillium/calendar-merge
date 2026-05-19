/**
 * Database exports
 * Switches between Firestore and SQLite based on DB_BACKEND env var.
 * Default: 'sqlite' for local dev, 'firestore' when GCP project is set.
 */

export { PortableTimestamp as Timestamp } from './timestamp';

/**
 * Database interface matching the surface area used by services
 */
export interface DatabaseAdapter {
  users: () => any;
  watches: () => any;
  eventMappings: () => any;
  syncState: () => any;
  oauthState: () => any;
  getDoc<T = any>(collection: string, docId: string): Promise<T | null>;
  setDoc<T = any>(collection: string, docId: string, data: T): Promise<void>;
  updateDoc(collection: string, docId: string, data: Partial<any>): Promise<void>;
  deleteDoc(collection: string, docId: string): Promise<void>;
  docExists(collection: string, docId: string): Promise<boolean>;
  query<T = any>(collection: string, field: string, operator: string, value: any): Promise<T[]>;
  getAll<T = any>(collection: string): Promise<T[]>;
  batch: () => any;
  runTransaction: <T>(fn: (t: any) => Promise<T>) => Promise<T>;
}

function getBackend(): 'sqlite' | 'firestore' {
  const explicit = process.env.DB_BACKEND;
  if (explicit === 'sqlite' || explicit === 'firestore') return explicit;

  // Auto-detect: if GCP project is set, use Firestore
  const gcpProject = process.env.GCP_PROJECT_ID || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  return gcpProject ? 'firestore' : 'sqlite';
}

const backend = getBackend();

let _db: DatabaseAdapter;
let _closeDb: () => Promise<void>;

if (backend === 'sqlite') {
  const sqlite = require('./sqlite');
  _db = sqlite.db;
  _closeDb = sqlite.closeSqlite;
} else {
  const firestore = require('./firestore');
  _db = firestore.db;
  _closeDb = firestore.closeFirestore;
}

export const db: DatabaseAdapter = _db;
export const closeDb = _closeDb;

// Re-export Firestore-specific things only when in Firestore mode
export function getFirestore() {
  if (backend !== 'firestore') {
    throw new Error('getFirestore() only available in Firestore mode (set DB_BACKEND=firestore)');
  }
  return require('./firestore').getFirestore();
}

export function initializeFirestore(settings?: any) {
  if (backend !== 'firestore') {
    throw new Error('initializeFirestore() only available in Firestore mode');
  }
  return require('./firestore').initializeFirestore(settings);
}

export function getCollection(name: string) {
  if (backend !== 'firestore') {
    throw new Error('getCollection() only available in Firestore mode');
  }
  return require('./firestore').getCollection(name);
}

export function getTypedCollection(name: string) {
  if (backend !== 'firestore') {
    throw new Error('getTypedCollection() only available in Firestore mode');
  }
  return require('./firestore').getTypedCollection(name);
}

// Alias for backward compat
export const closeFirestore = _closeDb;
