# Testing Guide for /gcp

**Date:** 2025-11-13
**Status:** Ready for local testing

---

## Prerequisites Checklist

Before testing, ensure you have:

- [ ] ✅ **Build succeeds:** `pnpm build` completes without errors
- [ ] ✅ **Dependencies installed:** `pnpm install` completed
- [ ] ⚠️ **Environment variables configured:** `.env` file created
- [ ] ⚠️ **GCP credentials available:** Service account or gcloud auth
- [ ] ⚠️ **Firestore enabled:** Database exists in GCP project

---

## Step 1: Environment Configuration

### Create .env File

Copy and configure the `.env` file:

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# .env file already created, now edit it:
nano .env

# Or use your editor
code .env
```

### Required Variables (Update These!)

```bash
# GCP Project (REQUIRED)
GCP_PROJECT=your-actual-project-id
GCLOUD_PROJECT=your-actual-project-id

# Google OAuth (REQUIRED - get from Cloud Console)
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-actual-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Local Development
CLOUD_FUNCTION_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
PORT=8080
```

### Where to Get OAuth Credentials

1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your project
3. Create OAuth 2.0 Client ID (if not exists):
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback`
4. Copy Client ID and Client Secret to `.env`

---

## Step 2: GCP Authentication

The `/gcp` app needs to access Firestore. Set up authentication:

### Option 1: Application Default Credentials (Easiest)

```bash
# Login with gcloud
gcloud auth application-default login

# Set project
gcloud config set project YOUR_PROJECT_ID

# This creates credentials at:
# ~/.config/gcloud/application_default_credentials.json
```

### Option 2: Service Account (For CI/CD)

```bash
# Download service account key from GCP Console
# Save to: ~/gcp-service-account.json

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS=~/gcp-service-account.json
```

---

## Step 3: Verify Firestore is Ready

```bash
# Check if Firestore is enabled
gcloud firestore databases list --project=YOUR_PROJECT_ID

# Should show:
# NAME                  LOCATION_ID  TYPE
# (default)             us-central1  FIRESTORE_NATIVE
```

If not enabled:
```bash
gcloud firestore databases create --location=us-central1 --project=YOUR_PROJECT_ID
```

---

## Step 4: Build the Application

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Clean previous build
pnpm clean

# Build TypeScript
pnpm build

# Verify dist/ folder was created
ls -la dist/
```

Expected output:
```
dist/
├── config/
├── controllers/
├── db/
├── index.js         ← Main entry point
├── middleware/
├── routes/
├── services/
├── types/
└── utils/
```

---

## Step 5: Start Development Server

### Method 1: Using tsx (Recommended for Development)

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Start with hot reload
pnpm dev

# You should see:
# Server listening on port 8080
# Environment: development
# Cloud Function URL: http://localhost:8080
```

### Method 2: Using Node (Production-like)

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Build first
pnpm build

# Start from compiled code
pnpm start

# Server runs on http://localhost:8080
```

---

## Step 6: Test Endpoints

### Test 1: Health Check

```bash
# Test health endpoint
curl http://localhost:8080/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-11-13T...",
  "service": "calendar-merge-service"
}
```

### Test 2: Root Endpoint

```bash
curl http://localhost:8080/

# Expected response:
{
  "name": "Calendar Merge Service",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "webhook": "/webhook",
    "auth": "/auth/*",
    "calendars": "/calendars",
    "sync": "/sync/*"
  }
}
```

### Test 3: OAuth Flow (Start)

```bash
# Generate auth URL
curl "http://localhost:8080/auth/init?userId=test-user-123"

# Expected response:
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "random-state-string"
}
```

Open the `authUrl` in browser to test OAuth flow.

### Test 4: List Calendars (Requires Auth)

First, complete OAuth flow to get a userId, then:

```bash
# Replace with actual userId from OAuth
curl "http://localhost:8080/calendars?userId=YOUR_USER_ID"

# Expected response:
{
  "calendars": [
    {
      "id": "primary",
      "summary": "Primary Calendar",
      "primary": true
    },
    ...
  ]
}
```

---

## Step 7: Test with Firestore

### Check Database Connection

```bash
# Check if app can connect to Firestore
curl http://localhost:8080/health

# Watch server logs for:
# "Configuration validated successfully"
# "Initializing Firestore"
```

### Test Creating Data

Complete the OAuth flow, then:

```bash
# This creates a user in Firestore
curl "http://localhost:8080/auth/init?userId=test-123"

# Check Firestore Console:
# https://console.cloud.google.com/firestore/databases
# Should see: collections/users/test-123 (after OAuth completes)
```

---

## Step 8: Test Airbnb Feature

### Create a Test Event

1. Complete OAuth flow
2. Create watch for a calendar
3. Create test event in Google Calendar with "Airbnb" in title
4. Trigger sync
5. Check target calendar - description should have `__EVENT__`

### Manual Test Script

```bash
# 1. Complete OAuth (get userId)
curl "http://localhost:8080/auth/init?userId=test-user"
# Open authUrl in browser, complete flow

