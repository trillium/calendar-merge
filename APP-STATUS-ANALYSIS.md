# Calendar Merge Service - Status Analysis

**Date:** October 5, 2025  
**Analysis Performed By:** GitHub Copilot

## Executive Summary

The Calendar Merge Service consists of a Vite frontend (deployed on Vercel) and Google Cloud Functions backend. While the core infrastructure is deployed, several critical configuration issues prevent the app from being ready for user access.

## Architecture Overview

```
Frontend (Vercel) → Cloud Functions (GCP) → Firestore + Google Calendar API
     ↓                    ↓                           ↓
[Web Interface]    [OAuth + Sync Logic]      [Data Storage]
```

## Current Deployment Status

### ✅ Successfully Deployed Components

1. **Google Cloud Functions**

   - `handleWebhook` - Active at `https://handlewebhook-xdki5g6bya-uc.a.run.app`
   - `renewWatches` - Active at `https://renewwatches-xdki5g6bya-uc.a.run.app`
   - Region: us-central1
   - Environment: 2nd gen

2. **Vite Frontend**

   - Deployed on Vercel (confirmed by last command `vercel --prod`)
   - Built with Vite bundler
   - HTML/JS/CSS interface for OAuth flow and calendar selection

3. **Google Cloud Project**
   - Project ID: `calendar-merge-1759477062`
   - Service Account: `calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com`
   - Authentication: Active (trilliummassagela@gmail.com)

## Critical Issues Found

### ❌ Missing OAuth Functions

**Problem:** The deployed functions (`handleWebhook`, `renewWatches`) don't include the OAuth endpoints that the frontend expects.

**Expected endpoints missing:**

- `/oauth/start` - Initiates OAuth flow
- `/oauth/callback` - Handles OAuth callback
- `/setup` - Configures calendar sync

**Frontend expects:** `${API_URL}/oauth/start`, `${API_URL}/oauth/callback`, `${API_URL}/setup`

### ❌ API URL Configuration Mismatch

**Frontend configuration:**

```javascript
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
```

**Issues:**

1. Development env points to `http://localhost:3000` (local dev server)
2. No production environment variables configured for Vercel deployment
3. Frontend doesn't know about actual Cloud Function URLs

### ❌ OAuth Flow Architecture Problems

**Current OAuth Implementation Issues:**

1. **Token Storage Security Risk**

   ```typescript
   // Storing tokens in Firestore without encryption
   await firestore.collection('users').doc(userId).set({ tokens, ... });
   ```

2. **Weak User ID Generation**

   ```typescript
   function generateUserId(tokens: any): string {
     return Buffer.from(tokens.access_token || "")
       .toString("base64")
       .substring(0, 16);
   }
   ```

3. **Inefficient Token Lookup**
   ```typescript
   // Scans all users to find token - doesn't scale
   const usersSnapshot = await firestore.collection("users").get();
   ```

## Environment Variables Status

### Backend Environment Variables ✅

```bash
PROJECT_ID=calendar-merge-1759477062
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
WEBHOOK_URL=https://7cdc355f2be9.ngrok-free.app  # ⚠️ Using development webhook
```

### Frontend Environment Variables ❌

- Missing `VITE_API_URL` for production
- No environment-specific configuration for Vercel

## Google Cloud Console Configuration Status

### ⚠️ OAuth Configuration Concerns

**Redirect URIs:** Need verification that authorized redirect URIs in Google Cloud Console match:

- Vercel production URL
- Local development URLs

**Scopes:** Currently requesting:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

## Required Actions for User Readiness

### 1. Deploy Missing OAuth Functions

```bash
# Need to deploy functions with oauth endpoints
gcloud functions deploy oauth-start --entry-point=oauthStart
gcloud functions deploy oauth-callback --entry-point=oauthCallback
gcloud functions deploy setup --entry-point=setup
```

### 2. Configure Frontend API URL

```bash
# Set production API URL in Vercel
vercel env add VITE_API_URL
# Value should be the Cloud Function URL base
```

### 3. Fix OAuth Security Issues

- Implement proper user ID using Google's user info
- Encrypt tokens before storing in Firestore
- Add token expiration and refresh logic
- Implement proper authentication middleware

### 4. Update Google Cloud Console

- Verify authorized redirect URIs include Vercel domain
- Ensure OAuth consent screen is configured for production

### 5. Infrastructure Configuration

- Replace ngrok webhook URL with production Cloud Function URL
- Set up proper CORS configuration for production domains
- Configure Firestore security rules

## Development vs Production Gaps

| Component      | Development    | Production         | Status                |
| -------------- | -------------- | ------------------ | --------------------- |
| Frontend URL   | localhost:5173 | Vercel domain      | ❌ Not configured     |
| API URL        | localhost:3000 | Cloud Functions    | ❌ Missing            |
| Webhook URL    | ngrok tunnel   | Cloud Function     | ❌ Still using dev    |
| OAuth Redirect | localhost      | Vercel + localhost | ⚠️ Needs verification |

## Next Steps Priority

1. **High Priority:** Deploy OAuth functions (`oauth-start`, `oauth-callback`, `setup`)
2. **High Priority:** Configure `VITE_API_URL` in Vercel environment
3. **Medium Priority:** Fix OAuth security vulnerabilities
4. **Medium Priority:** Update webhook URL to production endpoint
5. **Low Priority:** Implement proper error handling and user feedback

## Testing Recommendations

Once fixes are implemented:

1. Test OAuth flow end-to-end
2. Verify calendar list loading
3. Test calendar sync setup
4. Validate webhook notifications
5. Test token refresh mechanism

## Security Considerations

- OAuth tokens stored in plaintext in Firestore
- No token expiration handling
- Weak user identification mechanism
- CORS configuration needs production domains
- No rate limiting on API endpoints

---

**Status:** ⚠️ **Not Ready for Users** - Critical configuration gaps prevent functionality
