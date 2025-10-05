#!/bin/bash
set -e

echo "🔧 Setting up Vercel environment with API URL..."

# Get the API URL
if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

# Query for API URL if not in .env.gcp or if we want fresh data
echo "🔍 Getting latest API URL..."
API_URL=$(gcloud functions describe api --region=$REGION --gen2 --format='value(serviceConfig.uri)' 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
  echo "❌ API function not found. Deploy it first:"
  echo "   pnpm deploy:api"
  exit 1
fi

echo "✅ Found API URL: $API_URL"

# Update .env.gcp with the URL
if grep -q "API_URL=" .env.gcp; then
  sed -i '' "s|API_URL=.*|API_URL=$API_URL|" .env.gcp
else
  echo "API_URL=$API_URL" >> .env.gcp
fi

echo "💾 Updated .env.gcp with API URL"

# Check if we're in the web directory, if not, change to it
if [ ! -f "package.json" ] || ! grep -q "calendar-merge-web" package.json 2>/dev/null; then
  echo "📁 Changing to web directory..."
  cd web
fi

# Set the environment variable in Vercel
echo "🌐 Setting VITE_API_URL in Vercel..."
echo "$API_URL" | vercel env add VITE_API_URL production

# Redeploy the frontend
echo "🚀 Redeploying frontend to Vercel..."
vercel --prod

echo ""
echo "✅ Setup complete!"
echo "🌐 Frontend URL will be shown above"
echo "🔗 API URL: $API_URL"
echo ""
echo "🎉 Your calendar merge service should now be fully connected!"