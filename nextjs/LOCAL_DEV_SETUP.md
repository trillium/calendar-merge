# Local Development Setup - Next.js + GCP Backend

**Date:** 2025-11-13
**Architecture:** Next.js frontend → GCP backend (localhost:8080)

---

## 🏗️ Architecture

In local development, you'll run two servers:

1. **GCP Backend** (port 8080)
   - OAuth endpoints
   - Calendar sync logic
   - Firestore database
   - **Includes Airbnb feature**

2. **Next.js Frontend** (port 3000)
   - UI/Dashboard
   - Proxies API calls to GCP backend
   - Session management

---

## 🚀 Quick Start

### Terminal 1: Start GCP Backend
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
pnpm dev
```
**Runs at:** http://localhost:8080

### Terminal 2: Start Next.js Frontend
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/nextjs
pnpm dev
```
**Runs at:** http://localhost:3000 (or configured port)

---

## 🔧 Configuration Options

### Option 1: Simple Environment Variable (Easiest)

Update `nextjs/.env.local`:
```bash
# Backend URL for development
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080

# Keep existing OAuth credentials (used by backend)
GOOGLE_CLIENT_ID=262025806347-cib52r7rc0t7t82384k8ifdjcr9qb315.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

# Session secret
SESSION_SECRET="7wdOJhrLbLhHP3M+RoohS9VJJVCgeaNK+Tej3zxZm6A="

# Remove or comment out these (handled by GCP backend):
# WEBHOOK_URL=...
# BATCH_SYNC_URL=...
# TRIGGER_INITIAL_SYNC_URL=...
```

### Option 2: Next.js Rewrites (For API Proxying)

Update `nextjs/next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@google-cloud/tasks',
    '@google-cloud/firestore',
    'googleapis',
  ],

  // In development, proxy API calls to GCP backend
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/backend/:path*',
          destination: 'http://localhost:8080/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
```

Then in your Next.js code, call:
```typescript
// Instead of /api/oauth/start
fetch('/api/backend/auth/google')

// Instead of /api/calendars
fetch('/api/backend/calendars/list?userId=...')
```

---

## 🔄 OAuth Flow - Local Development

### Current Flow (Next.js handles OAuth)
```
User → Next.js (/api/oauth/start)
     → Google OAuth
     → Next.js callback (/api/oauth/callback)
     → Stores in Firestore
     → Session created
```

### New Flow (GCP backend handles OAuth)
```
User → Next.js UI
     → Frontend calls: /api/backend/auth/google
     → GCP Backend generates auth URL
     → User redirects to Google
     → Google redirects to: http://localhost:3000/auth/callback
     → Next.js receives callback
     → Next.js forwards to GCP: /api/backend/auth/google/callback
     → GCP stores in Firestore
     → Next.js creates session
```

---

## 📝 Implementation Steps

### Step 1: Update GCP Backend OAuth Redirect

The GCP backend needs to redirect OAuth callbacks to Next.js.

**File:** `gcp/.env`
```bash
# Change this to match Next.js frontend
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/callback
```

### Step 2: Create Next.js Callback Proxy

**File:** `nextjs/app/api/oauth/callback/route.ts`

Replace with:
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${error}`, req.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=no_code', req.url));
    }

    // Forward to GCP backend
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
    const response = await fetch(
      `${backendUrl}/auth/google/callback?code=${code}&state=${state}`
    );

    if (!response.ok) {
      return NextResponse.redirect(new URL('/?error=backend_failed', req.url));
    }

    // Backend returns redirect URL - follow it or create session
    const data = await response.json();

    // Create session (you can use iron-session as before)
    // ... session code here ...

    return NextResponse.redirect(new URL('/?success=true', req.url));
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/?error=oauth_failed', req.url));
  }
}
```

### Step 3: Update Next.js API Routes to Call Backend

**Example:** `nextjs/app/api/calendars/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/app/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

  try {
    const response = await fetch(
      `${backendUrl}/calendars/list?userId=${session.userId}`
    );

    if (!response.ok) {
      throw new Error('Backend request failed');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Calendar list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}
```

---

## 🎯 Simpler Alternative: Direct Frontend Calls

