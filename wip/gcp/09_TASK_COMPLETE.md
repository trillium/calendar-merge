# Task 09 Complete: Create Batch Sync Service (ODD)

**Status**: ✅ Complete
**Date**: 2025-11-13 (completed in previous session)

## Summary

Created batch synchronization service for large-scale event processing. Includes legacy single-calendar sync, round-robin multi-calendar sync, progress tracking, and state management. Designed for initial syncs and manual sync triggers.

## Files Created

### **batch-sync.service.ts** (279 lines)
Complete batch sync implementation with progress tracking.

## Functions Implemented

### 1. **`batchSyncEvents(channelId)`** - Legacy single-calendar sync
Processes all events for one calendar watch:

**Flow**:
1. Fetch watch data from Firestore
2. Check if paused → skip
3. Update sync state to 'syncing'
4. Fetch all events (max 2500)
5. Update total events count
6. Process each event with rate limiting
7. Update progress every 10 events
8. Save final state and syncToken
9. Mark as 'completed' or 'failed'

**Use Cases**:
- Initial calendar sync after watch creation
- Manual sync trigger for specific calendar
- Retry after failed sync

**Performance**:
- 100 events: ~15 seconds
- 1000 events: ~2.5 minutes
- 2500 events: ~6.25 minutes

### 2. **`batchSyncRoundRobin(userId)`** - Multi-calendar round-robin sync
Efficient syncing for users with multiple calendars:

**Flow**:
1. Fetch all watches for user
2. Filter active watches (not paused, not syncing)
3. Get round-robin state (current index)
4. Process ONE calendar at current index
5. Fetch batch of events (configurable batch size)
6. Sync events with rate limiting
7. Update syncToken
8. Increment index (round-robin)
9. Return status with hasMore flag

**Key Features**:
- **Round-Robin**: Processes one calendar per call
- **Fair Distribution**: All calendars get equal attention
- **Batch Size**: Configurable (from APP_CONFIG.BATCH_SIZE)
- **Stateful**: Tracks current index in Firestore
- **Resumable**: Can be called repeatedly until complete

**Use Cases**:
- Users with 5+ calendars
- Cloud Scheduler job (process one calendar at a time)
- Spreading load over time
- Avoiding timeout issues

**Example**:
```
User has 3 calendars: [A, B, C]
Call 1: Process calendar A (index 0) → move to index 1
Call 2: Process calendar B (index 1) → move to index 2
Call 3: Process calendar C (index 2) → move to index 0
Call 4: Process calendar A (index 0) → continues...
```

### 3. **`getBatchSyncProgress(channelId)`** - Progress tracking
Returns current sync progress:

**Returns**:
```typescript
{
  totalCalendars: 1,
  processedCalendars: 0 | 1,
  currentCalendar: 'user@gmail.com',
  totalEvents: 250,
  syncedEvents: 100,
  failedEvents: 2,
  errors: [{ calendarId, error, timestamp }]
}
```

**Used By**:
- Controllers → Sync status endpoint
- Frontend → Progress bar
- Monitoring → Track sync health

### 4. **`resetBatchSyncState(channelId)`** - State reset
Resets sync state to pending:

**Use Cases**:
- Retry failed sync
- Clear error state
- Manual reset from admin UI

## Key Features

### 1. Progress Tracking

**Every 10 Events**:
```typescript
if (i % 10 === 0) {
  await db.updateDoc('watches', channelId, {
    'syncState.processedEvents': i + 1,
  });
}
```

**Why?**
- Real-time progress updates
- Frontend can show progress bar
- Debugging (know where sync failed)
- Resume from last checkpoint (future enhancement)

**Final State Update**:
```typescript
await db.updateDoc('watches', channelId, {
  'syncState.status': 'completed',
  'syncState.completedAt': Date.now(),
  'syncState.processedEvents': events.length,
  'syncState.failedEvents': failedCount,
  syncToken: nextSyncToken,
  syncTokenUpdatedAt: Date.now(),
});
```

### 2. Round-Robin State Management

**Firestore Document** (`syncState` collection):
```typescript
{
  _id: `roundrobin_${userId}`,
  currentIndex: 2  // Next calendar to process
}
```

**Index Wrapping**:
```typescript
const nextIndex = (currentIndex + 1) % activeWatches.length;
```

**Benefits**:
- Fair distribution of processing
- No calendar gets starved
- Survives function restarts
- Cloud Scheduler friendly

### 3. Sync State Machine

**States**:
- `pending` - Ready to sync, not started
- `syncing` - Currently processing events
- `completed` - Successfully finished
- `failed` - Error occurred

**State Transitions**:
```
pending → syncing → completed
pending → syncing → failed
failed → pending (via reset)
```

**Stored in Firestore**:
```typescript
syncState: {
  status: 'syncing',
  startedAt: 1699900000000,
  completedAt: null,
  totalEvents: 250,
  processedEvents: 100,
  failedEvents: 2,
  error: null
}
```

### 4. Rate Limiting

**Same as webhook sync**:
```typescript
for (let i = 0; i < events.length; i++) {
  await syncEvent(...);

  if (i < events.length - 1) {
    await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS); // 150ms
  }
}
```

**Impact**:
- 150ms per event
- 1000 events = 2.5 minutes minimum
- Prevents quota exhaustion
- Respects Google API limits

### 5. Error Handling

**Failed Sync**:
```typescript
catch (error) {
  await db.updateDoc('watches', channelId, {
    'syncState.status': 'failed',
    'syncState.error': error.message,
  });
  throw error;
}
```

**Individual Event Failures**:
```typescript
const result = await syncEvent(...);
if (result.success) {
  syncedCount++;
} else {
  failedCount++;
}
// Continue processing (don't throw)
```

