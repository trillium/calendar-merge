# Task 19: Port Existing Tests from functions/calendar-sync

**Status:** Not Started
**Priority:** High
**Estimated Time:** 4-6 hours
**Dependencies:** Task 16 (Test setup)

---

## Objective

Port the comprehensive test suite from `functions/calendar-sync/*.test.ts` to the new `/gcp` structure, adapting them for the new architecture while preserving test coverage.

## Why This Task?

You already have **2,165 lines of well-written tests** in Vitest format that cover:
- Event syncing logic (459 lines)
- Batch sync (578 lines)
- OAuth flow (354 lines)
- Watch management (232 lines)
- Control operations (390 lines)
- Auth (152 lines)

**These tests are valuable!** They validate:
- Edge cases
- Error handling
- Data transformations
- API interactions
- Business logic

Rather than rewrite from scratch, we'll adapt them to the new service structure.

---

## Current Test Infrastructure

### functions/calendar-sync/

**Test Framework:** Vitest
**Total Tests:** 6 files, ~2,165 lines
**Files:**
```
auth.test.ts        (152 lines) - OAuth client tests
batchSync.test.ts   (578 lines) - Batch sync logic
control.test.ts     (390 lines) - Sync control operations
oauth.test.ts       (354 lines) - OAuth flow tests
sync.test.ts        (459 lines) - Event syncing (includes Airbnb tests!)
watch.test.ts       (232 lines) - Watch channel management
```

**Key Patterns:**
- Mocks Firestore with Vitest
- Mocks Google APIs
- Tests business logic in isolation
- Validates error handling

---

## Migration Strategy

### Option 1: Convert Vitest → Jest (Recommended)

**Pros:**
- Jest is already configured in `/gcp`
- Industry standard for Node.js
- Better TypeScript support
- More plugins/integrations

**Cons:**
- Need to convert test syntax
- Slightly different mocking patterns

**Conversion Map:**
```typescript
// Vitest → Jest
import { describe, it, expect, vi, beforeEach } from 'vitest';
// becomes
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

vi.fn()           → jest.fn()
vi.mock()         → jest.mock()
vi.clearAllMocks()→ jest.clearAllMocks()
vi.mocked()       → jest.mocked()
```

### Option 2: Keep Vitest for Both

**Pros:**
- No conversion needed
- Tests work as-is

**Cons:**
- Need to add Vitest to `/gcp`
- Maintain two test runners
- More complex setup

**Recommendation:** Use Option 1 (convert to Jest) for consistency.

---

## Porting Process

### Step 1: Set up Jest in /gcp (already done in Task 16)

### Step 2: Port sync.test.ts → event-sync.service.test.ts

This is the **most important** file as it tests the core syncing logic including the Airbnb feature.

**Source:** `functions/calendar-sync/sync.test.ts` (459 lines)
**Target:** `gcp/src/__tests__/services/event-sync.service.test.ts`

**Key Changes:**

```typescript
// OLD (Vitest, direct imports)
import { syncCalendarEvents } from './sync';

// NEW (Jest, service imports)
import { syncCalendarEvents } from '../../services/event-sync.service';
```

**Tests to Port:**
- ✅ Basic event syncing
- ✅ Label formatting (`[calendarName]`)
- ✅ Privacy settings (visibility: private)
- ✅ Busy/free status preservation
- ✅ Update vs create logic
- ✅ Cancelled event deletion
- ✅ Composite key usage
- ✅ >50 events handling (syncToken only)
- ✅ SyncToken saving
- ✅ Stats tracking
- ✅ **Airbnb event handling** (if tested)

**Action:** Copy and convert test structure

### Step 3: Port batchSync.test.ts → batch-sync.service.test.ts

**Source:** `functions/calendar-sync/batchSync.test.ts` (578 lines)
**Target:** `gcp/src/__tests__/services/batch-sync.service.test.ts`

**Tests to Port:**
- Batch processing logic
- Round-robin iteration
- Progress tracking
- Error handling
- Quota management
- Stats updates

### Step 4: Port watch.test.ts → watch-channel.service.test.ts

