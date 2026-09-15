# Cloud Functions Teardown: Removing Old Infrastructure

## Overview

After successfully migrating to the consolidated `calendarSync` function, this guide walks through safely removing the old 5-function infrastructure.

## ⚠️ Prerequisites - DO NOT SKIP

**Before tearing down old infrastructure, verify:**

- [ ] New `calendarSync` function is deployed and healthy
- [ ] All endpoints tested and working (see MIGRATION_SINGLE_DEPLOY.md)
- [ ] Webhook notifications are being received at new URL
- [ ] Batch sync operations completing successfully
- [ ] Next.js app using new API endpoints
- [ ] Cloud Scheduler jobs updated (if applicable)
- [ ] At least 7 days have passed since deployment (allows watch migrations)
- [ ] Production traffic flowing through new function
- [ ] No errors in new function logs

**Recommended waiting period:** 7-14 days after successful migration

## Pre-Teardown Checklist

### 1. Verify New Function Health

```bash
# Set your function URL
FUNCTION_URL=$(gcloud functions describe calendarSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')

# Health check
curl $FUNCTION_URL/health

# Expected output:
# {"status":"healthy","timestamp":"2025-10-26T..."}
```

### 2. Check New Function Logs

```bash
# Review recent activity (should show webhook, batch sync, etc.)
gcloud functions logs read calendarSync --limit=50

# Check for errors
gcloud functions logs read calendarSync --limit=100 | grep -i error

# Verify all route types are being hit
gcloud functions logs read calendarSync --limit=100 | grep "POST /webhook"
gcloud functions logs read calendarSync --limit=100 | grep "POST /batch-sync"
gcloud functions logs read calendarSync --limit=100 | grep "POST /renew-watches"
```

### 3. Compare Invocation Counts

```bash
# Check if old functions are still receiving traffic
gcloud functions describe handleWebhook --region=$REGION --gen2 --format='value(serviceConfig.service)' | \
  xargs -I {} gcloud run services describe {} --region=$REGION --format='value(status.url)'

# If old functions show 0 invocations in Cloud Console for past week, safe to delete
```

### 4. Backup Current State

```bash
# Export old function configurations (for rollback reference)
mkdir -p ./backups/old-functions

gcloud functions describe handleWebhook --region=$REGION --gen2 > ./backups/old-functions/handleWebhook.yaml
gcloud functions describe batchSync --region=$REGION --gen2 > ./backups/old-functions/batchSync.yaml
gcloud functions describe renewWatches --region=$REGION --gen2 > ./backups/old-functions/renewWatches.yaml
gcloud functions describe triggerInitialSync --region=$REGION --gen2 > ./backups/old-functions/triggerInitialSync.yaml
gcloud functions describe api --region=$REGION --gen2 > ./backups/old-functions/api.yaml

echo "✅ Configurations backed up to ./backups/old-functions/"
```

## Teardown Steps

### Step 1: List All Functions

```bash
# Confirm what exists
gcloud functions list --gen2 --region=$REGION

# You should see:
# - calendarSync (NEW - keep this)
# - handleWebhook (OLD - delete)
# - batchSync (OLD - delete)
# - renewWatches (OLD - delete)
# - triggerInitialSync (OLD - delete)
# - api (OLD - delete)
```

### Step 2: Check for Dependencies

#### Cloud Scheduler Jobs

```bash
# List scheduler jobs
gcloud scheduler jobs list --location=$REGION

# Check if any reference old function URLs
gcloud scheduler jobs describe renewWatchesScheduler --location=$REGION 2>/dev/null | grep -i "handleWebhook\|batchSync\|renewWatches\|triggerInitialSync"
```

**If found:** Update them first before deleting functions (see Migration Updates below)

#### Firestore Trigger Dependencies

```bash
# Check if any functions have Firestore triggers
gcloud functions describe handleWebhook --region=$REGION --gen2 --format='value(eventTrigger)' 2>/dev/null
gcloud functions describe batchSync --region=$REGION --gen2 --format='value(eventTrigger)' 2>/dev/null
# etc.
```

**If found:** Ensure new function handles these triggers

#### IAM Bindings

```bash
# Check if service accounts reference old functions
gcloud projects get-iam-policy $PROJECT_ID --flatten="bindings[].members" \
  --filter="bindings.members:*handleWebhook*" --format="table(bindings.role)"
```

### Step 3: Delete Old Functions

**⚠️ This is irreversible. Ensure prerequisites are met.**

