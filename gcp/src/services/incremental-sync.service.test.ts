import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processIncrementalChanges } from './incremental-sync.service';
import { syncEventsBatchPaginated } from './batch-sync.service';
import { db } from '../db';

vi.mock('./batch-sync.service', () => ({
  syncEventsBatchPaginated: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    docExists: vi.fn(),
    query: vi.fn(),
    getAll: vi.fn(),
    users: vi.fn(),
    watches: vi.fn(),
    eventMappings: vi.fn(),
    syncState: vi.fn(),
    oauthState: vi.fn(),
    batch: vi.fn(),
    runTransaction: vi.fn(),
  },
  Timestamp: { now: vi.fn(() => ({ _seconds: 0, _nanoseconds: 0 })) },
  closeDb: vi.fn(),
}));

function watch(overrides = {}) {
  return {
    channelId: 'chan-1',
    resourceId: 'res-1',
    userId: 'user1',
    calendarId: 'source@example.com',
    targetCalendarId: 'target@example.com',
    expiration: Date.now() + 3600_000,
    createdAt: { _seconds: 0, _nanoseconds: 0 },
    pendingChanges: true,
    syncToken: 'token-1',
    ...overrides,
  };
}

describe('processIncrementalChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zeros when no watches exist', async () => {
    vi.mocked(db.getAll).mockResolvedValue([]);
    const result = await processIncrementalChanges();
    expect(result).toEqual({ processed: 0, failed: 0, errors: [] });
    expect(syncEventsBatchPaginated).not.toHaveBeenCalled();
  });

  it('skips watches without pending changes, paused, or already syncing', async () => {
    vi.mocked(db.getAll).mockResolvedValue([
      watch({ channelId: 'a', pendingChanges: false }),
      watch({ channelId: 'b', paused: true }),
      watch({ channelId: 'c', syncState: { status: 'syncing' } }),
    ]);
    const result = await processIncrementalChanges();
    expect(result).toEqual({ processed: 0, failed: 0, errors: [] });
    expect(syncEventsBatchPaginated).not.toHaveBeenCalled();
  });

  it('processes a pending watch and clears its pending flag', async () => {
    vi.mocked(db.getAll).mockResolvedValue([watch()]);
    vi.mocked(syncEventsBatchPaginated).mockResolvedValue({
      processedCount: 5,
      finalSyncToken: 'token-2',
    });

    const result = await processIncrementalChanges();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(syncEventsBatchPaginated).toHaveBeenCalledWith(
      'user1',
      'source@example.com',
      'target@example.com',
      undefined,
      'token-1'
    );
    expect(db.updateDoc).toHaveBeenCalledWith(
      'watches',
      'chan-1',
      expect.objectContaining({ pendingChanges: false, syncToken: 'token-2' })
    );
  });

  it('keeps the old syncToken when the run returns none', async () => {
    vi.mocked(db.getAll).mockResolvedValue([watch()]);
    vi.mocked(syncEventsBatchPaginated).mockResolvedValue({ processedCount: 0 });

    await processIncrementalChanges();

    expect(db.updateDoc).toHaveBeenCalledWith(
      'watches',
      'chan-1',
      expect.objectContaining({ syncToken: 'token-1' })
    );
  });

  it('records failures and leaves pendingChanges set for retry', async () => {
    vi.mocked(db.getAll).mockResolvedValue([watch()]);
    vi.mocked(syncEventsBatchPaginated).mockRejectedValue(new Error('boom'));

    const result = await processIncrementalChanges();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ calendarId: 'source@example.com', error: 'boom' }]);
    expect(db.updateDoc).toHaveBeenCalledWith(
      'watches',
      'chan-1',
      expect.objectContaining({ 'syncState.status': 'pending' })
    );
  });
});
