#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying consolidated calendarSync function..."

# Get PROJECT_NUMBER from terraform output
echo "🔍 Getting PROJECT_NUMBER from Terraform..."
cd terraform
PROJECT_NUMBER=$(terraform output -raw project_number)
cd ..

if [ -z "$PROJECT_NUMBER" ]; then
  echo "❌ Failed to get PROJECT_NUMBER from terraform output"
  exit 1
fi

echo "📋 Using PROJECT_NUMBER: $PROJECT_NUMBER"

gcloud functions deploy calendarSync \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=calendarSync \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --timeout=540s \
  --memory=256MB \
  --set-env-vars PROJECT_ID=$PROJECT_ID,PROJECT_NUMBER=$PROJECT_NUMBER,REGION=$REGION,BATCH_SYNC_URL=$BATCH_SYNC_URL,SERVICE_ACCOUNT_EMAIL=$SERVICE_ACCOUNT_EMAIL,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,WEBHOOK_URL=$WEBHOOK_URL

# Get the function URL
FUNCTION_URL=$(gcloud functions describe calendarSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')

echo "✅ calendarSync deployed successfully"
echo ""
echo "🌐 Function URL: $FUNCTION_URL"
echo ""
echo "📝 Available endpoints:"
echo "  - POST $FUNCTION_URL/webhook - Google Calendar webhooks"
echo "  - POST $FUNCTION_URL/batch-sync - Batch sync (requires auth)"
echo "  - POST $FUNCTION_URL/renew-watches - Renew watch subscriptions"
echo "  - POST $FUNCTION_URL/api/sync/pause - Pause sync"
echo "  - POST $FUNCTION_URL/api/sync/resume - Resume sync"
echo "  - POST $FUNCTION_URL/api/sync/stop - Stop sync"
echo "  - POST $FUNCTION_URL/api/sync/restart - Restart sync"
echo "  - DELETE $FUNCTION_URL/api/user/clear - Clear user data"
echo "  - GET $FUNCTION_URL/health - Health check"
echo ""
echo "📝 Next steps:"
echo "  1. Update WEBHOOK_URL in .env.gcp to: $FUNCTION_URL/webhook"
echo "  2. Update BATCH_SYNC_URL in .env.gcp to: $FUNCTION_URL/batch-sync"
echo "  3. Update any Next.js environment variables that reference the old function URLs"
echo ""

# Save URLs to .env.gcp
if grep -q "WEBHOOK_URL=" .env.gcp; then
  sed -i '' "s|WEBHOOK_URL=.*|WEBHOOK_URL=$FUNCTION_URL/webhook|" .env.gcp
else
  echo "WEBHOOK_URL=$FUNCTION_URL/webhook" >> .env.gcp
fi

if grep -q "BATCH_SYNC_URL=" .env.gcp; then
  sed -i '' "s|BATCH_SYNC_URL=.*|BATCH_SYNC_URL=$FUNCTION_URL/batch-sync|" .env.gcp
else
  echo "BATCH_SYNC_URL=$FUNCTION_URL/batch-sync" >> .env.gcp
fi

if grep -q "API_URL=" .env.gcp; then
  sed -i '' "s|API_URL=.*|API_URL=$FUNCTION_URL/api|" .env.gcp
else
  echo "API_URL=$FUNCTION_URL/api" >> .env.gcp
fi

echo "💾 URLs saved to .env.gcp"
