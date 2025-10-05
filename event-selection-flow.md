# Complete Event Selection Flow

## The Full Picture: From Calendar Change to Event Sync

### Phase 1: Watch Setup (One-time)

```
User sets up sync
  → createCalendarWatch(userId, sourceCalendarId, webhookUrl, targetCalendarId)
  → Google Calendar API: events.watch()
  → Google starts monitoring sourceCalendarId for ANY changes
  → WatchData stored in Firestore
```

**Key Point**: Watch monitors the ENTIRE calendar, not specific events or time ranges.

---

### Phase 2: Webhook Trigger (When ANY change occurs)

**What triggers a webhook notification?**
- Creating an event (anywhere in the calendar, any time period)
- Updating an event (title, time, description, etc.)
- Deleting an event
- Changing event attendees
- Recurring event modifications
- **Even events 3+ months in the future**

**What Google sends:**
```http
POST /webhook-url
Headers:
  X-Goog-Channel-Id: [channelId]
  X-Goog-Resource-State: "exists"  (or "sync" for initial handshake)
  X-Goog-Resource-Id: [resourceId]

Body: (empty - NO event details!)
```

**Critical: The webhook tells you SOMETHING changed, but NOT what changed or which event.**

---

### Phase 3: Event Selection Query (Current Implementation)

When webhook fires → `handleWebhook()` → `syncCalendarEvents(channelId)`

**Current query in [sync.ts:44-49](functions/calendar-sync/sync.ts#L44):**
```typescript
const response = await calendar.events.list({
    calendarId,
    timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
});
```

**What this query does:**
- `timeMin`: Filters events where **end time** >= (now - 24 hours)
- `singleEvents: true`: Expands recurring events into individual instances
- `orderBy: 'startTime'`: Orders by start time (requires singleEvents)

---

## Event Selection Examples

Current time: **Oct 5, 2025, 2:00 PM**
Query: `timeMin = Oct 4, 2025, 2:00 PM` (24 hours ago)

### Scenario 1: Event created 3 months in the future
```
Event: "Conference" (Jan 15, 2026, 9am-5pm)
Action: User creates this event on Oct 5
Webhook: ✅ FIRES (event created)
Query result: ❌ NOT SELECTED (ends Jan 15, 2026 > timeMin)
Synced: ❌ NO
```

### Scenario 2: All-day event ending today
```
Event: "Vacation" (Oct 1-5, 2025, all-day)
Action: Event already exists, user updates title on Oct 5
Webhook: ✅ FIRES (event updated)
Query result: ✅ SELECTED (ends Oct 5, 2025 >= Oct 4, 2:00 PM)
Synced: ✅ YES
```

### Scenario 3: Event in the past (but ended within 24hrs)
```
Event: "Lunch meeting" (Oct 5, 12:00-1:00 PM)
Action: Meeting already happened, no user action
Webhook: ❌ DOESN'T FIRE
Query result: ✅ WOULD BE SELECTED IF QUERY RAN (ended Oct 5, 1:00 PM)
Synced: Only if another event triggers webhook
```

### Scenario 4: Recurring event (weekly meeting)
```
Event: "Team Standup" (Every Monday 9-10am, recurring forever)
Instance: Oct 6, 2025, 9-10am (tomorrow)
Action: User updates the recurring event on Oct 5
Webhook: ✅ FIRES (recurring event updated)
Query with singleEvents=true: ✅ SELECTS (expands to individual instances)
  - Oct 6 instance: ✅ SELECTED (ends Oct 6, 10am > Oct 4, 2pm)
  - Oct 13 instance: ✅ SELECTED (ends Oct 13, 10am > Oct 4, 2pm)
  - Oct 20 instance: ✅ SELECTED (ends Oct 20, 10am > Oct 4, 2pm)
  - ... (continues for all future instances)
Synced: ✅ YES - but THIS IS THE BUG!
```

**🚨 THIS IS WHAT CAUSED YOUR 3+ MONTH DUPLICATION!**

---

## The Bug Explained

### Why you saw 3+ month duplications:

1. **Recurring events** with `singleEvents: true` expand into ALL future instances
2. `timeMin` filters by **end time**, not creation/update time
3. If you have weekly meetings, this query returns **100+ instances** (all future occurrences)
4. Each instance gets synced to target calendar

**Example with weekly meeting:**
```
Recurring: "Team Meeting" every Monday 9-10am
timeMin: Oct 4, 2025, 2:00 PM

Query returns:
- Oct 6 instance ✅
- Oct 13 instance ✅
- Oct 20 instance ✅
- Oct 27 instance ✅
- Nov 3 instance ✅
- ... (continues until end of recurrence or forever)

Result: 50+ events synced on EVERY webhook trigger!
```

---

## What SHOULD Happen (Expected Behavior)

### Option A: Use `updatedMin` instead of `timeMin`

```typescript
const response = await calendar.events.list({
    calendarId,
    updatedMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
});
```

**What this does:**
- Fetches events **modified** in last 24 hours
- Still expands recurring events, BUT only returns instances that were updated
- Catches future event creation/updates

**Problem:**
- Still fetches too much on every webhook
- Recurring events still problematic

### Option B: Use `syncToken` (Google's recommended approach)

```typescript
// First sync: get all events + syncToken
const response = await calendar.events.list({
    calendarId,
    maxResults: 2500,
});
// Store: response.data.nextSyncToken

// Subsequent syncs: only get changes
const response = await calendar.events.list({
    calendarId,
    syncToken: storedSyncToken,
});
```

**What this does:**
- Returns ONLY events that changed since last sync
- Automatically handles recurring events correctly
- Includes deletions
- Most efficient

**How it handles your 3+ month recurring event:**
```
First sync: Returns all instances
Webhook fires (event updated): syncToken query returns ONLY updated instances
Result: No duplication, only actual changes synced
```

---

## Current Behavior Summary

### What gets synced NOW:
1. ✅ Events ending in next 24 hours
2. ✅ All-day events ending today
3. ✅ **ALL future instances of recurring events** (THE BUG)
4. ❌ Future one-time events (>24hrs away)
5. ❌ Updates to future events

### Why recurring events cause duplication:
- `singleEvents: true` + `timeMin` = exponential explosion
- Weekly meeting = 52+ instances per year
- Daily recurring = 365+ instances per year
- **Every webhook re-syncs ALL these instances**

---

## Recommended Fix

**Use `syncToken` with fallback to initial sync:**

```typescript
export async function syncCalendarEvents(channelId: string): Promise<void> {
    console.log(`Syncing events for channel ${channelId}`);

    const watchData = await getWatchData(channelId);
    const auth = await getAuthClient(watchData.userId);
    const calendar = google.calendar({ version: 'v3', auth });

    try {
        // Try incremental sync with syncToken
        const syncToken = await getSyncToken(watchData.calendarId);

        if (syncToken) {
            const response = await calendar.events.list({
                calendarId: watchData.calendarId,
                syncToken,
            });

            await processSyncedEvents(response.data.items, watchData);
            await saveSyncToken(watchData.calendarId, response.data.nextSyncToken);
        }
    } catch (error) {
        if (error.code === 410) {
            // Token expired, do full sync
            console.log('Sync token expired, performing full sync');
            await doFullSync(watchData, calendar);
        } else {
            throw error;
        }
    }
}
```

This eliminates:
- ❌ Recurring event explosion
- ❌ Missing future events
- ❌ Redundant syncing
- ✅ Only syncs actual changes
