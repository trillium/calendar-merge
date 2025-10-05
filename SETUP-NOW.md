# Setup GitHub Actions - Do This Now

## Step 1: Add Secrets to GitHub

Go to: **https://github.com/trillium/calendar-merge/settings/secrets/actions**

Click **"New repository secret"** and add each of these:

### Secret 1: GCP_PROJECT_ID
- Name: `GCP_PROJECT_ID`
- Value: `calendar-merge-1759477062`

### Secret 2: GCP_REGION
- Name: `GCP_REGION`
- Value: `us-central1`

### Secret 3: GCP_SERVICE_ACCOUNT_EMAIL
- Name: `GCP_SERVICE_ACCOUNT_EMAIL`
- Value: `calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com`

### Secret 4: GCP_SA_KEY
- Name: `GCP_SA_KEY`
- Value: Copy the **entire JSON** from `github-actions-key.json` (including the `{` and `}`)

The file is at: `/Users/trilliumsmith/code/calendar-merge-service/github-actions-key.json`

You can copy it with:
```bash
cat github-actions-key.json | pbcopy
```

Then paste into GitHub Secret value.

## Step 2: Delete the Key File

After you've added all 4 secrets to GitHub:

```bash
rm github-actions-key.json
```

**Important:** Verify the file is deleted!

## Step 3: Push the Workflow

```bash
git add .github/workflows/ci-cd.yml .gitignore
git commit -m "ci: add GitHub Actions CI/CD workflow"
git push origin main
```

## Step 4: Verify It Works

1. Go to: **https://github.com/trillium/calendar-merge/actions**
2. You should see a workflow run starting
3. Wait for it to complete (2-5 minutes)
4. Both jobs should show ✅ green checkmarks

## Step 5: Test with a Branch

```bash
# Create test branch
git checkout -b test-ci-workflow

# Make a small change
echo "# CI/CD Test" >> test.txt
git add test.txt
git commit -m "test: verify CI pipeline"

# Push (this will run tests only, not deploy)
git push origin test-ci-workflow
```

Check GitHub Actions - you should see:
- ✅ Test job runs
- ⏭️ Deploy job skipped (not on main)

## Done!

From now on:
- **Any push** → Tests run automatically
- **Merge to main** → Tests run + Auto-deploy to GCP

No more manual deployments! 🎉

## If Something Goes Wrong

Check:
- [ ] All 4 secrets are added to GitHub correctly
- [ ] `GCP_SA_KEY` contains the entire JSON (with `{` and `}`)
- [ ] No extra spaces or newlines in the secrets
- [ ] Workflow file is committed and pushed
- [ ] You deleted `github-actions-key.json` locally

See [.github/SETUP-CHECKLIST.md](.github/SETUP-CHECKLIST.md) for detailed troubleshooting.
