# Task 21: Create Comprehensive Tests Using Vitest

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 6-8 hours
**Dependencies:** Task 08 (Event Sync Service), Task 19 (Port existing tests - reference only)

---

## Objective

Create a comprehensive test suite for the `/gcp` codebase using **Vitest** (matching the existing test framework), using the existing tests in `functions/calendar-sync/*.test.ts` as a reference and starting point.

## Why Vitest?

**Keep the same test framework as your existing tests:**
- ✅ Already have 2,165 lines of working Vitest tests
- ✅ Faster than Jest (uses Vite's transformation pipeline)
- ✅ Compatible API with Jest (minimal learning curve)
- ✅ Better ESM support
- ✅ Native TypeScript support
- ✅ Built-in coverage with c8

**DON'T port from Vitest to Jest** - keep what works!

---

## Step 1: Install Vitest in /gcp

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Install Vitest and related packages
pnpm add -D vitest @vitest/coverage-v8 @vitest/ui
```

---

## Step 2: Remove Jest (if already installed)

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Remove Jest packages
pnpm remove jest @types/jest @jest/globals ts-jest

# Remove jest.config.js if it exists
rm -f jest.config.js
```

---

## Step 3: Create Vitest Configuration

**File:** `gcp/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-utils/setup.ts'],
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/test-utils/',
        '**/*.test.ts',
        'src/index.ts',
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## Step 4: Update package.json Scripts

**File:** `gcp/package.json`

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "clean": "rm -rf dist"
  }
}
```

---

## Step 5: Create Test Setup File

**File:** `gcp/src/test-utils/setup.ts`

```typescript
/**
 * Vitest test setup
 * Configures global test environment and mocks
 */

import { vi, beforeEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.GCP_PROJECT = 'test-project';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';
process.env.CLOUD_FUNCTION_URL = 'http://localhost:8080';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockTimestamp = {
    now: vi.fn(() => ({
      seconds: 1234567890,
      toMillis: () => 1234567890000,
    })),
    fromMillis: vi.fn((ms: number) => ({
      seconds: Math.floor(ms / 1000),
      toMillis: () => ms,
    })),
  };

  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockSet = vi.fn();
  const mockAdd = vi.fn();
  const mockGet = vi.fn();
  const mockLimit = vi.fn(() => ({ get: mockGet }));
  const mockWhere = vi.fn(() => ({
    where: mockWhere,
    limit: mockLimit,
    get: mockGet,
  }));
  const mockDoc = vi.fn(() => ({
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
    delete: mockDelete,
    ref: { delete: mockDelete, update: mockUpdate },
  }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
    where: mockWhere,
    add: mockAdd,
    get: mockGet,
  }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
    })),
    Timestamp: mockTimestamp,
  };
});

// Mock Google APIs
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
        setCredentials: vi.fn(),
        refreshAccessToken: vi.fn(),
        revokeCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        watch: vi.fn(),
      },
      calendars: {
        get: vi.fn(),
      },
      calendarList: {
        list: vi.fn(),
      },
      channels: {
        stop: vi.fn(),
      },
    })),
    oauth2: vi.fn(() => ({
      userinfo: {
        get: vi.fn(),
      },
    })),
  },
}));

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## Step 6: Create Mock Data (Reuse from Existing Tests)

**File:** `gcp/src/test-utils/mocks.ts`

```typescript
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
```

---

## Step 7: Port Event Sync Tests (MOST IMPORTANT)

**File:** `gcp/src/__tests__/services/event-sync.service.test.ts`

Copy from `functions/calendar-sync/sync.test.ts` and adapt for new service structure:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncCalendarEvents, syncEvent } from '../../services/event-sync.service';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { google } from 'googleapis';
import * as calendarService from '../../services/google-calendar.service';
import { db } from '../../db';

// Mock the services
vi.mock('../../services/google-calendar.service');
vi.mock('../../db/firestore');

describe('Event Sync Service', () => {
  let mockCalendar: any;

  beforeEach(() => {
    vi.clearAllMocks();

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
  });

  describe('syncCalendarEvents', () => {
    it('should sync events with calendar name label and privacy', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'user@example.com',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      // Mock watch data
      vi.mocked(db.getDoc).mockResolvedValueOnce(mockWatchData);

      // Mock events list
      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: [
          {
            id: 'event1',
            summary: 'Test Event',
            start: { dateTime: '2025-11-13T10:00:00Z' },
          }
        ],
        nextSyncToken: 'sync-token-123',
      });

      // Mock no existing mapping
      vi.mocked(db.getDoc).mockResolvedValueOnce(null);

      // Mock event get
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce({
        id: 'event1',
        summary: 'Test Event',
        start: { dateTime: '2025-11-13T10:00:00Z' },
        end: { dateTime: '2025-11-13T11:00:00Z' },
        status: 'confirmed',
        transparency: 'transparent',
      });

      // Mock event insert
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({
        id: 'new-event-1',
      });

      await syncCalendarEvents('channel123');

      // Verify event was created with proper formatting
      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target-cal',
        expect.objectContaining({
          summary: '[user] Test Event - free',
          visibility: 'private',
          transparency: 'transparent',
        })
      );
    });

    it('should handle >50 events by saving syncToken only', async () => {
      const mockWatchData = {
        userId: 'user123',
        calendarId: 'user@example.com',
        targetCalendarId: 'target-cal',
        channelId: 'channel123',
      };

      // Create 51 events
      const mockEvents = Array.from({ length: 51 }, (_, i) => ({
        id: `event${i}`,
        summary: `Test Event ${i}`,
        start: { dateTime: '2025-11-13T10:00:00Z' },
      }));

      vi.mocked(db.getDoc).mockResolvedValueOnce(mockWatchData);
      vi.mocked(calendarService.listEvents).mockResolvedValueOnce({
        events: mockEvents,
        nextSyncToken: 'sync-token-456',
      });

      await syncCalendarEvents('channel123');

      // Should save syncToken
      expect(db.updateDoc).toHaveBeenCalledWith(
        'watches',
        'channel123',
        expect.objectContaining({
          syncToken: 'sync-token-456',
          syncTokenUpdatedAt: expect.any(Number),
        })
      );

      // Should NOT process events
      expect(calendarService.getEvent).not.toHaveBeenCalled();
      expect(calendarService.createEvent).not.toHaveBeenCalled();
    });
  });

  describe('syncEvent - Airbnb Feature', () => {
    it('should add __EVENT__ marker to Airbnb events (summary match)', async () => {
      const airbnbEvent = {
        id: 'airbnb-1',
        summary: 'Airbnb Reservation',
        description: 'Guest details',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null); // No existing mapping
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb' });

      await syncEvent('user123', 'source@example.com', 'airbnb-1', 'target@example.com');

      // Verify __EVENT__ was added to description
      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nGuest details',
        })
      );
    });

    it('should add __EVENT__ marker to Airbnb events (organizer email match)', async () => {
      const airbnbEvent = {
        id: 'airbnb-2',
        summary: 'Reservation',
        description: 'Details',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
        organizer: { email: 'calendar@airbnb.com' },
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-2' });

      await syncEvent('user123', 'source@example.com', 'airbnb-2', 'target@example.com');

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        expect.objectContaining({
          description: '__EVENT__\n\nDetails',
        })
      );
    });

    it('should add __EVENT__ marker for Airbnb events without description', async () => {
      const airbnbEvent = {
        id: 'airbnb-3',
        summary: 'Airbnb',
        description: '',
        start: { dateTime: '2025-11-13T15:00:00Z' },
        end: { dateTime: '2025-11-13T17:00:00Z' },
        status: 'confirmed',
      };

      vi.mocked(db.getDoc).mockResolvedValueOnce(null);
      vi.mocked(calendarService.getEvent).mockResolvedValueOnce(airbnbEvent);
      vi.mocked(calendarService.createEvent).mockResolvedValueOnce({ id: 'new-airbnb-3' });

      await syncEvent('user123', 'source@example.com', 'airbnb-3', 'target@example.com');

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
      expect(calendarService.updateEvent).toHaveBeenCalledWith(
        'user123',
        'target@example.com',
        'target-event-1',
        expect.objectContaining({
          summary: '[source] Updated Event - busy',
        })
      );
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
      expect(db.deleteDoc).toHaveBeenCalledWith(
        'eventMappings',
        'source@example.com_event1'
      );
    });
  });
});
```

---

## Step 8: Copy Additional Test Files

Reference the existing tests and create adapted versions:

### From `functions/calendar-sync/batchSync.test.ts`:
**Create:** `gcp/src/__tests__/services/batch-sync.service.test.ts`

### From `functions/calendar-sync/watch.test.ts`:
**Create:** `gcp/src/__tests__/services/watch-channel.service.test.ts`

### From `functions/calendar-sync/oauth.test.ts` + `auth.test.ts`:
**Create:** `gcp/src/__tests__/services/google-auth.service.test.ts`

### From `functions/calendar-sync/control.test.ts`:
**Create:** `gcp/src/__tests__/controllers/sync.controller.test.ts`

---

## Step 9: Run Tests

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Run all tests
pnpm test

# Watch mode (re-runs on file changes)
pnpm test:watch

# UI mode (visual test runner)
pnpm test:ui

# Coverage report
pnpm test:coverage
```

---

## Step 10: Key Test Scenarios to Cover

### Critical Test Cases (from existing tests):

1. **Event Syncing:**
   - ✅ Calendar name labeling: `[calendarName]`
   - ✅ Privacy settings: `visibility: 'private'`
   - ✅ Busy/free status: `transparency`
   - ✅ Composite key usage
   - ✅ >50 events handling
   - ✅ SyncToken management
   - ✅ Stats tracking

2. **Airbnb Feature (NEW TESTS):**
   - ✅ Detect by summary containing "airbnb"
   - ✅ Detect by organizer email
   - ✅ Detect by creator email
   - ✅ Detect by attendee email
   - ✅ Add `__EVENT__` with existing description
   - ✅ Add `__EVENT__` without description
   - ✅ Don't add to non-Airbnb events

3. **Batch Sync:**
   - ✅ Round-robin processing
   - ✅ Progress tracking
   - ✅ Error handling
   - ✅ Quota management

4. **Watch Channels:**
   - ✅ Watch creation
   - ✅ Watch renewal
   - ✅ Expiration handling
   - ✅ Cleanup

5. **OAuth:**
   - ✅ Auth URL generation
   - ✅ Callback handling
   - ✅ Token refresh
   - ✅ State validation

---

## Validation Checklist

- [ ] Vitest installed and configured
- [ ] Jest removed (avoid conflicts)
- [ ] vitest.config.ts created
- [ ] Test setup file created
- [ ] Mock data created
- [ ] Event sync tests ported (459 lines)
- [ ] Batch sync tests ported (578 lines)
- [ ] Watch tests ported (232 lines)
- [ ] OAuth/Auth tests ported (506 lines)
- [ ] Control tests ported (390 lines)
- [ ] **Airbnb feature tests added** (critical!)
- [ ] All tests pass: `pnpm test`
- [ ] Coverage >80%: `pnpm test:coverage`
- [ ] Tests run in watch mode: `pnpm test:watch`

---

## Coverage Targets

Aim for these coverage thresholds:

```typescript
// vitest.config.ts
coverage: {
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80,
}
```

**Per-service targets:**
- Event Sync Service: >90% (most critical)
- Batch Sync Service: >85%
- Watch Service: >85%
- Auth Service: >80%
- Controllers: >75%

---

## Expected Test Count

After porting all tests, you should have approximately:

- **Event Sync:** ~30-40 tests
- **Batch Sync:** ~20-25 tests
- **Watch Channels:** ~15-20 tests
- **OAuth/Auth:** ~25-30 tests
- **Controllers:** ~15-20 tests
- **Utilities:** ~10-15 tests

**Total:** ~115-150 tests

---

## Running Tests in CI/CD

Update GitHub Actions workflow to use Vitest:

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: pnpm test
  working-directory: ./gcp

- name: Generate coverage
  run: pnpm test:coverage
  working-directory: ./gcp

- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    directory: ./gcp/coverage
```

---

## Benefits of Using Vitest

1. ✅ **No migration needed** - Same syntax as existing tests
2. ✅ **Faster test runs** - Vite's HMR for tests
3. ✅ **Better DX** - UI mode, watch mode
4. ✅ **Native ESM** - Matches modern Node.js
5. ✅ **Same API as Jest** - Easy to switch if needed
6. ✅ **Built-in coverage** - No extra config

---

## Example Test Output

```bash
$ pnpm test

 ✓ src/__tests__/services/event-sync.service.test.ts (35)
   ✓ Event Sync Service (35)
     ✓ syncCalendarEvents (12)
       ✓ should sync events with calendar name label and privacy
       ✓ should handle >50 events by saving syncToken only
       ...
     ✓ syncEvent - Airbnb Feature (8)
       ✓ should add __EVENT__ marker to Airbnb events (summary match)
       ✓ should add __EVENT__ marker to Airbnb events (organizer email match)
       ✓ should add __EVENT__ marker for Airbnb events without description
       ✓ should NOT add __EVENT__ to non-Airbnb events
       ...

 Test Files  5 passed (5)
      Tests  115 passed (115)
   Start at  14:23:45
   Duration  2.34s (transform 234ms, setup 89ms, collect 456ms, tests 1.56s)


 % Coverage report from v8
 -------------------------|---------|----------|---------|---------|
 File                     | % Stmts | % Branch | % Funcs | % Lines |
 -------------------------|---------|----------|---------|---------|
 All files                |   87.32 |    81.45 |   89.12 |   87.32 |
  services/               |   91.23 |    85.67 |   92.45 |   91.23 |
   event-sync.service.ts  |   94.56 |    89.23 |   95.67 |   94.56 |
   batch-sync.service.ts  |   88.34 |    82.45 |   89.12 |   88.34 |
   ...
 -------------------------|---------|----------|---------|---------|
```

---

## Next Steps After Creating Tests

1. **Task 20 (CI/CD)** - Automate test runs
2. **Task 17 (Integration)** - End-to-end testing
3. **Task 18 (Deployment)** - Deploy with confidence

---

## Success Criteria

- [ ] 100+ tests passing
- [ ] >80% code coverage overall
- [ ] >90% coverage on event-sync.service.ts
- [ ] All Airbnb feature scenarios tested
- [ ] Tests run in <5 seconds
- [ ] No flaky tests (all deterministic)
- [ ] Tests serve as documentation

---

## References

- Existing tests: `functions/calendar-sync/*.test.ts`
- Vitest docs: https://vitest.dev
- Coverage with v8: https://vitest.dev/guide/coverage.html

**Keep your existing Vitest tests as the source of truth - they're already battle-tested!** 🧪
