# Research Directive: Google Calendar V3 Sync & GCP Cloud Functions
**Date:** 2025-11-13
**Focus:** Calendar synchronization, OAuth refresh tokens, GCP serverless architecture

---

## Research Objectives

Conduct comprehensive technical research on implementing a production-grade calendar sync service using Google Calendar API v3 and Google Cloud Functions Gen 2. Focus on:

1. **Calendar synchronization mechanisms**
2. **OAuth 2.0 refresh token lifecycle**
3. **GCP Cloud Functions architecture patterns**
4. **Rate limiting and quota management**
5. **Error handling and retry strategies**

---

## Technology Stack Context

### Backend Infrastructure
- **Platform:** Google Cloud Functions Gen 2
- **Runtime:** Node.js 22
- **Language:** TypeScript 5.x
- **Database:** Firestore (state management)
- **Queue:** Cloud Tasks (async processing)
- **Auth:** Secret Manager (OAuth token storage)

### Frontend
- **Framework:** Next.js 15 (React 19)
- **Hosting:** Vercel
- **Runtime:** Node 22

### APIs & Services
- **Google Calendar API v3**
- **OAuth 2.0** for authentication
- **Push notifications** via watch channels

---

## Part 1: Google Calendar API V3 Sync Mechanisms

### 1.1 Full Sync vs Incremental Sync

**Research Questions:**
- What is the complete lifecycle of calendar event synchronization?
- When should you use full sync vs incremental sync?
- How do sync tokens work and when do they expire?

**Key Areas:**
- Initial sync process for calendars with 1000+ events
- Using `events.list()` with pagination
- Sync token acquisition and storage
- Incremental updates with sync tokens

### 1.2 Sync Tokens

**Deep Dive Required:**
```typescript
// Example pattern
const response = await calendar.events.list({
  calendarId: 'primary',
  syncToken: previousSyncToken,
  showDeleted: true,
  singleEvents: true,
});
```

**Critical Questions:**
1. What query parameters are **incompatible** with sync tokens?
2. When do sync tokens become invalid (HTTP 410)?
3. How do you handle sync token expiration gracefully?
4. What's the difference between `pageToken` and `syncToken`?
5. Can you use `timeMin`, `timeMax`, or `orderBy` with sync tokens?

**Error Handling:**
- HTTP 410 (Gone) - Sync token expired
- HTTP 404 (Not Found) - Calendar deleted
- HTTP 403 (Forbidden) - Permission issues
- Recovery strategies for each

### 1.3 Pagination

**Research:**
- How `pageToken` works for paginated results
- Relationship between `pageToken` and `nextSyncToken`
- When you receive `nextPageToken` vs `nextSyncToken`
- Best practices for handling large result sets (5000+ events)

**Pattern:**
```typescript
if (response.data.nextPageToken) {
  // More pages available
  nextRequest.pageToken = response.data.nextPageToken;
} else if (response.data.nextSyncToken) {
  // Final page - store for incremental sync
  storeSyncToken(response.data.nextSyncToken);
}
```

### 1.4 Push Notifications (Watch Channels)

**Research Areas:**
1. **Setup:**
   - How to create a watch channel via `events.watch()`
   - Required webhook endpoint configuration
   - Channel expiration times and limits

2. **Lifecycle:**
   - Maximum channel lifetime
   - Renewal strategies (when to renew?)
   - Handling channel expiration
   - Deleting/stopping channels

3. **Webhook Payload:**
   - What data is included in push notifications?
   - How to verify webhook authenticity?
   - What triggers a notification? (new event, update, delete)
   - Handling duplicate notifications

4. **Production Patterns:**
   - Scheduling automatic renewal (Cloud Scheduler)
   - Handling webhook at scale (1000+ users)
   - What happens when webhooks fail?

### 1.5 Event Operations

**Sync Event Types:**
- **Created events:** New events since last sync
- **Updated events:** Modified events (attendees, time, title)
- **Deleted events:** Events marked as deleted (requires `showDeleted: true`)

**Research:**
- How to detect event type (created vs updated vs deleted)?
- Using `event.status === 'cancelled'` for deletions
- Handling recurring events vs single events
- iCalUID and event ID relationship

---

## Part 2: OAuth 2.0 Refresh Token Management

### 2.1 OAuth Flow for Calendar Access

**Research:**
1. **Initial Authorization:**
   - Required OAuth scopes for calendar sync
   - Offline access (`access_type=offline`)
   - Consent screen implications
   - When refresh tokens are issued

2. **Token Storage:**
   - Where to securely store refresh tokens (Secret Manager, encrypted DB)
   - Best practices for multi-user systems
   - Encryption requirements

### 2.2 Refresh Token Lifecycle

**Critical Research Questions:**
1. **Expiration:**
   - Do Google refresh tokens expire? (Time-based vs usage-based)
   - Difference between user revocation and automatic expiration
   - How to detect an invalid refresh token

2. **Invalidation Scenarios:**
   - User revokes access via Google Account settings
   - Password change
   - Security-related automatic revocation
   - Exceeding refresh token limits (max tokens per user/app)

