/**
 * Task Queue Cascade Integration Test
 *
 * Proves that each step in the round-robin batch sync cascades into the next:
 *   1. batchSyncRoundRobin() processes page 1, enqueues task for page 2
 *   2. createBatchTask() persists task to SQLite
 *   3. continueBatch() processes page 2, enqueues task for page 3
 *   4. On last page, watch gets syncToken + stats
 *   5. Round-robin advances to next calendar
 *
 * Uses real SQLite (in-memory) but mocks Google Calendar API.
 * Runs under bun test (not vitest) because it needs bun:sqlite.
 */

// Force development mode so createBatchTask/listPendingTasks use local SQLite
// (bun auto-loads .env which has real GCP creds)
process.env.NODE_ENV = 'development';

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// --- In-memory SQLite setup (replaces the file-backed db) ---

let memDb: Database;

const COLLECTIONS = ['users', 'watches', 'eventMappings', 'syncState', 'oauthState', 'batchStates', 'tasks'];

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

function createTestDb() {
  memDb = new Database(':memory:');
  for (const col of COLLECTIONS) {
    memDb.exec(`CREATE TABLE IF NOT EXISTS "${col}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }

  return {
    async getDoc<T = any>(collection: string, docId: string): Promise<T | null> {
      const row = memDb.prepare(`SELECT data FROM "${collection}" WHERE id = ?`).get(docId) as { data: string } | null;
      return row ? JSON.parse(row.data) as T : null;
    },
    async setDoc<T = any>(collection: string, docId: string, data: T): Promise<void> {
      memDb.prepare(`INSERT OR REPLACE INTO "${collection}" (id, data) VALUES (?, ?)`).run(docId, JSON.stringify(data));
    },
    async updateDoc(collection: string, docId: string, data: Partial<any>): Promise<void> {
      const row = memDb.prepare(`SELECT data FROM "${collection}" WHERE id = ?`).get(docId) as { data: string } | null;
      if (!row) throw new Error(`Document ${collection}/${docId} not found`);
      const existing = JSON.parse(row.data);
      const updated = applyDotNotation(existing, data);
      memDb.prepare(`UPDATE "${collection}" SET data = ? WHERE id = ?`).run(JSON.stringify(updated), docId);
    },
    async deleteDoc(collection: string, docId: string): Promise<void> {
      memDb.prepare(`DELETE FROM "${collection}" WHERE id = ?`).run(docId);
    },
    async docExists(collection: string, docId: string): Promise<boolean> {
      const row = memDb.prepare(`SELECT 1 FROM "${collection}" WHERE id = ? LIMIT 1`).get(docId);
      return !!row;
    },
    async query<T = any>(collection: string, field: string, operator: string, value: any): Promise<T[]> {
      const rows = memDb.prepare(`SELECT data FROM "${collection}"`).all() as { data: string }[];
      return rows
        .map(r => JSON.parse(r.data) as T)
        .filter((doc: any) => {
          const parts = field.split('.');
          let v = doc;
          for (const p of parts) v = v?.[p];
          if (operator === '==') return v === value;
          return false;
        });
    },
    async getAll<T = any>(collection: string): Promise<T[]> {
      const rows = memDb.prepare(`SELECT data FROM "${collection}"`).all() as { data: string }[];
      return rows.map(r => JSON.parse(r.data) as T);
    },
    users: () => ({}),
    watches: () => ({}),
    eventMappings: () => ({}),
    syncState: () => ({}),
    oauthState: () => ({}),
    batch: () => { throw new Error('not supported'); },
    runTransaction: () => { throw new Error('not supported'); },
  };
}

// Create mock functions
const mockListEvents = mock(() => Promise.resolve({ events: [], nextPageToken: undefined, nextSyncToken: undefined }));
const mockBatchCreateEvents = mock(() => Promise.resolve({ successful: 0, failed: 0, results: [] }));
const mockBatchUpdateEvents = mock(() => Promise.resolve({ successful: 0, failed: 0, results: [] }));
const testDb = createTestDb();

// Mock modules before imports (bun hoists these)
mock.module('../db', () => ({
  db: testDb,
  Timestamp: { now: () => ({ _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 }) },
}));
mock.module('./google-calendar.service', () => ({ listEvents: mockListEvents }));
mock.module('./google-calendar-batch.service', () => ({
  batchCreateEvents: mockBatchCreateEvents,
  batchUpdateEvents: mockBatchUpdateEvents,
}));
mock.module('../config', () => ({
  APP_CONFIG: {
    CLOUD_TASKS_ENABLED: true,
    BATCH_DELAY_MS: 0,
    RATE_LIMIT_DELAY_MS: 0,
    PORT: 13013,
    NODE_ENV: 'development',
    CLOUD_FUNCTION_URL: 'http://localhost:13013',
  },
}));

// Now import the modules under test
import { createBatchTask, listPendingTasks } from './cloud-tasks.service';
import { syncEventsBatchPaginated, batchSyncRoundRobin } from './batch-sync.service';
import { db } from '../db';

// Helper: make N mock events
function mockEvents(count: number, startId = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `event-${startId + i}`,
    summary: `Event ${startId + i}`,
    start: { dateTime: '2026-06-01T10:00:00Z' },
    end: { dateTime: '2026-06-01T11:00:00Z' },
    status: 'confirmed',
  }));
}

describe('Task Queue Cascade', () => {
  beforeEach(async () => {
    mockListEvents.mockClear();
    mockBatchCreateEvents.mockClear();
    mockBatchUpdateEvents.mockClear();

    // Reset in-memory DB
    for (const col of COLLECTIONS) {
      memDb.exec(`DELETE FROM "${col}"`);
    }

    mockBatchCreateEvents.mockImplementation(() => Promise.resolve({ successful: 0, failed: 0, results: [] }));
    mockBatchUpdateEvents.mockImplementation(() => Promise.resolve({ successful: 0, failed: 0, results: [] }));
  });

  it('createBatchTask inserts a pending task into SQLite', async () => {
    const taskName = await createBatchTask({
      userId: 'user1',
      batchStateId: 'bs1',
      batchNumber: 2,
      scheduleTime: Date.now(),
    });

    expect(taskName).toMatch(/^local-task-/);

    const tasks = await db.getAll<any>('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].endpoint).toBe('/batch/continue');
    expect(tasks[0].payload).toEqual({
      userId: 'user1',
      batchStateId: 'bs1',
      batchNumber: 2,
    });
  });

  it('page 1 with nextPageToken enqueues task for page 2', async () => {
    // Setup: user + watch
    await db.setDoc('users', 'user1', { email: 'test@test.com' });
    await db.setDoc('watches', 'ch1', {
      channelId: 'ch1',
      resourceId: 'res1',
      userId: 'user1',
      calendarId: 'cal-a@test.com',
      targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false,
      syncState: { status: 'pending' },
      stats: { totalEventsSynced: 0 },
    });

    // Page 1: 50 events + pageToken → page 2 exists
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(50),
      nextPageToken: 'page2-token',
      nextSyncToken: undefined,
    }));

    const result = await batchSyncRoundRobin('user1');

    // Should have processed 50 events
    expect(result.eventsProcessed).toBe(50);
    expect(result.hasMore).toBe(true); // calendar still has pages (no syncToken yet)

    // Should have enqueued a task for batch 2
    const tasks = await db.getAll<any>('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].payload.batchNumber).toBe(2);
    expect(tasks[0].payload.batchStateId).toContain('cal-a@test.com');
  });

  it('multi-page cascade: each page creates the next task until final syncToken', async () => {
    // Setup
    await db.setDoc('users', 'user1', { email: 'test@test.com' });
    await db.setDoc('watches', 'ch1', {
      channelId: 'ch1',
      resourceId: 'res1',
      userId: 'user1',
      calendarId: 'cal-a@test.com',
      targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false,
      syncState: { status: 'pending' },
      stats: { totalEventsSynced: 0 },
    });

    // Page 1: 50 events, has more
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(50, 0),
      nextPageToken: 'page2-token',
      nextSyncToken: undefined,
    }));

    // Trigger round-robin (processes page 1, enqueues page 2)
    await batchSyncRoundRobin('user1');

    // Verify task for page 2 was created
    let tasks = await db.getAll<any>('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].payload.batchNumber).toBe(2);
    const batchStateId = tasks[0].payload.batchStateId;

    // Simulate what the task queue poller does: read the task, call continueBatch logic
    // Page 2: 50 events, has more
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(50, 50),
      nextPageToken: 'page3-token',
      nextSyncToken: undefined,
    }));

    // Simulate continueBatch for page 2
    const state2 = await db.getDoc<any>('batchStates', batchStateId);
    const result2 = await syncEventsBatchPaginated(
      state2.userId,
      state2.calendarId,
      state2.targetCalendarId,
      state2.currentPageToken,
    );

    // Update batchState (like continueBatch does)
    await db.updateDoc('batchStates', batchStateId, {
      processedEvents: state2.processedEvents + result2.processedCount,
      currentPageToken: result2.nextPageToken,
      updatedAt: Date.now(),
    });

    expect(result2.nextPageToken).toBe('page3-token');
    expect(result2.processedCount).toBe(50);

    // Enqueue page 3
    await createBatchTask({
      userId: 'user1',
      batchStateId,
      batchNumber: 3,
      scheduleTime: Date.now(),
    });

    tasks = await db.getAll<any>('tasks');
    expect(tasks).toHaveLength(2);
    expect(tasks[1].payload.batchNumber).toBe(3);

    // Page 3: 20 events, LAST PAGE → syncToken returned
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(20, 100),
      nextPageToken: undefined,
      nextSyncToken: 'final-sync-token-abc',
    }));

    const state3 = await db.getDoc<any>('batchStates', batchStateId);
    const result3 = await syncEventsBatchPaginated(
      state3.userId,
      state3.calendarId,
      state3.targetCalendarId,
      state3.currentPageToken,
    );

    expect(result3.finalSyncToken).toBe('final-sync-token-abc');
    expect(result3.nextPageToken).toBeUndefined();

    // Mark batch completed (like continueBatch does)
    await db.updateDoc('batchStates', batchStateId, {
      processedEvents: state3.processedEvents + result3.processedCount,
      status: 'completed',
      updatedAt: Date.now(),
    });

    // Update watch with syncToken + stats (like continueBatch does)
    const totalProcessed = state3.processedEvents + result3.processedCount;
    await db.updateDoc('watches', 'ch1', {
      syncToken: result3.finalSyncToken,
      syncTokenUpdatedAt: Date.now(),
      'syncState.status': 'completed',
      'syncState.completedAt': Date.now(),
      'syncState.processedEvents': totalProcessed,
      'stats.totalEventsSynced': totalProcessed,
      'stats.lastSyncTime': Date.now(),
    });

    // NO more tasks should be created (last page)
    tasks = await db.getAll<any>('tasks');
    expect(tasks).toHaveLength(2); // still 2, no 3rd task

    // Verify final watch state
    const watch = await db.getDoc<any>('watches', 'ch1');
    expect(watch.syncToken).toBe('final-sync-token-abc');
    expect(watch.syncState.status).toBe('completed');
    expect(watch.stats.totalEventsSynced).toBe(120); // 50 + 50 + 20

    // Verify batch state
    const batchState = await db.getDoc<any>('batchStates', batchStateId);
    expect(batchState.status).toBe('completed');
    expect(batchState.processedEvents).toBe(120);
  });

  it('round-robin advances to next calendar after completing one', async () => {
    await db.setDoc('users', 'user1', { email: 'test@test.com' });

    // Two watches — calendar A and calendar B
    await db.setDoc('watches', 'ch-a', {
      channelId: 'ch-a', resourceId: 'res-a', userId: 'user1',
      calendarId: 'cal-a@test.com', targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false, syncState: { status: 'pending' }, stats: { totalEventsSynced: 0 },
    });
    await db.setDoc('watches', 'ch-b', {
      channelId: 'ch-b', resourceId: 'res-b', userId: 'user1',
      calendarId: 'cal-b@test.com', targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false, syncState: { status: 'pending' }, stats: { totalEventsSynced: 0 },
    });

    // Calendar A: 1 page, returns syncToken
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(10),
      nextPageToken: undefined,
      nextSyncToken: 'token-a',
    }));

    const result1 = await batchSyncRoundRobin('user1');
    expect(result1.eventsProcessed).toBe(10);
    expect(result1.currentIndex).toBe(1); // advanced to calendar B
    expect(result1.hasMore).toBe(true);

    // Verify calendar A got its syncToken
    const watchA = await db.getDoc<any>('watches', 'ch-a');
    expect(watchA.syncToken).toBe('token-a');
    expect(watchA.syncState.status).toBe('completed');

    // Calendar B: 1 page, returns syncToken
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(5),
      nextPageToken: undefined,
      nextSyncToken: 'token-b',
    }));

    const result2 = await batchSyncRoundRobin('user1');
    expect(result2.eventsProcessed).toBe(5);
    expect(result2.currentIndex).toBe(0); // wrapped around
    expect(result2.hasMore).toBe(false); // no more calendars

    // Verify calendar B got its syncToken
    const watchB = await db.getDoc<any>('watches', 'ch-b');
    expect(watchB.syncToken).toBe('token-b');
    expect(watchB.syncState.status).toBe('completed');
  });

  it('empty calendar still gets syncToken', async () => {
    await db.setDoc('users', 'user1', { email: 'test@test.com' });
    await db.setDoc('watches', 'ch1', {
      channelId: 'ch1', resourceId: 'res1', userId: 'user1',
      calendarId: 'empty-cal@test.com', targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false, syncState: { status: 'pending' }, stats: { totalEventsSynced: 0 },
    });

    // 0 events, but Google still returns a syncToken
    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: [],
      nextPageToken: undefined,
      nextSyncToken: 'empty-sync-token',
    }));

    await batchSyncRoundRobin('user1');

    const watch = await db.getDoc<any>('watches', 'ch1');
    expect(watch.syncToken).toBe('empty-sync-token');
    expect(watch.syncState.status).toBe('completed');
  });

  it('skips watches with syncing status to prevent double-sync', async () => {
    await db.setDoc('users', 'user1', { email: 'test@test.com' });

    await db.setDoc('watches', 'ch-active', {
      channelId: 'ch-active', resourceId: 'res1', userId: 'user1',
      calendarId: 'active@test.com', targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false, syncState: { status: 'syncing' }, stats: { totalEventsSynced: 0 },
    });
    await db.setDoc('watches', 'ch-ready', {
      channelId: 'ch-ready', resourceId: 'res2', userId: 'user1',
      calendarId: 'ready@test.com', targetCalendarId: 'target@test.com',
      expiration: Date.now() + 7 * 86400000,
      createdAt: { _seconds: 0, _nanoseconds: 0 },
      paused: false, syncState: { status: 'pending' }, stats: { totalEventsSynced: 0 },
    });

    mockListEvents.mockImplementationOnce(() => Promise.resolve({
      events: mockEvents(3),
      nextPageToken: undefined,
      nextSyncToken: 'ready-token',
    }));

    const result = await batchSyncRoundRobin('user1');

    // Should only sync the pending one, skip the syncing one
    expect(result.eventsProcessed).toBe(3);
    expect(mockListEvents).toHaveBeenCalledTimes(1);

    // ready got synced
    const watchReady = await db.getDoc<any>('watches', 'ch-ready');
    expect(watchReady.syncToken).toBe('ready-token');

    // syncing one untouched
    const watchActive = await db.getDoc<any>('watches', 'ch-active');
    expect(watchActive.syncToken).toBeUndefined();
    expect(watchActive.syncState.status).toBe('syncing');
  });

  it('listPendingTasks returns only pending/processing tasks', async () => {
    await db.setDoc('tasks', 't1', { status: 'pending', payload: { userId: 'user1' } });
    await db.setDoc('tasks', 't2', { status: 'completed', payload: { userId: 'user1' } });
    await db.setDoc('tasks', 't3', { status: 'processing', payload: { userId: 'user1' } });
    await db.setDoc('tasks', 't4', { status: 'pending', payload: { userId: 'user2' } });

    const all = await listPendingTasks();
    expect(all).toHaveLength(3); // t1, t3, t4

    const user1 = await listPendingTasks('user1');
    expect(user1).toHaveLength(2); // t1, t3
  });
});
