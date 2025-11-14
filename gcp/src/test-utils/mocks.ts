/**
 * Mock data for tests
 * Based on functions/calendar-sync test mocks
 */

import { Timestamp } from '@google-cloud/firestore';

export const mockUserData = {
  userId: 'test-user-123',
  email: 'test@example.com',
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  tokenExpiry: Date.now() + 3600000,
  createdAt: Timestamp.now(),
  lastLogin: Timestamp.now(),
};

export const mockWatchData = {
  channelId: 'channel-123',
  resourceId: 'resource-123',
  userId: 'test-user-123',
  calendarId: 'calendar@example.com',
  targetCalendarId: 'target@example.com',
  expiration: Date.now() + 7 * 24 * 60 * 60 * 1000,
  createdAt: Timestamp.now(),
  paused: false,
  syncState: {
    status: 'pending' as const,
  },
  stats: {
    totalEventsSynced: 0,
  },
};

export const mockEventMapping = {
  sourceCalendarId: 'source@example.com',
  sourceEventId: 'event-123',
  targetEventId: 'target-event-123',
  lastSynced: Timestamp.now(),
};

export const mockCalendarEvent = {
  id: 'event-123',
  summary: 'Test Event',
  description: 'Test description',
  start: { dateTime: '2025-11-13T10:00:00Z' },
  end: { dateTime: '2025-11-13T11:00:00Z' },
  status: 'confirmed',
  transparency: 'opaque',
};

export const mockAirbnbEvent = {
  id: 'airbnb-event-123',
  summary: 'Airbnb Reservation',
  description: 'Guest reservation details',
  start: { dateTime: '2025-11-13T15:00:00Z' },
  end: { dateTime: '2025-11-13T17:00:00Z' },
  status: 'confirmed',
  organizer: { email: 'calendar@airbnb.com' },
};

export const mockCalendarList = [
  {
    id: 'primary',
    summary: 'Primary Calendar',
    primary: true,
  },
  {
    id: 'test@example.com',
    summary: 'Test Calendar',
    primary: false,
  },
];
