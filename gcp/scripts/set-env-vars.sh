#!/bin/bash

# Set environment variables for deployed Cloud Function

set -e

PROJECT_ID="${GCP_PROJECT:-}"
REGION="${FUNCTION_REGION:-us-central1}"
FUNCTION_NAME="calendarSync"

if [ -z "$PROJECT_ID" ]; then
    echo "Error: GCP_PROJECT not set"
    exit 1
fi

# Read from .env file
if [ -f "../.env.gcp" ]; then
    source ../.env.gcp
fi

echo "Updating environment variables for $FUNCTION_NAME..."

gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --region=$REGION \
  --update-env-vars \
    NODE_ENV=production,\
    GCP_PROJECT=$PROJECT_ID,\
    FUNCTION_REGION=$REGION,\
    GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,\
    GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,\
    GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT_URI,\
    CLOUD_FUNCTION_URL=$CLOUD_FUNCTION_URL,\
    FRONTEND_URL=$FRONTEND_URL \
  --project=$PROJECT_ID

echo "✓ Environment variables updated"
