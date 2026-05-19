# Local Development Quick Start - Full Stack

**Date:** 2025-11-13
**Architecture:** Next.js (Frontend) ↔ GCP Backend (API)

---

## 🚀 Start Both Servers

### Terminal 1: GCP Backend (API)

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp && pnpm dev
```

**Runs at:** http://localhost:8080
**Status:** ✅ Currently running

### Terminal 2: Next.js Frontend (UI)

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/nextjs && pnpm dev
```

**Runs at:** http://localhost:3000 (or configured port)

---

## ✅ Configuration Already Complete

Everything is already configured! Here's what was set up:

### GCP Backend (`/gcp/.env`)

```bash
✅ GCP_PROJECT=calendar-merge-1759477062
✅ GOOGLE_CLIENT_ID=262025806347-cib52r7rc0t7t82384k8ifdjcr9qb315.apps.googleusercontent.com
✅ GOOGLE_CLIENT_SECRET=REDACTED-CLIENT-SECRET
✅ CORS_ORIGIN=http://localhost:3000,http://localhost:13013
✅ PORT=8080
```

### Next.js Frontend (`/nextjs/.env.local`)

```bash
✅ NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
✅ GOOGLE_CLIENT_ID=262025806347-cib52r7rc0t7t82384k8ifdjcr9qb315.apps.googleusercontent.com
✅ GOOGLE_CLIENT_SECRET=REDACTED-CLIENT-SECRET
```

---

## 🧪 Test the Connection

### Method 1: Test Endpoint (Easiest)

With both servers running, visit:

```
http://localhost:3000/api/backend-test
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Successfully connected to GCP backend!",
  "backend": {
    "status": "ok",
    "timestamp": "...",
    "service": "calendar-sync"
  }
}
```

### Method 2: Browser Console

Open browser console at http://localhost:3000 and run:

```javascript
fetch("http://localhost:8080/health")
  .then((r) => r.json())
  .then(console.log);
```

### Method 3: Direct API Call

```bash
curl http://localhost:8080/health
```

---

## 📚 Using the GCP Backend from Next.js

A utility file has been created: `nextjs/app/lib/gcp-backend.ts`

### Example: In a Next.js API Route

```typescript
import { NextRequest, NextResponse } from "next/server";
import { gcpBackend } from "@/app/lib/gcp-backend";
import { getSession } from "@/app/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Call GCP backend
    const calendars = await gcpBackend.listCalendars(session.userId);
    return NextResponse.json(calendars);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Example: In a Server Component

```typescript
import { gcpBackend } from "@/app/lib/gcp-backend";

export default async function CalendarList({ userId }: { userId: string }) {
  const calendars = await gcpBackend.listCalendars(userId);

  return (
    <ul>
      {calendars.map((cal) => (
        <li key={cal.id}>{cal.summary}</li>
      ))}
    </ul>
  );
}
```

### Example: In a Client Component

```typescript
"use client";

import { useState, useEffect } from "react";

export default function CalendarList() {
  const [calendars, setCalendars] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8080/calendars/list?userId=YOUR_USER_ID")
      .then((r) => r.json())
      .then(setCalendars);
  }, []);

  return <ul>{/* render calendars */}</ul>;
}
```

---

## 🎯 Available Backend Methods

The `gcpBackend` utility provides these methods:

```typescript
// Health check
await gcpBackend.health();

// OAuth
await gcpBackend.startAuth(userId);
await gcpBackend.handleCallback(code, state);
await gcpBackend.revokeAuth(userId);

// Calendars
await gcpBackend.listCalendars(userId);

// Watch channels
await gcpBackend.createWatch({ userId, calendarId, targetCalendarId });
await gcpBackend.stopWatch(channelId);
await gcpBackend.pauseWatch(channelId);
await gcpBackend.resumeWatch(channelId);

