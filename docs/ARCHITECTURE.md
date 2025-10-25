# Architecture Documentation

## System Components

### 1. Source Calendars
- Multiple Google Calendars to monitor
- Push notifications enabled via Calendar API

### 2. Webhook Handler (Cloud Function)
- Receives push notifications from Google Calendar
- Triggered on event create/update/delete
- Processes incremental changes using sync tokens
- Updates target calendar in real-time

### 3. Batch Sync Function (Cloud Function)
- Handles initial calendar synchronization asynchronously
- Processes events in batches of 50 with pagination
- Uses Cloud Tasks for orchestration
- Rate-limited to respect Google Calendar API quotas (150ms between events)
- Tracks sync progress in Firestore (`syncState`)

### 4. Cloud Tasks Queue
- **Queue Name**: `calendar-sync-queue`
- **Rate**: 10 tasks/second (one task per calendar batch)
- **Concurrency**: 10 parallel calendar syncs
- **Retry**: Up to 3 attempts with exponential backoff
- Orchestrates batched event processing across calendars

### 5. Firestore Database
Collections:
- `event_mappings`: source_event_id → target_event_id mapping
- `watches`: Active calendar watch subscriptions with sync state
  - `syncState`: Tracks batch sync progress (status, pageToken, eventsSynced, timeMax)
  - `syncToken`: For incremental updates after initial sync

### 6. Target Calendar
- Single Google Calendar receiving merged events
- Events labeled with `[calendar-name]` prefix
- Privacy set to private, transparency preserved

### 7. Cloud Scheduler
- Renews watch subscriptions daily
- Prevents webhook expiration (7-day limit)

## Data Flow

### Initial Sync (Batch Processing)

```
User Sets Up Calendar
  ↓
createCalendarWatch()
  ├─ Creates watch subscription
  ├─ Initializes syncState (status: 'pending')
  └─ Enqueues first batch sync task (5s delay)
  ↓
Cloud Tasks → batchSync Function
  ├─ Fetches 50 events from Google Calendar API
  ├─ Processes each event with 150ms delay (rate limiting)
  ├─ Updates target calendar
  ├─ Increments syncState.eventsSynced in Firestore
  └─ Checks pagination:
      ├─ If nextPageToken exists:
      │   ├─ Stores pageToken in syncState
      │   └─ Enqueues next batch (2s delay)
      └─ If nextSyncToken exists (final batch):
          ├─ Stores syncToken for incremental updates
          └─ Marks syncState.status = 'complete'
  ↓
Sync Complete
  └─ Calendar ready for real-time incremental updates
```

### Incremental Updates (Real-time)

```
Source Calendar Event Change
  ↓
Push Notification
  ↓
handleWebhook Cloud Function
  ├─ Uses syncToken for incremental sync
  ├─ Fetches only changed events
  ├─ Updates syncToken
  └─ Processes changes:
      ├─ New events → Create in target calendar
      ├─ Updated events → Update in target calendar
      └─ Deleted events → Delete from target calendar
  ↓
Update Firestore Mapping
  └─ Store source_event_id → target_event_id
```

## Rate Limiting & Performance

### Google Calendar API Quotas
- **Quota**: 10 requests/second per project
- **Batch sync rate**: 150ms between events (~6.7 requests/second)
- **Safety margin**: Well under quota to handle concurrent calendars

### Batch Processing Performance
- **Batch size**: 50 events per batch
- **Batch interval**: 2 seconds between batches
- **Processing time**: ~7.5 seconds per batch (50 events × 150ms)
- **Example**: 500-event calendar = ~10 batches = ~90 seconds total

### Parallel Calendar Syncs
- **Queue concurrency**: 10 simultaneous calendar syncs
- **Per-calendar rate**: 6.7 events/second
- **Total throughput**: Up to 67 events/second across all calendars

## Sync State Management

### syncState Fields
```typescript
syncState: {
  status: 'pending' | 'syncing' | 'complete' | 'failed',
  pageToken?: string,           // For pagination between batches
  eventsSynced: number,          // Running count
  totalEvents?: number,          // Estimated total (if available)
  lastBatchTime?: number,        // Timestamp of last batch
  timeMax?: string,              // Sync window end (2 years from start)
}
```

### Status Transitions
- `pending` → Watch created, first batch not yet started
- `syncing` → Actively processing batches
- `complete` → All events synced, syncToken obtained
- `failed` → Error occurred, requires investigation

## Scaling Considerations

- Cloud Functions auto-scale with load (up to 1000 concurrent instances)
- Firestore scales automatically (millions of writes/second)
- Cloud Tasks handles queue overflow gracefully
- Watch subscriptions limited to 1000/project (Google Calendar API limit)
- Batch sync architecture prevents timeout issues with large calendars
