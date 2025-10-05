# GitHub Actions CI/CD Setup

This guide explains how to set up automatic testing and deployment for the Calendar Merge Service.

## Overview

The CI/CD pipeline automatically:
- ✅ Runs tests on every push and pull request
- ✅ Builds the project to verify compilation
- ✅ Deploys to GCP Cloud Functions when code is merged to `main`

## Workflow

```mermaid
graph LR
    A[Push Code] --> B[Run Tests]
    B --> C{Tests Pass?}
    C -->|No| D[❌ Fail - No Deploy]
    C -->|Yes| E{Branch = main?}
    E -->|No| F[✅ Pass - No Deploy]
    E -->|Yes| G[Build & Deploy to GCP]
    G --> H[✅ Deployed]
```

## Setup Instructions

### 1. Create GCP Service Account Key (One-time)

The GitHub Actions workflow needs credentials to deploy to GCP.

```bash
# Navigate to your project directory
cd /Users/trilliumsmith/code/calendar-merge-service

# Create a service account key for GitHub Actions
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com

# Display the key (you'll copy this to GitHub)
cat github-actions-key.json
```

**⚠️ Security:** After copying the key to GitHub Secrets, delete the local file:
```bash
rm github-actions-key.json
```

### 2. Add GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

| Secret Name | Value | How to Get |
|-------------|-------|------------|
| `GCP_PROJECT_ID` | `calendar-merge-1759477062` | From `.env.gcp` |
| `GCP_REGION` | `us-central1` | From `.env.gcp` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com` | From `.env.gcp` |
| `GCP_SA_KEY` | `{entire JSON key file}` | From step 1 above |

#### Example: Adding GCP_SA_KEY

1. Click **New repository secret**
2. Name: `GCP_SA_KEY`
3. Value: Paste the entire contents of `github-actions-key.json`:
```json
{
  "type": "service_account",
  "project_id": "calendar-merge-1759477062",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### 3. Grant Required Permissions

Ensure the service account has these IAM roles:

```bash
# Cloud Functions Developer (to deploy functions)
gcloud projects add-iam-policy-binding calendar-merge-1759477062 \
  --member="serviceAccount:calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.developer"

# Service Account User (to deploy as service account)
gcloud projects add-iam-policy-binding calendar-merge-1759477062 \
  --member="serviceAccount:calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Cloud Build Editor (for building functions)
gcloud projects add-iam-policy-binding calendar-merge-1759477062 \
  --member="serviceAccount:calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Storage Admin (for function artifacts)
gcloud projects add-iam-policy-binding calendar-merge-1759477062 \
  --member="serviceAccount:calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### 4. Test the Workflow

#### Option A: Push to a branch (runs tests only)
```bash
git checkout -b test-ci
git add .
git commit -m "test: verify CI pipeline"
git push origin test-ci
```

Check GitHub Actions tab - you should see:
- ✅ Test job runs
- ⏭️ Deploy job skipped (not main branch)

#### Option B: Merge to main (runs tests + deploy)
```bash
git checkout main
git merge test-ci
git push origin main
```

Check GitHub Actions tab - you should see:
- ✅ Test job runs
- ✅ Deploy job runs (deploys to GCP)

## How It Works

### Test Job (runs on all branches)

```yaml
test:
  - Checkout code
  - Install dependencies (pnpm)
  - Run tests
  - Build project
```

- Runs on: Every push and pull request
- Purpose: Ensure code quality before merge

### Deploy Job (runs only on main)

```yaml
deploy:
  needs: test  # Only runs if tests pass
  if: github.ref == 'refs/heads/main'

  - Checkout code
  - Build functions
  - Authenticate to GCP
  - Deploy handleWebhook function
  - Deploy renewWatches function
```

- Runs on: Pushes to `main` branch only
- Requires: Tests must pass first
- Purpose: Automatic deployment to production

## Monitoring Deployments

### View Workflow Status

GitHub Repository → **Actions** tab

You'll see:
- 🟢 Green checkmark = Success
- 🔴 Red X = Failed
- 🟡 Yellow dot = In progress

### View Deployment Logs

Click on a workflow run → Click on the job → Expand steps to see logs

### View Deployed Functions

```bash
# List deployed functions
gcloud functions list --regions=us-central1

# View function details
gcloud functions describe handleWebhook --region=us-central1 --gen2

# View function logs
gcloud functions logs read handleWebhook --region=us-central1 --gen2
```

## Troubleshooting

### Build Fails with "Permission Denied"

**Cause:** Service account lacks required IAM roles

**Fix:** Re-run the permission grants in Step 3

### Tests Fail in CI but Pass Locally

**Cause:** Environment differences

**Check:**
- Node version matches (20)
- All dependencies in package.json
- No local-only environment variables

### Deploy Fails with "Invalid Credentials"

**Cause:** `GCP_SA_KEY` secret is incorrect

**Fix:**
1. Recreate service account key
2. Copy entire JSON (including `{}`)
3. Update GitHub secret

### Deploy Succeeds but Function Doesn't Work

**Cause:** Missing environment variables or configuration

**Check:**
- Environment variables set in deploy command
- Firestore collections exist
- OAuth tokens stored in Secret Manager

## Branch Protection (Recommended)

Prevent direct pushes to main without PR:

1. GitHub Repo → **Settings** → **Branches**
2. Add rule for `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - Select status check: `test`

This ensures:
- All code goes through PR review
- Tests must pass before merge
- Automatic deployment after merge

## Cost Considerations

GitHub Actions free tier:
- 2,000 minutes/month for private repos
- Unlimited for public repos

This workflow uses ~5 minutes per push:
- Test job: ~2 minutes
- Deploy job: ~3 minutes

Estimated usage:
- 20 pushes/month = 100 minutes
- Well within free tier

## Security Best Practices

1. ✅ **Never** commit service account keys to git
2. ✅ Use GitHub Secrets for all sensitive data
3. ✅ Limit service account permissions (principle of least privilege)
4. ✅ Rotate service account keys periodically (every 90 days)
5. ✅ Use branch protection to require reviews
6. ✅ Enable 2FA on your GitHub account

## Next Steps

After setup:
1. Create a branch for your changes
2. Push and verify tests run
3. Create PR to main
4. Merge PR and verify automatic deployment
5. Check deployed functions work correctly

## Files

- [.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml) - GitHub Actions workflow
- [.env.gcp](../.env.gcp) - GCP configuration (not committed)
- [package.json](../package.json) - Build and test scripts
