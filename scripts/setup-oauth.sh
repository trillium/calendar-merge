#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "🔐 Setting up OAuth for Calendar API"
echo ""

# Enable Calendar API
echo "📡 Enabling Google Calendar API..."
gcloud services enable calendar-json.googleapis.com

# Create OAuth client ID using gcloud
echo ""
echo "📝 Creating OAuth 2.0 Client ID..."

# Check if OAuth brand exists, if not create one
BRAND_EXISTS=$(gcloud iap oauth-brands list --format="value(name)" 2>/dev/null || echo "")

if [ -z "$BRAND_EXISTS" ]; then
  echo "Creating OAuth consent screen..."
  gcloud iap oauth-brands create \
    --application_title="Calendar Merge Service" \
    --support_email=$(gcloud config get-value account)
fi

# Note: gcloud doesn't support creating OAuth clients directly
# We need to use the API
echo ""
echo "⚠️  OAuth client creation via CLI is limited."
echo "You need to create an OAuth 2.0 Client ID manually:"
echo ""
echo "1. Open: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "2. Click 'Create Credentials' → 'OAuth 2.0 Client ID'"
echo "3. Choose 'Desktop app'"
echo "4. Download JSON and save as 'credentials.json' in project root"
echo ""
read -p "Press Enter when you've downloaded credentials.json..."

if [ ! -f credentials.json ]; then
  echo "❌ credentials.json not found in project root"
  exit 1
fi

echo ""
echo "✅ OAuth credentials ready!"
echo "Now run: pnpm oauth:flow to authorize calendar access"
