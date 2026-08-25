# Local Watch Channel Testing Guide

**Your Architecture is Already What You Wanted!** ✅

The migration from 5 separate functions to a single consolidated function with sub-routes is **already deployed**. This matches your preference perfectly.

---

## 🏗️ Current Architecture (Deployed)

```typescript
// Single Cloud Function with Express routes
calendarSync (app.ts)
├── POST /webhook              ← Handles Google Calendar push notifications
├── POST /batch-sync           ← Batch sync processing
├── POST /renew-watches        ← Watch renewal
├── POST /api/sync/pause       ← Control endpoints
├── POST /api/sync/resume
├── POST /api/sync/stop
├── POST /api/sync/restart
├── DELETE /api/user/clear
└── GET /health                ← Health check

All routes share:
- Same codebase
- Same dependencies
- Same warm container
- No code duplication
```

**This is exactly what you wanted** - one function that runs the whole thing with sub-functions (routes) that are hit.

---

## 🧪 Testing Watch Channels Locally

### Quick Answer

**Yes**, you can create and remove watch channels locally, but Google Calendar requires a **publicly accessible webhook URL**.

### Setup (One-Time)

#### Option 1: Using ngrok (Recommended)

```bash
# 1. Install ngrok (if not installed)
brew install ngrok
# or
npm install -g ngrok

# 2. Start your local server
pnpm dev:server
# Server runs on http://localhost:8080

# 3. In a new terminal, start ngrok
ngrok http 8080

# You'll see something like:
# Forwarding https://abc123.ngrok.io -> http://localhost:8080
```

#### Option 2: Using localhost.run (No Installation)

```bash
# Start local server
pnpm dev:server

# In another terminal
ssh -R 80:localhost:8080 localhost.run

# You'll get a public URL like:
# https://xyz789.localhost.run
```

---

## 📝 Testing Watch Channels

### Method 1: Via Curl Commands

```bash
# Set your ngrok/localhost.run URL
NGROK_URL="https://abc123.ngrok.io"

# 1. Create a watch
curl -X POST http://localhost:8080/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "sourceCalendars": ["primary"],
    "targetCalendar": "target@gmail.com",
    "webhookUrl": "'$NGROK_URL'/webhook"
  }'

# 2. Trigger a webhook (simulated)
curl -X POST http://localhost:8080/webhook \
  -H "x-goog-channel-id: test-channel-id" \
  -H "x-goog-resource-state: exists"

# 3. List active watches (check Firestore)
# In Firebase Console > Firestore > watches collection

# 4. Stop a watch
curl -X POST http://localhost:8080/api/sync/stop \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "calendarId": "primary"
  }'
```

### Method 2: Via Test Script

Create `scripts/test-watch.ts`:

```typescript
import { createCalendarWatch, stopCalendarWatch } from '../functions/calendar-sync/watch';
import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();

async function testWatch() {
  const ngrokUrl = process.argv[2] || 'https://abc123.ngrok.io';
  const webhookUrl = `${ngrokUrl}/webhook`;

  console.log('Creating watch with webhook:', webhookUrl);

  // Create watch
  const channelId = await createCalendarWatch(
    'test-user-id',
    'primary',
    webhookUrl,
    'target@gmail.com'
  );

  console.log('✅ Watch created:', channelId);
  console.log('Make a change to your calendar and watch the logs...');
  console.log('Press Enter to stop watch...');

  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Get watch data
  const watchDoc = await firestore.collection('watches').doc(channelId).get();
  const watchData = watchDoc.data();

  // Stop watch
  await stopCalendarWatch('test-user-id', channelId, watchData?.resourceId);

  // Clean up
  await watchDoc.ref.delete();

  console.log('✅ Watch stopped and cleaned up');
}

testWatch().catch(console.error);
```

Run it:
```bash
ts-node scripts/test-watch.ts https://your-ngrok-url.ngrok.io
```

### Method 3: Via Functions Framework

```bash
# Already set up in your dev-server.ts
pnpm dev:server

# Server logs will show:
# - POST /webhook requests when calendar changes
# - x-goog-channel-id header
# - x-goog-resource-state (sync | exists)
```

---

## 🔍 Watch Channel Lifecycle

### 1. Create Watch

```typescript
// functions/calendar-sync/watch.ts:21
const channelId = await createCalendarWatch(
  userId,           // User ID
  calendarId,       // Calendar to watch (e.g., 'primary')
  webhookUrl,       // Your public webhook URL
  targetCalendarId  // Optional: target calendar
);

// Returns: Base64-encoded channelId
// Stored in: Firestore watches/{channelId}
// Expiration: 7 days (CONFIG.WATCH_EXPIRATION_DAYS)
```

### 2. Receive Webhooks

When a calendar event changes, Google sends:

```http
POST /webhook HTTP/1.1
Host: your-ngrok-url.ngrok.io
x-goog-channel-id: <your-channel-id>
x-goog-resource-state: exists
x-goog-resource-id: <resource-id>
x-goog-resource-uri: https://www.googleapis.com/calendar/v3/...
x-goog-message-number: 1
```

Your server (functions/calendar-sync/app.ts:43):
```typescript
app.post('/webhook', async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];

  if (resourceState === 'sync') {
    res.status(200).send('Sync acknowledged');
    return;
  }

  if (resourceState === 'exists') {
    await syncCalendarEvents(channelId);
  }

  res.status(200).send('OK');
});
```

