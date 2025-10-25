#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying batchSync function..."

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

gcloud functions deploy batchSync \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=batchSync \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --timeout=540s \
  --memory=256MB \
  --set-env-vars PROJECT_ID=$PROJECT_ID,PROJECT_NUMBER=$PROJECT_NUMBER,REGION=$REGION

echo "✅ batchSync deployed successfully"