# 2. Create watch
curl -X POST http://localhost:8080/calendars/watch \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "calendarId": "primary",
    "targetCalendarId": "YOUR_TARGET_CALENDAR_ID"
  }'

# 3. Create Airbnb event in Google Calendar
# (manually in Google Calendar UI with "Airbnb" in title)

# 4. Trigger sync (webhook will fire automatically)
# Or manually trigger:
curl -X POST http://localhost:8080/webhook \
  -H "X-Goog-Channel-Id: YOUR_CHANNEL_ID" \
  -H "X-Goog-Resource-State: exists"

# 5. Check target calendar - event should have __EVENT__ in description
```

---

## Step 9: Run Tests (If Implemented)

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

---

## Common Issues & Solutions

### Issue 1: "Cannot find module" errors

**Solution:** Build the project first
```bash
pnpm build
```

### Issue 2: "Configuration validation failed"

**Solution:** Check .env file has all required variables
```bash
cat .env
# Verify GCP_PROJECT, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET are set
```

### Issue 3: "Firestore connection failed"

**Solution:** Authenticate with gcloud
```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### Issue 4: "OAuth redirect mismatch"

**Solution:** Update authorized redirect URIs in GCP Console
1. Go to: https://console.cloud.google.com/apis/credentials
2. Edit OAuth 2.0 Client
3. Add: `http://localhost:3000/api/auth/callback`

### Issue 5: "Port 8080 already in use"

**Solution:** Kill existing process or change port
```bash
# Kill process on 8080
lsof -ti:8080 | xargs kill

# Or change port in .env
PORT=8081
```

---

## Testing Checklist

### ✅ Basic Functionality
- [ ] Server starts without errors
- [ ] Health endpoint returns 200
- [ ] Root endpoint shows API info
- [ ] Configuration validates successfully

### ✅ OAuth Flow
- [ ] Auth URL generates correctly
- [ ] OAuth callback works
- [ ] User created in Firestore
- [ ] Tokens stored correctly

### ✅ Calendar Operations
- [ ] List calendars works (with auth)
- [ ] Create watch works
- [ ] Watch stored in Firestore

### ✅ Event Syncing
- [ ] Webhook endpoint receives notifications
- [ ] Events sync to target calendar
- [ ] Labels added: `[calendarName]`
- [ ] Privacy set to `private`
- [ ] **Airbnb events get `__EVENT__` marker**

### ✅ Database
- [ ] Firestore connection works
- [ ] Data persists correctly
- [ ] Collections created properly

---

## Environment Variables Reference

### Required Variables

```bash
GCP_PROJECT              # Your GCP project ID
GOOGLE_CLIENT_ID         # OAuth client ID
GOOGLE_CLIENT_SECRET     # OAuth client secret
GOOGLE_REDIRECT_URI      # OAuth redirect URI
CLOUD_FUNCTION_URL       # Function URL (http://localhost:8080 for dev)
FRONTEND_URL             # Frontend URL (where to redirect after OAuth)
```

### Optional Variables

```bash
NODE_ENV=development     # development | production | test
PORT=8080               # Server port
LOG_LEVEL=info          # debug | info | warn | error
BATCH_SIZE=10           # Events per batch sync
CORS_ORIGIN=*           # CORS allowed origins
FUNCTION_REGION=us-central1  # GCP region
```

---

## Next Steps

1. ✅ **Complete this testing guide** - Verify everything works locally
2. ✅ **Test Airbnb feature** - Ensure `__EVENT__` marker is added
3. ✅ **Test all endpoints** - Use integration test script
4. ⚠️ **Deploy to staging** - Test in GCP environment
5. ⚠️ **Deploy to production** - Follow Task 18

---

## Quick Start (TL;DR)

```bash
# 1. Setup
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
cp .env.example .env
nano .env  # Fill in your values

# 2. Authenticate
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# 3. Build & Run
pnpm build
pnpm dev

# 4. Test
curl http://localhost:8080/health
curl http://localhost:8080/
curl "http://localhost:8080/auth/init?userId=test"

# 5. Complete OAuth in browser
# 6. Test calendar operations
# 7. Create Airbnb event and verify __EVENT__ marker
```

---

## Success Criteria

After testing, you should have:

- ✅ Server running on http://localhost:8080
- ✅ All endpoints responding correctly
- ✅ OAuth flow working end-to-end
- ✅ Firestore connection working
- ✅ Events syncing correctly
- ✅ **Airbnb events have `__EVENT__` in description**
- ✅ No errors in logs
- ✅ Ready for deployment to GCP

**You're ready to deploy when all checkboxes above are checked!** 🚀
