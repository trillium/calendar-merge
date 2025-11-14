# Task 18: Final Production Deployment

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 2-3 hours
**Dependencies:** All previous tasks, successful integration testing

---

## Objective

Deploy the `/gcp` consolidated function to production and migrate from the old `functions/calendar-sync/` architecture.

## Why This Task?

- Complete the migration to the new architecture
- Retire old 5-function setup
- Update all dependent services
- Ensure zero downtime

## Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All unit tests pass: `pnpm test`
- [ ] TypeScript builds without errors: `pnpm build`
- [ ] Integration tests pass on staging
- [ ] Environment variables are set in `.env`
- [ ] OAuth credentials are configured
- [ ] Firestore is enabled and accessible
- [ ] GCP billing is enabled
- [ ] Service account has proper permissions

## Deployment Steps

### Step 1: Deploy to Production

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Ensure you're authenticated
gcloud auth login

# Set project
export GCP_PROJECT=your-production-project-id
export FUNCTION_REGION=us-central1

# Deploy
./deploy.sh
```

Expected output:
```
========================================
Calendar Merge Service - Deployment
========================================
Project: your-project-id
Region: us-central1
Function: calendarSync

Step 1: Building TypeScript...
✓ Build successful

Step 2: Deploying Cloud Function...
✓ Function deployed

Step 3: Getting function URL...
Function URL: https://us-central1-PROJECT.cloudfunctions.net/calendarSync

Step 4: Testing health endpoint...
✓ Health check passed

Step 5: Updating environment files...
✓ Updated ../.env.gcp

========================================
Deployment Complete!
========================================
```

### Step 2: Verify Deployment

```bash
# Get function URL
FUNCTION_URL=$(gcloud functions describe calendarSync --region=$FUNCTION_REGION --gen2 --format='value(serviceConfig.uri)')

# Test endpoints
curl $FUNCTION_URL/health
curl $FUNCTION_URL/
curl "$FUNCTION_URL/auth/init?userId=test"
```

All should return HTTP 200.

### Step 3: Update Vercel Environment Variables

The Next.js frontend needs to point to the new function URL:

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/nextjs

# Remove old variable
vercel env rm NEXT_PUBLIC_API_URL production

# Add new variable
vercel env add NEXT_PUBLIC_API_URL production
# When prompted, enter: https://us-central1-PROJECT.cloudfunctions.net/calendarSync

# Redeploy frontend
vercel --prod
```

### Step 4: Set Up Cloud Scheduler

Create periodic jobs for maintenance tasks:

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Create scheduler jobs
./scripts/create-scheduler-jobs.sh
```

This creates:
- `renewWatches` - Runs daily at 2 AM to renew expiring watch channels

### Step 5: Update Environment Variables

Set all required environment variables on the deployed function:

```bash
./scripts/set-env-vars.sh
```

### Step 6: Migrate Existing Data

If you have existing users/watches in Firestore from the old system:

```bash
# No migration needed - Firestore collections are the same
# Watches collection: compatible
# Users collection: compatible
# Event mappings: compatible (using composite keys)
```

The new code is **backward compatible** with existing data structures.

### Step 7: Test Production Function

Run integration tests against production:

```bash
export CLOUD_FUNCTION_URL=https://us-central1-PROJECT.cloudfunctions.net/calendarSync
./scripts/integration-test.sh
```

### Step 8: Monitor Logs

Watch for any errors in production:

```bash
# Stream logs in real-time
gcloud functions logs read calendarSync \
  --region=$FUNCTION_REGION \
  --gen2 \
  --limit=100 \
  --format="table(time_stamp, log)"

# Or use Cloud Logging Console
# https://console.cloud.google.com/logs
```

### Step 9: Test End-to-End with Real User

1. **OAuth Flow:**
   - Navigate to your frontend
   - Click "Connect Calendar"
   - Complete OAuth flow
   - Verify user is created in Firestore

2. **Calendar Syncing:**
   - Select calendars to sync
   - Create watches
   - Verify events appear in target calendar

3. **Airbnb Feature:**
   - Create test event with "Airbnb" in title
   - Trigger sync
   - Verify `__EVENT__` appears in target calendar description

4. **Webhook Handling:**
   - Modify an event in source calendar
   - Wait for webhook (usually instant)
   - Verify change syncs to target calendar

## Migration from Old Architecture

If you're migrating from the old 5-function setup:

### Delete Old Functions

**⚠️ Only do this after verifying the new function works!**

```bash
# List current functions
gcloud functions list --region=$FUNCTION_REGION

