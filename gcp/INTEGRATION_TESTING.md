# Integration Testing Guide

This guide explains how to perform end-to-end integration testing of the Calendar Merge Service Cloud Function.

## Prerequisites

- Cloud Function deployed to GCP (see `deploy.sh`)
- `CLOUD_FUNCTION_URL` environment variable set
- Google Cloud CLI (`gcloud`) installed and configured
- `curl` installed

## Quick Start

```bash
# 1. Set function URL
export CLOUD_FUNCTION_URL="https://region-project.cloudfunctions.net/calendarSync"

# 2. Run automated tests
cd gcp
./scripts/integration-test.sh
```

## Automated Integration Tests

The `integration-test.sh` script tests all public endpoints without requiring authentication.

### Test Coverage

**Health & Info Tests**:
- `GET /health` - Health check endpoint
- `GET /` - Root endpoint with service info

**Authentication Tests**:
- `GET /auth/init` - OAuth initiation (no userId)
- `GET /auth/init?userId=test-123` - OAuth initiation (with userId)

**Calendar Tests**:
- `GET /calendars` - List calendars (should fail without auth)

**Sync Tests**:
- `GET /sync/status` - Sync status (should fail without params)
- `POST /sync/pause` - Pause sync (should fail without auth)
- `POST /sync/resume` - Resume sync (should fail without auth)

**Error Handling Tests**:
- `GET /nonexistent` - 404 handling
- `POST /sync/pause` with invalid JSON - 400 handling

### Expected Results

All tests should pass with:
- Health endpoints: 200 OK
- Protected endpoints without auth: 400 Bad Request or 501 Not Implemented
- Non-existent endpoints: 404 Not Found

## Manual Integration Tests

### 1. OAuth Flow Test

Test the complete OAuth authentication flow:

```bash
# Step 1: Get auth URL
FUNCTION_URL="your-function-url"
curl "$FUNCTION_URL/auth/init?userId=test-user-123"

# Expected Response:
# {
#   "authUrl": "https://accounts.google.com/...",
#   "state": "random-state-string"
# }
```

**Manual Steps**:
1. Copy the `authUrl` from the response
2. Open it in a browser
3. Complete Google OAuth consent
4. Should redirect to `FRONTEND_URL/auth/success?userId=test-user-123`

### 2. Calendar List Test

After completing OAuth, test calendar listing:

```bash
# Get userId from Firestore
# Then test calendar listing

curl "$FUNCTION_URL/calendars?userId=YOUR_USER_ID"

# Expected: Array of calendar objects
# [
#   {
#     "id": "primary",
#     "summary": "Your Calendar",
#     ...
#   }
# ]
```

### 3. Watch Creation Test

Test creating a watch channel:

```bash
curl -X POST "$FUNCTION_URL/calendars/watch" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "calendarId": "primary",
    "targetCalendarId": "YOUR_TARGET_CALENDAR_ID"
  }'

# Expected Response:
# {
#   "success": true,
#   "channelId": "uuid-v4-string",
#   "expiration": "2025-11-20T..."
# }
```

**Verification**:
- Check Firestore `watches` collection for new entry
- Verify webhook URL in watch document

### 4. Webhook Test

Simulate a webhook notification from Google:

```bash
curl -X POST "$FUNCTION_URL/webhook" \
  -H "X-Goog-Channel-Id: test-channel-123" \
  -H "X-Goog-Resource-State: exists" \
  -H "X-Goog-Resource-Id: resource-123"

# Expected: HTTP 200 OK
```

**Note**: For actual webhook testing, create a real watch and modify events in Google Calendar.

### 5. Batch Sync Test

Trigger a batch sync operation:

```bash
curl -X POST "$FUNCTION_URL/batch-sync" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID"}'

# Expected Response:
# {
#   "success": true,
#   "eventsProcessed": 42,
#   "calendarsProcessed": 3
# }
```

## Testing the Airbnb Feature

The Airbnb feature adds a `__EVENT__` marker to event descriptions for Airbnb-related events.

### Test Setup

1. **Create Test Event**:
   - Go to Google Calendar
   - Create an event with "Airbnb" in the title
   - OR invite an attendee with "airbnb" in their email

2. **Create Watch**:
   ```bash
   curl -X POST "$FUNCTION_URL/calendars/watch" \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "YOUR_USER_ID",
       "calendarId": "primary",
       "targetCalendarId": "YOUR_TARGET_CALENDAR_ID"
     }'
   ```

3. **Trigger Sync**:
   - Modify the Airbnb event (change time, description, etc.)
   - Google will send webhook notification
   - OR trigger batch sync manually

4. **Verify**:
   - Check target calendar
   - Event description should start with `__EVENT__`
   - If event had existing description: `__EVENT__\n\n<original description>`
   - If no description: just `__EVENT__`

### Verification Query

```bash
# Get event from target calendar
curl "$FUNCTION_URL/calendars/events?calendarId=TARGET_CALENDAR_ID&eventId=EVENT_ID&userId=USER_ID"

# Check description field for __EVENT__ marker
```

## Troubleshooting

