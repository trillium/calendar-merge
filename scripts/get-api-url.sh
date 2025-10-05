#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "🔍 Querying deployed API function..."

# Check if the function exists
if ! gcloud functions describe api --region=$REGION --gen2 >/dev/null 2>&1; then
  echo "❌ API function not found in region $REGION"
  echo "   Run 'pnpm deploy:api' to deploy it first"
  exit 1
fi

# Get the API URL
API_URL=$(gcloud functions describe api --region=$REGION --gen2 --format='value(serviceConfig.uri)')

if [ -z "$API_URL" ]; then
  echo "❌ Could not retrieve API URL"
  exit 1
fi

echo "✅ API function found!"
echo ""
echo "🌐 API Gateway URL: $API_URL"
echo ""

# Save URL to .env.gcp for future use
if grep -q "API_URL=" .env.gcp; then
  sed -i '' "s|API_URL=.*|API_URL=$API_URL|" .env.gcp
  echo "💾 Updated API_URL in .env.gcp"
else
  echo "API_URL=$API_URL" >> .env.gcp
  echo "💾 Added API_URL to .env.gcp"
fi

echo ""
echo "📝 Next steps to connect frontend:"
echo "  1. Set in Vercel: vercel env add VITE_API_URL production"
echo "  2. Enter this URL: $API_URL"
echo "  3. Redeploy frontend: cd web && vercel --prod"
echo ""
echo "🚀 Or run automated setup: ./scripts/setup-vercel-env.sh"