#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying API gateway function..."

gcloud functions deploy api \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID

# Get the API URL and display it
API_URL=$(gcloud functions describe api --region=$REGION --gen2 --format='value(serviceConfig.uri)')

echo "✅ API gateway deployed successfully"
echo ""
echo "🌐 API Gateway URL: $API_URL"
echo ""
echo "📝 Next steps:"
echo "  1. Set VITE_API_URL in Vercel: vercel env add VITE_API_URL production"
echo "  2. Enter this URL when prompted: $API_URL"
echo "  3. Redeploy frontend: cd web && vercel --prod"
echo ""

# Save URL to .env.gcp for future use
if grep -q "API_URL=" .env.gcp; then
  sed -i '' "s|API_URL=.*|API_URL=$API_URL|" .env.gcp
else
  echo "API_URL=$API_URL" >> .env.gcp
fi

echo "💾 API URL saved to .env.gcp"