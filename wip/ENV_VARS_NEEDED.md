# Environment Variables Needed by Each Cloud Function

## Common Variables (All Functions)
These should be set for **ALL** functions that interact with Google Calendar:

- `PROJECT_ID` - GCP project ID
- `GOOGLE_CLIENT_ID` - OAuth client ID (for authenticating with Google Calendar API)
- `GOOGLE_CLIENT_SECRET` - OAuth client secret (for refreshing tokens)

## Function-Specific Variables

### handleWebhook
**Currently set:** `PROJECT_ID`
**Missing:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Needs:**
```bash
--set-env-vars PROJECT_ID=$PROJECT_ID,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
```

### renewWatches
**Currently set:** `PROJECT_ID`
**Missing:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WEBHOOK_URL`

**Needs:**
```bash
--set-env-vars PROJECT_ID=$PROJECT_ID,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,WEBHOOK_URL=$WEBHOOK_URL
```

### triggerInitialSync
**Currently set:** `PROJECT_ID`
**Missing:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Needs:**
```bash
--set-env-vars PROJECT_ID=$PROJECT_ID,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
```

### batchSync
**Currently set:** All variables ✅

**Needs:**
```bash
--set-env-vars PROJECT_ID=$PROJECT_ID,PROJECT_NUMBER=$PROJECT_NUMBER,REGION=$REGION,BATCH_SYNC_URL=$BATCH_SYNC_URL,SERVICE_ACCOUNT_EMAIL=$SERVICE_ACCOUNT_EMAIL,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
```

### api
**Currently set:** `PROJECT_ID`
**Needs:** Likely just PROJECT_ID (gateway function, doesn't call Google APIs directly)

## Where These Variables Come From

Variables should be defined in `.env.gcp`:

```bash
# From GCP project
PROJECT_ID=calendar-merge-1759477062
PROJECT_NUMBER=<from terraform output>
REGION=us-central1
SERVICE_ACCOUNT_EMAIL=calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com

# From Google OAuth Console
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Function URLs (set after deployment)
WEBHOOK_URL=https://us-central1-calendar-merge-1759477062.cloudfunctions.net/handleWebhook
BATCH_SYNC_URL=https://us-central1-calendar-merge-1759477062.cloudfunctions.net/batchSync
```

## Action Items

Update these deployment scripts:
- [x] `deploy-batchSync.sh` - Already correct
- [ ] `deploy-handleWebhook.sh` - Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
- [ ] `deploy-renewWatches.sh` - Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, WEBHOOK_URL
- [ ] `deploy-triggerInitialSync.sh` - Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
