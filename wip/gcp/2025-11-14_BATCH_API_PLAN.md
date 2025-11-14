# Google Calendar Batch API Implementation Plan

**Date:** 2025-11-14
**Priority:** HIGH - Required for 2000+ event use case
**Status:** Not Started

## Problem

Current implementation uses **sequential individual API calls** with rate limiting:

```typescript
for (let i = 0; i < events.length; i++) {
  await syncEvent(userId, calendarId, event.id, targetCalendarId);
  await sleep(150); // 150ms delay
}
```

**Performance with 2000 events:**
- Time: 2000 × 150ms = 300 seconds (5 minutes)
- API calls: 2000 individual requests
- Cloud Function risk: Will timeout in production

**This will fail in production.** Cloud Functions timeout at 9 minutes (default 60s).

## Solution: Google Calendar Batch API

Google supports batching up to **100 operations** in a single HTTP request using multipart MIME.

**Performance with 2000 events:**
- Batches: 2000 ÷ 100 = 20 batch requests
- Time: ~10-20 seconds (estimated)
- API calls: 20 batch requests instead of 2000
- Cloud Function safe: Well under timeout

**Speed improvement: 15-30x faster**

---

## Google Batch API Reference

**Endpoint:** `https://www.googleapis.com/batch/calendar/v3`

**Format:** Multipart MIME with boundary delimiter

**Limits:**
- Max 100 operations per batch
- Each operation counted separately for quota (100 ops = 100 quota units)
- Operations can fail independently

**Example Request:**
```http
POST https://www.googleapis.com/batch/calendar/v3
Authorization: Bearer <token>
Content-Type: multipart/mixed; boundary=batch_boundary

--batch_boundary
Content-Type: application/http
Content-ID: <item1>

POST /calendar/v3/calendars/cal123/events
Content-Type: application/json

{"summary": "Event 1", "start": {...}, "end": {...}}

--batch_boundary
Content-Type: application/http
Content-ID: <item2>

PATCH /calendar/v3/calendars/cal123/events/evt456
Content-Type: application/json

{"summary": "Updated Event 2"}

--batch_boundary--
```

**Example Response:**
```http
HTTP/1.1 200 OK
Content-Type: multipart/mixed; boundary=batch_response_boundary

--batch_response_boundary
Content-Type: application/http
Content-ID: <response-item1>

HTTP/1.1 200 OK
Content-Type: application/json

{"id": "evt789", "summary": "Event 1", ...}

--batch_response_boundary
Content-Type: application/http
Content-ID: <response-item2>

HTTP/1.1 200 OK
Content-Type: application/json

{"id": "evt456", "summary": "Updated Event 2", ...}

--batch_response_boundary--
```

---

## Implementation Steps

### Step 1: Create Batch Request Builder

**File:** `/gcp/src/services/google-calendar-batch.service.ts` (new)

**Functions needed:**
```typescript
/**
 * Build multipart MIME batch request body
 */
function buildBatchRequest(
  operations: BatchOperation[]
): { boundary: string; body: string }

/**
 * Parse multipart MIME batch response
 */
function parseBatchResponse(
  response: string,
  boundary: string
): BatchOperationResult[]

/**
 * Execute batch create events
 */
export async function batchCreateEvents(
  userId: string,
  calendarId: string,
  events: calendar_v3.Schema$Event[]
): Promise<BatchResult>

/**
 * Execute batch update events
 */
export async function batchUpdateEvents(
  userId: string,
  calendarId: string,
  updates: Array<{ eventId: string; data: calendar_v3.Schema$Event }>
): Promise<BatchResult>
```

**Types needed:**
```typescript
interface BatchOperation {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  contentId: string;
  body?: any;
}

interface BatchOperationResult {
  contentId: string;
  statusCode: number;
  body: any;
  error?: any;
}

interface BatchResult {
  successful: number;
  failed: number;
  results: BatchOperationResult[];
}
```

### Step 2: Modify Event Sync Service

**File:** `/gcp/src/services/event-sync.service.ts`

**Current approach:**
```typescript
// Process events one at a time
for (let i = 0; i < events.length; i++) {
  const event = events[i];
  await syncEvent(userId, calendarId, event.id, targetCalendarId);
  await sleep(150);
}
```

