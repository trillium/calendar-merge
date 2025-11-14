# Task 16: Set Up Testing Infrastructure

**Status:** Not Started
**Priority:** Medium
**Estimated Time:** 3-4 hours
**Dependencies:** All previous tasks (services, controllers, routes)

---

## Objective

Set up Jest testing framework and create basic tests for services, controllers, and routes.

## Why This Task?

- Ensure code quality
- Catch regressions
- Make refactoring safer
- Document expected behavior

## Files to Create

```
gcp/
├── jest.config.js                    (Jest configuration)
├── tsconfig.test.json                (TypeScript config for tests)
└── src/
    ├── __tests__/
    │   ├── services/
    │   │   ├── google-auth.service.test.ts
    │   │   ├── event-sync.service.test.ts
    │   │   └── watch-channel.service.test.ts
    │   ├── controllers/
    │   │   └── sync.controller.test.ts
    │   └── utils/
    │       └── date-helpers.test.ts
    └── test-utils/
        ├── mocks.ts                  (Mock data)
        └── setup.ts                  (Test setup)
```

## Steps

### 1. Install testing dependencies

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

pnpm add -D jest @types/jest ts-jest @jest/globals
```

### 2. Create jest.config.js

**File:** `gcp/jest.config.js`

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/**',
    '!src/test-utils/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test-utils/setup.ts'],
  testTimeout: 10000,
};
```

### 3. Create tsconfig.test.json

**File:** `gcp/tsconfig.test.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["jest", "node"]
  },
  "include": ["src/**/*.test.ts", "src/__tests__/**/*.ts", "src/test-utils/**/*.ts"]
}
```

### 4. Create test setup

**File:** `gcp/src/test-utils/setup.ts`

```typescript
/**
 * Test setup and configuration
 */

// Set environment variables for tests
process.env.NODE_ENV = 'test';
process.env.GCP_PROJECT = 'test-project';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';
process.env.CLOUD_FUNCTION_URL = 'http://localhost:8080';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Mock Firestore
jest.mock('../db/firestore', () => ({
  getFirestore: jest.fn(),
  db: {
    users: jest.fn(),
    watches: jest.fn(),
    eventMappings: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn(),
    getAll: jest.fn(),
  },
}));

// Mock Google APIs
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({
        generateAuthUrl: jest.fn(),
        getToken: jest.fn(),
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn(),
        revokeCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn(() => ({
      events: {
        list: jest.fn(),
        get: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        watch: jest.fn(),
      },
      calendars: {
        get: jest.fn(),
      },
      calendarList: {
        list: jest.fn(),
      },
      channels: {
        stop: jest.fn(),
      },
    })),
    oauth2: jest.fn(() => ({
      userinfo: {
        get: jest.fn(),
      },
    })),
  },
}));
```

### 5. Create mock data

**File:** `gcp/src/test-utils/mocks.ts`

```typescript
/**
 * Mock data for tests
 */

import { Timestamp } from '@google-cloud/firestore';
import { WatchData, UserData, EventMapping } from '../types';

export const mockUserData: UserData = {
  userId: 'test-user-123',
  email: 'test@example.com',
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  tokenExpiry: Date.now() + 3600000,
  createdAt: Timestamp.now(),
};

export const mockWatchData: WatchData = {
  channelId: 'channel-123',
  resourceId: 'resource-123',
  userId: 'test-user-123',
  calendarId: 'calendar@example.com',
  targetCalendarId: 'target@example.com',
  expiration: Date.now() + 7 * 24 * 60 * 60 * 1000,
  createdAt: Timestamp.now(),
  paused: false,
  syncState: {
    status: 'pending',
  },
  stats: {
    totalEventsSynced: 0,
  },
};

export const mockEventMapping: EventMapping = {
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
};

export const mockAirbnbEvent = {
  id: 'airbnb-event-123',
  summary: 'Airbnb Reservation',
  description: 'Guest reservation',
  start: { dateTime: '2025-11-13T15:00:00Z' },
  end: { dateTime: '2025-11-13T11:00:00Z' },
  status: 'confirmed',
  organizer: { email: 'calendar@airbnb.com' },
};
```

### 6. Create example tests

**File:** `gcp/src/__tests__/utils/date-helpers.test.ts`