**Source:** `functions/calendar-sync/watch.test.ts` (232 lines)
**Target:** `gcp/src/__tests__/services/watch-channel.service.test.ts`

**Tests to Port:**
- Watch creation
- Watch renewal
- Watch deletion
- Expiration handling
- Cleanup logic

### Step 5: Port oauth.test.ts → google-auth.service.test.ts

**Source:** `functions/calendar-sync/oauth.test.ts` (354 lines)
**Target:** `gcp/src/__tests__/services/google-auth.service.test.ts`

**Tests to Port:**
- Auth URL generation
- OAuth callback handling
- Token exchange
- State validation
- User creation

### Step 6: Port control.test.ts → sync.controller.test.ts

**Source:** `functions/calendar-sync/control.test.ts` (390 lines)
**Target:** `gcp/src/__tests__/controllers/sync.controller.test.ts`

**Tests to Port:**
- Pause/resume sync
- Stop sync
- Restart sync
- Clear user data
- Error responses

### Step 7: Port auth.test.ts → google-auth.service.test.ts

**Source:** `functions/calendar-sync/auth.test.ts` (152 lines)
**Target:** `gcp/src/__tests__/services/google-auth.service.test.ts` (merge with oauth tests)

**Tests to Port:**
- Auth client creation
- Token refresh
- Token expiry detection

---

## Example Conversion

### Before (Vitest - sync.test.ts)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncCalendarEvents } from './sync';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(() => ({
    collection: vi.fn(),
  })),
}));

describe('sync.ts', () => {
  let mockCalendar: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendar = {
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
      },
    };
  });

  it('should sync events with labels', async () => {
    // Test implementation
  });
});
```

### After (Jest - event-sync.service.test.ts)

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { syncCalendarEvents } from '../../services/event-sync.service';
import { db } from '../../db';
import * as calendarService from '../../services/google-calendar.service';

jest.mock('../../db/firestore');
jest.mock('../../services/google-calendar.service');

describe('Event Sync Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should sync events with labels', async () => {
    // Mock setup
    (db.getDoc as jest.Mock).mockResolvedValue({
      userId: 'user123',
      calendarId: 'source@example.com',
      targetCalendarId: 'target@example.com',
    });

    (calendarService.listEvents as jest.Mock).mockResolvedValue({
      events: [{ id: 'event1', summary: 'Test' }],
    });

    // Test implementation
    await syncCalendarEvents('channel-123');

    // Assertions
    expect(calendarService.createEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        summary: expect.stringContaining('[source]'),
        visibility: 'private',
      })
    );
  });
});
```

---

## Specific Test Cases to Preserve

### Critical Tests from sync.test.ts

1. **Label formatting:**
   ```typescript
   expect(summary).toBe('[user] Test Event 1 - free');
   ```

2. **Privacy settings:**
   ```typescript
   expect(visibility).toBe('private');
   ```

3. **Busy/free preservation:**
   ```typescript
   expect(transparency).toBe('transparent'); // for free
   expect(transparency).toBe('opaque');      // for busy
   ```

4. **Composite key usage:**
   ```typescript
   expect(mockDoc).toHaveBeenCalledWith('test@example.com_event-abc');
   ```

5. **>50 events handling:**
   ```typescript
   // When >50 events, should save syncToken but not process events
   expect(mockUpdate).toHaveBeenCalledWith({
     syncToken: expect.any(String),
     syncTokenUpdatedAt: expect.any(Number),
   });
   expect(mockCalendar.events.get).not.toHaveBeenCalled();
   ```

6. **Stats tracking:**
   ```typescript
   expect(stats).toEqual({
     totalEventsSynced: 11,
     lastSyncTime: expect.any(Number),
     lastSyncEventCount: 1,
   });
   ```

---

## Validation Checklist

- [ ] All sync.test.ts tests ported (event syncing logic)
- [ ] All batchSync.test.ts tests ported (batch processing)
- [ ] All watch.test.ts tests ported (watch management)
- [ ] All oauth.test.ts tests ported (OAuth flow)
- [ ] All control.test.ts tests ported (control operations)
- [ ] All auth.test.ts tests ported (auth client)
- [ ] Tests converted from Vitest to Jest
- [ ] Mocks updated for new service structure
- [ ] All tests pass: `pnpm test`
- [ ] Coverage maintained or improved: `pnpm test:coverage`

