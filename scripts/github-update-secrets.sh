#!/bin/bash

# Upload GCP secrets to GitHub repository secrets
set -e

if [ ! -f ".env.gcp" ]; then
    echo "Error: .env.gcp file not found"
    exit 1
fi

echo "📤 Uploading secrets from .env.gcp to GitHub..."

# Source the .env.gcp file
source .env.gcp

# Upload OAuth secrets
echo "Setting GOOGLE_CLIENT_ID..."
gh secret set GOOGLE_CLIENT_ID --body "$GOOGLE_CLIENT_ID"

echo "Setting GOOGLE_CLIENT_SECRET..."
gh secret set GOOGLE_CLIENT_SECRET --body "$GOOGLE_CLIENT_SECRET"

echo "✅ GitHub secrets updated successfully"
