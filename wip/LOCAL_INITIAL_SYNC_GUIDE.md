# Local Initial Sync with GCP Handoff Strategy

**Strategy:** Run compute-intensive initial sync locally, then hand off to GCP for ongoing incremental updates.

---

## 🎯 Why This Makes Sense

### The Problem with Cloud Functions for Initial Sync

**Initial sync is compute-intensive:**
- Large calendar: 500 events × 150ms delay = ~90 seconds compute time
- Timeout risk: Long syncs may hit 540s (9 min) limit
- Cold start overhead for each batch
- Uses significant Cloud Function resources

**Incremental updates are lightweight:**
- Typical webhook: 1-5 events changed
- Processing time: <1 second
- Perfect fit for serverless architecture

### The Solution: Hybrid Approach

```
┌─────────────────────────────────────────┐
│  1. INITIAL SYNC (Local)                │
│  - Run on your machine                  │
│  - No timeouts                           │
│  - Full visibility/debugging             │
│  - One-time operation per calendar       │
└─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────┐
│  2. CREATE WATCH (Local → GCP)          │
│  - Point webhook to GCP function        │
│  - Store in Firestore                   │
└─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────┐
│  3. ONGOING UPDATES (GCP)               │
│  - Webhooks trigger incremental sync    │
│  - Fast, serverless                     │
│  - Scales automatically                 │
└─────────────────────────────────────────┘
```

---

## 🚀 Implementation Strategy

### Option 1: Complete Local Sync, Then Create Watch (Recommended)

**Best for:** Clean separation, full control over initial sync process

```typescript
// scripts/local-initial-sync.ts

import { google } from 'googleapis';
import { Firestore } from '@google-cloud/firestore';
import { getAuthClient } from '../functions/calendar-sync/auth';
import { syncEvent } from '../functions/calendar-sync/sync';
import { createCalendarWatch } from '../functions/calendar-sync/watch';

const firestore = new Firestore();

async function localInitialSync(
  userId: string,
  sourceCalendars: string[],
  targetCalendar: string
) {
  console.log('🚀 Starting LOCAL initial sync');
  console.log(`User: ${userId}`);
  console.log(`Source calendars: ${sourceCalendars.join(', ')}`);
  console.log(`Target calendar: ${targetCalendar}\n`);

  const auth = await getAuthClient(userId);
  const calendar = google.calendar({ version: 'v3', auth });

  // Phase 1: Sync all events locally
  for (const calendarId of sourceCalendars) {
    console.log(`\n📅 Syncing calendar: ${calendarId}`);

    const timeMax = new Date();
    timeMax.setFullYear(timeMax.getFullYear() + 2);

    let pageToken: string | undefined;
    let totalEvents = 0;

    do {
      // Fetch batch of events
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 50,
        pageToken,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      console.log(`  Batch: ${events.length} events`);

      // Sync each event
      for (const event of events) {
        await syncEvent(
          userId,
          calendarId,
          event.id!,
          targetCalendar,
          event
        );
        totalEvents++;

        // Rate limiting (optional locally, but polite)
        await sleep(100);
      }

      pageToken = response.data.nextPageToken || undefined;
      console.log(`  Progress: ${totalEvents} events synced`);

    } while (pageToken);

    console.log(`✅ Calendar ${calendarId} complete: ${totalEvents} events`);
  }

  console.log('\n🎉 LOCAL sync complete!\n');

  // Phase 2: Create watch channels pointing to GCP
  console.log('📡 Creating watch channels (pointing to GCP)...\n');

  const gcpWebhookUrl = process.env.WEBHOOK_URL ||
    'https://calendarsync-262025806347.us-central1.run.app/webhook';

  const channelIds: string[] = [];

  for (const calendarId of sourceCalendars) {
    console.log(`  Creating watch for ${calendarId}...`);

    const channelId = await createCalendarWatch(
      userId,
      calendarId,
      gcpWebhookUrl,
      targetCalendar
    );

    channelIds.push(channelId);

    // Mark sync as complete (no batch sync needed)
    await firestore.collection('watches').doc(channelId).update({
      'syncState.status': 'complete',
      'syncState.eventsSynced': 0, // Already synced locally
      'syncState.pageToken': null,
    });

    console.log(`  ✅ Watch created: ${channelId}`);
  }

  console.log('\n✅ All watches created and pointing to GCP!');
  console.log('\n🎯 Setup complete:');
  console.log('  - Initial sync: Done locally');
  console.log('  - Ongoing updates: Will use GCP webhooks');
  console.log(`  - Webhook URL: ${gcpWebhookUrl}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Usage