**New batched approach:**
```typescript
// Separate events into creates vs updates
const createOps = [];
const updateOps = [];

for (const event of events) {
  const mappingId = generateCompositeKey(calendarId, event.id);
  const mappingDoc = await db.getDoc('eventMappings', mappingId);

  if (mappingDoc) {
    updateOps.push({ sourceEvent: event, targetEventId: mappingDoc.targetEventId });
  } else {
    createOps.push(event);
  }
}

// Batch creates
if (createOps.length > 0) {
  const batches = chunk(createOps, 100);
  for (const batch of batches) {
    const result = await batchCreateEvents(userId, targetCalendarId, batch);
    // Handle results, create mappings
  }
}

// Batch updates
if (updateOps.length > 0) {
  const batches = chunk(updateOps, 100);
  for (const batch of batches) {
    const result = await batchUpdateEvents(userId, targetCalendarId, batch);
    // Handle results
  }
}
```

### Step 3: Event Mapping Handling

**Challenge:** Need to map batch response items back to source events.

**Solution:** Use Content-ID in batch requests:

```typescript
// When building batch request
const contentId = `${sourceCalendarId}:${sourceEventId}`;

// When parsing response
const [sourceCalendarId, sourceEventId] = contentId.split(':');
```

**Create mappings after batch completes:**
```typescript
for (const result of batchResult.results) {
  if (result.statusCode === 200) {
    const [sourceCalendarId, sourceEventId] = result.contentId.split(':');
    const targetEventId = result.body.id;

    await db.setDoc('eventMappings', compositeKey, {
      sourceCalendarId,
      sourceEventId,
      targetEventId,
      lastSynced: Timestamp.now(),
    });
  }
}
```

### Step 4: Error Handling

**Challenge:** Individual operations in batch can fail independently.

**Approach:**
```typescript
const result = await batchCreateEvents(...);

// Successful operations
console.log(`Created ${result.successful} events`);

// Failed operations
for (const failure of result.results.filter(r => r.statusCode !== 200)) {
  const [sourceCalId, sourceEvtId] = failure.contentId.split(':');

  if (failure.statusCode === 409) {
    // Conflict - event already exists, try update instead
  } else if (failure.statusCode === 429) {
    // Rate limit - retry later
  } else {
    // Other error - log and continue
    log.error(`Failed to create event ${sourceEvtId}`, failure.error);
  }
}
```

### Step 5: Retry Logic

**Failed operations should be retried individually** (not in batch) to avoid cascading failures:

```typescript
const failedOps = result.results.filter(r => r.statusCode !== 200);

// Retry failed operations individually with backoff
for (const failed of failedOps) {
  const [sourceCalId, sourceEvtId] = failed.contentId.split(':');

  try {
    await sleep(1000); // Backoff
    await syncEvent(userId, sourceCalId, sourceEvtId, targetCalendarId);
  } catch (error) {
    log.error(`Retry failed for event ${sourceEvtId}`, error);
  }
}
```

---

## Implementation Complexity

### Using googleapis Library

Good news: **googleapis library has built-in batch support!**

```typescript
import { google } from 'googleapis';

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Create batch request
const batch = calendar.newBatch();

// Add operations
batch.add(calendar.events.insert({
  calendarId: targetCalendarId,
  requestBody: event1
}));

batch.add(calendar.events.insert({
  calendarId: targetCalendarId,
  requestBody: event2
}));

// Execute batch
batch.exec((err, results) => {
  // Handle results
});
```

**This simplifies implementation significantly!** No need to manually build multipart MIME.

### Estimated Implementation Time

- **Using googleapis batch API:** 4-6 hours
  - Learn googleapis batch API (1 hour)
  - Implement batch create/update functions (2 hours)
  - Modify event-sync.service.ts (1 hour)
  - Test with large event sets (1-2 hours)

- **Manual multipart MIME:** 2-3 days
  - Build multipart request builder (1 day)
  - Parse multipart responses (1 day)
  - Error handling and testing (1 day)

**Recommendation:** Use googleapis batch API (much simpler).

---

## Migration Strategy

### Phase 1: Implement Batch Functions (Non-Breaking)

Create new batch functions without modifying existing code:

```typescript
// New file: google-calendar-batch.service.ts
export async function batchSyncEvents(
  userId: string,
  calendarId: string,
  eventIds: string[],
  targetCalendarId: string
): Promise<BatchSyncResult>
```

### Phase 2: Update Batch Sync Service

Modify `batchSyncRoundRobin()` to use batch functions:

```typescript
// Old
for (const event of events) {
  await syncEvent(...);
  await sleep(150);
}

// New
await batchSyncEvents(userId, calendarId, eventIds, targetCalendarId);
```

### Phase 3: Keep Individual Sync for Webhooks

**Important:** Continue using individual `syncEvent()` for webhook notifications.

**Why:**
- Webhooks typically notify 1-5 events (small batches)
- Individual calls are fine for small volumes
- Simpler error handling for real-time updates

**Strategy:**
```typescript
if (events.length > 10) {
  // Use batch API for large syncs
  await batchSyncEvents(...);
} else {
  // Use individual calls for small syncs
  for (const event of events) {
    await syncEvent(...);
  }
}
```

