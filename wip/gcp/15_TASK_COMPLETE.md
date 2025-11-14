# Task 15 Complete: Create Deployment Configuration (ODD)

**Status**: ✅ Complete
**Date**: 2025-11-13

## Summary

Created deployment scripts and configuration files for automated deployment to Google Cloud Functions Gen2. Includes build automation, environment variable management, health checks, and Cloud Scheduler setup.

## Files Created/Updated

### 1. **.gcloudignore**
Excludes unnecessary files from GCP deployment:
- Node modules and lock files
- Source TypeScript files (deploy dist/ only)
- Tests and coverage
- Development files (.env, IDE configs)
- Documentation (except README)
- Scripts directory

**Result**: Reduces deployment size and speeds up upload

### 2. **deploy.sh**
Main deployment script with comprehensive automation:
- **Environment Validation**: Checks for GCP_PROJECT environment variable
- **TypeScript Build**: Runs `pnpm build` and verifies dist/ exists
- **Cloud Function Deployment**:
  - Gen2 Cloud Functions (latest version)
  - Node.js 22 runtime
  - 512MB memory
  - **540s timeout** (max for HTTP functions - critical for long-running sync operations)
  - 0-10 instances (auto-scaling)
  - HTTP trigger with unauthenticated access
- **Health Check**: Tests deployed function immediately
- **Environment File Update**: Updates or creates .env.gcp with function URL
- **Colored Output**: Green/yellow/red for better visibility
- **Error Handling**: Exits on any error with clear messages

