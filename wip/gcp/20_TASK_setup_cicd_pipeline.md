# Task 20: Set Up CI/CD Pipeline

**Status:** Not Started
**Priority:** Medium
**Estimated Time:** 3-4 hours
**Dependencies:** Task 16 (Tests), Task 19 (Port existing tests)

---

## Objective

Set up automated Continuous Integration and Continuous Deployment (CI/CD) pipeline to run tests, build, and deploy the Cloud Function automatically on every commit.

## Why This Task?

- **Catch bugs early** - Tests run on every commit
- **Automated deployments** - No manual deployment steps
- **Consistent builds** - Same environment every time
- **Code quality** - Enforce linting and formatting
- **Fast feedback** - Know immediately if something breaks

---

## CI/CD Platform Options

### Option 1: GitHub Actions (Recommended)

**Pros:**
- ✅ Free for public repos, generous free tier for private
- ✅ Integrated with GitHub
- ✅ Easy GCP authentication with Workload Identity
- ✅ Large marketplace of actions
- ✅ YAML-based configuration

**Cons:**
- Requires GitHub repository

### Option 2: Google Cloud Build

**Pros:**
- ✅ Native GCP integration
- ✅ Free tier: 120 build-minutes/day
- ✅ Direct access to GCP resources
- ✅ Fast builds (close to resources)

**Cons:**
- More complex configuration
- Vendor lock-in

### Option 3: GitLab CI/CD

**Pros:**
- ✅ Powerful CI/CD features
- ✅ Built-in container registry
- ✅ Auto DevOps

**Cons:**
- Requires GitLab repository

**Recommendation:** Use **GitHub Actions** for simplicity and free tier.

---

## GitHub Actions Setup

### Step 1: Create Workflow Directory

```bash
cd /Users/trilliumsmith/code/calendar-merge-service
mkdir -p .github/workflows
```

### Step 2: Create CI Workflow (Test & Build)

**File:** `.github/workflows/ci.yml`

```yaml
name: CI - Test & Build

on:
  push:
    branches: [main, develop]
    paths:
      - 'gcp/**'
      - '.github/workflows/ci.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'gcp/**'

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: ./gcp

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: gcp/pnpm-lock.yaml

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linter
        run: pnpm lint || echo "Linter not configured yet"

      - name: Run tests
        run: pnpm test
        env:
          NODE_ENV: test

      - name: Generate coverage report
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          directory: ./gcp/coverage
          flags: unittests
          name: gcp-coverage
          fail_ci_if_error: false

  build:
    name: Build TypeScript
    runs-on: ubuntu-latest
    needs: test

    defaults:
      run:
        working-directory: ./gcp

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: gcp/pnpm-lock.yaml

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build TypeScript
        run: pnpm build

      - name: Check for build artifacts
        run: |
          if [ ! -d "dist" ]; then
            echo "Error: dist/ directory not created"
            exit 1
          fi
          echo "Build artifacts created successfully"
          ls -la dist/

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: gcp/dist/
          retention-days: 7
```

### Step 3: Create CD Workflow (Deploy to Staging)

**File:** `.github/workflows/deploy-staging.yml`