Instead of creating proxy routes, your Next.js frontend can call the GCP backend directly:

**File:** `nextjs/app/lib/api.ts` (create this)
```typescript
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export async function callBackend(endpoint: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

// Usage examples
export const api = {
  // OAuth
  startAuth: (userId: string) =>
    callBackend(`/auth/google?userId=${userId}`),

  // Calendars
  listCalendars: (userId: string) =>
    callBackend(`/calendars/list?userId=${userId}`),

  // Watch
  createWatch: (data: { userId: string; calendarId: string; targetCalendarId: string }) =>
    callBackend('/calendars/watch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
```

Then in your React components:
```typescript
import { api } from '@/app/lib/api';

// In your component
const calendars = await api.listCalendars(userId);
```

---

## 🔐 CORS Configuration

The GCP backend needs to allow requests from Next.js frontend.

**File:** `gcp/.env`
```bash
# Allow Next.js frontend
CORS_ORIGIN=http://localhost:3000
```

This is already configured in the GCP backend.

---

## ✅ Testing the Setup

### Test 1: Backend is Running
```bash
curl http://localhost:8080/health
# Should return: {"status":"ok",...}
```

### Test 2: Frontend Can Reach Backend
```bash
# In browser console (with Next.js running)
fetch('http://localhost:8080/health')
  .then(r => r.json())
  .then(console.log)
```

### Test 3: Full OAuth Flow
1. Start both servers
2. Go to http://localhost:3000
3. Click "Login" or "Connect Calendar"
4. Should redirect to Google OAuth
5. After authorizing, should return to Next.js
6. Next.js should forward to GCP backend
7. User should be logged in

---

## 📊 Port Summary

| Service | Port | URL |
|---------|------|-----|
| GCP Backend | 8080 | http://localhost:8080 |
| Next.js Frontend | 3000 | http://localhost:3000 |

---

## 🐛 Troubleshooting

### "CORS error" in browser
**Fix:** Check `gcp/.env` has `CORS_ORIGIN=http://localhost:3000`

### "Connection refused" from Next.js
**Fix:** Make sure GCP backend is running (`pnpm dev` in /gcp folder)

### OAuth redirect goes to wrong URL
**Fix:** Update `gcp/.env` with `GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/callback`

### Frontend and backend use different Firestore data
**Fix:** Both should use same GCP project. Check that both are authenticated:
```bash
gcloud auth application-default login
```

---

## 🎯 Recommended Setup for Testing

**Simplest approach:**

1. **Don't modify Next.js OAuth routes** - keep them as-is
2. **Use GCP backend only for calendar operations:**
   - List calendars
   - Create watches
   - Handle webhooks
   - Sync events (with Airbnb feature)

3. **Next.js handles:**
   - OAuth flow (already working)
   - Sessions
   - UI

4. **Create utility to call backend:**

**File:** `nextjs/app/lib/backend.ts`
```typescript
const BACKEND_URL = 'http://localhost:8080';

export async function callGcpBackend(endpoint: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  const response = await fetch(url, options);
  return response.json();
}
```

Then in your Next.js API routes:
```typescript
import { callGcpBackend } from '@/app/lib/backend';

// In /api/setup/route.ts or wherever you create watches
const result = await callGcpBackend('/calendars/watch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    calendarId,
    targetCalendarId,
  }),
});
```

This way:
- ✅ Minimal changes to Next.js
- ✅ OAuth still works
- ✅ Calendar sync uses GCP backend (with Airbnb feature)
- ✅ Easy to test

---

## 📝 Summary

**For local development:**

1. Run GCP backend: `cd gcp && pnpm dev` (port 8080)
2. Run Next.js: `cd nextjs && pnpm dev` (port 3000)
3. Next.js can call GCP backend at `http://localhost:8080`
4. Update CORS in GCP backend to allow Next.js origin

**OAuth can work two ways:**
- **Keep current:** Next.js handles OAuth (simpler for now)
- **Migrate:** GCP backend handles OAuth (better for production)

**Recommended:** Keep Next.js OAuth, but use GCP backend for all calendar operations. This lets you test the Airbnb feature immediately!