const userId = process.argv[2];
const sourceCalendars = process.argv.slice(3, -1);
const targetCalendar = process.argv[process.argv.length - 1];

if (!userId || sourceCalendars.length === 0 || !targetCalendar) {
  console.error('Usage: ts-node scripts/local-initial-sync.ts <userId> <source1> [source2...] <target>');
  console.error('Example: ts-node scripts/local-initial-sync.ts 12345 primary work@gmail.com unified@gmail.com');
  process.exit(1);
}

localInitialSync(userId, sourceCalendars, targetCalendar)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
```

**Usage:**
```bash
# 1. Ensure you have OAuth tokens in Firestore for the user
# 2. Run the script
ts-node scripts/local-initial-sync.ts \
  115699614043593531056 \
  primary \
  work@gmail.com \
  unified@gmail.com

# Output:
# 🚀 Starting LOCAL initial sync
# 📅 Syncing calendar: primary
#   Batch: 50 events
#   Progress: 50 events synced
#   Batch: 50 events
#   Progress: 100 events synced
# ✅ Calendar primary complete: 150 events
# ...
# 📡 Creating watch channels (pointing to GCP)...
# ✅ All watches created and pointing to GCP!
```

---

### Option 2: Hybrid - Initial Batch Local, Ongoing via GCP

**Best for:** Test locally first, then let GCP finish if interrupted

```typescript
// Similar to above, but:
// 1. Sync first batch locally (verify it works)
// 2. Create watch with syncState.status = 'syncing'
// 3. Let GCP batchSync continue from pageToken