```yaml
name: CD - Deploy to Staging

on:
  push:
    branches: [develop]
    paths:
      - 'gcp/**'
  workflow_dispatch:

jobs:
  deploy-staging:
    name: Deploy to Staging Environment
    runs-on: ubuntu-latest
    environment: staging

    defaults:
      run:
        working-directory: ./gcp

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: gcp/pnpm-lock.yaml

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build TypeScript
        run: pnpm build

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_STAGING }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Functions (Staging)
        run: |
          gcloud functions deploy calendarSync-staging \
            --gen2 \
            --runtime=nodejs22 \
            --region=us-central1 \
            --source=. \
            --entry-point=calendarSync \
            --trigger-http \
            --allow-unauthenticated \
            --memory=512MB \
            --timeout=540s \
            --min-instances=0 \
            --max-instances=5 \
            --set-env-vars NODE_ENV=staging,GCP_PROJECT=${{ secrets.GCP_PROJECT_STAGING }} \
            --project=${{ secrets.GCP_PROJECT_STAGING }}

      - name: Get function URL
        id: get-url
        run: |
          URL=$(gcloud functions describe calendarSync-staging \
            --region=us-central1 \
            --gen2 \
            --project=${{ secrets.GCP_PROJECT_STAGING }} \
            --format='value(serviceConfig.uri)')
          echo "function_url=$URL" >> $GITHUB_OUTPUT
          echo "Deployed to: $URL"

      - name: Test deployment
        run: |
          curl -f ${{ steps.get-url.outputs.function_url }}/health || exit 1
          echo "Health check passed!"

      - name: Create deployment summary
        run: |
          echo "## Staging Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "✅ Deployed successfully" >> $GITHUB_STEP_SUMMARY
          echo "📍 URL: ${{ steps.get-url.outputs.function_url }}" >> $GITHUB_STEP_SUMMARY
          echo "🔗 Test: ${{ steps.get-url.outputs.function_url }}/health" >> $GITHUB_STEP_SUMMARY
```

### Step 4: Create CD Workflow (Deploy to Production)

**File:** `.github/workflows/deploy-production.yml`

```yaml
name: CD - Deploy to Production

on:
  push:
    branches: [main]
    paths:
      - 'gcp/**'
  workflow_dispatch:

jobs:
  deploy-production:
    name: Deploy to Production Environment
    runs-on: ubuntu-latest
    environment: production

    defaults:
      run:
        working-directory: ./gcp

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: gcp/pnpm-lock.yaml

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Build TypeScript
        run: pnpm build

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PRODUCTION }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Functions (Production)
        run: |
          gcloud functions deploy calendarSync \
            --gen2 \
            --runtime=nodejs22 \
            --region=us-central1 \
            --source=. \
            --entry-point=calendarSync \
            --trigger-http \
            --allow-unauthenticated \
            --memory=512MB \
            --timeout=540s \
            --min-instances=0 \
            --max-instances=10 \
            --set-env-vars NODE_ENV=production,GCP_PROJECT=${{ secrets.GCP_PROJECT_PRODUCTION }} \
            --project=${{ secrets.GCP_PROJECT_PRODUCTION }}

      - name: Get function URL
        id: get-url
        run: |
          URL=$(gcloud functions describe calendarSync \
            --region=us-central1 \
            --gen2 \
            --project=${{ secrets.GCP_PROJECT_PRODUCTION }} \
            --format='value(serviceConfig.uri)')
          echo "function_url=$URL" >> $GITHUB_OUTPUT
          echo "Deployed to: $URL"

      - name: Test deployment
        run: |
          curl -f ${{ steps.get-url.outputs.function_url }}/health || exit 1
          echo "Health check passed!"

      - name: Run integration tests
        run: |
          export CLOUD_FUNCTION_URL=${{ steps.get-url.outputs.function_url }}
          # Add integration test commands here
          # Example: pnpm test:integration

      - name: Create deployment summary
        run: |
          echo "## 🚀 Production Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "✅ Deployed successfully to production" >> $GITHUB_STEP_SUMMARY
          echo "📍 URL: ${{ steps.get-url.outputs.function_url }}" >> $GITHUB_STEP_SUMMARY
          echo "🔗 Health: ${{ steps.get-url.outputs.function_url }}/health" >> $GITHUB_STEP_SUMMARY
          echo "⏰ Timestamp: $(date)" >> $GITHUB_STEP_SUMMARY

      - name: Notify deployment (optional)
        run: |
          echo "Send notification to Slack/Discord/Email here"
          # Example: curl -X POST $SLACK_WEBHOOK_URL -d '{"text":"Production deployed!"}'
```

---

## GitHub Repository Setup

### Step 5: Configure GitHub Secrets

Add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

#### Required Secrets:

```
GCP_SA_KEY_STAGING          - Service account JSON for staging
GCP_SA_KEY_PRODUCTION       - Service account JSON for production
GCP_PROJECT_STAGING         - GCP project ID for staging
GCP_PROJECT_PRODUCTION      - GCP project ID for production
```

