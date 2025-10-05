#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying Cloud Functions..."

gcloud functions deploy handleWebhook \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=handleWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID

echo "✅ handleWebhook deployed"

gcloud functions deploy renewWatches \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=renewWatches \
  --trigger-http \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID

echo "✅ renewWatches deployed"

gcloud functions deploy api \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID

echo "✅ api deployed"

WEBHOOK_URL=$(gcloud functions describe handleWebhook --region=$REGION --gen2 --format='value(serviceConfig.uri)')
RENEW_URL=$(gcloud functions describe renewWatches --region=$REGION --gen2 --format='value(serviceConfig.uri)')
API_URL=$(gcloud functions describe api --region=$REGION --gen2 --format='value(serviceConfig.uri)')

echo ""
echo "📝 Function URLs:"
echo "Webhook: $WEBHOOK_URL"
echo "Renew: $RENEW_URL"
echo "API (OAuth + Setup): $API_URL"

cat >> .env.gcp << ENVEOF
WEBHOOK_URL=$WEBHOOK_URL
RENEW_URL=$RENEW_URL
API_URL=$API_URL
ENVEOF