#### Option A: Delete Individually (Recommended)

Delete one at a time, testing between each deletion:

```bash
# Delete handleWebhook
echo "Deleting handleWebhook..."
gcloud functions delete handleWebhook --region=$REGION --gen2 --quiet

# Wait 5 minutes and check for issues
sleep 300

# Verify new function still working
curl $FUNCTION_URL/health

# If all good, continue with next function
echo "Deleting batchSync..."
gcloud functions delete batchSync --region=$REGION --gen2 --quiet

sleep 300

echo "Deleting renewWatches..."
gcloud functions delete renewWatches --region=$REGION --gen2 --quiet

sleep 300

echo "Deleting triggerInitialSync..."
gcloud functions delete triggerInitialSync --region=$REGION --gen2 --quiet

sleep 300

echo "Deleting api..."
gcloud functions delete api --region=$REGION --gen2 --quiet

echo "✅ All old functions deleted"
```

#### Option B: Delete All at Once (Faster, riskier)

```bash
# Delete all old functions in one command
for func in handleWebhook batchSync renewWatches triggerInitialSync api; do
  echo "Deleting $func..."
  gcloud functions delete $func --region=$REGION --gen2 --quiet &
done

wait

echo "✅ All old functions deleted"
```

### Step 4: Clean Up Cloud Run Services

Cloud Functions Gen2 creates Cloud Run services. Verify they're gone:

```bash
# List Cloud Run services
gcloud run services list --region=$REGION

# Should only show calendarSync service
# If old services remain, delete them:
gcloud run services delete handlewebhook --region=$REGION --quiet 2>/dev/null
gcloud run services delete batchsync --region=$REGION --quiet 2>/dev/null
gcloud run services delete renewwatches --region=$REGION --quiet 2>/dev/null
gcloud run services delete triggerinitalsync --region=$REGION --quiet 2>/dev/null
gcloud run services delete api --region=$REGION --quiet 2>/dev/null
```

### Step 5: Remove Old Deployment Scripts

```bash
# Move old deployment scripts to archive
mkdir -p ./scripts/deploy/archived

mv ./scripts/deploy/deploy-handleWebhook.sh ./scripts/deploy/archived/
mv ./scripts/deploy/deploy-batchSync.sh ./scripts/deploy/archived/
mv ./scripts/deploy/deploy-renewWatches.sh ./scripts/deploy/archived/
mv ./scripts/deploy/deploy-triggerInitialSync.sh ./scripts/deploy/archived/
mv ./scripts/deploy/deploy-api.sh ./scripts/deploy/archived/

echo "✅ Old deployment scripts archived"
```

### Step 6: Clean Up Environment Variables

Remove old URLs from `.env.gcp` (if any remain):

```bash
# The new deployment script should have already updated these
# But double-check and remove any old references

# Verify current URLs
grep -E "WEBHOOK_URL|BATCH_SYNC_URL|API_URL" .env.gcp

# They should all point to calendarSync routes
# Example:
# WEBHOOK_URL=https://.../calendarSync/webhook
# BATCH_SYNC_URL=https://.../calendarSync/batch-sync
# API_URL=https://.../calendarSync/api
```

### Step 7: Update Documentation

Update any references to old functions:

```bash
# Search for references in documentation
grep -r "handleWebhook" --include="*.md" .
grep -r "batchSync" --include="*.md" .
grep -r "renewWatches" --include="*.md" .
grep -r "triggerInitialSync" --include="*.md" .

# Update README, architecture docs, etc.
```

## Post-Teardown Verification

### 1. Function List

```bash
# Confirm only new function exists
gcloud functions list --gen2 --region=$REGION

# Expected output: Only calendarSync
```

### 2. Test All Endpoints

```bash
FUNCTION_URL=$(gcloud functions describe calendarSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')

# Health check
curl $FUNCTION_URL/health

# Webhook (simulated)
curl -X POST $FUNCTION_URL/webhook \
  -H "x-goog-channel-id: test" \
  -H "x-goog-resource-state: sync"

# Batch sync (requires auth)
curl -X POST $FUNCTION_URL/batch-sync \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}'

# Renew watches
curl -X POST $FUNCTION_URL/renew-watches

# API endpoints
curl -X POST $FUNCTION_URL/api/sync/pause \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "calendarId": "test@gmail.com"}'
```

### 3. Monitor Logs

