# Task 17: Integration Testing

**Status:** Not Started
**Priority:** High
**Estimated Time:** 2-3 hours
**Dependencies:** Task 15 (Deployment), Task 16 (Tests)

---

## Objective

Perform end-to-end integration testing of the deployed Cloud Function to ensure all components work together correctly.

## Why This Task?

- Verify deployment is successful
- Test all API endpoints with real data
- Ensure OAuth flow works
- Validate webhook handling
- Catch integration issues before production

## Testing Checklist

### Pre-Deployment Tests

Before deploying to production, test locally:

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# 1. Run unit tests
pnpm test

# 2. Build the project
pnpm build

# 3. Start local dev server
pnpm dev

# In another terminal:

# 4. Test health endpoint
curl http://localhost:8080/health

# Expected: {"status":"healthy",...}

# 5. Test root endpoint
curl http://localhost:8080/

# Expected: {"name":"Calendar Merge Service",...}
```

### Post-Deployment Tests

After deploying to GCP, run these tests:

## Test Script

Create an integration test script:

**File:** `gcp/scripts/integration-test.sh`

```bash
#!/bin/bash

# Integration testing script for deployed Cloud Function

set -e

# Get function URL
FUNCTION_URL="${CLOUD_FUNCTION_URL:-}"

if [ -z "$FUNCTION_URL" ]; then
    echo "Error: CLOUD_FUNCTION_URL not set"
    echo "Run: export CLOUD_FUNCTION_URL=https://your-function-url"
    exit 1
fi

echo "Testing Cloud Function: $FUNCTION_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name=$1
    local method=$2
    local path=$3
    local expected_code=$4
    local data=$5

    echo -n "Testing $name... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$FUNCTION_URL$path")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$FUNCTION_URL$path")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_code, got $http_code)"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== Health & Info Tests ==="
test_endpoint "Health check" "GET" "/health" "200"
test_endpoint "Root endpoint" "GET" "/" "200"
echo ""

echo "=== Authentication Tests ==="
test_endpoint "Auth init (no userId)" "GET" "/auth/init" "200"
test_endpoint "Auth init (with userId)" "GET" "/auth/init?userId=test-123" "200"
echo ""

echo "=== Calendar Tests ==="
# These will fail without valid authentication, but should return proper error codes
test_endpoint "List calendars (no userId)" "GET" "/calendars" "400"
echo ""

echo "=== Sync Tests ==="
test_endpoint "Sync status (no userId)" "GET" "/sync/status" "400"
test_endpoint "Pause sync (no channelId)" "POST" "/sync/pause" "400" '{}'
test_endpoint "Resume sync (no channelId)" "POST" "/sync/resume" "400" '{}'
echo ""

echo "=== Error Handling Tests ==="
test_endpoint "404 Not Found" "GET" "/nonexistent" "404"
test_endpoint "Invalid JSON body" "POST" "/sync/pause" "400" 'invalid-json'
echo ""

# Summary
echo "========================================="
echo "Test Results:"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "========================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
```

Make executable:
```bash
chmod +x gcp/scripts/integration-test.sh
```

### Manual Integration Tests

#### 1. OAuth Flow Test

```bash
# Get auth URL
FUNCTION_URL="your-function-url"
curl "$FUNCTION_URL/auth/init?userId=test-user-123"

# Response should contain:
# {
#   "authUrl": "https://accounts.google.com/...",
#   "state": "random-state-string"
# }

# Open authUrl in browser and complete OAuth flow
# Should redirect to FRONTEND_URL/auth/success?userId=test-user-123
```

#### 2. Calendar List Test

```bash
# After completing OAuth, get userId from database
# Then list calendars (requires valid auth)

curl "$FUNCTION_URL/calendars?userId=YOUR_USER_ID"

# Expected: List of calendars
```

#### 3. Watch Creation Test

```bash
# Create a watch for a calendar
curl -X POST "$FUNCTION_URL/calendars/watch" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "calendarId": "primary",
    "targetCalendarId": "YOUR_TARGET_CALENDAR_ID"
  }'

# Expected: { "success": true, "channelId": "...", "expiration": "..." }
```

#### 4. Webhook Test

```bash
# Simulate a webhook from Google Calendar
curl -X POST "$FUNCTION_URL/webhook" \
  -H "X-Goog-Channel-Id: test-channel-123" \
  -H "X-Goog-Resource-State: exists" \
  -H "X-Goog-Resource-Id: resource-123"

# Expected: HTTP 200 OK
```

#### 5. Batch Sync Test

```bash
# Trigger batch sync (requires auth token)
curl -X POST "$FUNCTION_URL/batch-sync" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID"}'

# Expected: { "success": true, ... }
```

## Testing the Airbnb Feature

1. Create a test event in Google Calendar with "Airbnb" in the title or organizer email
2. Create a watch for that calendar
3. Trigger a sync (either via webhook or batch sync)
4. Check the target calendar - the event should have `__EVENT__` in the description

## Validation Checklist

- [ ] Health endpoint returns 200
- [ ] Root endpoint returns service info
- [ ] Auth init generates valid OAuth URL
- [ ] Error responses have proper status codes (400, 404, 500)
- [ ] Integration test script runs successfully
- [ ] OAuth flow completes successfully
- [ ] Calendar listing works (with valid auth)
- [ ] Watch creation works
- [ ] Webhook handling works
- [ ] Batch sync works
- [ ] Airbnb events get __EVENT__ marker

## Troubleshooting

### Common Issues

**1. Function returns 500 errors**
```bash
# Check logs
gcloud functions logs read calendarSync --region=us-central1 --limit=50

# Look for error messages
```

**2. Authentication fails**
```bash
# Verify environment variables are set
gcloud functions describe calendarSync --region=us-central1 --gen2 --format='value(serviceConfig.environmentVariables)'
```

**3. Webhook not receiving notifications**
```bash
# Check watch is created
# Verify webhook URL is correct
# Check Firestore watches collection
```

**4. Database errors**
```bash
# Verify Firestore is enabled
# Check service account permissions
# Review Firestore rules
```

## Next Task

→ **18_TASK_final_deployment.md** - Production deployment and migration

## Notes

- Integration tests verify the entire stack works together
- Test both success and error cases
- Use real Google Calendar API in staging environment
- Monitor Cloud Logging during tests
- Keep integration tests in version control for regression testing