### Function Returns 500 Errors

```bash
# Check function logs
gcloud functions logs read calendarSync \
  --region=us-central1 \
  --limit=50

# Look for stack traces and error messages
```

### Authentication Fails

```bash
# Verify environment variables
gcloud functions describe calendarSync \
  --region=us-central1 \
  --gen2 \
  --format='value(serviceConfig.environmentVariables)'

# Should show:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - GOOGLE_REDIRECT_URI
# - FRONTEND_URL
```

### Webhook Not Receiving Notifications

**Common Issues**:
1. Watch not created properly - check Firestore `watches` collection
2. Webhook URL incorrect - verify in watch document
3. Watch expired - Google watches expire after 7 days
4. Google unable to reach webhook - check function is deployed and accessible

**Debug Steps**:
```bash
# 1. List active watches in Firestore
# Use Firebase Console or gcloud

# 2. Check function is accessible
curl "$FUNCTION_URL/health"

# 3. Check function logs for webhook requests
gcloud functions logs read calendarSync \
  --region=us-central1 \
  --limit=50 | grep webhook
```

### Database Errors

```bash
# Verify Firestore is enabled
gcloud firestore databases list --project=YOUR_PROJECT_ID

# Check service account permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID

# Service account should have:
# - roles/datastore.user (for Firestore)
```

### Rate Limiting Errors

If you see 429 (Too Many Requests) from Google Calendar API:

- Rate limit: 1,000,000 queries/day (free tier)
- Quota per user per 100 seconds: 500 queries
- Solution: Function includes 150ms delay between API calls

**Check quota usage**:
```bash
# Google Cloud Console > APIs & Services > Dashboard
# Look for Calendar API usage
```

## Performance Testing

### Load Test

Test function performance under load:

```bash
# Install Apache Bench (ab)
# macOS: brew install httpd

# Test health endpoint (100 requests, 10 concurrent)
ab -n 100 -c 10 "$FUNCTION_URL/health"

# Expected:
# - Time per request: < 500ms
# - Failed requests: 0
```

### Cold Start Test

Test function cold start performance:

```bash
# Wait for function to scale to zero (5-15 minutes)
# Then make first request

time curl "$FUNCTION_URL/health"

# Expected:
# - First request (cold start): 1-3 seconds
# - Subsequent requests (warm): 100-300ms
```

## Monitoring

### View Logs in Real-Time

```bash
gcloud functions logs tail calendarSync \
  --region=us-central1
```

### Check Function Metrics

```bash
# Request count
gcloud functions describe calendarSync \
  --region=us-central1 \
  --gen2 \
  --format='value(serviceConfig.revision)'

# View in Cloud Console:
# Cloud Functions > calendarSync > Metrics
```

## Validation Checklist

Before considering integration testing complete:

- [ ] Health endpoint returns 200 with correct response
- [ ] Root endpoint returns service info
- [ ] Auth init generates valid OAuth URL
- [ ] Error responses have proper status codes (400, 404, 500, 501)
- [ ] Integration test script runs successfully (all tests pass)
- [ ] OAuth flow completes successfully in browser
- [ ] Calendar listing works with valid auth
- [ ] Watch creation creates entry in Firestore
- [ ] Webhook handling responds with 200
- [ ] Batch sync processes events correctly
- [ ] Airbnb events get `__EVENT__` marker in description
- [ ] Function logs show no errors during normal operations
- [ ] Environment variables are set correctly
- [ ] Function scales to zero when idle (cost optimization)

## Continuous Integration

### CI Pipeline Integration

Add integration tests to CI/CD:

```yaml
# .github/workflows/deploy.yml (example)
- name: Deploy to GCP
  run: cd gcp && ./deploy.sh

- name: Run Integration Tests
  env:
    CLOUD_FUNCTION_URL: ${{ secrets.CLOUD_FUNCTION_URL }}
  run: cd gcp && ./scripts/integration-test.sh
```

### Pre-Production Testing

Before deploying to production:

1. Deploy to staging environment
2. Run full integration test suite
3. Manually test OAuth flow
4. Test webhook with real Google Calendar
5. Verify Airbnb feature works
6. Monitor logs for 24 hours
7. Check no errors or warnings
8. Deploy to production

## Cost Monitoring

Monitor costs during testing:

```bash
# Check current month costs
gcloud billing accounts list

# View detailed billing
# Cloud Console > Billing > Reports
```

**Expected Free Tier Usage**:
- Cloud Functions: 2M invocations/month free
- Firestore: 50K reads, 20K writes/day free
- Cloud Logging: 50 GB/month free

## Next Steps

After integration testing is complete:

1. Review Task 18 (Final Deployment) - EVEN task
2. Monitor production deployment
3. Set up alerts for errors
4. Configure Cloud Monitoring dashboards
5. Plan regular testing schedule

## Notes

- Integration tests verify the entire stack works together
- Always test in staging before production
- Keep CLOUD_FUNCTION_URL in environment variables, never hardcode
- Monitor Cloud Logging during and after tests
- Re-run integration tests after any deployment
- Set up monitoring alerts for production issues