```bash
# Check for errors after teardown
gcloud functions logs read calendarSync --limit=50

# Should show normal operation with no errors
```

### 4. Check Firestore

```bash
# Verify watches are being updated
gcloud firestore query watches --limit=5

# Check for any stale references to old function URLs
```

### 5. End-to-End Test

Perform a full user flow:
- [ ] User authenticates
- [ ] Calendar watch created (points to new webhook URL)
- [ ] Webhook receives notification
- [ ] Batch sync triggered
- [ ] Events synced successfully
- [ ] Control operations work (pause/resume)

## Migration Updates (If Not Done Already)

### Update Cloud Scheduler Jobs

```bash
# List jobs
gcloud scheduler jobs list --location=$REGION

# Update renewWatches job (example)
gcloud scheduler jobs update http renewWatchesScheduler \
  --location=$REGION \
  --uri="$FUNCTION_URL/renew-watches" \
  --http-method=POST

# Update any batch sync jobs
gcloud scheduler jobs update http batchSyncScheduler \
  --location=$REGION \
  --uri="$FUNCTION_URL/batch-sync" \
  --http-method=POST \
  --oidc-service-account-email=$SERVICE_ACCOUNT_EMAIL
```

### Update Vercel Environment Variables

```bash
# In Vercel dashboard or CLI
vercel env rm NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_API_URL production
# Enter: $FUNCTION_URL/api

# Redeploy Next.js app
cd nextjs
vercel --prod
```

### Update Firestore Watches Collection

If any watch documents reference old webhook URLs:

```bash
# Check for old URLs
gcloud firestore query watches --filter="webhookUrl:*handleWebhook*"

# If found, update them via script or manually
# They should point to: $FUNCTION_URL/webhook
```

## Cost Impact

### Before Teardown
- 6 Cloud Functions (5 old + 1 new) = ~$15-25/month
- Duplicated invocation costs
- Cold start overhead

### After Teardown
- 1 Cloud Function = ~$10-12/month
- **Estimated savings:** $5-13/month (~30-50% reduction)

### Detailed Cost Breakdown

| Resource | Before | After | Savings |
|----------|--------|-------|---------|
| Function instances | 6 × $0.40/month | 1 × $0.40/month | $2.00/month |
| Invocations (1M/month) | 6 × $0.40 | 1 × $0.40 | $2.00/month |
| Compute time | 6 × avg | 1 × avg (shared) | ~$3-8/month |
| Cold starts | 6 functions | 1 function | ~$1-3/month |
| **Total** | **~$15-25** | **~$10-12** | **~$5-13** |

## Rollback Procedure

If you need to restore old functions after teardown:

### 1. Redeploy from Backup Scripts

```bash
# Restore deployment scripts
cp ./scripts/deploy/archived/deploy-*.sh ./scripts/deploy/

# Redeploy old functions
./scripts/deploy/deploy-handleWebhook.sh
./scripts/deploy/deploy-batchSync.sh
./scripts/deploy/deploy-renewWatches.sh
./scripts/deploy/deploy-triggerInitialSync.sh
./scripts/deploy/deploy-api.sh
```

### 2. Restore Environment Variables

```bash
# Update .env.gcp with old URLs
# Get URLs from newly deployed functions
WEBHOOK_URL=$(gcloud functions describe handleWebhook --region=$REGION --gen2 --format='value(serviceConfig.uri)')
BATCH_SYNC_URL=$(gcloud functions describe batchSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')
API_URL=$(gcloud functions describe api --region=$REGION --gen2 --format='value(serviceConfig.uri)')

# Update .env.gcp
sed -i '' "s|WEBHOOK_URL=.*|WEBHOOK_URL=$WEBHOOK_URL|" .env.gcp
sed -i '' "s|BATCH_SYNC_URL=.*|BATCH_SYNC_URL=$BATCH_SYNC_URL|" .env.gcp
sed -i '' "s|API_URL=.*|API_URL=$API_URL|" .env.gcp
```

### 3. Update Vercel

```bash
vercel env rm NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_API_URL production
# Enter old API_URL

cd nextjs
vercel --prod
```

### 4. Delete New Function (Optional)

```bash
gcloud functions delete calendarSync --region=$REGION --gen2 --quiet
```

## What NOT to Delete

**Do not delete these resources:**

