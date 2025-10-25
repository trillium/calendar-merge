#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "🔐 Granting Cloud Tasks service account permission to invoke batchSync..."

# Get PROJECT_NUMBER from terraform output
echo "🔍 Getting PROJECT_NUMBER from Terraform..."
cd terraform
PROJECT_NUMBER=$(terraform output -raw project_number)
cd ..

if [ -z "$PROJECT_NUMBER" ]; then
  echo "❌ Failed to get PROJECT_NUMBER from terraform output"
  exit 1
fi

CLOUDTASKS_SA="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
echo "📋 Granting permissions to: $CLOUDTASKS_SA"

gcloud functions add-invoker-policy-binding batchSync \
  --gen2 \
  --region=$REGION \
  --member="serviceAccount:$CLOUDTASKS_SA"

echo "✅ Cloud Tasks service account can now invoke batchSync function"