#### Optional Secrets (if using):

```
GOOGLE_CLIENT_ID            - OAuth client ID
GOOGLE_CLIENT_SECRET        - OAuth client secret
CODECOV_TOKEN              - Codecov upload token
SLACK_WEBHOOK_URL          - Slack notification webhook
```

### Step 6: Create Service Accounts

Create service accounts with deployment permissions:

```bash
# For staging
gcloud iam service-accounts create github-actions-staging \
  --display-name="GitHub Actions - Staging" \
  --project=$GCP_PROJECT_STAGING

# Grant permissions
gcloud projects add-iam-policy-binding $GCP_PROJECT_STAGING \
  --member="serviceAccount:github-actions-staging@$GCP_PROJECT_STAGING.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.developer"

gcloud projects add-iam-policy-binding $GCP_PROJECT_STAGING \
  --member="serviceAccount:github-actions-staging@$GCP_PROJECT_STAGING.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Generate key
gcloud iam service-accounts keys create staging-key.json \
  --iam-account=github-actions-staging@$GCP_PROJECT_STAGING.iam.gserviceaccount.com

# Copy contents to GitHub secret GCP_SA_KEY_STAGING
cat staging-key.json

# Repeat for production
```

### Step 7: Configure GitHub Environments

**Settings → Environments → New environment**

#### Create two environments:

1. **staging**
   - Deployment branches: `develop`
   - No protection rules needed

2. **production**
   - Deployment branches: `main`
   - Required reviewers: Add yourself or team members
   - Wait timer: 5 minutes (optional)

---

## Advanced: Pre-commit Hooks

### Step 8: Add Pre-commit Checks

Install Husky for pre-commit hooks:

```bash
cd /Users/trilliumsmith/code/calendar-merge-service

# Install husky
pnpm add -D husky lint-staged

# Initialize husky
pnpm exec husky init
```

**File:** `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run linting and tests before commit
cd gcp
pnpm lint || exit 1
pnpm test || exit 1
```

**File:** `package.json` (root)

```json
{
  "scripts": {
    "prepare": "husky install"
  },
  "lint-staged": {
    "gcp/**/*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

---

## Monitoring & Notifications

### Step 9: Add Status Badges to README

**File:** `README.md` (root)

```markdown
# Calendar Merge Service

