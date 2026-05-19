/**
 * SQLite database service
 * Drop-in replacement for Firestore using Bun's built-in SQLite.
 * Implements the same db interface: getDoc, setDoc, updateDoc, deleteDoc, docExists, query, getAll.
 * Each "collection" is a table with (id TEXT PRIMARY KEY, data TEXT).
 * Documents stored as JSON. Supports Firestore-style dot-notation updates.
 */

import { Database } from 'bun:sqlite';
import path from 'path';
import { logger } from '../utils';
import { PortableTimestamp } from './timestamp';

let sqliteDb: Database | null = null;

const COLLECTIONS = ['users', 'watches', 'eventMappings', 'syncState', 'oauthState', 'batchStates'];

/**
 * Get or create the SQLite database instance
 */
function getDb(): Database {
  if (!sqliteDb) {
    const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'calendar-sync.db');

    // Ensure data directory exists
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    sqliteDb = new Database(dbPath);
    sqliteDb.exec('PRAGMA journal_mode = WAL');
    sqliteDb.exec('PRAGMA foreign_keys = ON');

    // Create tables for each collection
    for (const collection of COLLECTIONS) {
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS "${collection}" (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL
        )
      `);
    }

    logger.info(`SQLite database initialized at ${dbPath}`);
  }
  return sqliteDb;
}

/**
 * Ensure table exists (for dynamic collection names not in COLLECTIONS)
 */
function ensureTable(collection: string): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${collection}" (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `);
}

/**
 * Revive PortableTimestamp objects from parsed JSON
 */
function reviveTimestamps(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(reviveTimestamps);

  // Check if this object is a serialized timestamp
  const ts = PortableTimestamp.revive(obj);
  if (ts) return ts;

  // Recurse into properties
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = reviveTimestamps(value);
  }
  return result;
}

/**
 * Apply Firestore-style dot-notation updates to an object.
 * e.g., {'syncState.status': 'syncing'} sets obj.syncState.status = 'syncing'
 */
function applyDotNotation(target: any, updates: Record<string, any>): any {
  const result = { ...target };

  for (const [key, value] of Object.entries(updates)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined || current[parts[i]] === null || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        } else {
          current[parts[i]] = { ...current[parts[i]] };
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * SQLite-backed database with same interface as Firestore db
 */
export const db = {
  users: () => ({ collection: 'users' }),
  watches: () => ({ collection: 'watches' }),
  eventMappings: () => ({ collection: 'eventMappings' }),
  syncState: () => ({ collection: 'syncState' }),
  oauthState: () => ({ collection: 'oauthState' }),

  async getDoc<T = any>(collection: string, docId: string): Promise<T | null> {
    ensureTable(collection);
    const row = getDb().prepare(`SELECT data FROM "${collection}" WHERE id = ?`).get(docId) as { data: string } | null;
    if (!row) return null;
    return reviveTimestamps(JSON.parse(row.data)) as T;
  },

  async setDoc<T = any>(collection: string, docId: string, data: T): Promise<void> {
    ensureTable(collection);
    const json = JSON.stringify(data);
    getDb().prepare(`INSERT OR REPLACE INTO "${collection}" (id, data) VALUES (?, ?)`).run(docId, json);
  },

  async updateDoc(collection: string, docId: string, data: Partial<any>): Promise<void> {
    ensureTable(collection);
    const existing = await db.getDoc(collection, docId);
    if (!existing) {
      throw new Error(`Document ${collection}/${docId} not found for update`);
    }
    const updated = applyDotNotation(existing, data);
    const json = JSON.stringify(updated);
    getDb().prepare(`UPDATE "${collection}" SET data = ? WHERE id = ?`).run(json, docId);
  },

  async deleteDoc(collection: string, docId: string): Promise<void> {
    ensureTable(collection);
    getDb().prepare(`DELETE FROM "${collection}" WHERE id = ?`).run(docId);
  },

  async docExists(collection: string, docId: string): Promise<boolean> {
    ensureTable(collection);
    const row = getDb().prepare(`SELECT 1 FROM "${collection}" WHERE id = ? LIMIT 1`).get(docId);
    return !!row;
  },

  async query<T = any>(
    collection: string,
    field: string,
    operator: string,
    value: any
  ): Promise<T[]> {
    ensureTable(collection);
    const rows = getDb().prepare(`SELECT data FROM "${collection}"`).all() as { data: string }[];
    return rows
      .map(row => reviveTimestamps(JSON.parse(row.data)) as T)
      .filter((doc: any) => {
        const fieldValue = getNestedField(doc, field);
        switch (operator) {
          case '==': return fieldValue === value;
          case '!=': return fieldValue !== value;
          case '<': return fieldValue < value;
          case '<=': return fieldValue <= value;
          case '>': return fieldValue > value;
          case '>=': return fieldValue >= value;
          default: return false;
        }
      });
  },

  async getAll<T = any>(collection: string): Promise<T[]> {
    ensureTable(collection);
    const rows = getDb().prepare(`SELECT data FROM "${collection}"`).all() as { data: string }[];
    return rows.map(row => reviveTimestamps(JSON.parse(row.data)) as T);
  },

  batch: () => {
    throw new Error('batch() not supported in SQLite mode — use individual operations');
  },

  runTransaction: () => {
    throw new Error('runTransaction() not supported in SQLite mode — use individual operations');
  },
};

/**
 * Get a nested field value using dot notation
 */
function getNestedField(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Close the SQLite connection
 */
export async function closeSqlite(): Promise<void> {
  if (sqliteDb) {
    logger.info('Closing SQLite connection');
    sqliteDb.close();
    sqliteDb = null;
  }
}
