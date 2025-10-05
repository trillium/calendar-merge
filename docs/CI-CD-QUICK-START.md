# CI/CD Quick Start

## TL;DR

1. **Run setup script:**
   ```bash
   ./scripts/setup-github-actions.sh
   ```

2. **Add secrets to GitHub:**
   - Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`
   - Add the 4 secrets printed by the script

3. **Delete the key file:**
   ```bash
   rm github-actions-key.json
   ```

4. **Push code:**
   ```bash
   git add .
   git commit -m "ci: add GitHub Actions workflow"
   git push
   ```

5. **Check GitHub Actions tab** - tests run automatically!

## What Happens After Setup

### Every Push (Any Branch)
```
✅ Tests run
✅ Build verification
```

### Push to Main Branch
```
✅ Tests run
✅ Build verification
✅ Auto-deploy to GCP Cloud Functions
```

## GitHub Secrets Needed

| Name | Example Value |
|------|--------------|
| `GCP_PROJECT_ID` | `calendar-merge-1759477062` |
| `GCP_REGION` | `us-central1` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `calendar-sync-sa@...iam.gserviceaccount.com` |
| `GCP_SA_KEY` | `{...entire JSON...}` |

## Workflow File

Location: [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml)

## Full Documentation

See: [docs/github-actions-setup.md](github-actions-setup.md)

## Typical Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes, commit
git add .
git commit -m "feat: add awesome feature"

# 3. Push (triggers tests)
git push origin feature/my-feature

# 4. Create PR on GitHub
# 5. Review PR, tests must pass
# 6. Merge to main
# 7. Automatic deployment happens!
```

## Troubleshooting

**Tests fail in CI but pass locally?**
```bash
# Run tests exactly like CI does:
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

**Deploy fails?**
- Check GitHub Secrets are correct
- Verify service account has permissions
- Check Cloud Functions logs

**Need to redeploy?**
```bash
# Just push to main again
git commit --allow-empty -m "chore: trigger redeploy"
git push
```

## Disable Auto-Deploy (if needed)

Comment out the deploy job in `.github/workflows/ci-cd.yml`:

```yaml
# deploy:
#   name: Deploy to GCP
#   ...
```

Or set it to manual trigger only:

```yaml
on:
  workflow_dispatch:  # Manual trigger only
```