**Strategy**:
- Track failed event count
- Continue processing remaining events
- Mark overall sync as failed only if critical error
- Log all errors for debugging

## Round-Robin Algorithm

### Why Round-Robin?

**Problem**: User has 10 calendars with 1000 events each
- Sequential sync: 10,000 events × 150ms = 25 minutes
- Cloud Function timeout: 540s (9 minutes)
- **Can't complete in single function call**

**Solution**: Process one calendar per call
- Call 1: Sync calendar 1 (1000 events, 2.5 min)
- Call 2: Sync calendar 2 (1000 events, 2.5 min)
- ...
- Call 10: Sync calendar 10 (1000 events, 2.5 min)
- **Total: 10 calls over time**

### Cloud Scheduler Integration

**Daily Job** (example):
```bash
# Schedule: Every 4 hours
0 */4 * * *

# Endpoint:
POST /batch-sync-roundrobin
{ "userId": "user123" }
```

**Effect**:
- Every 4 hours: Process one calendar
- User with 6 calendars: Full sync in 24 hours
- Spreads load over time
- No timeout issues

### hasMore Flag

```typescript
const hasMore = events.length === batchSize;
```

**Meaning**:
- `true`: More events might exist, call again
- `false`: This calendar is complete (for now)

**Use Case**:
```javascript
// Controller code
do {
  result = await batchSyncRoundRobin(userId);
} while (result.hasMore && loopCount < 10);
```

## Performance Comparison

### Single Calendar Sync

| Events | Time (150ms/event) | API Calls |
|--------|-------------------|-----------|
| 10 | ~2 seconds | 11 |
| 100 | ~15 seconds | 101 |
| 1000 | ~2.5 minutes | 1001 |
| 2500 | ~6.25 minutes | 2501 |

### Round-Robin Sync

| Calendars | Events Each | Time Per Call | Total Calls |
|-----------|-------------|---------------|-------------|
| 1 | 1000 | 2.5 min | 1 |
| 5 | 1000 | 2.5 min | 5 |
| 10 | 1000 | 2.5 min | 10 |

**Advantage**: Each call fits within Cloud Function timeout

## Integration Points

**Uses**:
- `google-calendar.service` → listEvents
- `event-sync.service` → syncEvent
- `db/firestore` → Watch data, sync state, round-robin state
- `utils` → logger, sleep
- `config` → APP_CONFIG (BATCH_SIZE, RATE_LIMIT_DELAY_MS)

**Used By**:
- Controllers (Task 12) → Manual sync triggers
- Cloud Scheduler → Round-robin job
- Routes (Task 13) → Batch sync endpoints

## Use Case Examples

### 1. Initial Sync After Watch Creation
```typescript
// After creating watch
await batchSyncEvents(channelId);
```

### 2. Manual Sync Trigger (Single Calendar)
```typescript
// User clicks "Sync Now" on specific calendar
await batchSyncEvents(channelId);
const progress = await getBatchSyncProgress(channelId);
return progress; // Show to user
```

### 3. Background Sync (Multiple Calendars)
```typescript
// Cloud Scheduler calls every 4 hours
app.post('/jobs/batch-sync', async (req, res) => {
  const { userId } = req.body;
  const result = await batchSyncRoundRobin(userId);
  res.json(result);
});
```

### 4. Retry Failed Sync
```typescript
// Admin panel: "Retry Failed Sync"
await resetBatchSyncState(channelId);
await batchSyncEvents(channelId);
```

## Dependencies

**Requires**:
- Task 07: Google Calendar Service (listEvents)
- Task 08 (EVEN): Event Sync Service (syncEvent)
- Task 05: Database Service (Firestore)
- Task 04: Utils (logger, sleep)
- Task 03: Types (WatchData, BatchSyncProgress, RoundRobinStatus)
- Task 02: Config (APP_CONFIG)

**Used By**:
- Task 13 (ODD): Routes - Batch sync endpoints
- Task 12 (EVEN): Controllers - Sync logic
- Task 18 (EVEN): Final Deployment - Scheduler jobs

## Testing Considerations

**Unit Tests Needed**:
- batchSyncEvents with various event counts
- Round-robin index wrapping
- Progress tracking updates
- State transitions (pending→syncing→completed)
- Error handling (failed state)
- hasMore flag calculation
- resetBatchSyncState

**Integration Tests**:
- Full batch sync with real calendar
- Round-robin with multiple calendars
- Progress tracking during sync
- Recovery from failed sync
- Round-robin state persistence

**Load Tests**:
- 2500 event sync (max)
- 10 calendars round-robin
- Concurrent batch syncs
- Firestore write performance

## Configuration

**APP_CONFIG Settings**:
```typescript
{
  BATCH_SIZE: 100,              // Events per round-robin call
  RATE_LIMIT_DELAY_MS: 150,     // Delay between API calls
  WEBHOOK_EVENT_LIMIT: 50       // Max events for webhook
}
```

**Tuning**:
- Increase BATCH_SIZE → Faster but longer function runtime
- Decrease BATCH_SIZE → Slower but safer timeouts
- RATE_LIMIT_DELAY_MS → Balance speed vs quota

## Next Tasks

- Task 11 (ODD): Middleware - Auth for batch sync endpoints
- Task 13 (ODD): Routes - Expose batch sync API
- Task 12 (EVEN): Controllers - Orchestrate batch sync

## Notes

- Progress updates every 10 events (configurable)
- Round-robin is Cloud Scheduler friendly
- State stored in Firestore for resumability
- Failed individual events don't fail entire sync
- SyncToken saved after completion for incremental updates
- hasMore flag enables continuation logic
- resetBatchSyncState allows retry of failed syncs
- Compatible with Task 08 event-sync service
- Designed for Cloud Function timeout limits (540s)
