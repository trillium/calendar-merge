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
    it('should sync events from source to target calendar', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'source-cal',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      const mockEvents = [
        { id: 'event1', summary: 'Test Event 1', start: { dateTime: '2025-10-04T10:00:00Z' } },
        { id: 'event2', summary: 'Test Event 2', start: { dateTime: '2025-10-04T14:00:00Z' } },
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

      // Mock event mapping queries (no existing mappings)
      mockGet.mockResolvedValue({ empty: true, docs: [] });

      // Mock event get
      mockCalendar.events.get.mockResolvedValueOnce({
        data: {
          id: 'event1',
          summary: 'Test Event 1',
          start: { dateTime: '2025-10-04T10:00:00Z' },
          end: { dateTime: '2025-10-04T11:00:00Z' },
          status: 'confirmed',
        },
      });

      mockCalendar.events.get.mockResolvedValueOnce({
        data: {
          id: 'event2',
          summary: 'Test Event 2',
          start: { dateTime: '2025-10-04T14:00:00Z' },
          end: { dateTime: '2025-10-04T15:00:00Z' },
          status: 'confirmed',
        },
      });

      // Mock event insert
      mockCalendar.events.insert.mockResolvedValue({
        data: { id: 'new-event-1' },
      });

      await syncCalendarEvents('channel123');

      expect(mockCalendar.events.list).toHaveBeenCalledWith({
        calendarId: 'source-cal',
        timeMin: expect.any(String),
        singleEvents: true,
        orderBy: 'startTime',
      });

      expect(mockCalendar.events.insert).toHaveBeenCalledTimes(2);
      expect(mockAdd).toHaveBeenCalledTimes(2);
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

    it('should update existing events', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'source-cal',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      const mockEvents = [
        { id: 'event1', summary: 'Updated Event', start: { dateTime: '2025-10-04T10:00:00Z' } },
      ];

      const mockMapping = {
        sourceCalendarId: 'source-cal',
        sourceEventId: 'event1',
        targetEventId: 'target-event-1',
      };

      // Mock watch document
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockWatchData,
      });

      // Mock event list
      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      // Mock existing event mapping
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          data: () => mockMapping,
          ref: { update: vi.fn() },
        }],
      });

      // Mock event get
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: 'event1',
          summary: 'Updated Event',
          start: { dateTime: '2025-10-04T10:00:00Z' },
          end: { dateTime: '2025-10-04T11:00:00Z' },
          status: 'confirmed',
        },
      });

      await syncCalendarEvents('channel123');

      expect(mockCalendar.events.update).toHaveBeenCalledWith({
        calendarId: 'target-cal',
        eventId: 'target-event-1',
        requestBody: expect.objectContaining({
          summary: 'Updated Event',
        }),
      });
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

      // Mock existing event mapping
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{
          data: () => mockMapping,
          ref: mockDocRef,
        }],
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