---

## Running Tests

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Run all tests
pnpm test

# Run specific test file
pnpm test event-sync.service.test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

Expected coverage targets:
- **Event sync service:** >90%
- **Batch sync service:** >85%
- **Watch service:** >85%
- **Auth service:** >80%
- **Overall:** >80%

---

## Special Considerations

### Airbnb Feature Tests

Make sure to include tests for the Airbnb event handling:

```typescript
describe('Airbnb event handling', () => {
  it('should add __EVENT__ marker to Airbnb events by summary', async () => {
    const airbnbEvent = {
      id: 'event1',
      summary: 'Airbnb Reservation',
      description: 'Guest details',
    };

    // ... test that description becomes '__EVENT__\n\nGuest details'
  });

  it('should add __EVENT__ marker to Airbnb events by organizer email', async () => {
    const airbnbEvent = {
      id: 'event1',
      summary: 'Reservation',
      organizer: { email: 'calendar@airbnb.com' },
    };

    // ... test that description gets '__EVENT__'
  });

  it('should handle events without description', async () => {
    const airbnbEvent = {
      id: 'event1',
      summary: 'Airbnb',
      description: undefined,
    };

    // ... test that description becomes just '__EVENT__'
  });
});
```

### Database Mocking

The new structure uses `db` helper instead of raw Firestore:

```typescript
// OLD (direct Firestore mock)
mockFirestore.collection('watches').doc('123').get()

// NEW (db helper mock)
(db.getDoc as jest.Mock).mockResolvedValue({ ... })
(db.updateDoc as jest.Mock).mockResolvedValue(undefined)
```

---

## Migration Script (Optional)

Create a helper script to automate some of the conversion:

**File:** `gcp/scripts/convert-tests.sh`

```bash
#!/bin/bash

# Convert Vitest syntax to Jest in test files
# Usage: ./convert-tests.sh input.test.ts output.test.ts

sed -e "s/from 'vitest'/from '@jest\/globals'/g" \
    -e "s/vi\.fn/jest.fn/g" \
    -e "s/vi\.mock/jest.mock/g" \
    -e "s/vi\.clearAllMocks/jest.clearAllMocks/g" \
    -e "s/vi\.mocked/jest.mocked/g" \
    -e "s/vi\.spyOn/jest.spyOn/g" \
    "$1" > "$2"

echo "Converted $1 → $2"
echo "⚠️  Manual review required:"
echo "  - Update import paths"
echo "  - Update mock structure"
echo "  - Fix any syntax issues"
```

---

## Success Criteria

- [ ] All 2,165+ lines of tests ported
- [ ] Test coverage ≥80% overall
- [ ] All critical business logic tested
- [ ] Airbnb feature tests included
- [ ] Tests run in CI/CD pipeline
- [ ] No regressions from original tests

---

## Next Steps After Porting

1. **Run tests continuously:** `pnpm test:watch`
2. **Check coverage:** `pnpm test:coverage`
3. **Fix any failing tests**
4. **Add new tests for missing coverage**
5. **Set up CI/CD to run tests on every commit**

---

## Effort Estimate

**Total Time:** 4-6 hours

**Breakdown:**
- Setup/preparation: 0.5h
- sync.test.ts → event-sync.service.test.ts: 1.5h
- batchSync.test.ts → batch-sync.service.test.ts: 1h
- watch.test.ts → watch-channel.service.test.ts: 0.5h
- oauth.test.ts + auth.test.ts → google-auth.service.test.ts: 1h
- control.test.ts → sync.controller.test.ts: 0.5h
- Debugging/fixing: 1h

---

## Benefits

After porting tests, you'll have:

✅ **Comprehensive test coverage** - All business logic validated
✅ **Regression protection** - Can refactor safely
✅ **Documentation** - Tests show how code should work
✅ **Confidence** - Deploy knowing tests pass
✅ **Faster development** - Catch bugs early

**Don't skip this task!** The existing tests are a valuable asset that will save time and prevent bugs.
