# Task 15: Create Deployment Configuration

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 2-3 hours
**Dependencies:** Task 14 (Main app)

---

## Objective

Create deployment scripts and configuration files for deploying to Google Cloud Functions.

## Why This Task?

- Automated deployment reduces errors
- Configuration as code
- Environment variable management
- Reproducible deployments

## Files to Create

```
gcp/
├── .gcloudignore                          (Exclude files from deployment)
├── deploy.sh                              (Main deployment script)
└── scripts/
    ├── deploy-function.sh                 (Deploy Cloud Function)
    ├── set-env-vars.sh                    (Set environment variables)
    └── create-scheduler-jobs.sh           (Create Cloud Scheduler jobs)
```

## Steps

### 1. Create .gcloudignore

**File:** `gcp/.gcloudignore`

```gitignore
# Node modules
node_modules/
package-lock.json
pnpm-lock.yaml
yarn.lock

# Source files (only deploy dist/)
src/
*.ts
!src/  # But keep src/ if needed for source maps

# TypeScript config
tsconfig.json

# Tests
**/*.test.ts
**/*.test.js
**/__tests__/
coverage/

# Development
.env
.env.*
!.env.example

# IDE
.vscode/
.idea/
*.swp

# Git
.git/
.gitignore

# Documentation
*.md
!README.md

# Scripts
scripts/

# Logs
*.log
```

### 2. Create deploy.sh (main deployment script)

**File:** `gcp/deploy.sh`

```bash
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
```

### 3. Create create-scheduler-jobs.sh

**File:** `gcp/scripts/create-scheduler-jobs.sh`

```bash
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
```

### 4. Create set-env-vars.sh

**File:** `gcp/scripts/set-env-vars.sh`

```bash
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
```

### 5. Make scripts executable

```bash
chmod +x gcp/deploy.sh
chmod +x gcp/scripts/*.sh
```

## Validation Checklist

- [ ] .gcloudignore created
- [ ] deploy.sh created and executable
- [ ] create-scheduler-jobs.sh created
- [ ] set-env-vars.sh created
- [ ] Scripts use proper error handling (set -e)
- [ ] Environment variables validated before deployment

## Testing Deployment

```bash
# 1. Set up environment
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
cp .env.example .env
# Edit .env with real values

# 2. Authenticate with GCP
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Run deployment
./deploy.sh

# 4. Test deployed function
FUNCTION_URL=$(gcloud functions describe calendarSync --region=us-central1 --gen2 --format='value(serviceConfig.uri)')
curl $FUNCTION_URL/health

# 5. Set up scheduler (after deployment)
./scripts/create-scheduler-jobs.sh
```

## Next Task

→ **16_TASK_create_tests.md** - Set up testing infrastructure

## Notes

- Deploy script builds TypeScript before deploying
- Excludes source files and tests from deployment
- Auto-updates .env.gcp with function URL
- Creates Cloud Scheduler job for watch renewal
- Gen2 Cloud Functions (newer, recommended)
- Node.js 22 runtime
- 512MB memory, 540s timeout (max for HTTP)
