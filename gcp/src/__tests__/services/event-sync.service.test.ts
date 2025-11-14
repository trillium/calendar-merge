import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncEvent } from '../../services/event-sync.service';
import * as calendarService from '../../services/google-calendar.service';
import { db } from '../../db';

// Mock the services
vi.mock('../../services/google-calendar.service');
vi.mock('../../db/firestore');

describe('Event Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncEvent - Airbnb Feature Tests', () => {
    it('should add __EVENT__ marker to Airbnb events (summary match)', async () => {
      const airbnbEvent = {
        id: 'airbnb-1',
        summary: 'Airbnb Reservation',
        description: 'Guest details here',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      // Mock: No existing mapping
      vi.mocked(db.getDoc).mockResolvedValueOnce(null);

      // Mock: Get source event
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);

      // Mock: Create target event
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb' });

      await syncEvent('user123', 'source@example.com', 'airbnb-1', 'target@example.com');

      // Verify __EVENT__ was added to description
      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nGuest details here',
        })
      );
    });

    it('should add __EVENT__ marker to Airbnb events (organizer email match)', async () => {
      const airbnbEvent = {
        id: 'airbnb-2',
        summary: 'Reservation',
        description: 'Some details',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        organizer: { email: 'calendar@airbnb.com' },
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-2' });

      await syncEvent('user123', 'source@example.com', 'airbnb-2', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nSome details',
        })
      );
    });

    it('should add __EVENT__ marker to Airbnb events (creator email match)', async () => {
      const airbnbEvent = {
        id: 'airbnb-3',
        summary: 'Booking',
        description: 'Creator test',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        creator: { email: 'support@airbnb.com' },
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-3' });

      await syncEvent('user123', 'source@example.com', 'airbnb-3', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nCreator test',
        })
      );
    });

    it('should add __EVENT__ marker to Airbnb events (attendee email match)', async () => {
      const airbnbEvent = {
        id: 'airbnb-4',
        summary: 'Meeting',
        description: 'Attendee test',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        attendees: [
          { email: 'user@example.com' },
          { email: 'noreply@airbnb.com' },
        ],
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-4' });

      await syncEvent('user123', 'source@example.com', 'airbnb-4', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nAttendee test',
        })
      );
    });

    it('should add __EVENT__ marker for Airbnb events without description', async () => {
      const airbnbEvent = {
        id: 'airbnb-5',
        summary: 'Airbnb',
        description: '',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-5' });

      await syncEvent('user123', 'source@example.com', 'airbnb-5', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__',
        })
      );
    });

    it('should add __EVENT__ marker for Airbnb events with undefined description', async () => {
      const airbnbEvent = {
        id: 'airbnb-6',
        summary: 'Airbnb Stay',
        // description is undefined
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-6' });

      await syncEvent('user123', 'source@example.com', 'airbnb-6', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__',
        })
      );
    });

    it('should NOT add __EVENT__ to non-Airbnb events', async () => {
      const regularEvent = {
        id: 'regular-1',
        summary: 'Regular Meeting',
        description: 'Meeting notes',
        start: { dateTime: '2025-11-13T10:00:00Z' },
        end: { dateTime: '2025-11-13T11:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(regularEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-regular' });

      await syncEvent('user123', 'source@example.com', 'regular-1', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: 'Meeting notes', // NO __EVENT__
        })
      );
    });

    it('should be case-insensitive for Airbnb detection (uppercase)', async () => {
      const airbnbEvent = {
        id: 'airbnb-7',
        summary: 'AIRBNB BOOKING',
        description: 'Test',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-7' });

      await syncEvent('user123', 'source@example.com', 'airbnb-7', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nTest',
        })
      );
    });

    it('should be case-insensitive for Airbnb detection (mixed case)', async () => {
      const airbnbEvent = {
        id: 'airbnb-8',
        summary: 'AirBnB reservation',
        description: 'Test mixed case',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-8' });

      await syncEvent('user123', 'source@example.com', 'airbnb-8', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nTest mixed case',
        })
      );
    });

    it('should add __EVENT__ marker even if already present (current behavior)', async () => {
      const airbnbEvent = {
        id: 'airbnb-9',
        summary: 'Airbnb Stay',
        description: '__EVENT__\n\nAlready has marker',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-9' });

      await syncEvent('user123', 'source@example.com', 'airbnb-9', 'target@example.com');

      // Verify __EVENT__ was added (current implementation adds it regardless)
      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: expect.stringContaining('__EVENT__'),
        })
      );
    });
  });

  describe('syncEvent - Update vs Create', () => {
    it('should update existing events instead of creating duplicates', async () => {
      const existingMapping = {
        sourceCalendarId: 'source@example.com',
        sourceEventId: 'event1',
        targetEventId: 'target-event-1',
      };

      const updatedEvent = {
        id: 'event1',
        summary: 'Updated Event',
        start: { dateTime: '2025-11-13T10:00:00Z' },
        end: { dateTime: '2025-11-13T11:00:00Z' },
        status: 'confirmed',
        transparency: 'opaque',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(existingMapping);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(updatedEvent);
      vi.mocked(calendarService.updateEvent).mockResolvedValueOnce({ id: 'target-event-1' });

      await syncEvent('user123', 'source@example.com', 'event1', 'target@example.com');

      // Should UPDATE, not INSERT
      expect(calendarService.updateEvent).toHaveBeenCalled();
      expect(calendarService.createEvent).not.toHaveBeenCalled();
    });

    it('should delete cancelled events', async () => {
      const existingMapping = {
        sourceCalendarId: 'source@example.com',
        sourceEventId: 'event1',
        targetEventId: 'target-event-1',
      };

      const cancelledEvent = {
        id: 'event1',
        status: 'cancelled',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(existingMapping);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(cancelledEvent);

      await syncEvent('user123', 'source@example.com', 'event1', 'target@example.com');

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        'target-event-1'
      );
      expect(db.deleteDoc).toHaveBeenCalled();
    });

    it('should handle 404 errors gracefully (event not found)', async () => {
      vi.mocked(db.getDoc).mockResolvedValueOnce(null);

      const notFoundError: any = new Error('Not Found');
      notFoundError.code = 404;
      vi.mocked(calendarService.getEvent).mockRejectedValueOnce(notFoundError);

      // Should not throw, returns success: false
      const result = await syncEvent('user123', 'source@example.com', 'missing-event', 'target@example.com');
      expect(result.success).toBe(false);
    });
  });
});
