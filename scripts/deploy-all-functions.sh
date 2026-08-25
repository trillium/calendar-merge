#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying all Cloud Functions..."

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

# Common env vars needed by all functions
COMMON_VARS="PROJECT_ID=$PROJECT_ID,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"

# Deploy handleWebhook
echo ""
echo "1/5 Deploying handleWebhook..."
gcloud functions deploy handleWebhook \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=handleWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars $COMMON_VARS

echo "✅ handleWebhook deployed"

# Deploy renewWatches
echo ""
echo "2/5 Deploying renewWatches..."
gcloud functions deploy renewWatches \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=renewWatches \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars $COMMON_VARS,WEBHOOK_URL=$WEBHOOK_URL

echo "✅ renewWatches deployed"

# Deploy batchSync
echo ""
echo "3/5 Deploying batchSync..."
gcloud functions deploy batchSync \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=batchSync \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --timeout=540s \
  --memory=256MB \
  --set-env-vars $COMMON_VARS,PROJECT_NUMBER=$PROJECT_NUMBER,REGION=$REGION,BATCH_SYNC_URL=$BATCH_SYNC_URL,SERVICE_ACCOUNT_EMAIL=$SERVICE_ACCOUNT_EMAIL

echo "✅ batchSync deployed"

# Deploy api (OAuth + Setup)
echo ""
echo "4/5 Deploying api..."
gcloud functions deploy api \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars $COMMON_VARS,WEBHOOK_URL=$WEBHOOK_URL

echo "✅ api deployed"

# Deploy triggerInitialSync
echo ""
echo "5/5 Deploying triggerInitialSync..."
gcloud functions deploy triggerInitialSync \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=triggerInitialSync \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars $COMMON_VARS

echo "✅ triggerInitialSync deployed"

# Get URLs
echo ""
echo "📝 Getting function URLs..."
WEBHOOK_URL=$(gcloud functions describe handleWebhook --region=$REGION --gen2 --format='value(serviceConfig.uri)')
RENEW_URL=$(gcloud functions describe renewWatches --region=$REGION --gen2 --format='value(serviceConfig.uri)')
API_URL=$(gcloud functions describe api --region=$REGION --gen2 --format='value(serviceConfig.uri)')
BATCH_SYNC_URL=$(gcloud functions describe batchSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')
TRIGGER_SYNC_URL=$(gcloud functions describe triggerInitialSync --region=$REGION --gen2 --format='value(serviceConfig.uri)')

echo ""
echo "✅ All functions deployed successfully!"
echo ""
echo "📋 Function URLs:"
echo "  Webhook:       $WEBHOOK_URL"
echo "  Renew:         $RENEW_URL"
echo "  API:           $API_URL"
echo "  Batch Sync:    $BATCH_SYNC_URL"
echo "  Initial Sync:  $TRIGGER_SYNC_URL"
echo ""
echo "💡 Update .env.gcp with these URLs if needed"
