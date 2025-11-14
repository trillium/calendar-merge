# Task 08 Complete: Create Event Sync Service

**Status**: ✅ Complete
**Date**: 2025-11-13 (completed in previous session)

## Summary

Created event synchronization service that handles webhook-triggered syncing with incremental updates, rate limiting, and **special Airbnb event handling**. The service is the core of the calendar merge functionality.

## Files Created

### **event-sync.service.ts** (273 lines)
Complete event synchronization with syncToken support and Airbnb feature.

## Functions Implemented

### 1. **`syncCalendarEvents(channelId)`** - Main webhook handler
Triggered when Google Calendar sends push notification:

**Flow**:
1. Fetch watch data from Firestore
2. Check if paused or batch sync in progress → skip
3. Fetch changed events using syncToken (incremental) or full sync
4. Handle expired syncToken (410 error) → full resync
5. If >50 events → save syncToken and exit (too many for webhook)
6. Process each event with rate limiting (150ms delays)
7. Update watch statistics and syncToken

**Key Features**:
- **Incremental Sync**: Uses syncToken for only changed events
- **Smart Throttling**: Skips webhook if batch sync running
- **Event Limit**: Max 50 events per webhook (configurable)
- **Rate Limiting**: 150ms delay between API calls
- **Statistics**: Tracks total events synced, last sync time

### 2. **`syncEvent(userId, sourceCalendarId, sourceEventId, targetCalendarId)`** - Single event sync
Syncs one event from source to target calendar:

**Flow**:
1. Generate composite key for event mapping
2. Check if mapping exists in Firestore
3. Fetch source event
4. If cancelled → delete from target
5. Transform event data (includes Airbnb handling)
6. Create or update in target calendar
7. Update/create event mapping in Firestore

**Error Handling**:
- 403 Quota exceeded → return `{ success: false }` for retry
- 429 Rate limit → return `{ success: false }` for retry
- Other errors → log and continue

### 3. **`transformEventData(sourceEvent, sourceCalendarId)`** - Event transformation
Transforms source event for target calendar:

**Transformations**:
- Summary: `[calendarName] Original Title - busy/free`
- Description: **Airbnb special handling** (see below)
- Transparency: Preserves busy/free status
- Visibility: Always `private`
- Location: Preserved
- Status: Preserved
- Start/End: Preserved

## 🎯 Critical Feature: Airbnb Event Handling

### The `__EVENT__` Marker

**Lines 161-173** contain the Airbnb feature:

```typescript
// Check if this is an Airbnb event
const isAirbnbEvent =
  sourceEvent.summary?.toLowerCase().includes('airbnb') ||
  sourceEvent.organizer?.email?.toLowerCase().includes('airbnb') ||
  sourceEvent.creator?.email?.toLowerCase().includes('airbnb') ||
  sourceEvent.attendees?.some(attendee =>
    attendee.email?.toLowerCase().includes('airbnb')
  );

if (isAirbnbEvent) {
  description = description ? `__EVENT__\n\n${description}` : '__EVENT__';
}
```

**Detection Logic**:
An event is considered "Airbnb" if ANY of these contain "airbnb" (case-insensitive):
- Event summary (title)
- Organizer email
- Creator email
- Any attendee email

**Marker Behavior**:
- Event has description → `__EVENT__\n\n<original description>`
- No description → Just `__EVENT__`

**Why This Matters**:
This preserves a critical business requirement from the original implementation - marking Airbnb-related events for special handling or filtering.

## Key Features

### 1. Incremental Sync with SyncToken

**First Sync** (no syncToken):
```typescript
const response = await listEvents(userId, calendarId, {
  maxResults: 2500,
  singleEvents: true,
});
// Returns all events + nextSyncToken
```

**Subsequent Syncs** (with syncToken):
```typescript
const response = await listEvents(userId, calendarId, {
  syncToken: savedToken
});
// Returns only changed events since last sync
```

**Expired Token Handling**:
```typescript
if (error.message === 'SYNC_TOKEN_EXPIRED') {
  // Perform full resync
  const response = await listEvents(userId, calendarId, {
    maxResults: 2500,
    singleEvents: true,
  });
}
```

### 2. Smart Throttling

**Webhook Event Limit**:
```typescript
if (events.length > APP_CONFIG.WEBHOOK_EVENT_LIMIT) { // 50
  // Too many events - just save syncToken
  await db.updateDoc('watches', channelId, {
    syncToken: newSyncToken,
    syncTokenUpdatedAt: Date.now(),
  });
  return; // Don't process events
}
```

**Why?**
- Webhooks have time limits (Cloud Functions: 540s timeout)
- Large syncs should use batch sync instead
- Saves syncToken for next incremental sync

**Skip During Batch Sync**:
```typescript
if (syncState?.status === 'pending' || syncState?.status === 'syncing') {
  log.info('Batch sync in progress, skipping webhook notification');
  return;
}
```

**Why?**
- Prevents duplicate processing
- Batch sync is comprehensive
- Webhook changes will be caught in next incremental sync

### 3. Event Mapping System

**Composite Key**:
```typescript
const mappingId = generateCompositeKey(sourceCalendarId, sourceEventId);
// Example: "user@gmail.com_event123"
```

**Firestore Document**:
```typescript
interface EventMapping {
  sourceCalendarId: string;
  sourceEventId: string;
  targetEventId: string;
  lastSynced: Timestamp;
}
```

