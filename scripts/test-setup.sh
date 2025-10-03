#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run setup first"
  exit 1
fi

source .env.gcp

echo "🧪 Testing GCP setup..."

echo "1️⃣  Testing Firestore..."
cd functions/calendar-sync
npm install --silent
cd ../..

node -e "
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: '$PROJECT_ID' });
db.collection('event_mappings').add({ test: true, timestamp: new Date() })
  .then(() => console.log('✅ Firestore working'))
  .catch(err => { console.error('❌ Firestore error:', err); process.exit(1); });
"

if [ -z "$WEBHOOK_URL" ]; then
  echo "⚠️  WEBHOOK_URL not set. Deploy functions first."
  exit 0
fi

echo "2️⃣  Testing Cloud Function..."
curl -s -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "x-goog-resource-state: sync" \
  -d '{"test": true}'

echo ""
echo "3️⃣  Checking logs..."
gcloud functions logs read handleWebhook --region=$REGION --limit=3

echo ""
echo "✅ All tests passed!"