- ❌ Firestore database (`calendar-merge-service`)
- ❌ Firestore collections (`watches`, `event_mappings`, `tokens`)
- ❌ Service account (`calendar-sync-sa@...`)
- ❌ OAuth credentials (Google Cloud Console)
- ❌ Secret Manager secrets (`google-oauth-client-id`, `google-oauth-client-secret`)
- ❌ IAM roles and permissions
- ❌ Terraform state files
- ❌ `.env.gcp` file

**These are shared infrastructure used by the new function.**

## Troubleshooting

### Issue: "Function still receiving traffic"

**Symptom:** Old functions showing invocations after teardown attempt

**Solution:**
1. Check Cloud Scheduler jobs: `gcloud scheduler jobs list`
2. Check Firestore watches: `gcloud firestore query watches`
3. Update any references to old URLs
4. Wait 24 hours for DNS/cache propagation

### Issue: "Cannot delete function - permission denied"

**Symptom:** `gcloud functions delete` returns permission error

**Solution:**
```bash
# Check your current account
gcloud auth list

# Ensure you have the correct role
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:$(gcloud config get-value account)" \
  --format="table(bindings.role)"

# Need roles/cloudfunctions.admin or roles/owner
```

### Issue: "New function errors after old deletion"

**Symptom:** `calendarSync` shows errors after deleting old functions

**Solution:**
1. Check logs: `gcloud functions logs read calendarSync --limit=50`
2. Identify the error
3. If critical, rollback using procedure above
4. Fix issue in new function
5. Redeploy: `./scripts/deploy/deploy-calendar-sync.sh`

### Issue: "Webhooks not being received"

**Symptom:** No webhook notifications after teardown

**Solution:**
```bash
# Check watch documents in Firestore
gcloud firestore query watches --limit=10

# Verify webhookUrl field points to new function
# If not, renew watches:
curl -X POST $FUNCTION_URL/renew-watches

# Or manually update via Firestore console
```

## Cleanup Checklist

After completing all steps:

- [ ] Old functions deleted
- [ ] Old Cloud Run services removed
- [ ] Deployment scripts archived
- [ ] Environment variables updated
- [ ] Cloud Scheduler jobs point to new URLs
- [ ] Firestore watches use new webhook URL
- [ ] Vercel environment variables updated
- [ ] Next.js app redeployed
- [ ] All endpoints tested
- [ ] Logs show no errors
- [ ] Documentation updated
- [ ] 7+ days of monitoring completed
- [ ] Team notified of changes

## Final Verification

Run this comprehensive check:

```bash
#!/bin/bash
echo "🔍 Final Verification Checklist"
echo ""

echo "1. Checking function list..."
FUNCTIONS=$(gcloud functions list --gen2 --region=$REGION --format="value(name)")
if [ "$FUNCTIONS" = "calendarSync" ]; then
  echo "✅ Only calendarSync exists"
else
  echo "⚠️  Multiple functions found: $FUNCTIONS"
fi

echo ""
echo "2. Testing health endpoint..."
FUNCTION_URL=$(gcloud functions describe calendarSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')
HEALTH=$(curl -s $FUNCTION_URL/health | jq -r .status)
if [ "$HEALTH" = "healthy" ]; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
fi

echo ""
echo "3. Checking recent invocations..."
RECENT_LOGS=$(gcloud functions logs read calendarSync --limit=10 | wc -l)
if [ $RECENT_LOGS -gt 0 ]; then
  echo "✅ Function is receiving traffic ($RECENT_LOGS recent log entries)"
else
  echo "⚠️  No recent traffic"
fi

echo ""
echo "4. Checking for errors..."
ERROR_COUNT=$(gcloud functions logs read calendarSync --limit=100 | grep -i error | wc -l)
if [ $ERROR_COUNT -eq 0 ]; then
  echo "✅ No errors in recent logs"
else
  echo "⚠️  $ERROR_COUNT errors found in recent logs"
fi

echo ""
echo "✅ Teardown verification complete!"
```

## Summary

This teardown process:

1. **Safely removes** old infrastructure after verification
2. **Preserves** shared resources (Firestore, secrets, service accounts)
3. **Reduces costs** by 30-50%
4. **Simplifies** deployment and maintenance
5. **Includes** rollback procedures for safety

**Recommended timeline:**
- Day 0: Deploy new `calendarSync` function
- Day 1-7: Monitor and verify
- Day 7: Update Cloud Scheduler, renew watches
- Day 14: Execute teardown
- Day 15-21: Final monitoring

**Questions or issues?** Review logs and test each endpoint before proceeding with next deletion.