# Delete old functions (if they exist)
gcloud functions delete handleWebhook --region=$FUNCTION_REGION --gen2 --quiet
gcloud functions delete batchSync --region=$FUNCTION_REGION --gen2 --quiet
gcloud functions delete renewWatches --region=$FUNCTION_REGION --gen2 --quiet
gcloud functions delete triggerInitialSync --region=$FUNCTION_REGION --gen2 --quiet
gcloud functions delete api --region=$FUNCTION_REGION --gen2 --quiet
```

### Update Cloud Scheduler Jobs

If you had old scheduler jobs:

```bash
# List scheduler jobs
gcloud scheduler jobs list --location=$FUNCTION_REGION

# Delete old renewWatches job (if different)
gcloud scheduler jobs delete renewWatches --location=$FUNCTION_REGION --quiet

# Create new one (already done in Step 4)
```

### Archive Old Code

```bash
# Archive old functions/calendar-sync code
cd /Users/trilliumsmith/code/calendar-merge-service
mkdir -p archive
mv functions/calendar-sync archive/calendar-sync-$(date +%Y%m%d)

# Keep git history
git add .
git commit -m "Archive old function structure, migrate to /gcp"
```

## Post-Deployment Monitoring

### Day 1-3: Monitor Closely

```bash
# Check logs every few hours
gcloud functions logs read calendarSync --region=$FUNCTION_REGION --limit=100

# Check error rate
# Look for 500 errors in logs
# Verify webhook processing works
# Check sync completion rate
```

### Week 1: Monitor Metrics

In Cloud Console, check:
- Function invocations (should match webhook volume)
- Error rate (should be <1%)
- Execution time (should be <5s for webhooks)
- Memory usage (should be <256MB)
- Costs (should be 30-50% lower than 5-function setup)

## Rollback Plan

If issues arise, you can quickly rollback:

```bash
# Option 1: Redeploy previous version
cd /Users/trilliumsmith/code/calendar-merge-service/archive/calendar-sync-YYYYMMDD
# Deploy old functions

# Option 2: Revert code changes
git revert HEAD
cd gcp
./deploy.sh
```

## Success Criteria

- [ ] New function deploys successfully
- [ ] All integration tests pass
- [ ] Health endpoint returns 200
- [ ] OAuth flow works
- [ ] Calendar syncing works
- [ ] Webhooks are received and processed
- [ ] Airbnb events get `__EVENT__` marker
- [ ] Frontend connects successfully
- [ ] No errors in logs for 24 hours
- [ ] Old functions deleted (after 1 week of stability)
- [ ] Cost savings realized (check billing)

## Cost Comparison

Expected monthly costs:

**Old Architecture (5 functions):**
- Invocations: ~100K/month × 5 functions = 500K invocations
- Memory: 256MB × 5 functions
- Estimated: $15-20/month

**New Architecture (1 function):**
- Invocations: ~100K/month × 1 function = 100K invocations
- Memory: 512MB × 1 function (shared warm container)
- Estimated: $10-12/month

**Savings: 30-50%** ✅

## Final Checklist

- [ ] Production deployment complete
- [ ] Integration tests pass
- [ ] Vercel environment variables updated
- [ ] Cloud Scheduler configured
- [ ] End-to-end testing complete
- [ ] Monitoring in place
- [ ] Documentation updated
- [ ] Team notified
- [ ] Old functions deleted (after verification period)

## Completion

Congratulations! You've successfully migrated from the fragmented 5-function architecture to the consolidated `/gcp` structure with:

✅ **Better organization** - Routes, controllers, services pattern
✅ **Easier deployment** - Single command deploys everything
✅ **Lower costs** - 30-50% reduction
✅ **Better maintainability** - Clear separation of concerns
✅ **Airbnb feature** - Special event handling implemented
✅ **TypeScript throughout** - Type safety across the board

---

**Next Steps:**
- Monitor for 1 week
- Gather user feedback
- Plan additional features
- Consider adding more special event handlers (similar to Airbnb)
