# GitHub Actions Setup Checklist

Use this checklist to ensure CI/CD is configured correctly.

## Prerequisites
- [ ] Repository is on GitHub
- [ ] You have admin access to the repository
- [ ] GCP project is set up and functions are working
- [ ] You have `gcloud` CLI installed and authenticated

## Setup Steps

### 1. Run Setup Script
```bash
cd /Users/trilliumsmith/code/calendar-merge-service
./scripts/setup-github-actions.sh
```

- [ ] Script completed without errors
- [ ] Service account key created: `github-actions-key.json`
- [ ] IAM permissions granted
- [ ] Script printed 4 secrets to add to GitHub

### 2. Add GitHub Secrets

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`

Click "New repository secret" for each:

- [ ] Added `GCP_PROJECT_ID`
- [ ] Added `GCP_REGION`
- [ ] Added `GCP_SERVICE_ACCOUNT_EMAIL`
- [ ] Added `GCP_SA_KEY` (entire JSON, including `{` and `}`)

### 3. Security Cleanup

- [ ] Verified all 4 secrets are in GitHub
- [ ] Deleted local key file: `rm github-actions-key.json`
- [ ] Confirmed `github-actions-key.json` is in `.gitignore`

### 4. Commit Workflow

```bash
git add .github/workflows/ci-cd.yml
git add .gitignore
git commit -m "ci: add GitHub Actions CI/CD workflow"
git push origin main
```

- [ ] Workflow file committed
- [ ] Changes pushed to GitHub
- [ ] No secrets committed (check with `git log -p`)

### 5. Verify First Run

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`

- [ ] Workflow run appears
- [ ] Test job is running/passed
- [ ] Deploy job is running/passed (if on main branch)
- [ ] No errors in logs

### 6. Test on Feature Branch

```bash
git checkout -b test-ci
git commit --allow-empty -m "test: verify CI pipeline"
git push origin test-ci
```

- [ ] Test job runs on feature branch
- [ ] Deploy job is skipped (not main branch)
- [ ] Tests pass successfully

### 7. Test Auto-Deploy

```bash
git checkout main
git merge test-ci
git push origin main
```

- [ ] Test job runs
- [ ] Deploy job runs (only on main)
- [ ] Functions deployed to GCP
- [ ] Deployment logs show success

### 8. Verify Deployed Functions

```bash
gcloud functions list --regions=us-central1
```

- [ ] `handleWebhook` function listed
- [ ] `renewWatches` function listed
- [ ] Functions are in ACTIVE state
- [ ] Recent deploy time matches GitHub Actions timestamp

### 9. Optional: Branch Protection

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/branches`

Add rule for `main`:

- [ ] Require pull request before merging
- [ ] Require status checks to pass
- [ ] Require "test" check to pass
- [ ] Require branches to be up to date

### 10. Test Full Workflow

```bash
git checkout -b feature/test-full-workflow
# Make a small change
echo "# Test" >> test.txt
git add test.txt
git commit -m "test: full CI/CD workflow"
git push origin feature/test-full-workflow
```

On GitHub:
- [ ] Create pull request
- [ ] Wait for tests to pass
- [ ] Merge pull request
- [ ] Verify automatic deployment
- [ ] Cleanup: `git branch -d feature/test-full-workflow`

## Troubleshooting

### ❌ Tests fail in CI but pass locally
```bash
# Run exactly as CI does
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

### ❌ Deploy job doesn't run
Check:
- [ ] Job is on `main` branch
- [ ] Test job passed first
- [ ] Not a pull request (only direct pushes to main)

### ❌ Deploy fails with "Permission Denied"
Re-run step 1 to grant IAM permissions:
```bash
./scripts/setup-github-actions.sh
```

### ❌ Deploy fails with "Invalid credentials"
Check:
- [ ] `GCP_SA_KEY` secret contains entire JSON (with `{` and `}`)
- [ ] No extra spaces or newlines in secret
- [ ] JSON is valid (paste into JSON validator)

## Success Criteria

✅ All items checked above
✅ Tests run automatically on every push
✅ Deployment happens automatically on main branch
✅ Functions are deployed and working
✅ No secrets in git repository
✅ Documentation is clear and accessible

## Post-Setup

Your workflow is now:
1. Create feature branch
2. Make changes
3. Push (tests run automatically)
4. Create PR
5. Merge to main (auto-deploy!)

No more manual deployments! 🎉

## Need Help?

- Full documentation: [docs/github-actions-setup.md](../docs/github-actions-setup.md)
- Quick start: [docs/CI-CD-QUICK-START.md](../docs/CI-CD-QUICK-START.md)
- Summary: [CICD-SETUP-SUMMARY.md](../CICD-SETUP-SUMMARY.md)