```typescript
import { formatDuration, isExpired, daysFromNow } from '../../utils/date-helpers';

describe('Date Helpers', () => {
  describe('formatDuration', () => {
    it('should format milliseconds to human-readable duration', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(90000000)).toBe('1d 1h');
    });
  });

  describe('isExpired', () => {
    it('should return true for past timestamps', () => {
      const pastTime = Date.now() - 1000;
      expect(isExpired(pastTime)).toBe(true);
    });

    it('should return false for future timestamps', () => {
      const futureTime = Date.now() + 1000;
      expect(isExpired(futureTime)).toBe(false);
    });
  });

  describe('daysFromNow', () => {
    it('should calculate timestamp N days in the future', () => {
      const now = Date.now();
      const sevenDays = daysFromNow(7);
      const diff = sevenDays - now;
      const expectedDiff = 7 * 24 * 60 * 60 * 1000;

      // Allow 1 second tolerance
      expect(Math.abs(diff - expectedDiff)).toBeLessThan(1000);
    });
  });
});
```

**File:** `gcp/src/__tests__/services/event-sync.service.test.ts`

```typescript
import { syncEvent } from '../../services/event-sync.service';
import { db } from '../../db';
import * as calendarService from '../../services/google-calendar.service';
import { mockCalendarEvent, mockAirbnbEvent } from '../../test-utils/mocks';

jest.mock('../../db/firestore');
jest.mock('../../services/google-calendar.service');

describe('Event Sync Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncEvent', () => {
    it('should create new event if mapping does not exist', async () => {
      // Mock: no existing mapping
      (db.getDoc as jest.Mock).mockResolvedValue(null);

      // Mock: source event exists
      (calendarService.getEvent as jest.Mock).mockResolvedValue(mockCalendarEvent);

      // Mock: event creation succeeds
      (calendarService.createEvent as jest.Mock).mockResolvedValue({
        id: 'new-target-event',
      });

      const result = await syncEvent(
        'test-user',
        'source@example.com',
        'event-123',
        'target@example.com'
      );

      expect(result.success).toBe(true);
      expect(calendarService.createEvent).toHaveBeenCalled();
      expect(db.setDoc).toHaveBeenCalledWith(
        'eventMappings',
        expect.any(String),
        expect.objectContaining({
          sourceEventId: 'event-123',
          targetEventId: 'new-target-event',
        })
      );
    });

    it('should add __EVENT__ marker to Airbnb events', async () => {
      (db.getDoc as jest.Mock).mockResolvedValue(null);
      (calendarService.getEvent as jest.Mock).mockResolvedValue(mockAirbnbEvent);
      (calendarService.createEvent as jest.Mock).mockResolvedValue({ id: 'new-event' });

      await syncEvent('test-user', 'source@example.com', 'airbnb-event', 'target@example.com');

      // Check that createEvent was called with __EVENT__ in description
      const createCall = (calendarService.createEvent as jest.Mock).mock.calls[0];
      const eventData = createCall[2]; // Third argument
      expect(eventData.description).toContain('__EVENT__');
    });

    it('should handle cancelled events', async () => {
      const cancelledEvent = { ...mockCalendarEvent, status: 'cancelled' };

      (db.getDoc as jest.Mock).mockResolvedValue({
        targetEventId: 'existing-target',
      });
      (calendarService.getEvent as jest.Mock).mockResolvedValue(cancelledEvent);

      const result = await syncEvent(
        'test-user',
        'source@example.com',
        'event-123',
        'target@example.com'
      );

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        'test-user',
        'target@example.com',
        'existing-target'
      );
      expect(db.deleteDoc).toHaveBeenCalled();
    });
  });
});
```

### 7. Update package.json scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

## Validation Checklist

- [ ] Jest installed and configured
- [ ] Test setup file created
- [ ] Mock data created
- [ ] Example tests written
- [ ] Tests pass: `pnpm test`
- [ ] Coverage report generated: `pnpm test:coverage`

## Running Tests

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Run specific test file
pnpm test event-sync.service.test
```

## Next Task

→ **17_TASK_integration_testing.md** - Perform integration testing with deployed function

## Notes

- Tests use mocks for Firestore and Google APIs
- Test environment variables set in setup.ts
- Coverage reports show which code is tested
- Watch mode useful for TDD workflow
- Can port existing tests from `functions/calendar-sync/*.test.ts`
