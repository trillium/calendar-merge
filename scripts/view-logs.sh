#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found"
  exit 1
fi

source .env.gcp

echo "📋 Recent logs for handleWebhook:"
gcloud functions logs read handleWebhook --region=$REGION --limit=20

echo ""
echo "📋 Recent logs for renewWatches:"
gcloud functions logs read renewWatches --region=$REGION --limit=20