// Sync
await gcpBackend.triggerSync({ userId, calendarId, targetCalendarId });
await gcpBackend.getSyncStatus(channelId);
```

---

## 🔄 OAuth Flow (Current Setup)

### Option A: Next.js Handles OAuth (Current - Simplest)

Keep your existing Next.js OAuth routes. They work fine!

**Workflow:**

1. User clicks "Login" → `/api/oauth/start`
2. Redirects to Google OAuth
3. Google redirects back → `/api/oauth/callback`
4. Next.js stores tokens in Firestore
5. Session created

**Then for calendar operations:**

```typescript
// Next.js API route calls GCP backend
const result = await gcpBackend.createWatch({
  userId: session.userId,
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",
});
```

### Option B: GCP Backend Handles OAuth (Future)

For full migration, update Next.js callback to forward to backend:

```typescript
// nextjs/app/api/oauth/callback/route.ts
export async function GET(req: NextRequest) {
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Forward to GCP backend
  const result = await gcpBackend.handleCallback(code, state);

  // Create session with result
  // ...
}
```

---

## 🎨 Airbnb Feature Testing

The Airbnb feature is **live in the GCP backend**. To test:

### Step 1: Create a Watch (using GCP backend)

```typescript
// In Next.js API route
const watch = await gcpBackend.createWatch({
  userId: "your-user-id",
  calendarId: "primary",
  targetCalendarId: "your-target-calendar@gmail.com",
});
```

### Step 2: Create Test Event in Google Calendar

1. Go to Google Calendar
2. Create event with "Airbnb" in the title
3. Save the event

### Step 3: Wait for Sync

The webhook will trigger automatically (if watch channel is active), or manually trigger:

```typescript
await gcpBackend.triggerSync({
  userId: "your-user-id",
  calendarId: "primary",
  targetCalendarId: "your-target-calendar@gmail.com",
});
```

### Step 4: Verify

Check your target calendar - the synced event should have `__EVENT__` in the description!

**Example:**

```
Original: "Airbnb checkin 3pm"
Synced:   "[primary] Airbnb checkin 3pm - busy"
Description: "__EVENT__\n\nOriginal description here"
```

---

## 🐛 Troubleshooting

### "Failed to connect to GCP backend"

**Check:**

1. Is GCP backend running? `curl http://localhost:8080/health`
2. Check terminal for errors
3. Restart GCP backend: `cd gcp && pnpm dev`

### "CORS error" in browser console

**Check:**

1. GCP backend `.env` has: `CORS_ORIGIN=http://localhost:3000,http://localhost:13013`
2. Server was restarted after changing CORS settings

### Next.js can't find `@/app/lib/gcp-backend`

**Fix:**

- File was created at: `nextjs/app/lib/gcp-backend.ts`
- Restart Next.js dev server

### OAuth redirects to wrong URL

**Current setup:** Next.js handles OAuth at `/api/oauth/callback`
**GCP backend:** Not used for OAuth yet (optional migration)

---

## 📊 Port Summary

| Service          | Port          | URL                   | Status         |
| ---------------- | ------------- | --------------------- | -------------- |
| GCP Backend      | 8080          | http://localhost:8080 | ✅ Running     |
| Next.js Frontend | 3000 or 13013 | http://localhost:3000 | Ready to start |

---

## 🎯 Next Steps

1. **Start Next.js:** `cd nextjs && pnpm dev`
2. **Test connection:** Visit http://localhost:3000/api/backend-test
3. **Update existing API routes** to use `gcpBackend` utility
4. **Test Airbnb feature** with real calendar events

---

## 📝 Summary

**What's ready:**

- ✅ GCP backend running on port 8080
- ✅ CORS configured for Next.js frontend
- ✅ Utility created (`gcpBackend`) for API calls
- ✅ Environment variables configured
- ✅ Test endpoint created (`/api/backend-test`)
- ✅ **Airbnb feature implemented and ready**

**What to do:**

1. Start Next.js: `cd nextjs && pnpm dev`
2. Test connection: http://localhost:3000/api/backend-test
3. Update your Next.js API routes to call `gcpBackend` methods
4. Test end-to-end with real calendar data

**You're ready to develop with the full stack!** 🚀
