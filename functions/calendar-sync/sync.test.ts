import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncCalendarEvents } from './sync';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { google } from 'googleapis';
import * as authModule from './auth';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockAdd = vi.fn();
  const mockGet = vi.fn();
  const mockLimit = vi.fn(() => ({ get: mockGet }));
  const mockWhere = vi.fn(() => ({ where: mockWhere, limit: mockLimit, get: mockGet }));
  const mockDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate, delete: mockDelete, ref: { delete: mockDelete, update: mockUpdate } }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc, where: mockWhere, add: mockAdd }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
    })),
    Timestamp: {
      now: vi.fn(() => ({ seconds: 1234567890 })),
    },
  };
});

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    })),
  },
}));

// Mock auth module
vi.mock('./auth', () => ({
  getAuthClient: vi.fn(),
}));

describe('sync.ts', () => {
  let mockFirestore: any;
  let mockCalendar: any;
  let mockCollection: any;
  let mockDoc: any;
  let mockGet: any;
  let mockWhere: any;
  let mockAdd: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFirestore = new Firestore();
    mockCollection = mockFirestore.collection;
    mockDoc = mockCollection().doc;
    mockGet = mockDoc().get;
    mockWhere = mockCollection().where;
    mockAdd = mockCollection().add;

    mockCalendar = {
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    vi.mocked(google.calendar).mockReturnValue(mockCalendar as any);
    vi.mocked(authModule.getAuthClient).mockResolvedValue({} as any);
  });

  describe('syncCalendarEvents', () => {
    it('should sync events from source to target calendar with labels and privacy', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'user@example.com',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      const mockEvents = [
        { id: 'event1', summary: 'Test Event 1', start: { dateTime: '2025-10-04T10:00:00Z' } },
      ];

      // Mock watch document
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockWatchData,
      });

      // Mock event list
      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      // Mock event mapping document (no existing mapping)
      mockGet.mockResolvedValue({ exists: false });

      // Mock event get
      mockCalendar.events.get.mockResolvedValueOnce({
        data: {
          id: 'event1',
          summary: 'Test Event 1',
          start: { dateTime: '2025-10-04T10:00:00Z' },
          end: { dateTime: '2025-10-04T11:00:00Z' },
          status: 'confirmed',
          transparency: 'transparent',
        },
      });

      // Mock event insert
      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'new-event-1' },
      });

      await syncCalendarEvents('channel123');

      expect(mockCalendar.events.insert).toHaveBeenCalledWith({
        calendarId: 'target-cal',
        requestBody: expect.objectContaining({
          summary: '[user] Test Event 1 - free',
          visibility: 'private',
          transparency: 'transparent',
        }),
      });
    });

    it('should return early if watch does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      await syncCalendarEvents('nonexistent');

      expect(mockCalendar.events.list).not.toHaveBeenCalled();
    });

    it('should return early if watch data is incomplete', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ userId: 'user123', calendarId: 'source-cal' }), // Missing targetCalendarId
      });

      await syncCalendarEvents('channel123');

      expect(mockCalendar.events.list).not.toHaveBeenCalled();
    });

    it('should update existing events without duplicating', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'user@example.com',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      const mockEvents = [
        { id: 'event1', summary: 'Updated Event', start: { dateTime: '2025-10-04T10:00:00Z' } },
      ];

      const mockMapping = {
        sourceCalendarId: 'user@example.com',
        sourceEventId: 'event1',
        targetEventId: 'target-event-1',
      };

      const mockUpdateFn = vi.fn();

      // Mock watch document
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockWatchData,
      });

      // Mock event list
      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      // Mock existing event mapping document (using composite key)
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockMapping,
        ref: { update: mockUpdateFn },
      });

      // Mock event get
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: 'event1',
          summary: 'Updated Event',
          start: { dateTime: '2025-10-04T10:00:00Z' },
          end: { dateTime: '2025-10-04T11:00:00Z' },
          status: 'confirmed',
          transparency: 'opaque',
        },
      });

      await syncCalendarEvents('channel123');

      // Should update, not insert
      expect(mockCalendar.events.update).toHaveBeenCalledWith({
        calendarId: 'target-cal',
        eventId: 'target-event-1',
        requestBody: expect.objectContaining({
          summary: '[user] Updated Event - busy',
          visibility: 'private',
          transparency: 'opaque',
        }),
      });
      expect(mockCalendar.events.insert).not.toHaveBeenCalled();
    });

    it('should use composite key for mapping document ID', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'test@example.com',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      const mockEvents = [
        { id: 'event-abc', summary: 'Test', start: { dateTime: '2025-10-04T10:00:00Z' } },
      ];

      // Mock watch document
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockWatchData,
      });

      // Mock event list
      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      // Mock no existing mapping
      mockGet.mockResolvedValue({ exists: false });

      // Mock event get
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: 'event-abc',
          summary: 'Test',
          start: { dateTime: '2025-10-04T10:00:00Z' },
          end: { dateTime: '2025-10-04T11:00:00Z' },
          status: 'confirmed',
        },
      });

      // Mock event insert
      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'new-target-event' },
      });

      // Spy on Firestore set
      const mockSet = vi.fn();
      mockDoc.mockReturnValue({ get: mockGet, set: mockSet, ref: {} });

      await syncCalendarEvents('channel123');

      // Verify composite key was used: sourceCalendarId_sourceEventId
      expect(mockDoc).toHaveBeenCalledWith('test@example.com_event-abc');
    });

    it('should delete cancelled events', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'source-cal',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      const mockEvents = [
        { id: 'event1', summary: 'Cancelled Event', start: { dateTime: '2025-10-04T10:00:00Z' } },
      ];

      const mockMapping = {
        sourceCalendarId: 'source-cal',
        sourceEventId: 'event1',
        targetEventId: 'target-event-1',
      };

      const mockDocRef = { delete: vi.fn() };

      // Mock watch document
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockWatchData,
      });

      // Mock event list
      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      // Mock existing event mapping document (using composite key)
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockMapping,
        ref: mockDocRef,
      });

      // Mock cancelled event
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: 'event1',
          status: 'cancelled',
        },
      });

      await syncCalendarEvents('channel123');

      expect(mockCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'target-cal',
        eventId: 'target-event-1',
      });
      expect(mockDocRef.delete).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));

      await expect(syncCalendarEvents('channel123')).rejects.toThrow('Firestore error');
    });
  });
});