![CI](https://github.com/your-username/calendar-merge-service/workflows/CI%20-%20Test%20%26%20Build/badge.svg)
![Deploy Staging](https://github.com/your-username/calendar-merge-service/workflows/CD%20-%20Deploy%20to%20Staging/badge.svg)
![Deploy Production](https://github.com/your-username/calendar-merge-service/workflows/CD%20-%20Deploy%20to%20Production/badge.svg)
[![codecov](https://codecov.io/gh/your-username/calendar-merge-service/branch/main/graph/badge.svg)](https://codecov.io/gh/your-username/calendar-merge-service)

Your project description here...
```

### Step 10: Set Up Slack Notifications (Optional)

**File:** `.github/workflows/notify.yml`

```yaml
name: Notify

on:
  workflow_run:
    workflows: ["CD - Deploy to Production"]
    types:
      - completed

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1.25.0
        with:
          payload: |
            {
              "text": "Production deployment ${{ github.event.workflow_run.conclusion }}!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Production Deployment*\nStatus: ${{ github.event.workflow_run.conclusion }}\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Testing the Pipeline

### Step 11: Test CI/CD

```bash
cd /Users/trilliumsmith/code/calendar-merge-service

# Create a test branch
git checkout -b test-ci

# Make a small change to gcp code
echo "// Test CI" >> gcp/src/index.ts

# Commit and push
git add .
git commit -m "test: trigger CI pipeline"
git push origin test-ci

# Open GitHub and watch Actions tab
# Should see:
# 1. CI - Test & Build (running)
# 2. Build passes
# 3. Tests pass
```

### Step 12: Test Deployment

```bash
# Merge to develop (triggers staging deployment)
git checkout develop
git merge test-ci
git push origin develop

# Watch GitHub Actions - should deploy to staging

# Merge to main (triggers production deployment)
git checkout main
git merge develop
git push origin main

# Watch GitHub Actions - should deploy to production
# (Requires approval if environment protection enabled)
```

---

## Validation Checklist

- [ ] GitHub Actions workflows created
- [ ] Service accounts created with proper permissions
- [ ] GitHub secrets configured
- [ ] GitHub environments configured (staging, production)
- [ ] CI workflow runs on PRs and pushes
- [ ] Tests pass in CI
- [ ] Build succeeds in CI
- [ ] Deploy to staging works
- [ ] Deploy to production works (with approval)
- [ ] Health checks pass after deployment
- [ ] Status badges added to README
- [ ] Pre-commit hooks configured (optional)
- [ ] Notifications set up (optional)

---

## CI/CD Flow Diagram

```
Developer commits to feature branch
    ↓
GitHub Actions: CI Pipeline
    ├─ Install dependencies
    ├─ Run linter
    ├─ Run tests
    └─ Build TypeScript
    ↓
✅ All checks pass → Merge to develop
    ↓
GitHub Actions: Deploy to Staging
    ├─ Run tests again
    ├─ Build
    ├─ Deploy to calendarSync-staging
    ├─ Run health check
    └─ Notify team
    ↓
Manual testing on staging
    ↓
Merge to main
    ↓
GitHub Actions: Deploy to Production
    ├─ Run tests again
    ├─ Build
    ├─ (Wait for approval)
    ├─ Deploy to calendarSync
    ├─ Run health check
    ├─ Run integration tests
    └─ Notify team
    ↓
✅ Production deployed!
```

---

## Benefits

After setting up CI/CD:

✅ **Automated testing** - Never deploy broken code
✅ **Consistent builds** - Same process every time
✅ **Fast feedback** - Know immediately if tests fail
✅ **Safe deployments** - Staging → Production flow
✅ **Code quality** - Linting enforced
✅ **Team confidence** - Reviewers see test results
✅ **Documentation** - Pipeline is self-documenting
✅ **Rollback capability** - Easy to revert if needed

---

## Cost Estimate

### GitHub Actions (Free Tier)

- **Public repos:** Unlimited minutes
- **Private repos:** 2,000 minutes/month free
- **Typical usage:** ~50-100 minutes/month
- **Cost:** $0 (within free tier)

### Google Cloud Build Alternative

- **Free tier:** 120 build-minutes/day
- **Typical usage:** ~20 minutes/day
- **Cost:** $0 (within free tier)

---

## Troubleshooting

### Common Issues

**1. Authentication fails**
```bash
# Check service account permissions
gcloud projects get-iam-policy $GCP_PROJECT

# Verify secret is valid JSON
cat staging-key.json | jq .
```

**2. Tests fail in CI but pass locally**
```bash
# Check Node version matches
node --version  # Should be 22

# Check environment variables
# Add debug step to workflow:
- name: Debug environment
  run: env | sort
```

**3. Deployment fails**
```bash
# Check Cloud Functions quota
gcloud functions list --project=$GCP_PROJECT

# Check logs
gcloud functions logs read calendarSync --limit=50
```

---

## Next Steps After Setup

1. **Add more tests** - Increase coverage to >90%
2. **Add integration tests** - Test deployed function
3. **Set up monitoring** - Cloud Monitoring alerts
4. **Add performance tests** - Load testing
5. **Document pipeline** - Update team wiki

---

## Related Tasks

- **Task 16:** Testing setup (prerequisite)
- **Task 19:** Port existing tests (prerequisite)
- **Task 17:** Integration testing (used in CD pipeline)
- **Task 18:** Production deployment (automated by CD)

---

## Success Criteria

- [ ] Every commit triggers CI
- [ ] All tests must pass to merge
- [ ] Staging deploys automatically on merge to `develop`
- [ ] Production deploys automatically on merge to `main` (with approval)
- [ ] Health checks verify deployments
- [ ] Team gets notified of deployments
- [ ] Can rollback easily if needed

**With CI/CD in place, you have a professional, maintainable deployment process! 🚀**
