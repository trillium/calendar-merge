# Sync Behavior Analysis

## Current Implementation (sync.ts:44-49)

```typescript
const response = await calendar.events.list({
    calendarId,
    timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
});
```

## Problem Analysis

### What Actually Gets Synced

**Current behavior:**
- `timeMin` filters by **event END time**, not update time
- Fetches events that END within the last 24 hours
- Webhook notifications contain NO details about what changed
- On every webhook trigger, re-fetches last 24 hours of events

**Issues:**
1. ❌ **Events starting >24hrs ago but ending within 24hrs**: Synced repeatedly
2. ❌ **Events modified but ending >24hrs ago**: NOT synced (e.g., title change on next week's meeting)
3. ❌ **Events starting in the future**: NOT synced unless they end within 24hrs
4. ❌ **Redundant syncing**: Same events synced on every webhook notification

### Example Scenarios

#### Scenario 1: All-day event created 2 days ago
- Event: "Conference" (Oct 3-5, 2025)
- Current time: Oct 5, 2:00 PM
- **Result**: ✅ Synced (ends within 24hrs)
- **Problem**: Synced repeatedly on every webhook

#### Scenario 2: Meeting updated from 2pm to 3pm next week
- Event: "Team Meeting" (Oct 12, 2025, 2pm → 3pm)
- Current time: Oct 5
- **Result**: ❌ NOT synced (ends >24hrs from now)
- **Problem**: Title/time changes missed

#### Scenario 3: Event created for tomorrow
- Event: "Dentist" (Oct 6, 2025, 10am-11am)
- Webhook fired: Oct 5
- **Result**: ❌ NOT synced (ends >24hrs from now)
- **Problem**: New events not synced until <24hrs before end time

## Recommended Solutions

### Option 1: Use `updatedMin` (Quick Fix)
```typescript
const response = await calendar.events.list({
    calendarId,
    updatedMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
});
```
**Pros:**
- Syncs events modified in last 24 hours (correct behavior)
- Catches updates to future events
- Simple change

**Cons:**
- Still redundant (fetches same events on each webhook)
- No pagination for large result sets

### Option 2: Implement `syncToken` (Optimal)
```typescript
// First sync: fetch all, store nextSyncToken
const response = await calendar.events.list({
    calendarId,
    maxResults: 2500,
    singleEvents: true,
});
// Store: response.data.nextSyncToken

// Subsequent syncs: use syncToken for incremental changes
const response = await calendar.events.list({
    calendarId,
    syncToken: storedSyncToken,
});
```
**Pros:**
- ✅ Only fetches changed/deleted events
- ✅ Highly efficient (minimal API calls)
- ✅ Handles deletions automatically
- ✅ No time window limitations

**Cons:**
- More complex implementation
- Need to store syncToken per calendar
- Handle 410 GONE errors (token expired, full resync needed)

### Option 3: Hybrid Approach (Recommended)
```typescript
// Try syncToken first, fall back to updatedMin
try {
    const syncToken = await getSyncToken(calendarId);
    if (syncToken) {
        const response = await calendar.events.list({
            calendarId,
            syncToken,
        });
        await saveSyncToken(calendarId, response.data.nextSyncToken);
        return response.data.items;
    }
} catch (error) {
    if (error.code === 410) {
        // Token expired, do full sync
        console.log('Sync token expired, performing full sync');
    }
}

// Fallback or initial sync
const response = await calendar.events.list({
    calendarId,
    updatedMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults: 2500,
});
await saveSyncToken(calendarId, response.data.nextSyncToken);
```

## Testing Plan

### Test Cases Needed

1. **Create event in future** (>24hrs away)
   - Expected: Should sync immediately
   - Current: ❌ Fails

2. **Update event title** (event is next week)
   - Expected: Should sync updated title
   - Current: ❌ Fails

3. **Delete event** (event was in future)
   - Expected: Should delete from target calendar
   - Current: ❌ Fails

4. **All-day event spanning multiple days**
   - Expected: Sync once
   - Current: ⚠️  May sync multiple times

5. **High-frequency updates** (same event updated 10x)
   - Expected: Sync final state
   - Current: ⚠️  Syncs multiple times inefficiently

## Impact Assessment

**Current production impact:**
- Multi-day events: Working but inefficient
- Future events: **NOT syncing** until <24hrs before end
- Event modifications: **NOT syncing** if event >24hrs away
- Deleted events: **NOT syncing** if deleted >24hrs after creation

**Severity: HIGH** - Core functionality broken for common use cases