3. **Detection & Recovery:**
   - What error codes indicate invalid refresh token?
   - HTTP 401 vs 403 vs 400 error meanings
   - Re-authentication strategies
   - User notification patterns

**Example Error Handling:**
```typescript
try {
  const accessToken = await refreshAccessToken(refreshToken);
} catch (error) {
  if (error.code === 401 || error.message.includes('invalid_grant')) {
    // Refresh token invalid - require re-auth
  }
}
```

### 2.3 Access Token vs Refresh Token

**Clarify:**
- Access token lifespan (typically 1 hour)
- When to proactively refresh access tokens
- Caching strategies for access tokens
- Rate limiting on token refresh endpoint

---

## Part 3: GCP Cloud Functions Architecture

### 3.1 Function Design Patterns

**Research:**
1. **Deployment Strategies:**
   - Multiple small functions vs single Express app
   - Cold start considerations (Gen 2 improvements)
   - Environment variable management per function
   - Shared code/dependencies across functions

2. **Function Types:**
   - **HTTP functions:** API endpoints, webhooks
   - **Event-driven functions:** Firestore triggers, Pub/Sub
   - **Scheduled functions:** Cloud Scheduler cron jobs

3. **Example Architecture:**
   ```
   handleWebhook (HTTP)     → Receives calendar push notifications
   batchSync (HTTP)         → Processes sync batches (Cloud Tasks triggered)
   renewWatches (Scheduled) → Daily cron to renew watch channels
   api (HTTP)               → API gateway for frontend
   ```

### 3.2 Cloud Tasks Integration

**Research:**
1. **Use Cases:**
   - Async processing of long-running operations
   - Rate limiting via task queues
   - Retry logic with exponential backoff

2. **Best Practices:**
   - Task deduplication strategies
   - OIDC authentication for function invocation
   - Queue configuration (rate limits, retry settings)
   - Task naming for idempotency

**Pattern:**
```typescript
// Deterministic task naming prevents duplicates
const taskName = `sync-${userId}-${timestamp}`;
await cloudTasks.createTask({
  parent: queuePath,
  task: {
    name: taskName,
    httpRequest: {
      url: functionUrl,
      oidcToken: { serviceAccountEmail }
    }
  }
});
```

### 3.3 Firestore for State Management

**Research:**
1. **Data Model Patterns:**
   - Storing sync state (progress, tokens, status)
   - Atomic updates with transactions
   - Nested field updates with dot notation
   - Handling concurrent writes

2. **Common Patterns:**
   ```typescript
   // Atomic counter increment
   await doc.update({
     'stats.eventsSynced': FieldValue.increment(count),
     'syncState.status': 'syncing'
   });

   // Atomic transaction for coordination
   await firestore.runTransaction(async (tx) => {
     const doc = await tx.get(ref);
     const nextIndex = (doc.data().currentIndex + 1) % total;
     tx.update(ref, { currentIndex: nextIndex });
   });
   ```

### 3.4 Secret Manager Integration

**Research:**
- Storing OAuth tokens securely
- Accessing secrets from Cloud Functions
- Versioning and rotation strategies
- Performance considerations (caching secrets)

---

## Part 4: Rate Limiting & Quota Management

### 4.1 Google Calendar API Quotas

**Research:**
1. **Default Limits:**
   - Queries per second (per project, per user)
   - Daily quota limits
   - Batch request capabilities

2. **Strategies:**
   - Implementing exponential backoff for 429 errors
   - Client-side rate limiting (delay between requests)
   - Using batch requests where possible

**Example Rate Limiting:**
```typescript
const RATE_LIMIT_DELAY_MS = 150; // ~6-7 req/sec (under 10/sec limit)

for (const event of events) {
  await processEvent(event);
  await sleep(RATE_LIMIT_DELAY_MS);
}
```

### 4.2 Multi-Calendar Sync Challenges

**Research Questions:**
1. If syncing 5 calendars in parallel at 2 req/sec each = 10 req/sec total?
2. How to coordinate syncs to stay under quota?
3. Round-robin vs parallel processing trade-offs?

**Pattern Example:**
```
Cal1 [batch 50 events] → delay → Cal2 [batch 50 events] → delay → Cal3 → Cal1 → ...
```

---

## Part 5: Error Handling & Retry Strategies

### 5.1 Common Error Scenarios

**Research Each:**

| Error Code | Meaning | Retry Strategy |
|------------|---------|----------------|
| 401 | Unauthorized (invalid/expired token) | Refresh access token or re-auth |
| 403 | Forbidden (quota/permission) | Exponential backoff or alert |
| 404 | Calendar/event not found | Mark as deleted, don't retry |
| 410 | Sync token expired | Restart full sync |
| 429 | Rate limit exceeded | Exponential backoff |
| 500/503 | Server error | Retry with backoff |

### 5.2 Retry Patterns

**Research:**
1. **Exponential Backoff:**
   ```typescript
   const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
   await sleep(backoffMs);
   ```

