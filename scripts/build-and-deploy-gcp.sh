#!/bin/bash
set -e

echo "🏗️  Building and deploying all GCP functions..."
echo ""

# Check for required files
if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

# Step 1: Build TypeScript
echo "📦 Step 1/6: Building TypeScript..."
cd functions/calendar-sync
pnpm build
cd ../..

# Verify build artifacts exist
if [ ! -f functions/calendar-sync/dist/sync.js ]; then
  echo "❌ Build failed - dist/sync.js not found"
  exit 1
fi

echo "✅ Build complete"
echo ""

# Step 2: Deploy all functions in parallel
echo "🚀 Step 2/2: Deploying all functions in parallel..."
echo ""

# Start all deployments in background
./scripts/deploy/deploy-handleWebhook.sh &
WEBHOOK_PID=$!

./scripts/deploy/deploy-batchSync.sh &
BATCH_PID=$!

./scripts/deploy/deploy-renewWatches.sh &
RENEW_PID=$!

./scripts/deploy/deploy-triggerInitialSync.sh &
INITIAL_PID=$!

./scripts/deploy/deploy-api.sh &
API_PID=$!

echo "⏳ Waiting for all deployments to complete..."
echo ""

# Wait for all background processes and capture exit codes
wait $WEBHOOK_PID
WEBHOOK_EXIT=$?

wait $BATCH_PID
BATCH_EXIT=$?

wait $RENEW_PID
RENEW_EXIT=$?

wait $INITIAL_PID
INITIAL_EXIT=$?

wait $API_PID
API_EXIT=$?

# Check if any failed
if [ $WEBHOOK_EXIT -ne 0 ] || [ $BATCH_EXIT -ne 0 ] || [ $RENEW_EXIT -ne 0 ] || [ $INITIAL_EXIT -ne 0 ] || [ $API_EXIT -ne 0 ]; then
  echo "❌ One or more deployments failed"
  exit 1
fi

echo ""

echo "✅ All GCP functions deployed successfully!"
echo ""
echo "📋 Summary:"
echo "  - handleWebhook: Receives calendar change notifications"
echo "  - batchSync: Processes calendar events in batches"
echo "  - renewWatches: Renews Google Calendar watch subscriptions"
echo "  - triggerInitialSync: Starts initial sync for new calendars"
echo "  - api: API gateway for frontend"
echo ""
echo "🔍 View functions:"
echo "  pnpm functions:list"
echo ""
echo "📝 View logs:"
echo "  pnpm logs:webhook"
echo "  pnpm logs:batchSync"