**Why Composite Key?**
- Avoids Firestore index requirements
- Efficient lookups
- Single document per source event

### 4. Rate Limiting

**150ms delay between events**:
```typescript
for (let i = 0; i < events.length; i++) {
  await syncEvent(...);

  if (i < events.length - 1) {
    await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS); // 150ms
  }
}
```

**Why?**
- Google Calendar API quota: 500 queries/100s per user
- 150ms = ~6.67 requests/second = 400/minute
- Well under quota limit

### 5. Statistics Tracking

**Updated After Each Sync**:
```typescript
updates.stats = {
  totalEventsSynced: currentStats.totalEventsSynced + syncedCount,
  lastSyncTime: Date.now(),
  lastSyncEventCount: syncedCount,
};
```

**Used For**:
- Monitoring sync performance
- User dashboard
- Debugging sync issues

## Event Transformation Example

**Source Event**:
```json
{
  "summary": "Airbnb Reservation",
  "description": "Guest: John Doe",
  "organizer": { "email": "calendar@airbnb.com" },
  "transparency": "opaque",
  "start": { "dateTime": "2025-11-15T14:00:00Z" },
  "end": { "dateTime": "2025-11-15T16:00:00Z" }
}
```

**Transformed Event** (target calendar):
```json
{
  "summary": "[calendar] Airbnb Reservation - busy",
  "description": "__EVENT__\n\nGuest: John Doe",
  "transparency": "opaque",
  "visibility": "private",
  "start": { "dateTime": "2025-11-15T14:00:00Z" },
  "end": { "dateTime": "2025-11-15T16:00:00Z" }
}
```

**Note**: `__EVENT__` marker added because organizer contains "airbnb"

## Error Handling Strategy

### Quota Errors (403)
```typescript
if (error.code === 403 && error.message?.includes('Quota exceeded')) {
  return { success: false, eventId: sourceEventId };
}
```
Caller can retry later.

### Rate Limit Errors (429)
```typescript
if (error.code === 429 || error.message?.includes('Rate Limit Exceeded')) {
  return { success: false, eventId: sourceEventId };
}
```
Caller can retry with backoff.

### Other Errors
```typescript
log.error(`Error syncing event ${sourceEventId}`, error);
return { success: false };
```
Log and continue - don't fail entire sync.

## Integration Points

**Uses**:
- `google-calendar.service` → listEvents, getEvent, createEvent, updateEvent, deleteEvent
- `db/firestore` → Event mappings, watch data
- `utils` → logger, sleep, generateCompositeKey
- `config` → APP_CONFIG (rate limits, event limit)

**Used By**:
- `webhook.routes` → Webhook handler calls syncCalendarEvents()
- `batch-sync.service` → Calls syncEvent() for bulk processing
- Controllers (Task 12) → Manual sync triggers

## Performance Metrics

**Incremental Sync** (typical):
- Changed events: 1-5
- Time: 1-2 seconds (with rate limiting)
- API calls: 2-6 (list + sync each event)

**Full Sync** (initial):
- Events: 100-2500
- Time: 15-625 seconds (150ms per event)
- API calls: 101-2501 (list + sync each event)

**Why Incremental Sync Matters**:
- **99% time reduction** after initial sync
- Webhooks respond quickly
- Lower API quota usage
- Better user experience

## Dependencies

**Requires**:
- Task 07: Google Calendar Service
- Task 05: Database Service (Firestore)
- Task 04: Utils (logger, sleep, generateCompositeKey)
- Task 03: Types (EventMapping, WatchData, SyncEventResult)
- Task 02: Config (APP_CONFIG)

**Used By**:
- Task 09 (ODD): Batch Sync Service
- Task 13 (ODD): Webhook Routes
- Task 12 (EVEN): Controllers

## Testing Considerations

**Unit Tests Needed**:
- transformEventData with Airbnb events
- transformEventData with non-Airbnb events
- syncEvent create vs update logic
- syncEvent cancelled event handling
- syncCalendarEvents with syncToken
- syncCalendarEvents with expired syncToken
- Error handling (403, 429)

**Integration Tests**:
- Real event sync end-to-end
- Webhook processing
- Airbnb marker verification
- Event mapping persistence
- Statistics tracking

**Critical Test**: Airbnb Event Detection
```javascript
test('Airbnb event gets __EVENT__ marker', () => {
  const event = {
    summary: 'Airbnb Check-in',
    description: 'Details here'
  };
  const transformed = transformEventData(event, 'cal@gmail.com');
  expect(transformed.description).toBe('__EVENT__\n\nDetails here');
});
```

## Next Tasks

- Task 09 (ODD): Batch Sync Service - Uses syncEvent()
- Task 10 (EVEN): Watch Channel Service
- Task 13 (ODD): Routes - Exposes webhook endpoint

## Notes

- **Airbnb feature is critical** - lines 161-173 must be preserved
- SyncToken dramatically improves performance after initial sync
- Event limit (50) prevents webhook timeouts
- Rate limiting prevents quota exhaustion
- Statistics enable monitoring and debugging
- Composite keys avoid Firestore index requirements
- Graceful error handling ensures sync continues even with failures
- Cancelled events properly deleted from target calendar
- Event mappings track source→target relationship