2. **Failed Event Tracking:**
   - Store failed event IDs
   - Retry in subsequent batches
   - Max retry limit (e.g., 5 attempts)
   - Eventual failure handling

3. **Circuit Breaker:**
   - When to stop retrying entirely?
   - Alerting on repeated failures

---

## Part 6: Production Architecture Patterns

### 6.1 Round-Robin Batch Processing

**Problem:** Parallel sync of multiple calendars exceeds rate limits.

**Solution:** Process one batch from each calendar sequentially.

**Research:**
1. How to coordinate state across batches?
2. Using Firestore transactions for atomic coordination
3. Cloud Tasks for enqueueing next batch
4. Preventing infinite loops (max iteration limits)

**Pattern:**
```
User has 3 calendars → Cal1, Cal2, Cal3
Iteration 1: Process 50 events from Cal1 → enqueue next task
Iteration 2: Process 50 events from Cal2 → enqueue next task
Iteration 3: Process 50 events from Cal3 → enqueue next task
Iteration 4: Back to Cal1 (if not complete)
...
Continue until all calendars complete
```

### 6.2 Progress Tracking

**Research:**
- Real-time progress updates for UI
- Firestore document structure for sync state
- Polling vs WebSocket patterns
- Showing "X of Y events synced"

### 6.3 Graceful Degradation

**Scenarios to Handle:**
1. Google Calendar API temporarily unavailable
2. User revokes access mid-sync
3. Source calendar deleted during sync
4. Rate limits hit unexpectedly
5. Function timeout (Cloud Functions have max execution time)

---

## Part 7: Multi-User Scale Considerations

### 7.1 Scaling Challenges

**Research:**
1. **Per-user isolation:**
   - Separate sync state per user
   - OAuth token management at scale
   - Firestore collection design

2. **Webhook handling:**
   - Processing 1000+ webhook notifications/second
   - Preventing webhook retry loops
   - Duplicate notification handling

3. **Resource limits:**
   - Cloud Function concurrency limits
   - Firestore write throughput
   - Cloud Tasks queue throughput

### 7.2 Cost Optimization

**Research:**
- Cloud Functions pricing (CPU time, memory, invocations)
- Firestore read/write costs
- Calendar API quota vs paid quota increases
- Secret Manager access pricing

---

## Deliverable Format

Provide findings in structured markdown with:

1. **Executive Summary** - Key takeaways for each section
2. **Technical Details** - Code examples, API specifications
3. **Best Practices** - Recommended patterns from Google and community
4. **Common Pitfalls** - Non-obvious gotchas and mistakes to avoid
5. **Sequence Diagrams** - For complex flows (Mermaid format)
6. **Production Checklist** - "Ready for production" criteria
7. **Links to Official Docs** - Citations for all claims

---

## Critical Questions to Answer

### Calendar API
1. What query parameters are incompatible with sync tokens?
2. How do you detect when a user revokes calendar access?
3. What's the exact mechanism for handling deleted events?
4. How do watch channels behave when refresh tokens are revoked?

### OAuth
1. Do Google Calendar refresh tokens expire automatically?
2. What error codes indicate token revocation vs expiration?
3. How many refresh tokens can exist per user/app combination?
4. What triggers automatic refresh token invalidation?

### Architecture
1. What's the optimal polling interval for watch channel renewal?
2. How to handle very large calendars (10k+ events) efficiently?
3. What's the recommended Cloud Function timeout setting?
4. How to prevent duplicate processing during retries?

### Edge Cases
1. What happens if sync token becomes invalid mid-pagination?
2. How to handle concurrent modifications to the same event?
3. What if webhook endpoint is temporarily unavailable?
4. How to recover from Firestore write failures mid-batch?

---

## Research Sources Priority

1. **Primary:** Google Calendar API v3 official documentation
2. **Primary:** Google OAuth 2.0 documentation
3. **Primary:** GCP Cloud Functions documentation
4. **Secondary:** Google Cloud blog posts and best practices
5. **Secondary:** Stack Overflow discussions (high-vote answers)
6. **Tertiary:** GitHub issues in official Google client libraries
7. **Tertiary:** Community blog posts from verified implementers

---

## Depth Requirements

- Include specific error codes and messages, not just "handle errors"
- Provide actual API request/response examples (JSON)
- Explain the "why" behind best practices, not just "what to do"
- Cover non-obvious behaviors (e.g., what happens to pending webhooks when channels expire)
- Include performance implications (e.g., sync token vs full sync latency)

---

## Scope Boundaries

**In Scope:**
- Google Calendar API v3 synchronization
- OAuth 2.0 refresh token management
- GCP Cloud Functions Gen 2 patterns
- Firestore for state management
- Cloud Tasks for async processing

**Out of Scope:**
- Non-Google calendar systems (Outlook, Apple Calendar)
- Google Calendar API v2 or older
- Non-serverless architectures
- GraphQL alternatives
- Third-party sync services

---

**Goal:** Produce a comprehensive technical reference that enables building a production-grade calendar sync service with deep understanding of sync mechanisms, OAuth lifecycle, and GCP serverless patterns.
