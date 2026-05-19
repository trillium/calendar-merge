#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying handleWebhook function..."

gcloud functions deploy handleWebhook \
  --gen2 \
  --runtime=nodejs22 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=handleWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

echo "✅ handleWebhook deployed successfully"