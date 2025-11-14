#!/bin/bash

# Calendar Merge Service - Deployment Script
# Deploys the consolidated Cloud Function to GCP

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Calendar Merge Service - Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Configuration
PROJECT_ID="${GCP_PROJECT:-}"
REGION="${FUNCTION_REGION:-us-central1}"
FUNCTION_NAME="calendarSync"
RUNTIME="nodejs22"
MEMORY="512MB"
TIMEOUT="540s"
MIN_INSTANCES="0"
MAX_INSTANCES="10"

# Check if project ID is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT environment variable not set${NC}"
    echo "Please set it in .env or export it:"
    echo "  export GCP_PROJECT=your-project-id"
    exit 1
fi

echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Function: $FUNCTION_NAME"
echo ""

# Step 1: Build TypeScript
echo -e "${YELLOW}Step 1: Building TypeScript...${NC}"
pnpm build

if [ ! -d "dist" ]; then
    echo -e "${RED}Error: dist/ directory not found after build${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Step 2: Deploy Cloud Function
echo -e "${YELLOW}Step 2: Deploying Cloud Function...${NC}"

gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=$RUNTIME \
  --region=$REGION \
  --source=. \
  --entry-point=calendarSync \
  --trigger-http \
  --allow-unauthenticated \
  --memory=$MEMORY \
  --timeout=$TIMEOUT \
  --min-instances=$MIN_INSTANCES \
  --max-instances=$MAX_INSTANCES \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT=$PROJECT_ID,FUNCTION_REGION=$REGION" \
  --project=$PROJECT_ID

echo -e "${GREEN}✓ Function deployed${NC}"
echo ""

# Step 3: Get function URL
echo -e "${YELLOW}Step 3: Getting function URL...${NC}"

FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME \
  --region=$REGION \
  --gen2 \
  --project=$PROJECT_ID \
  --format='value(serviceConfig.uri)')

echo "Function URL: $FUNCTION_URL"
echo ""

# Step 4: Test health endpoint
echo -e "${YELLOW}Step 4: Testing health endpoint...${NC}"

if curl -f -s "$FUNCTION_URL/health" > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "URL: $FUNCTION_URL/health"
fi

echo ""

# Step 5: Update environment files
echo -e "${YELLOW}Step 5: Updating environment files...${NC}"

# Update .env.gcp in root
ENV_FILE="../.env.gcp"
if [ -f "$ENV_FILE" ]; then
    # Update or add CLOUD_FUNCTION_URL
    if grep -q "CLOUD_FUNCTION_URL=" "$ENV_FILE"; then
        sed -i.bak "s|CLOUD_FUNCTION_URL=.*|CLOUD_FUNCTION_URL=$FUNCTION_URL|" "$ENV_FILE"
    else
        echo "CLOUD_FUNCTION_URL=$FUNCTION_URL" >> "$ENV_FILE"
    fi
    echo -e "${GREEN}✓ Updated $ENV_FILE${NC}"
else
    echo "CLOUD_FUNCTION_URL=$FUNCTION_URL" > "$ENV_FILE"
    echo -e "${GREEN}✓ Created $ENV_FILE${NC}"
fi

echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Function Name: $FUNCTION_NAME"
echo "Function URL:  $FUNCTION_URL"
echo ""
echo "Endpoints:"
echo "  Health:   $FUNCTION_URL/health"
echo "  Webhook:  $FUNCTION_URL/webhook"
echo "  Auth:     $FUNCTION_URL/auth/init"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update Vercel environment variables:"
echo "   vercel env add NEXT_PUBLIC_API_URL production"
echo "   Value: $FUNCTION_URL"
echo ""
echo "2. Set up Cloud Scheduler for watch renewal:"
echo "   ./scripts/create-scheduler-jobs.sh"
echo ""
echo "3. Test OAuth flow:"
echo "   curl $FUNCTION_URL/auth/init"
echo ""