---

## Testing Plan

### Unit Tests

```typescript
describe('Batch sync', () => {
  it('should batch create 100 events', async () => {
    const events = generateTestEvents(100);
    const result = await batchCreateEvents(userId, calendarId, events);
    expect(result.successful).toBe(100);
  });

  it('should handle partial failures', async () => {
    // Mock some events to fail
    const result = await batchCreateEvents(...);
    expect(result.successful).toBeLessThan(100);
    expect(result.failed).toBeGreaterThan(0);
  });

  it('should create event mappings for successful ops', async () => {
    await batchCreateEvents(...);
    const mapping = await db.getDoc('eventMappings', compositeKey);
    expect(mapping).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('Large sync', () => {
  it('should sync 2000+ events in under 60 seconds', async () => {
    const start = Date.now();
    await batchSyncRoundRobin(userId);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(60000); // 60 seconds
  });

  it('should handle mixed creates and updates', async () => {
    // Create some events first
    // Then modify source events
    // Trigger sync
    // Verify updates applied
  });
});
```

### Manual Testing

1. **Create test calendar with 2000+ events**
   - Use Google Calendar API to bulk create test events
   - Mix of different event types (all-day, recurring, etc.)

2. **Test initial sync**
   - Clear eventMappings collection
   - Trigger batch sync
   - Verify all events synced
   - Check timing (should be <30 seconds)

3. **Test incremental sync**
   - Modify some source events
   - Trigger sync
   - Verify updates applied

4. **Test error handling**
   - Delete target calendar mid-sync
   - Revoke OAuth tokens
   - Verify graceful failure

---

## Performance Targets

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| 2000 events sync time | 300 sec | <30 sec | 10x improvement |
| API calls (2000 events) | 2000 | 20 | 100x reduction |
| Cloud Function timeout risk | HIGH | NONE | Critical for production |
| Max events per round | ~200* | 2000+ | *before timeout |

---

## Configuration Changes

Add batch size config to `/gcp/src/config/app.config.ts`:

```typescript
export const APP_CONFIG = {
  // Batch sync settings
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '10', 10),
  BATCH_API_SIZE: 100, // Google's max batch size
  BATCH_API_ENABLED: process.env.BATCH_API_ENABLED === 'true',
  BATCH_THRESHOLD: 10, // Use batch API if > 10 events

  // Rate limiting (for individual calls)
  RATE_LIMIT_DELAY_MS: 150,

  // ... existing config
}
```

**Environment variables:**
```bash
# .env
BATCH_API_ENABLED=true  # Enable batch API
BATCH_THRESHOLD=10      # Use batch if > 10 events
```

---

## Rollout Plan

### Week 1: Development
- Implement googleapis batch API wrapper
- Modify batch-sync.service.ts
- Unit tests

### Week 2: Testing
- Integration tests with large datasets
- Manual testing with real calendars
- Performance benchmarking

### Week 3: Deployment
- Deploy to staging (test with real data)
- Monitor logs and errors
- Deploy to production with feature flag

### Week 4: Optimization
- Tune batch sizes
- Add metrics/monitoring
- Document performance improvements

---

## Risks & Mitigations

### Risk: Batch API complexity
**Mitigation:** Use googleapis library (built-in batch support)

### Risk: Partial failures hard to debug
**Mitigation:**
- Detailed logging per operation
- Content-ID mapping back to source events
- Individual retry for failed ops

### Risk: Event mapping race conditions
**Mitigation:**
- Use Firestore transactions for critical updates
- Composite keys prevent collisions

### Risk: Breaking existing functionality
**Mitigation:**
- Feature flag (`BATCH_API_ENABLED`)
- Keep individual sync as fallback
- Gradual rollout

---

## Success Metrics

✅ 2000 event sync completes in <30 seconds
✅ Zero Cloud Function timeouts
✅ Event mappings 100% accurate
✅ No duplicate events created
✅ Graceful handling of partial failures
✅ Logs clearly show batch progress

---

## References

- [Google Calendar Batch API Docs](https://developers.google.com/calendar/api/guides/batch)
- [googleapis Node.js Batch](https://github.com/googleapis/google-api-nodejs-client#batching-requests)
- [Multipart MIME Spec](https://www.ietf.org/rfc/rfc2046.txt)

---

## Next Steps

1. **Spike:** Test googleapis batch API with small dataset (1-2 hours)
2. **Design review:** Confirm approach with team
3. **Implementation:** Follow phased rollout plan
4. **Testing:** Comprehensive testing with 2000+ events
5. **Deploy:** Gradual rollout with monitoring
