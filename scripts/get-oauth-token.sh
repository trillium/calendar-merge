#!/bin/bash
set -e

echo "🔐 OAuth Token Generator"
echo ""
echo "Prerequisites:"
echo "  1. Download OAuth credentials from GCP Console"
echo "  2. Save as credentials.json in project root"
echo ""
read -p "Have you completed these steps? (yes/no): " READY

if [ "$READY" != "yes" ]; then
  echo "Please complete the prerequisites first"
  exit 1
fi

if [ ! -f credentials.json ]; then
  echo "❌ credentials.json not found"
  exit 1
fi

cd functions/calendar-sync
npm install

cd ../..
node scripts/oauth-flow.js