**Key Improvements over original**:
- 540s timeout instead of 60s (needed for batch sync operations)
- Better error handling with validation checks
- Smart .env.gcp update (appends or updates, doesn't overwrite)
- Comprehensive next steps guidance

### 3. **scripts/create-scheduler-jobs.sh**
Creates Cloud Scheduler jobs for maintenance tasks:
- **renewWatches Job**: Daily at 2 AM UTC
  - Renews expiring Google Calendar watch channels
  - Prevents webhook interruptions
  - Calls `/renew-watches` endpoint
- **Error Handling**: Handles existing jobs gracefully

**Configuration**:
- Requires: GCP_PROJECT, CLOUD_FUNCTION_URL environment variables
- Region: us-central1 (default)
- Schedule: Cron format (0 2 * * *)

### 4. **scripts/set-env-vars.sh**
Updates environment variables for deployed function:
- Loads from .env.gcp file
- Updates function without redeploying
- Sets production variables:
  - NODE_ENV=production
  - GCP_PROJECT
  - FUNCTION_REGION
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
  - GOOGLE_REDIRECT_URI
  - CLOUD_FUNCTION_URL
  - FRONTEND_URL

**Use Case**: Update secrets without full redeployment

### 5. **File Permissions**
All shell scripts made executable:
```bash
chmod +x deploy.sh
chmod +x scripts/*.sh
```

## Architecture

```
gcp/
├── .gcloudignore                    # ✅ Deployment exclusions
├── deploy.sh                        # ✅ Main deployment script
└── scripts/
    ├── create-scheduler-jobs.sh     # ✅ Cloud Scheduler setup
    └── set-env-vars.sh              # ✅ Env var updates
```

## Deployment Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| Runtime | nodejs22 | Latest Node.js LTS |
| Memory | 512MB | Sufficient for API operations |
| Timeout | 540s | Max for HTTP (needed for batch sync) |
| Min Instances | 0 | Cost optimization (free tier) |
| Max Instances | 10 | Prevents runaway scaling costs |
| Trigger | HTTP | REST API endpoints |
| Auth | Unauthenticated | App-level auth in middleware |
| Generation | Gen2 | Latest Cloud Functions version |

## Usage Workflow

### Initial Deployment
```bash
# 1. Set environment variables
export GCP_PROJECT=your-project-id
export FUNCTION_REGION=us-central1

# 2. Run deployment
cd gcp
./deploy.sh

# 3. Set up scheduler (after deployment)
export CLOUD_FUNCTION_URL=<url-from-step-2>
./scripts/create-scheduler-jobs.sh
```

### Update Environment Variables
```bash
# Edit .env.gcp with new values
./scripts/set-env-vars.sh
```

### Redeploy After Code Changes
```bash
./deploy.sh
```

## Key Features

### 1. Automated Build Verification
```bash
if [ ! -d "dist" ]; then
    echo "Error: dist/ directory not found after build"
    exit 1
fi
```
Prevents deploying without compiled code.

### 2. Smart Environment File Updates
```bash
if grep -q "CLOUD_FUNCTION_URL=" "$ENV_FILE"; then
    sed -i.bak "s|CLOUD_FUNCTION_URL=.*|CLOUD_FUNCTION_URL=$FUNCTION_URL|" "$ENV_FILE"
else
    echo "CLOUD_FUNCTION_URL=$FUNCTION_URL" >> "$ENV_FILE"
fi
```
Updates existing value or appends new one - preserves other variables.

### 3. Post-Deployment Health Check
```bash
if curl -f -s "$FUNCTION_URL/health" > /dev/null; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed"
fi
```
Immediate validation of deployment success.

### 4. Integration with Vercel
Provides instructions to update Next.js frontend:
```bash
vercel env add NEXT_PUBLIC_API_URL production
```

## Environment Variables Required

**For Deployment**:
- `GCP_PROJECT` - Google Cloud project ID (required)
- `FUNCTION_REGION` - Deployment region (default: us-central1)

**For Runtime** (set via set-env-vars.sh):
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `GOOGLE_REDIRECT_URI` - OAuth callback URL
- `FRONTEND_URL` - Next.js app URL
- `CLOUD_FUNCTION_URL` - Function URL (auto-set by deploy.sh)

## Dependencies

**Requires (from ODD tasks)**:
- Task 01-13: All source code and services

**Awaits (from EVEN tasks)**:
- Task 14: Main app entry point (`calendarSync` function)
  - Note: Deploy script references `--entry-point=calendarSync` which will be created in Task 14

## Cloud Scheduler Jobs

| Job Name | Schedule | Endpoint | Purpose |
|----------|----------|----------|---------|
| renewWatches | 0 2 * * * (daily 2 AM) | /renew-watches | Renew expiring watch channels |

**Why Daily at 2 AM?**
- Low traffic time
- Google watch channels expire after 7 days
- Running daily ensures renewal before expiration

## Testing Deployment

```bash
# Test health endpoint
curl https://<region>-<project>.cloudfunctions.net/calendarSync/health

# Expected response
{
  "status": "ok",
  "timestamp": "2025-11-13T...",
  "service": "calendar-sync"
}
```

## Integration Points

### With Vercel (Next.js frontend)
```bash
# After deployment, update Vercel env
vercel env add NEXT_PUBLIC_API_URL production
# Value: <CLOUD_FUNCTION_URL from deploy.sh>
```

### With Google Cloud Scheduler
```bash
# After deployment, create jobs
./scripts/create-scheduler-jobs.sh
```

### With Firestore
- Automatic: Uses default credentials from Cloud Function environment
- No additional setup needed

## Cost Optimization

**Free Tier Usage**:
- 2M invocations/month free
- 400K GB-seconds compute time free
- Min instances = 0 (no cold start costs)

**Settings for Free Tier**:
- 512MB memory (1 unit)
- 0 min instances (scale to zero)
- 10 max instances (cap costs)

## Security Considerations

### 1. Unauthenticated HTTP Trigger
- Allows public webhook endpoint (/webhook)
- Auth middleware protects user-facing routes
- Required for Google Calendar push notifications

### 2. Environment Variables
- Stored in Cloud Function environment (encrypted)
- Not included in source code
- Updated via set-env-vars.sh

### 3. Secrets Management
**Future Enhancement**: Use Secret Manager instead of env vars
```bash
gcloud secrets create google-client-secret --data-file=-
```

## Next Steps

Task 17 (ODD): Integration Testing - End-to-end testing of deployed function

## Notes

- Deploy script auto-updates .env.gcp with function URL
- All scripts have proper error handling (`set -e`)
- Scripts are executable and ready to use
- .gcloudignore optimizes deployment size
- Gen2 functions have better performance and features than Gen1
- 540s timeout is critical for batch sync operations (can process many events)
- Cloud Scheduler requires Cloud Functions to be deployed first
