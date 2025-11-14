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
