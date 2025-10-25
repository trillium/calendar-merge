import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchSyncEvents, enqueueBatchSync } from './batchSync';
import { Firestore } from '@google-cloud/firestore';
import { CloudTasksClient } from '@google-cloud/tasks';
import { google } from 'googleapis';
import * as authModule from './auth';
import * as syncModule from './sync';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockUpdate = vi.fn();
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate, ref: { update: mockUpdate } }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
    })),
  };
});

// Mock Cloud Tasks
vi.mock('@google-cloud/tasks', () => {
  const mockCreateTask = vi.fn();
  const mockQueuePath = vi.fn(() => 'projects/test-project/locations/us-central1/queues/calendar-sync-queue');

  return {
    CloudTasksClient: vi.fn(() => ({
      createTask: mockCreateTask,
      queuePath: mockQueuePath,
    })),
  };
});

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(),
      },
    })),
  },
}));

// Mock auth module
vi.mock('./auth', () => ({
  getAuthClient: vi.fn(),
}));

// Mock sync module
vi.mock('./sync', () => ({
  syncEvent: vi.fn(),
}));

describe('batchSync.ts', () => {
  let mockFirestore: any;
  let mockTasksClient: any;
  let mockCalendar: any;
  let mockCollection: any;
  let mockDoc: any;
  let mockGet: any;
  let mockUpdate: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Set up environment variables
    process.env.PROJECT_ID = 'test-project';
    process.env.PROJECT_NUMBER = '123456789012';
    process.env.REGION = 'us-central1';

    mockFirestore = new Firestore();
    mockTasksClient = new CloudTasksClient();
    mockCollection = mockFirestore.collection;
    mockDoc = mockCollection().doc;
    mockGet = mockDoc().get;
    mockUpdate = mockDoc().update;

    mockCalendar = {
      events: {
        list: vi.fn(),
      },
    };

    vi.mocked(google.calendar).mockReturnValue(mockCalendar as any);
    vi.mocked(authModule.getAuthClient).mockResolvedValue({} as any);
    vi.mocked(syncModule.syncEvent).mockResolvedValue(true);
  });

  describe('batchSyncEvents', () => {
    it('should process a batch of 50 events with rate limiting', async () => {
      const channelId = 'channel-123';
      const mockWatchData = {
        userId: 'user-123',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'pending',
          eventsSynced: 0,
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      const mockEvents = Array.from({ length: 50 }, (_, i) => ({
        id: `event-${i}`,
        summary: `Event ${i}`,
      }));

      // Mock Firestore get
      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      // Mock Google Calendar API response - intermediate page
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
          nextPageToken: 'next-page-token-123',
        },
      });

      const syncPromise = batchSyncEvents(channelId);

      // Advance timers to handle rate limiting delays
      await vi.runAllTimersAsync();

      await syncPromise;

      // Verify auth was obtained
      expect(authModule.getAuthClient).toHaveBeenCalledWith('user-123');

      // Verify events.list was called with correct parameters
      expect(mockCalendar.events.list).toHaveBeenCalledWith({
        calendarId: 'source@example.com',
        timeMin: expect.any(String),
        timeMax: '2027-10-25T00:00:00.000Z',
        maxResults: 50,
        pageToken: undefined, // First batch has no pageToken
        singleEvents: true,
        orderBy: 'startTime',
      });

      // Verify all 50 events were synced
      expect(syncModule.syncEvent).toHaveBeenCalledTimes(50);

      // Verify progress was updated with nextPageToken
      expect(mockUpdate).toHaveBeenCalledWith({
        'syncState.eventsSynced': 50,
        'syncState.lastBatchTime': expect.any(Number),
        'syncState.pageToken': 'next-page-token-123',
        'syncState.status': 'syncing',
      });

      // Verify next batch was enqueued
      expect(mockTasksClient.createTask).toHaveBeenCalled();
    });

    it('should handle pagination and continue with pageToken', async () => {
      const channelId = 'channel-456';
      const mockWatchData = {
        userId: 'user-456',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'syncing',
          eventsSynced: 50,
          pageToken: 'page-token-from-previous-batch',
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      const mockEvents = Array.from({ length: 50 }, (_, i) => ({
        id: `event-batch2-${i}`,
        summary: `Event Batch 2 ${i}`,
      }));

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
          nextPageToken: 'page-token-for-batch-3',
        },
      });

      const syncPromise = batchSyncEvents(channelId);

      // Advance timers to handle rate limiting delays
      await vi.runAllTimersAsync();

      await syncPromise;

      // Verify pageToken was passed to API
      expect(mockCalendar.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          pageToken: 'page-token-from-previous-batch',
        })
      );

      // Verify progress includes cumulative count (50 + 50 = 100)
      expect(mockUpdate).toHaveBeenCalledWith({
        'syncState.eventsSynced': 100,
        'syncState.lastBatchTime': expect.any(Number),
        'syncState.pageToken': 'page-token-for-batch-3',
        'syncState.status': 'syncing',
      });
    });

    it('should mark sync complete and store syncToken on final batch', async () => {
      const channelId = 'channel-final';
      const mockWatchData = {
        userId: 'user-final',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'syncing',
          eventsSynced: 100,
          pageToken: 'last-page-token',
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      const mockEvents = Array.from({ length: 25 }, (_, i) => ({
        id: `final-event-${i}`,
        summary: `Final Event ${i}`,
      }));

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      // Final page returns nextSyncToken instead of nextPageToken
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: mockEvents,
          nextSyncToken: 'sync-token-abc123',
        },
      });

      const syncPromise = batchSyncEvents(channelId);

      // Advance timers to handle rate limiting delays
      await vi.runAllTimersAsync();

      await syncPromise;

      // Verify sync marked as complete with syncToken
      expect(mockUpdate).toHaveBeenCalledWith({
        'syncState.eventsSynced': 125,
        'syncState.lastBatchTime': expect.any(Number),
        syncToken: 'sync-token-abc123',
        'syncState.status': 'complete',
        'syncState.pageToken': null,
      });

      // Verify next batch was NOT enqueued
      expect(mockTasksClient.createTask).not.toHaveBeenCalled();
    });

    it('should skip sync if already complete', async () => {
      const channelId = 'channel-complete';
      const mockWatchData = {
        userId: 'user-complete',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'complete',
          eventsSynced: 500,
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      await batchSyncEvents(channelId);

      // Verify no API calls were made
      expect(mockCalendar.events.list).not.toHaveBeenCalled();
      expect(syncModule.syncEvent).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should throw error if watch not found', async () => {
      const channelId = 'nonexistent-channel';

      mockGet.mockResolvedValue({
        exists: false,
      });

      await expect(batchSyncEvents(channelId)).rejects.toThrow('Watch nonexistent-channel not found');
    });

    it('should throw error if watch data is missing required fields', async () => {
      const channelId = 'invalid-watch';
      const mockWatchData = {
        userId: 'user-123',
        calendarId: 'source@example.com',
        // Missing targetCalendarId
        syncState: {
          status: 'pending',
          eventsSynced: 0,
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      await expect(batchSyncEvents(channelId)).rejects.toThrow('Missing configuration for source@example.com');
    });

    it('should handle errors gracefully and mark sync as failed', async () => {
      const channelId = 'error-channel';
      const mockWatchData = {
        userId: 'user-error',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'pending',
          eventsSynced: 0,
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      // Mock API error
      mockCalendar.events.list.mockRejectedValue(new Error('Google API error'));

      await expect(batchSyncEvents(channelId)).rejects.toThrow('Google API error');

      // Verify sync was marked as failed
      expect(mockUpdate).toHaveBeenCalledWith({
        'syncState.status': 'failed',
        'syncState.lastBatchTime': expect.any(Number),
      });
    });

    it('should update status to syncing on first batch', async () => {
      const channelId = 'first-batch-channel';
      const mockWatchData = {
        userId: 'user-first',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'pending', // Initial status
          eventsSynced: 0,
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [{ id: 'event-1', summary: 'Event 1' }],
          nextSyncToken: 'sync-token-123',
        },
      });

      await batchSyncEvents(channelId);

      // Verify status was updated to syncing before processing
      expect(mockUpdate).toHaveBeenNthCalledWith(1, {
        'syncState.status': 'syncing',
        'syncState.lastBatchTime': expect.any(Number),
      });
    });

    it('should handle empty event list', async () => {
      const channelId = 'empty-channel';
      const mockWatchData = {
        userId: 'user-empty',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'pending',
          eventsSynced: 0,
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [],
          nextSyncToken: 'sync-token-empty',
        },
      });

      await batchSyncEvents(channelId);

      // Verify sync completed even with 0 events
      expect(mockUpdate).toHaveBeenLastCalledWith({
        'syncState.eventsSynced': 0,
        'syncState.lastBatchTime': expect.any(Number),
        syncToken: 'sync-token-empty',
        'syncState.status': 'complete',
        'syncState.pageToken': null,
      });
    });

    it('should handle response with neither nextPageToken nor nextSyncToken', async () => {
      const channelId = 'unusual-channel';
      const mockWatchData = {
        userId: 'user-unusual',
        calendarId: 'source@example.com',
        targetCalendarId: 'target@example.com',
        syncState: {
          status: 'pending',
          eventsSynced: 0,
          timeMax: '2027-10-25T00:00:00.000Z',
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { update: mockUpdate },
      });

      // Unusual case: no nextPageToken and no nextSyncToken
      mockCalendar.events.list.mockResolvedValue({
        data: {
          items: [{ id: 'event-1' }],
          // No nextPageToken or nextSyncToken
        },
      });

      await batchSyncEvents(channelId);

      // Verify sync was marked complete anyway
      expect(mockUpdate).toHaveBeenLastCalledWith({
        'syncState.eventsSynced': 1,
        'syncState.lastBatchTime': expect.any(Number),
        'syncState.status': 'complete',
        'syncState.pageToken': null,
      });
    });
  });

  describe('enqueueBatchSync', () => {
    it('should enqueue a batch sync task with correct parameters', async () => {
      const channelId = 'channel-789';
      const delaySeconds = 5;

      await enqueueBatchSync(channelId, delaySeconds);

      // Verify queuePath was constructed correctly
      expect(mockTasksClient.queuePath).toHaveBeenCalledWith(
        'test-project',
        'us-central1',
        'calendar-sync-queue'
      );

      // Verify createTask was called with correct structure
      expect(mockTasksClient.createTask).toHaveBeenCalledWith({
        parent: 'projects/test-project/locations/us-central1/queues/calendar-sync-queue',
        task: {
          httpRequest: {
            httpMethod: 'POST',
            url: 'https://us-central1-test-project.cloudfunctions.net/batchSync',
            headers: {
              'Content-Type': 'application/json',
            },
            body: Buffer.from(JSON.stringify({ channelId })).toString('base64'),
            oidcToken: {
              serviceAccountEmail: 'service-123456789012@gcp-sa-cloudtasks.iam.gserviceaccount.com',
              audience: 'https://us-central1-test-project.cloudfunctions.net/batchSync',
            },
          },
          scheduleTime: {
            seconds: expect.any(Number),
          },
        },
      });
    });

    it('should use CONFIG.PROJECT_ID fallback if env var not set', async () => {
      const originalEnv = process.env.PROJECT_ID;
      delete process.env.PROJECT_ID;

      // Code has fallback to CONFIG.PROJECT_ID, so this should succeed
      await enqueueBatchSync('channel-123', 5);

      expect(mockTasksClient.createTask).toHaveBeenCalled();

      process.env.PROJECT_ID = originalEnv;
    });

    it('should throw error if PROJECT_NUMBER is missing', async () => {
      delete process.env.PROJECT_NUMBER;

      await expect(enqueueBatchSync('channel-123', 5)).rejects.toThrow(
        'Missing PROJECT_ID or PROJECT_NUMBER environment variables'
      );
    });

    it('should handle task creation errors', async () => {
      mockTasksClient.createTask.mockRejectedValue(new Error('Cloud Tasks error'));

      await expect(enqueueBatchSync('channel-123', 5)).rejects.toThrow('Cloud Tasks error');
    });

    it('should calculate schedule time correctly with delay', async () => {
      const channelId = 'channel-delay';
      const delaySeconds = 10;
      const mockNow = 1700000000000; // Fixed timestamp
      vi.setSystemTime(mockNow);

      await enqueueBatchSync(channelId, delaySeconds);

      const expectedScheduleSeconds = Math.floor(mockNow / 1000) + delaySeconds;

      expect(mockTasksClient.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({
            scheduleTime: {
              seconds: expectedScheduleSeconds,
            },
          }),
        })
      );
    });

    it('should use default region if REGION env var is not set', async () => {
      delete process.env.REGION;

      await enqueueBatchSync('channel-123', 5);

      // Should default to us-central1
      expect(mockTasksClient.queuePath).toHaveBeenCalledWith(
        'test-project',
        'us-central1',
        'calendar-sync-queue'
      );

      expect(mockTasksClient.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({
            httpRequest: expect.objectContaining({
              url: 'https://us-central1-test-project.cloudfunctions.net/batchSync',
            }),
          }),
        })
      );
    });
  });
});
