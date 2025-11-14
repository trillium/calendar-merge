#!/bin/bash

# Create Cloud Scheduler jobs for periodic tasks

set -e

PROJECT_ID="${GCP_PROJECT:-}"
REGION="${FUNCTION_REGION:-us-central1}"
FUNCTION_URL="${CLOUD_FUNCTION_URL:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$FUNCTION_URL" ]; then
    echo "Error: GCP_PROJECT and CLOUD_FUNCTION_URL must be set"
    exit 1
fi

echo "Creating Cloud Scheduler jobs..."

# Job 1: Renew watch channels (daily at 2 AM)
gcloud scheduler jobs create http renewWatches \
  --location=$REGION \
  --schedule="0 2 * * *" \
  --uri="$FUNCTION_URL/renew-watches" \
  --http-method=POST \
  --project=$PROJECT_ID \
  --description="Renew expiring calendar watch channels" \
  || echo "Job 'renewWatches' may already exist"

echo "✓ Cloud Scheduler jobs created"

