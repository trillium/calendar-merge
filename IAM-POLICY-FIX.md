# IAM Policy Fix - Deployment Issue Resolution

## Problem

GitHub Actions deployment was failing with:
```
Permission 'run.services.setIamPolicy' denied
```

The service account couldn't set IAM policies when using `--allow-unauthenticated`.

## Solution: Separation of Concerns

Instead of giving the service account more permissions, we separated IAM policy management from code deployment.

### Step 1: Manual IAM Policy (One-time, by owner)

```bash
gcloud run services add-iam-policy-binding handlewebhook \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --platform=managed
```

**What this does:**
- Allows public internet access to the webhook endpoint
- Required for Google Calendar to send webhook notifications
- Persists across deployments
- Only needs to be done once

### Step 2: Updated CI/CD Workflow

Removed `--allow-unauthenticated` flag from deployment:

```yaml
# Before
gcloud functions deploy handleWebhook \
  --allow-unauthenticated \  # ← Removed this
  ...

# After
gcloud functions deploy handleWebhook \
  # IAM policy already set manually
  ...
```

**Benefits:**
- ✅ Service account needs fewer permissions (more secure)
- ✅ IAM policies managed separately from code
- ✅ Clearer security boundary
- ✅ Deployments succeed without IAM permission errors

## Verification

Check that the function is publicly accessible:

```bash
# Get function URL
gcloud functions describe handleWebhook \
  --region=us-central1 \
  --gen2 \
  --format="value(serviceConfig.uri)"

# Test it
curl <FUNCTION_URL>
```

## If You Need to Change IAM Policy Later

```bash
# Make it private (remove public access)
gcloud run services remove-iam-policy-binding handlewebhook \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"

# Make it public again
gcloud run services add-iam-policy-binding handlewebhook \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

## Service Account Permissions Summary

The `calendar-sync-sa` service account now has:
- ✅ `roles/cloudfunctions.developer` - Deploy functions
- ✅ `roles/run.developer` - Update Cloud Run services
- ✅ `roles/cloudbuild.builds.editor` - Build code
- ✅ `roles/storage.admin` - Manage artifacts
- ✅ `roles/iam.serviceAccountUser` - Run as service account
- ✅ `roles/datastore.user` - Access Firestore
- ❌ **Does NOT have** - Permission to modify IAM policies (security!)

## Status

✅ **RESOLVED** - Deployments should now succeed without IAM permission errors.