async function hybridInitialSync(
  userId: string,
  sourceCalendars: string[],
  targetCalendar: string
) {
  // Phase 1: Sync FIRST batch locally (proof of concept)
  for (const calendarId of sourceCalendars) {
    console.log(`Syncing first batch of ${calendarId}...`);

    const response = await calendar.events.list({
      calendarId,
      maxResults: 50,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    for (const event of events) {
      await syncEvent(userId, calendarId, event.id!, targetCalendar, event);
    }

    console.log(`✅ First 50 events synced locally`);

    // Phase 2: Create watch and let GCP continue
    const channelId = await createCalendarWatch(
      userId,
      calendarId,
      gcpWebhookUrl,
      targetCalendar
    );

    // Mark as partially synced
    await firestore.collection('watches').doc(channelId).update({
      'syncState.status': 'syncing',
      'syncState.pageToken': response.data.nextPageToken || null,
      'syncState.eventsSynced': events.length,
    });

    console.log(`✅ Watch created, GCP will continue from page token`);
  }
}
```

---

### Option 3: Skip Initial Sync Entirely (Incremental Only)

**Best for:** New users, only future events matter

```typescript
async function skipInitialSync(
  userId: string,
  sourceCalendars: string[],
  targetCalendar: string
) {
  console.log('⏩ Skipping initial sync, only watching future changes');

  const gcpWebhookUrl = process.env.WEBHOOK_URL!;

  for (const calendarId of sourceCalendars) {
    const channelId = await createCalendarWatch(
      userId,
      calendarId,
      gcpWebhookUrl,
      targetCalendar
    );

    // Mark as complete (no historical sync)
    await firestore.collection('watches').doc(channelId).update({
      'syncState.status': 'complete',
      'syncState.eventsSynced': 0,
    });

    console.log(`✅ Watch created for ${calendarId} (incremental only)`);
  }
}
```

---

## 🛠️ Setup Instructions

### 1. Create Local Sync Script

```bash
# Create the script
cat > scripts/local-initial-sync.ts << 'EOF'
[paste the Option 1 code above]
EOF

# Make it executable
chmod +x scripts/local-initial-sync.ts
```

### 2. Add npm Script

Edit `package.json`:
```json
{
  "scripts": {
    "sync:local": "ts-node scripts/local-initial-sync.ts"
  }
}
```

### 3. Set Environment Variables

```bash
# .env.local (for local development)
WEBHOOK_URL=https://calendarsync-262025806347.us-central1.run.app/webhook
PROJECT_ID=calendar-merge-1759477062
```

### 4. Run Local Initial Sync

```bash
# Get user ID from Firestore (or from your auth flow)
USER_ID="115699614043593531056"

# Run local sync
pnpm sync:local $USER_ID primary work@gmail.com unified@gmail.com

# Or directly with ts-node
ts-node scripts/local-initial-sync.ts \
  $USER_ID \
  primary \
  work@gmail.com \
  unified@gmail.com
```

---

## 🎯 Best Practice Workflow

### For Development/Testing

```bash
# 1. Sync locally (fast debugging)
pnpm sync:local $USER_ID primary target@gmail.com

# 2. Test watch creation locally with ngrok
ngrok http 8080
# Use ngrok URL in watch creation

# 3. When ready, point watches to GCP
# Edit the watch webhook URL in Firestore
```

### For Production

```bash
# Option A: All local initial sync
pnpm sync:local $USER_ID cal1 cal2 cal3 target@gmail.com

# Option B: Let Next.js trigger it
# In nextjs/app/api/setup/route.ts:
// - Add option to skip batch sync
// - Just create watches pointing to GCP
// - User manually runs local sync if needed
```

---

## 🔄 Modified Setup Flow (Next.js)

Update `nextjs/app/api/setup/route.ts`:

```typescript
export async function POST(request: Request) {
  const { userId, sourceCalendars, targetCalendar, skipInitialSync } = await request.json();

  // Create watches
  const channelIds = [];
  for (const calendarId of sourceCalendars) {
    const channelId = await createCalendarWatch(
      userId,
      calendarId,
      process.env.WEBHOOK_URL!,
      targetCalendar
    );
    channelIds.push(channelId);
  }

  if (skipInitialSync) {
    // User will run local sync manually
    // Mark watches as complete (no GCP batch sync)
    for (const channelId of channelIds) {
      await firestore.collection('watches').doc(channelId).update({
        'syncState.status': 'complete',
        'syncState.eventsSynced': 0,
      });
    }

    return Response.json({
      success: true,
      message: 'Watches created. Run local sync script to import historical events.',
      channelIds,
    });
  } else {
    // Original behavior: trigger GCP batch sync
    await createSyncCoordination(userId, channelIds);
    await enqueueBatchSync(userId, 5);

    return Response.json({
      success: true,
      message: 'Watches created. Initial sync starting on GCP.',
      channelIds,
    });
  }
}
```

Frontend UI:

```tsx
// In SetupWizard.tsx
<Checkbox
  checked={skipInitialSync}
  onCheckedChange={setSkipInitialSync}
>
  Skip initial sync (I'll run it locally)
</Checkbox>

{skipInitialSync && (
  <Alert>
    <InfoIcon />
    <AlertTitle>Local Sync Required</AlertTitle>
    <AlertDescription>
      After setup, run: <Code>pnpm sync:local {userId} {sourceCalendars.join(' ')} {targetCalendar}</Code>
    </AlertDescription>
  </Alert>
)}
```

---

## ⚡ Advanced: Parallel Local Sync

For faster local processing:

```typescript
async function parallelLocalSync(
  userId: string,
  sourceCalendars: string[],
  targetCalendar: string
) {
  // Sync all calendars in parallel (use your full CPU)
  await Promise.all(
    sourceCalendars.map(calendarId =>
      syncCalendarLocally(userId, calendarId, targetCalendar)
    )
  );

  // Then create watches
  const channelIds = await Promise.all(
    sourceCalendars.map(calendarId =>
      createCalendarWatch(userId, calendarId, gcpWebhookUrl, targetCalendar)
    )
  );

  console.log('✅ All calendars synced and watches created!');
}
```

---

## 🎉 Summary

### Yes, You Can Do This!

**Local Initial Sync:**
- ✅ Run on your machine
- ✅ No timeouts
- ✅ Full debugging visibility
- ✅ Faster (no cold starts)

**GCP Handoff:**
- ✅ Create watch channels pointing to GCP
- ✅ Mark sync as complete in Firestore
- ✅ GCP handles ongoing webhooks
- ✅ Scalable serverless architecture

**Best of Both Worlds:**
- ⚡ Better performance (local is faster)
- 🔧 Easier debugging (see everything locally)
- 🚀 Production-ready ongoing sync (GCP serverless)
- 💪 More control over the initial sync process

---

## 📝 Next Steps

1. Create `scripts/local-initial-sync.ts` (use Option 1 code)
2. Add `pnpm sync:local` to package.json
3. Test with your calendar
4. Optionally add UI toggle in Next.js for "skip initial sync"
5. Enjoy streamlined initial syncs! 🎊

---

**This is actually a very smart optimization!** You get the best of both worlds: local compute control for the compute-intensive one-time sync, and scalable serverless GCP for ongoing incremental updates.
