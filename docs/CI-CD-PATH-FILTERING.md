# CI/CD Path Filtering

## Overview

The CI/CD workflow now uses **path filtering** to only build and deploy when relevant files change. This saves time and resources.

## How It Works

### 1. Change Detection Job

```yaml
changes:
  outputs:
    backend: true/false   # Did backend files change?
    frontend: true/false  # Did frontend files change?
```

Checks which files changed and sets output flags.

### 2. Conditional Jobs

Jobs only run if relevant files changed:

```yaml
test:
  needs: changes
  if: needs.changes.outputs.backend == 'true'
  # Only runs if backend files changed

deploy:
  needs: [changes, test]
  if: |
    github.ref == 'refs/heads/main' &&
    needs.changes.outputs.backend == 'true'
  # Only deploys if backend changed AND on main branch
```

## File Patterns

### Backend Files
Triggers: tests → build → deploy (on main)

```yaml
backend:
  - 'functions/**'           # Function source code
  - 'package.json'           # Root package.json
  - 'pnpm-lock.yaml'         # Dependency lockfile
```

**Note:** Workflow file changes (`.github/workflows/**`) do NOT trigger deployment. This prevents CI/CD configuration changes from unnecessarily redeploying backend functions.

### Frontend Files
Triggers: (to be configured)

```yaml
frontend:
  - 'web/**'                 # Web app files
```

## Examples

### Scenario 1: Update Backend Code
```bash
# Edit functions/calendar-sync/sync.ts
git commit -m "fix: improve sync logic"
git push
```
**Result:**
- ✅ Changes detected (backend)
- ✅ Tests run
- ✅ Deploy to GCP (if on main)

### Scenario 2: Update Documentation
```bash
# Edit README.md
git commit -m "docs: update README"
git push
```
**Result:**
- ⏭️ No backend changes
- ⏭️ Tests skipped
- ⏭️ Deploy skipped
- ⚡ Fast workflow (< 30 seconds)

### Scenario 3: Update Frontend
```bash
# Edit web/src/main.js
git commit -m "feat: improve UI"
git push
```
**Result:**
- ⏭️ No backend changes
- ⏭️ Backend tests skipped
- ⏭️ Backend deploy skipped
- ✅ Frontend changes detected (for future frontend build)

### Scenario 4: Update Both
```bash
# Edit functions/sync.ts and web/src/main.js
git commit -m "feat: add feature to backend and frontend"
git push
```
**Result:**
- ✅ Backend changes detected → test + deploy
- ✅ Frontend changes detected (for future use)

## Benefits

### Before (No Path Filtering)
- Every commit triggers full build/test/deploy
- Documentation changes deploy to GCP
- Wasted CI minutes
- Slower feedback

### After (With Path Filtering)
- Only relevant changes trigger builds
- Documentation changes complete in ~30s
- Saves CI minutes
- Faster feedback
- Lower GCP API calls

## Performance Impact

**Example repository with 100 commits/month:**

| Change Type | Frequency | Before | After |
|-------------|-----------|--------|-------|
| Backend code | 30 commits | 30 deploys | 30 deploys ✅ |
| Documentation | 40 commits | 40 deploys ❌ | 0 deploys ✅ |
| Frontend | 20 commits | 20 deploys ❌ | 0 deploys ✅ |
| Config/other | 10 commits | 10 deploys ❌ | 0 deploys ✅ |

**Result:** 70% reduction in unnecessary deployments

## Adding More Patterns

### Add Terraform Changes
```yaml
backend:
  - 'functions/**'
  - 'terraform/**'        # Infrastructure changes
  - 'package.json'
  - 'pnpm-lock.yaml'
```

### Ignore Specific Files
```yaml
backend:
  - 'functions/**'
  - '!functions/**/*.md'   # Ignore markdown in functions
  - '!functions/**/*.test.ts'  # Ignore tests (if wanted)
```

### Multiple Deployment Targets
```yaml
filters: |
  backend:
    - 'functions/**'
  frontend:
    - 'web/**'
  infrastructure:
    - 'terraform/**'
```

Then create separate jobs:
```yaml
deploy-backend:
  if: needs.changes.outputs.backend == 'true'

deploy-frontend:
  if: needs.changes.outputs.frontend == 'true'

deploy-infrastructure:
  if: needs.changes.outputs.infrastructure == 'true'
```

## Manual Override

You can still manually trigger deployment:

```bash
# Trigger workflow manually (deploys regardless of changes)
gh workflow run "CI/CD Pipeline" --ref main
```

Or in GitHub UI: Actions → CI/CD Pipeline → Run workflow

## Troubleshooting

### Deploy didn't run when I expected it to

Check:
1. Are you on `main` branch?
2. Did backend files actually change?
3. Did tests pass?

View the changes job output:
```bash
gh run view --log | grep "backend="
```

### Want to force a deploy

```bash
# Touch a backend file to trigger change detection
touch functions/calendar-sync/index.ts
git add functions/calendar-sync/index.ts
git commit -m "chore: trigger deploy"
git push
```

## Technical Details

Uses the `dorny/paths-filter` action which:
- Compares current commit with base branch
- Checks file patterns using glob syntax
- Returns boolean outputs for each filter
- Works with PRs and pushes

## Future Enhancements

- [ ] Add frontend deployment (Firebase Hosting, etc.)
- [ ] Add infrastructure deployment (Terraform)
- [ ] Add integration tests for deployments
- [ ] Add deployment notifications (Slack, Discord)
