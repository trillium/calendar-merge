import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncEventsBatchPaginated } from './batch-sync.service';
import * as calendarService from './google-calendar.service';
import * as batchService from './google-calendar-batch.service';
import { db } from '../db';

// Mock the services
vi.mock('./google-calendar.service');
vi.mock('./google-calendar-batch.service');
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

describe('Batch Sync Service - PageToken Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncEventsBatchPaginated', () => {
    it('should fetch only 50 events per page', async () => {
      const mockEvents = Array.from({ length: 50 }, (_, i) => ({
        id: `event-${i}`,
        summary: `Event ${i}`,
        start: { dateTime: '2025-11-15T10:00:00Z' },
        end: { dateTime: '2025-11-15T11:00:00Z' },
        status: 'confirmed',
      }));

      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: mockEvents,
        nextPageToken: 'page2token',
        nextSyncToken: undefined,
      });

      vi.mocked(db.getDoc).mockResolvedValue(null); // No existing mappings
      vi.mocked(batchService.batchCreateEvents).mockResolvedValueOnce({
        successful: 50,
        failed: 0,
        results: [],
      });

      const result = await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        undefined
      );

      // Verify maxResults: 50 is passed
      expect(calendarService.listEvents).toHaveBeenCalledWith(
        'user123',
        'source@example.com',
        expect.objectContaining({
          maxResults: 50,
        })
      );

      // Verify nextPageToken is returned
      expect(result.nextPageToken).toBe('page2token');
      expect(result.processedCount).toBe(50);
    });

    it('should use pageToken to continue from previous batch', async () => {
      const mockEvents = Array.from({ length: 30 }, (_, i) => ({
        id: `event-${i + 50}`,
        summary: `Event ${i + 50}`,
        start: { dateTime: '2025-11-15T10:00:00Z' },
        end: { dateTime: '2025-11-15T11:00:00Z' },
        status: 'confirmed',
      }));

      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: mockEvents,
        nextPageToken: undefined, // Last page
        nextSyncToken: 'final-sync-token',
      });

      vi.mocked(db.getDoc).mockResolvedValue(null);
      vi.mocked(batchService.batchCreateEvents).mockResolvedValueOnce({
        successful: 30,
        failed: 0,
        results: [],
      });

      const result = await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        'page2token' // Continue from previous batch
      );

      // Verify pageToken: 'page2token' was used
      expect(calendarService.listEvents).toHaveBeenCalledWith(
        'user123',
        'source@example.com',
        expect.objectContaining({
          pageToken: 'page2token',
        })
      );

      // Verify finalSyncToken is returned on last page
      expect(result.finalSyncToken).toBe('final-sync-token');
      expect(result.nextPageToken).toBeUndefined();
      expect(result.processedCount).toBe(30);
    });

    it('should return finalSyncToken on last page', async () => {
      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: [
          {
            id: 'final-event',
            summary: 'Final Event',
            start: { dateTime: '2025-11-15T10:00:00Z' },
            end: { dateTime: '2025-11-15T11:00:00Z' },
            status: 'confirmed',
          },
        ],
        nextPageToken: undefined, // No more pages
        nextSyncToken: 'sync-token-xyz',
      });

      vi.mocked(db.getDoc).mockResolvedValue(null);
      vi.mocked(batchService.batchCreateEvents).mockResolvedValueOnce({
        successful: 1,
        failed: 0,
        results: [],
      });

      const result = await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        'last-page-token'
      );

      expect(result.finalSyncToken).toBe('sync-token-xyz');
      expect(result.nextPageToken).toBeUndefined();
    });

    it('should skip already-mapped events on initial sync (no syncToken)', async () => {
      const mockEvents = [
        {
          id: 'new-event',
          summary: 'New Event',
          start: { dateTime: '2025-11-15T10:00:00Z' },
          end: { dateTime: '2025-11-15T11:00:00Z' },
          status: 'confirmed',
        },
        {
          id: 'already-synced',
          summary: 'Already Synced Event',
          start: { dateTime: '2025-11-15T12:00:00Z' },
          end: { dateTime: '2025-11-15T13:00:00Z' },
          status: 'confirmed',
        },
      ];

      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: mockEvents,
        nextPageToken: undefined,
        nextSyncToken: 'final-sync',
      });

      // First event has no mapping (new), second has mapping (already synced in previous attempt)
      vi.mocked(db.getDoc)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ targetEventId: 'target-existing' });

      vi.mocked(batchService.batchCreateEvents).mockResolvedValueOnce({
        successful: 1,
        failed: 0,
        results: [],
      });

      await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        undefined, // No pageToken
        undefined  // No syncToken = initial sync
      );

      // Verify batchCreateEvents was called with ONLY the new event
      expect(batchService.batchCreateEvents).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.arrayContaining([
          expect.objectContaining({ sourceEventId: 'new-event' }),
        ])
      );

      // Verify batchUpdateEvents was NOT called (initial sync skips already-mapped events)
      expect(batchService.batchUpdateEvents).not.toHaveBeenCalled();
    });

    it('should update already-mapped events on incremental sync (with syncToken)', async () => {
      const mockEvents = [
        {
          id: 'new-event',
          summary: 'New Event',
          start: { dateTime: '2025-11-15T10:00:00Z' },
          end: { dateTime: '2025-11-15T11:00:00Z' },
          status: 'confirmed',
        },
        {
          id: 'modified-event',
          summary: 'Modified Event',
          start: { dateTime: '2025-11-15T12:00:00Z' },
          end: { dateTime: '2025-11-15T13:00:00Z' },
          status: 'confirmed',
        },
      ];

      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: mockEvents,
        nextPageToken: undefined,
        nextSyncToken: 'new-sync-token',
      });

      // First event has no mapping (newly created), second has mapping (modified)
      vi.mocked(db.getDoc)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ targetEventId: 'target-existing' });

      vi.mocked(batchService.batchCreateEvents).mockResolvedValueOnce({
        successful: 1,
        failed: 0,
        results: [],
      });

      vi.mocked(batchService.batchUpdateEvents).mockResolvedValueOnce({
        successful: 1,
        failed: 0,
        results: [],
      });

      await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        undefined,       // No pageToken
        'previous-sync'  // Has syncToken = incremental sync
      );

      // Verify batchCreateEvents was called with the new event
      expect(batchService.batchCreateEvents).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.arrayContaining([
          expect.objectContaining({ sourceEventId: 'new-event' }),
        ])
      );

      // Verify batchUpdateEvents WAS called (incremental sync updates changed events)
      expect(batchService.batchUpdateEvents).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.arrayContaining([
          expect.objectContaining({
            sourceEventId: 'modified-event',
            targetEventId: 'target-existing',
          }),
        ])
      );
    });

    it('should skip cancelled events', async () => {
      const mockEvents = [
        {
          id: 'active-event',
          summary: 'Active',
          start: { dateTime: '2025-11-15T10:00:00Z' },
          end: { dateTime: '2025-11-15T11:00:00Z' },
          status: 'confirmed',
        },
        {
          id: 'cancelled-event',
          summary: 'Cancelled',
          start: { dateTime: '2025-11-15T12:00:00Z' },
          end: { dateTime: '2025-11-15T13:00:00Z' },
          status: 'cancelled',
        },
      ];

      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: mockEvents,
        nextPageToken: undefined,
        nextSyncToken: 'sync-final',
      });

      vi.mocked(db.getDoc).mockResolvedValue(null);
      vi.mocked(batchService.batchCreateEvents).mockResolvedValueOnce({
        successful: 1,
        failed: 0,
        results: [],
      });

      await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        undefined
      );

      // Only active event should be created, cancelled should be skipped
      expect(batchService.batchCreateEvents).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.arrayContaining([
          expect.objectContaining({ sourceEventId: 'active-event' }),
        ])
      );

      expect(batchService.batchCreateEvents).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.not.arrayContaining([
          expect.objectContaining({ sourceEventId: 'cancelled-event' }),
        ])
      );
    });

    it('should handle empty pages gracefully', async () => {
      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: [],
        nextPageToken: undefined,
        nextSyncToken: 'empty-sync',
      });

      const result = await syncEventsBatchPaginated(
        'user123',
        'source@example.com',
        'target@example.com',
        undefined
      );

      expect(result.processedCount).toBe(0);
      expect(result.finalSyncToken).toBe('empty-sync');
      expect(result.nextPageToken).toBeUndefined();

      // Should not call batch operations for empty page
      expect(batchService.batchCreateEvents).not.toHaveBeenCalled();
      expect(batchService.batchUpdateEvents).not.toHaveBeenCalled();
    });
  });
});
