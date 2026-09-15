import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCalendarWatch, renewCalendarWatch, stopCalendarWatch } from './watch';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';
import * as authModule from './auth';
import * as batchSyncModule from './batchSync';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockSet = vi.fn();
  const mockDelete = vi.fn();
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({ set: mockSet, get: mockGet, ref: { delete: mockDelete } }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
    })),
  };
});

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(),
        watch: vi.fn(),
      },
      channels: {
        stop: vi.fn(),
      },
    })),
  },
}));

// Mock auth module
vi.mock('./auth', () => ({
  getAuthClient: vi.fn(),
}));

// Mock batchSync module
vi.mock('./batchSync', () => ({
  enqueueBatchSync: vi.fn(),
}));

describe('watch.ts', () => {
  let mockFirestore: any;
  let mockCalendar: any;
  let mockCollection: any;
  let mockDoc: any;
  let mockSet: any;
  let mockGet: any;
  let mockDelete: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables for enqueueBatchSync
    process.env.PROJECT_ID = 'test-project';
    process.env.PROJECT_NUMBER = '123456789012';
    process.env.REGION = 'us-central1';

    mockFirestore = new Firestore();
    mockCollection = mockFirestore.collection;
    mockDoc = mockCollection().doc;
    mockSet = mockDoc().set;
    mockGet = mockDoc().get;
    mockDelete = mockDoc().ref.delete;

    mockCalendar = {
      events: {
        list: vi.fn(),
        watch: vi.fn(),
      },
      channels: {
        stop: vi.fn(),
      },
    };

    vi.mocked(google.calendar).mockReturnValue(mockCalendar as any);
    vi.mocked(authModule.getAuthClient).mockResolvedValue({} as any);

    // Mock Date.now for consistent channel IDs
    vi.spyOn(Date, 'now').mockReturnValue(1234567890000);
  });

  describe('createCalendarWatch', () => {
    it('should create a watch subscription and store in Firestore', async () => {
      const mockWatchResponse = {
        data: {
          resourceId: 'resource-123',
        },
      };

      mockCalendar.events.watch.mockResolvedValue(mockWatchResponse);
      vi.mocked(batchSyncModule.enqueueBatchSync).mockResolvedValue();

      await createCalendarWatch(
        'user123',
        'calendar123',
        'https://example.com/webhook',
        'target-cal'
      );

      const expectedChannelId = Buffer.from('user123-calendar123-1234567890000').toString('base64');

      expect(authModule.getAuthClient).toHaveBeenCalledWith('user123');

      expect(mockCalendar.events.watch).toHaveBeenCalledWith({
        calendarId: 'calendar123',
        requestBody: {
          id: expectedChannelId,
          type: 'web_hook',
          address: 'https://example.com/webhook',
          expiration: expect.any(String),
        },
      });

      expect(mockSet).toHaveBeenCalledWith({
        userId: 'user123',
        calendarId: 'calendar123',
        channelId: expectedChannelId,
        resourceId: 'resource-123',
        expiration: expect.any(Number),
        targetCalendarId: 'target-cal',
        stats: {
          totalEventsSynced: 0,
        },
        syncState: {
          status: 'pending',
          eventsSynced: 0,
          timeMax: expect.any(String),
        },
      });

      // Should enqueue batch sync
      expect(batchSyncModule.enqueueBatchSync).toHaveBeenCalledWith(expectedChannelId, 5);
    });

    it('should handle watch creation errors', async () => {
      mockCalendar.events.watch.mockRejectedValue(new Error('API error'));

      await expect(
        createCalendarWatch('user123', 'calendar123', 'https://example.com/webhook')
      ).rejects.toThrow('API error');
    });
  });

  describe('renewCalendarWatch', () => {
    it('should renew an existing watch', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'calendar123',
        channelId: 'old-channel-id',
        resourceId: 'old-resource-id',
        targetCalendarId: 'target-cal',
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
        ref: { delete: mockDelete },
      });

      mockCalendar.events.watch.mockResolvedValue({
        data: { resourceId: 'new-resource-id' },
      });

      vi.mocked(batchSyncModule.enqueueBatchSync).mockResolvedValue();

      process.env.WEBHOOK_URL = 'https://example.com/webhook';

      await renewCalendarWatch('calendar123', 'old-watch-id');

      expect(mockGet).toHaveBeenCalled();
      expect(mockCalendar.channels.stop).toHaveBeenCalledWith({
        auth: {},
        requestBody: {
          id: 'old-channel-id',
          resourceId: 'old-resource-id',
        },
      });
      expect(mockCalendar.events.watch).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
      expect(batchSyncModule.enqueueBatchSync).toHaveBeenCalled();
    });

    it('should skip renewal if watch does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      await renewCalendarWatch('calendar123', 'nonexistent');

      expect(mockCalendar.channels.stop).not.toHaveBeenCalled();
      expect(mockCalendar.events.watch).not.toHaveBeenCalled();
    });

    it('should handle renewal errors', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));

      await expect(renewCalendarWatch('calendar123', 'watch-id')).rejects.toThrow(
        'Firestore error'
      );
    });
  });

  describe('stopCalendarWatch', () => {
    it('should stop a watch subscription', async () => {
      await stopCalendarWatch('user123', 'channel123', 'resource123');

      expect(authModule.getAuthClient).toHaveBeenCalledWith('user123');
      expect(mockCalendar.channels.stop).toHaveBeenCalledWith({
        auth: {},
        requestBody: {
          id: 'channel123',
          resourceId: 'resource123',
        },
      });
    });

    it('should not throw if stop fails', async () => {
      mockCalendar.channels.stop.mockRejectedValue(new Error('Stop failed'));

      await expect(
        stopCalendarWatch('user123', 'channel123', 'resource123')
      ).resolves.not.toThrow();
    });
  });
});