### 3. Renew Watch (before expiration)

```typescript
// functions/calendar-sync/watch.ts:84
await renewCalendarWatch(calendarId, watchId);

// This:
// 1. Stops old watch
// 2. Creates new watch with same config
// 3. Deletes old watch document
// 4. Creates new watch document
```

### 4. Stop Watch

```typescript
// functions/calendar-sync/watch.ts:120
await stopCalendarWatch(userId, channelId, resourceId);

// Calls: calendar.channels.stop()
// Note: Also delete Firestore document manually if needed
```

---

## 🎯 Local Testing Workflow

### Full End-to-End Test

```bash
# Terminal 1: Start local server
cd /Users/trilliumsmith/code/calendar-merge-service
pnpm dev:server

# Terminal 2: Start ngrok
ngrok http 8080
# Note the URL: https://abc123.ngrok.io

# Terminal 3: Create watch
curl -X POST http://localhost:8080/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "115699614043593531056",
    "sourceCalendars": ["primary"],
    "targetCalendar": "trillium@hatsfabulous.com",
    "webhookUrl": "https://abc123.ngrok.io/webhook"
  }'

# Terminal 1: Watch logs
# You should see: "Watch created for calendar primary"

# In Google Calendar:
# 1. Create a new event
# 2. Or edit an existing event
# 3. Or delete an event

# Terminal 1: Watch for webhook
# You should see:
# "Webhook received: exists for channel <channelId>"
# "Syncing calendar events for channel <channelId>"

# Terminal 3: Stop watch when done
curl -X POST http://localhost:8080/api/sync/stop \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "115699614043593531056",
    "calendarId": "primary"
  }'
```

---

## 📋 Watch Channel Functions Reference

All functions are in `functions/calendar-sync/watch.ts`:

| Function | Purpose | Line |
|----------|---------|------|
| `createCalendarWatch()` | Create new watch | 21 |
| `renewCalendarWatch()` | Renew expiring watch | 84 |
| `stopCalendarWatch()` | Stop active watch | 120 |
| `createSyncCoordination()` | Round-robin sync setup | 144 |

---

## ⚠️ Important Notes

### Webhook Requirements

1. **Must be HTTPS** (not HTTP)
   - ngrok provides HTTPS by default
   - localhost.run provides HTTPS by default
   - Local HTTP won't work

2. **Must be publicly accessible**
   - Google servers need to reach your webhook
   - `localhost:8080` won't work (use ngrok)

3. **Must return 200 OK quickly**
   - Google expects response within seconds
   - Process events asynchronously after responding

### Watch Expiration

- Default: 7 days (CONFIG.WATCH_EXPIRATION_DAYS)
- Maximum: 7 days (Google Calendar limit)
- Must renew before expiration
- Cloud Scheduler handles auto-renewal in production

### Rate Limiting

- Creating watches: ~150ms delay between calls
- Respects Google Calendar API quota (10 req/sec)
- Implemented in watch.ts with RATE_LIMIT_DELAY_MS

---

## 🎓 Advanced: Testing Production Webhook Flow

To test the exact production flow locally:

```bash
# 1. Start local server
pnpm dev:server

# 2. Start ngrok with custom domain (if you have one)
ngrok http 8080 --domain=your-custom-domain.ngrok.app

# 3. Set environment variables
export WEBHOOK_URL="https://your-custom-domain.ngrok.app/webhook"
export BATCH_SYNC_URL="https://your-custom-domain.ngrok.app/batch-sync"

# 4. Run full setup flow
curl -X POST http://localhost:8080/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "sourceCalendars": ["primary", "work@gmail.com"],
    "targetCalendar": "unified@gmail.com"
  }'

# This will:
# - Create watches for both calendars
# - Set up round-robin sync coordination
# - Enqueue initial batch sync (but Cloud Tasks won't work locally)
# - Store everything in Firestore

# 5. Manually trigger batch sync (simulate Cloud Tasks)
curl -X POST http://localhost:8080/batch-sync \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'

# 6. Change calendar event and watch webhook logs
# Make change in Google Calendar -> Watch Terminal 1 for webhook

# 7. Clean up when done
curl -X POST http://localhost:8080/api/sync/stop \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'
```

---

## 🔧 Troubleshooting

### "Watch creation failed: invalid_grant"
- **Cause:** OAuth tokens expired
- **Fix:** Re-authenticate via Next.js UI

### "Webhook not received"
- **Cause:** ngrok URL changed or Google can't reach it
- **Check:** ngrok is still running, URL is correct
- **Fix:** Recreate watch with current ngrok URL

### "Watch expired"
- **Cause:** Watch older than 7 days
- **Fix:** Create new watch, old one is automatically deleted

### "Permission denied"
- **Cause:** Service account doesn't have calendar access
- **Fix:** Check IAM permissions in GCP Console

---

## 📚 Additional Resources

- **Google Calendar Push Notifications:** https://developers.google.com/calendar/api/guides/push
- **Watch Channel Documentation:** https://developers.google.com/calendar/api/v3/reference/events/watch
- **ngrok Documentation:** https://ngrok.com/docs
- **Your Code:** `functions/calendar-sync/watch.ts`

---

**Bottom Line:** Yes, you can fully test watch channels locally using ngrok or localhost.run to expose your local server to Google's webhooks. All create/renew/stop functions are available and working in your codebase.
