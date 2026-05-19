/**
 * SQLite database + PortableTimestamp tests
 * Proves: timestamp roundtrip, CRUD, dot-notation updates, query filtering
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { PortableTimestamp } from './timestamp';

// --- PortableTimestamp unit tests ---

describe('PortableTimestamp', () => {
  it('roundtrips through JSON without losing precision', () => {
    const original = PortableTimestamp.now();
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);
    const revived = PortableTimestamp.revive(parsed);

    expect(revived).not.toBeNull();
    expect(revived!.toMillis()).toBe(original.toMillis());
  });

  it('fromMillis produces correct seconds and nanoseconds', () => {
    const ms = 1779174045716;
    const ts = PortableTimestamp.fromMillis(ms);

    expect(ts.seconds).toBe(Math.floor(ms / 1000));
    expect(ts.toMillis()).toBe(ms);
  });

  it('revive returns null for non-timestamp objects', () => {
    expect(PortableTimestamp.revive(null)).toBeNull();
    expect(PortableTimestamp.revive({ foo: 'bar' })).toBeNull();
    expect(PortableTimestamp.revive({ _seconds: 'not a number', _nanoseconds: 0 })).toBeNull();
  });

  it('revive reconstructs from plain {_seconds, _nanoseconds}', () => {
    const plain = { _seconds: 1779170248, _nanoseconds: 916000000 };
    const ts = PortableTimestamp.revive(plain);

    expect(ts).not.toBeNull();
    expect(ts!.seconds).toBe(1779170248);
    expect(ts!.nanoseconds).toBe(916000000);
    expect(ts!.toMillis()).toBe(1779170248916);
  });

  it('toDate returns a valid Date', () => {
    const ts = PortableTimestamp.fromMillis(1779174045716);
    const date = ts.toDate();

    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBe(1779174045716);
  });
});

// --- SQLite db layer tests (using real in-memory database) ---

// Inline a minimal db implementation for isolated testing
// (avoids importing the singleton which has side effects)
function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.exec('PRAGMA journal_mode = WAL');

  function ensureTable(collection: string) {
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS "${collection}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }

  function reviveTimestamps(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(reviveTimestamps);
    const ts = PortableTimestamp.revive(obj);
    if (ts) return ts;
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = reviveTimestamps(value);
    }
    return result;
  }

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

  return {
    async getDoc<T = any>(collection: string, docId: string): Promise<T | null> {
      ensureTable(collection);
      const row = sqliteDb.prepare(`SELECT data FROM "${collection}" WHERE id = ?`).get(docId) as { data: string } | null;
      if (!row) return null;
      return reviveTimestamps(JSON.parse(row.data)) as T;
    },

    async setDoc<T = any>(collection: string, docId: string, data: T): Promise<void> {
      ensureTable(collection);
      sqliteDb.prepare(`INSERT OR REPLACE INTO "${collection}" (id, data) VALUES (?, ?)`).run(docId, JSON.stringify(data));
    },

    async updateDoc(collection: string, docId: string, data: Partial<any>): Promise<void> {
      ensureTable(collection);
      const existing = await this.getDoc(collection, docId);
      if (!existing) throw new Error(`Document ${collection}/${docId} not found for update`);
      const updated = applyDotNotation(existing, data);
      sqliteDb.prepare(`UPDATE "${collection}" SET data = ? WHERE id = ?`).run(JSON.stringify(updated), docId);
    },

    async deleteDoc(collection: string, docId: string): Promise<void> {
      ensureTable(collection);
      sqliteDb.prepare(`DELETE FROM "${collection}" WHERE id = ?`).run(docId);
    },

    async docExists(collection: string, docId: string): Promise<boolean> {
      ensureTable(collection);
      const row = sqliteDb.prepare(`SELECT 1 FROM "${collection}" WHERE id = ? LIMIT 1`).get(docId);
      return !!row;
    },

    async query<T = any>(collection: string, field: string, operator: string, value: any): Promise<T[]> {
      ensureTable(collection);
      const rows = sqliteDb.prepare(`SELECT data FROM "${collection}"`).all() as { data: string }[];
      return rows
        .map(row => reviveTimestamps(JSON.parse(row.data)) as T)
        .filter((doc: any) => {
          const fieldValue = field.split('.').reduce((c: any, k: string) => c?.[k], doc);
          switch (operator) {
            case '==': return fieldValue === value;
            case '!=': return fieldValue !== value;
            case '<': return fieldValue < value;
            case '>': return fieldValue > value;
            default: return false;
          }
        });
    },

    async getAll<T = any>(collection: string): Promise<T[]> {
      ensureTable(collection);
      const rows = sqliteDb.prepare(`SELECT data FROM "${collection}"`).all() as { data: string }[];
      return rows.map(row => reviveTimestamps(JSON.parse(row.data)) as T);
    },

    close() { sqliteDb.close(); },
  };
}

describe('SQLite db layer', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('CRUD operations', () => {
    it('setDoc + getDoc roundtrips data', async () => {
      await db.setDoc('users', 'u1', { name: 'Alice', age: 30 });
      const doc = await db.getDoc('users', 'u1');
      expect(doc).toEqual({ name: 'Alice', age: 30 });
    });

    it('getDoc returns null for missing documents', async () => {
      const doc = await db.getDoc('users', 'nonexistent');
      expect(doc).toBeNull();
    });

    it('setDoc overwrites existing documents', async () => {
      await db.setDoc('users', 'u1', { v: 1 });
      await db.setDoc('users', 'u1', { v: 2 });
      const doc = await db.getDoc('users', 'u1');
      expect(doc).toEqual({ v: 2 });
    });

    it('deleteDoc removes a document', async () => {
      await db.setDoc('users', 'u1', { name: 'Alice' });
      await db.deleteDoc('users', 'u1');
      expect(await db.getDoc('users', 'u1')).toBeNull();
    });

    it('docExists returns correct boolean', async () => {
      expect(await db.docExists('users', 'u1')).toBe(false);
      await db.setDoc('users', 'u1', { name: 'Alice' });
      expect(await db.docExists('users', 'u1')).toBe(true);
    });
  });

  describe('timestamp revival through SQLite', () => {
    it('PortableTimestamp survives setDoc/getDoc roundtrip', async () => {
      const now = PortableTimestamp.now();
      const expires = PortableTimestamp.fromMillis(Date.now() + 86400000);

      await db.setDoc('oauthState', 's1', {
        state: 's1',
        createdAt: now,
        expiresAt: expires,
      });

      const doc = await db.getDoc<any>('oauthState', 's1');
      expect(doc!.createdAt).toBeInstanceOf(PortableTimestamp);
      expect(doc!.expiresAt).toBeInstanceOf(PortableTimestamp);
      expect(doc!.createdAt.toMillis()).toBe(now.toMillis());
      expect(doc!.expiresAt.toMillis()).toBe(expires.toMillis());
    });

    it('nested timestamps are revived', async () => {
      const ts = PortableTimestamp.now();
      await db.setDoc('test', 'd1', {
        outer: { inner: { timestamp: ts } },
      });

      const doc = await db.getDoc<any>('test', 'd1');
      expect(doc!.outer.inner.timestamp).toBeInstanceOf(PortableTimestamp);
      expect(doc!.outer.inner.timestamp.toMillis()).toBe(ts.toMillis());
    });

    it('non-timestamp objects are not falsely revived', async () => {
      await db.setDoc('test', 'd1', {
        config: { _seconds: 'not a number', _nanoseconds: 0 },
        list: [1, 2, 3],
      });

      const doc = await db.getDoc<any>('test', 'd1');
      expect(doc!.config).toEqual({ _seconds: 'not a number', _nanoseconds: 0 });
      expect(doc!.list).toEqual([1, 2, 3]);
    });
  });

  describe('dot-notation updates', () => {
    it('updates nested fields with dot notation', async () => {
      await db.setDoc('syncState', 's1', {
        userId: 'u1',
        syncState: { status: 'idle', lastSync: null },
      });

      await db.updateDoc('syncState', 's1', {
        'syncState.status': 'syncing',
      });

      const doc = await db.getDoc<any>('syncState', 's1');
      expect(doc!.syncState.status).toBe('syncing');
      expect(doc!.syncState.lastSync).toBeNull(); // untouched
    });

    it('creates intermediate objects for deep dot paths', async () => {
      await db.setDoc('test', 'd1', { a: 1 });
      await db.updateDoc('test', 'd1', { 'x.y.z': 'deep' });

      const doc = await db.getDoc<any>('test', 'd1');
      expect(doc!.x.y.z).toBe('deep');
      expect(doc!.a).toBe(1);
    });

    it('mixes dot-notation and top-level updates', async () => {
      await db.setDoc('test', 'd1', { a: 1, nested: { b: 2 } });
      await db.updateDoc('test', 'd1', {
        a: 10,
        'nested.b': 20,
        'nested.c': 30,
      });

      const doc = await db.getDoc<any>('test', 'd1');
      expect(doc).toEqual({ a: 10, nested: { b: 20, c: 30 } });
    });

    it('throws when updating a nonexistent document', async () => {
      await expect(db.updateDoc('test', 'missing', { x: 1 }))
        .rejects.toThrow('not found for update');
    });
  });

  describe('OAuth state lifecycle', () => {
    it('create → validate → consume state', async () => {
      const state = 'abc123';
      const now = PortableTimestamp.now();
      const expires = PortableTimestamp.fromMillis(Date.now() + 86400000);

      // Create
      await db.setDoc('oauthState', state, {
        state,
        createdAt: now,
        expiresAt: expires,
      });

      // Validate - exists and not expired
      const doc = await db.getDoc<any>('oauthState', state);
      expect(doc).not.toBeNull();
      expect(Date.now() < doc!.expiresAt.toMillis()).toBe(true);

      // Consume
      await db.deleteDoc('oauthState', state);
      expect(await db.getDoc('oauthState', state)).toBeNull();
    });

    it('detects expired states', async () => {
      const state = 'expired1';
      const pastTime = PortableTimestamp.fromMillis(Date.now() - 1000);

      await db.setDoc('oauthState', state, {
        state,
        createdAt: pastTime,
        expiresAt: pastTime, // already expired
      });

      const doc = await db.getDoc<any>('oauthState', state);
      expect(Date.now() > doc!.expiresAt.toMillis()).toBe(true);
    });
  });

  describe('query and getAll', () => {
    it('query filters by field value', async () => {
      await db.setDoc('users', 'u1', { email: 'a@test.com', role: 'admin' });
      await db.setDoc('users', 'u2', { email: 'b@test.com', role: 'user' });
      await db.setDoc('users', 'u3', { email: 'c@test.com', role: 'admin' });

      const admins = await db.query('users', 'role', '==', 'admin');
      expect(admins).toHaveLength(2);
    });

    it('query supports nested field paths', async () => {
      await db.setDoc('watches', 'w1', { config: { active: true } });
      await db.setDoc('watches', 'w2', { config: { active: false } });

      const active = await db.query('watches', 'config.active', '==', true);
      expect(active).toHaveLength(1);
    });

    it('getAll returns all documents', async () => {
      await db.setDoc('items', 'i1', { v: 1 });
      await db.setDoc('items', 'i2', { v: 2 });
      await db.setDoc('items', 'i3', { v: 3 });

      const all = await db.getAll('items');
      expect(all).toHaveLength(3);
    });
  });

  describe('token storage pattern', () => {
    it('stores and retrieves OAuth tokens like the real flow', async () => {
      const userId = '115699614043593531056';
      const now = PortableTimestamp.now();

      await db.setDoc('users', userId, {
        userId,
        email: 'test@gmail.com',
        accessToken: 'ya29.access-token-here',
        refreshToken: '1//refresh-token-here',
        tokenExpiry: Date.now() + 3600000,
        createdAt: now,
        lastLogin: now,
      });

      const user = await db.getDoc<any>('users', userId);
      expect(user!.accessToken).toBe('ya29.access-token-here');
      expect(user!.refreshToken).toBe('1//refresh-token-here');
      expect(user!.createdAt).toBeInstanceOf(PortableTimestamp);

      // Update token on refresh (like getAuthClient does)
      await db.updateDoc('users', userId, {
        accessToken: 'ya29.new-access-token',
        tokenExpiry: Date.now() + 3600000,
        lastLogin: PortableTimestamp.now(),
      });

      const updated = await db.getDoc<any>('users', userId);
      expect(updated!.accessToken).toBe('ya29.new-access-token');
      expect(updated!.refreshToken).toBe('1//refresh-token-here'); // untouched
      expect(updated!.lastLogin).toBeInstanceOf(PortableTimestamp);
    });
  });
});
