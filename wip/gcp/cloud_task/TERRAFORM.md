# Cloud Tasks Queue - Terraform Configuration

**Date**: 2025-11-14
**Status**: 🔧 Configuration Guide
**Goal**: Update Terraform to properly configure Cloud Tasks queue for batch sync

---

## Current State

Looking at `terraform/main.tf:103-117`, you **already have** a Cloud Tasks queue defined:

```hcl
# Cloud Tasks queue for batched sync
resource "google_cloud_tasks_queue" "calendar_sync_queue" {
  name     = "calendar-sync-queue"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts = 3
    max_backoff  = "3600s"
    min_backoff  = "5s"
  }
}
```

**Problem**: Current configuration is for **multi-user** scenario. Need to update for **single-user** use case.

---

## Required Changes

### Update 1: Queue Rate Limits (Single User)

**Current** (lines 107-110):
```hcl
rate_limits {
  max_dispatches_per_second = 10    # ❌ Too fast for single user
  max_concurrent_dispatches = 10    # ❌ Parallel not safe for single user
}
```

**Updated** (for single user with 50-event batches):
```hcl
rate_limits {
  max_dispatches_per_second = 0.1   # ✅ 1 dispatch per 10 seconds
  max_concurrent_dispatches = 1     # ✅ Sequential only (same user quota)
}
```

**Why**:
- 50 events per batch = 50 API quota units
- 0.1 dispatches/second = 1 dispatch every 10 seconds
- 50 events × 0.1 dispatches/sec = 5 events/sec = **500 events per 100 seconds** ✅
- Single user quota: **500 queries per 100 seconds**
- Sequential processing prevents quota collisions

### Update 2: Retry Configuration

**Current** (lines 112-116):
```hcl
retry_config {
  max_attempts = 3
  max_backoff  = "3600s"    # ❌ 1 hour is too long
  min_backoff  = "5s"       # ❌ Too short for rate limit errors
}
```

**Updated** (better for API rate limiting):
```hcl
retry_config {
  max_attempts       = 3
  max_backoff        = "300s"   # ✅ 5 minutes max
  min_backoff        = "10s"    # ✅ Start at 10 seconds
  max_doublings      = 5        # ✅ Control exponential growth
  max_retry_duration = "0s"     # ✅ No overall time limit
}
```

**Retry Schedule**:
- Attempt 1: Immediate
- Attempt 2: +10 seconds (min_backoff)
- Attempt 3: +20 seconds (doubled)
- Attempt 4: +40 seconds (doubled)
- After max_attempts: Task marked as failed

---

## Complete Updated Configuration

Replace lines 102-117 in `terraform/main.tf`:

```hcl
# Cloud Tasks queue for batched sync
# Configured for single-user sequential processing
# Rate: 50 events/batch × 0.1 dispatches/sec = 5 events/sec = 500 events/100sec
resource "google_cloud_tasks_queue" "calendar_sync_queue" {
  name     = "calendar-sync-queue"
  location = var.region

  rate_limits {
    # Single user: Process one 50-event batch every 10 seconds
    # This keeps us at Google Calendar API limit: 500 requests/100 seconds
    max_dispatches_per_second = 0.1   # 1 dispatch per 10 seconds
    max_concurrent_dispatches = 1     # Sequential only (prevents quota conflicts)
  }

  retry_config {
    # Retry failed tasks with exponential backoff
    max_attempts       = 3      # Retry up to 3 times
    min_backoff        = "10s"  # Start with 10 second delay
    max_backoff        = "300s" # Cap at 5 minutes
    max_doublings      = 5      # Exponential backoff steps
    max_retry_duration = "0s"   # No overall time limit (use max_attempts)
  }
}
```

---

## Multi-User Configuration (Future)

When you have multiple users, each with their own quota bucket, update to:

```hcl
resource "google_cloud_tasks_queue" "calendar_sync_queue" {
  name     = "calendar-sync-queue"
  location = var.region

  rate_limits {
    # Multi-user: Process up to 5 batches per second across all users
    # Each user has separate quota, so parallel is safe
    max_dispatches_per_second = 5     # 5 dispatches per second
    max_concurrent_dispatches = 10    # Up to 10 parallel tasks
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 5
    max_retry_duration = "0s"
  }
}
```

---

## IAM Configuration (Already Correct)

The existing IAM binding (lines 119-124) is correct:

```hcl
# IAM binding for Cloud Tasks to invoke Cloud Functions
resource "google_project_iam_member" "cloudtasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${var.service_account_email}"
}
```

This allows your application service account to **create tasks** in the queue.

### Additional IAM Needed

You'll also need to grant the **Cloud Tasks service account** permission to **invoke your Cloud Function**.

#### Current Architecture: Single Unified Cloud Function

Based on `gcp/deploy.sh`, you have **one consolidated Cloud Function** named `calendarSync` that handles all endpoints:
- `/health` - Health check
- `/webhook` - Google Calendar webhooks
- `/auth/*` - OAuth flow
- `/sync/*` - Sync operations
- `/batch/*` - Batch processing (new endpoints)

Since Cloud Functions Gen2 run on Cloud Run, use the Cloud Run IAM resource:

```hcl
# Grant Cloud Tasks service account permission to invoke the unified Cloud Function
# This allows Cloud Tasks to call /batch/continue and /batch/retry endpoints
resource "google_cloud_run_service_iam_member" "cloudtasks_invoker" {
  project  = var.project_id
  location = var.region
  service  = "calendarsync"  # Cloud Run service name (lowercase, no hyphens)
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
}
```

**Important Notes**:
- Cloud Function name in deploy script: `calendarSync` (camelCase)
- Cloud Run service name: `calendarsync` (lowercase, normalized)
- Function is deployed with `--allow-unauthenticated` for public endpoints
- Cloud Tasks uses OIDC tokens, so it can invoke even with authentication enabled
- You can verify the Cloud Run service name with:
  ```bash
  gcloud run services list --region=us-central1
  ```

---

## Environment-Based Configuration (Recommended)

Create separate queue configurations for dev/staging/prod:

### Option A: Use Terraform Workspaces

```hcl
locals {
  # Environment-specific rate limits
  rate_limits = terraform.workspace == "prod" ? {
    max_dispatches_per_second = 5    # Multi-user in production
    max_concurrent_dispatches = 10
  } : {
    max_dispatches_per_second = 0.1  # Single user in dev/staging
    max_concurrent_dispatches = 1
  }
}

resource "google_cloud_tasks_queue" "calendar_sync_queue" {
  name     = "calendar-sync-queue"
  location = var.region

  rate_limits {
    max_dispatches_per_second = local.rate_limits.max_dispatches_per_second
    max_concurrent_dispatches = local.rate_limits.max_concurrent_dispatches
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 5
    max_retry_duration = "0s"
  }
}
```

### Option B: Use Variables

```hcl
variable "queue_max_dispatches_per_second" {
  description = "Max Cloud Tasks dispatches per second"
  type        = number
  default     = 0.1  # Single user default
}

variable "queue_max_concurrent_dispatches" {
  description = "Max concurrent Cloud Tasks dispatches"
  type        = number
  default     = 1  # Single user default
}

resource "google_cloud_tasks_queue" "calendar_sync_queue" {
  name     = "calendar-sync-queue"
  location = var.region

  rate_limits {
    max_dispatches_per_second = var.queue_max_dispatches_per_second
    max_concurrent_dispatches = var.queue_max_concurrent_dispatches
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 5
    max_retry_duration = "0s"
  }
}
```

Then in `terraform.tfvars`:
```hcl
# Development (single user)
queue_max_dispatches_per_second = 0.1
queue_max_concurrent_dispatches = 1

# Production (multi-user) - use terraform.tfvars.prod
# queue_max_dispatches_per_second = 5
# queue_max_concurrent_dispatches = 10
```

---

## Applying Changes

### Step 1: Review Changes

```bash
cd terraform
terraform plan
```

Look for:
```
~ resource "google_cloud_tasks_queue" "calendar_sync_queue" {
    ~ rate_limits {
        ~ max_dispatches_per_second = 10 -> 0.1
        ~ max_concurrent_dispatches = 10 -> 1
      }
    ~ retry_config {
        ~ max_backoff  = "3600s" -> "300s"
        ~ min_backoff  = "5s" -> "10s"
        + max_doublings = 5
      }
  }
```

### Step 2: Apply Changes

```bash
terraform apply
```

### Step 3: Verify Queue Configuration

```bash
gcloud tasks queues describe calendar-sync-queue \
  --location=us-central1 \
  --project=calendar-merge-1759477062
```

Expected output:
```yaml
name: projects/calendar-merge-1759477062/locations/us-central1/queues/calendar-sync-queue
rateLimits:
  maxDispatchesPerSecond: 0.1
  maxConcurrentDispatches: 1
retryConfig:
  maxAttempts: 3
  minBackoff: 10s
  maxBackoff: 300s
  maxDoublings: 5
```

---

## Manual Update (Alternative to Terraform)

If you need to update the queue without Terraform:

```bash
gcloud tasks queues update calendar-sync-queue \
  --location=us-central1 \
  --max-dispatches-per-second=0.1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=3 \
  --min-backoff=10s \
  --max-backoff=300s \
  --max-doublings=5
```

**Warning**: Manual changes will be overwritten by next Terraform apply. Always update Terraform configuration too.

---

## Rate Limit Calculations

### Single User (Current Need)

| Batch Size | Dispatches/Sec | Events/Sec | Events/100s | Within Limit? |
|------------|----------------|------------|-------------|---------------|
| 25 events  | 0.2 (1 per 5s) | 5          | 500         | ✅ Yes        |
| 50 events  | 0.1 (1 per 10s)| 5          | 500         | ✅ Yes        |
| 50 events  | 0.2 (1 per 5s) | 10         | 1000        | ❌ **No - exceeds 500** |

### Multi-User (Future)

Assume 10 concurrent users, each processing batches:

| Batch Size | Dispatches/Sec | Events/Sec per User | Total Events/Sec | Safe? |
|------------|----------------|---------------------|------------------|-------|
| 50 events  | 5 (distributed)| 5                   | 50               | ✅ Yes (each user separate quota) |

**Key**: With multiple users, each has their own 500/100s quota. Parallel processing is safe as long as you don't exceed 5 events/sec **per user**.

---

## Testing Queue Configuration

### 1. Create Test Tasks

```bash
# Create a test task
gcloud tasks create-http-task test-task-1 \
  --queue=calendar-sync-queue \
  --location=us-central1 \
  --url=https://sector-ace-shell-warranties.trycloudflare.com/batch/continue \
  --method=POST \
  --header=Content-Type:application/json \
  --body-content='{"userId":"test","batchNumber":1}'
```

### 2. Monitor Queue

```bash
# Watch queue in real-time
watch -n 1 'gcloud tasks queues describe calendar-sync-queue --location=us-central1 | grep -A 10 "state:"'
```

### 3. Verify Rate Limiting

Create multiple tasks and verify they execute at 1 per 10 seconds:

```bash
# Create 5 tasks
for i in {1..5}; do
  gcloud tasks create-http-task test-task-$i \
    --queue=calendar-sync-queue \
    --location=us-central1 \
    --url=https://sector-ace-shell-warranties.trycloudflare.com/batch/continue \
    --method=POST \
    --header=Content-Type:application/json \
    --body-content="{\"userId\":\"test\",\"batchNumber\":$i}"
done

# Watch execution times - should be ~10 seconds apart
gcloud tasks list --queue=calendar-sync-queue --location=us-central1
```

---

## Monitoring & Observability

### Cloud Console

View queue metrics:
https://console.cloud.google.com/cloudtasks/queue/us-central1/calendar-sync-queue?project=calendar-merge-1759477062

**Metrics to watch**:
- Tasks dispatched per second (should hover around 0.1)
- Queue depth (pending tasks)
- Retry rate
- Error rate

### Terraform Outputs

Add helpful outputs to `terraform/main.tf`:

```hcl
output "cloud_tasks_queue_full_name" {
  value       = google_cloud_tasks_queue.calendar_sync_queue.id
  description = "Full resource name of Cloud Tasks queue"
}

output "cloud_tasks_queue_rate_limit" {
  value = {
    max_dispatches_per_second = google_cloud_tasks_queue.calendar_sync_queue.rate_limits[0].max_dispatches_per_second
    max_concurrent_dispatches = google_cloud_tasks_queue.calendar_sync_queue.rate_limits[0].max_concurrent_dispatches
  }
  description = "Current rate limit configuration"
}

output "cloud_tasks_console_url" {
  value       = "https://console.cloud.google.com/cloudtasks/queue/${var.region}/${google_cloud_tasks_queue.calendar_sync_queue.name}?project=${var.project_id}"
  description = "URL to view queue in Cloud Console"
}
```

After apply:
```bash
terraform output cloud_tasks_console_url
```

---

## Troubleshooting

### Issue: Tasks Not Executing

**Check 1**: Queue paused?
```bash
gcloud tasks queues describe calendar-sync-queue --location=us-central1 | grep state
# Should be: state: RUNNING
```

**Check 2**: IAM permissions?
```bash
# Check if Cloud Tasks can invoke your function
gcloud functions get-iam-policy YOUR_FUNCTION_NAME --region=us-central1
# Look for: service-PROJECT_NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com
```

**Check 3**: Tasks in queue?
```bash
gcloud tasks list --queue=calendar-sync-queue --location=us-central1
```

### Issue: Rate Limiting Too Slow

If you need faster processing (and have multiple users):

```bash
# Temporarily increase rate
gcloud tasks queues update calendar-sync-queue \
  --location=us-central1 \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=3

# Don't forget to update Terraform too!
```

### Issue: Tasks Failing with 401/403

**Problem**: OIDC authentication failing

**Diagnosis**:
```bash
# Check if Cloud Tasks service account has invoke permission
gcloud run services get-iam-policy calendarsync \
  --region=us-central1 \
  --project=calendar-merge-1759477062

# Look for:
# members:
# - serviceAccount:service-PROJECT_NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com
# role: roles/run.invoker
```

**Solution**: Add IAM binding for Cloud Tasks service account (see IAM section above)

**Manual fix** (if not using Terraform):
```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe calendar-merge-1759477062 --format='value(projectNumber)')

# Grant permission
gcloud run services add-iam-policy-binding calendarsync \
  --region=us-central1 \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Summary of Changes Needed

### Immediate (Single User)

#### 1. Update Cloud Tasks Queue Rate Limits

**File**: `terraform/main.tf:107-110`

**Change**:
```hcl
rate_limits {
  max_dispatches_per_second = 0.1   # Was: 10 → Now: 1 per 10 seconds
  max_concurrent_dispatches = 1     # Was: 10 → Now: Sequential only
}
```

#### 2. Update Retry Configuration

**File**: `terraform/main.tf:112-116`

**Change**:
```hcl
retry_config {
  max_attempts       = 3      # Keep same
  max_backoff        = "300s" # Was: "3600s" → Now: 5 minutes max
  min_backoff        = "10s"  # Was: "5s" → Now: 10 seconds
  max_doublings      = 5      # Add this line
  max_retry_duration = "0s"   # Add this line (no overall time limit)
}
```

#### 3. Add Cloud Tasks Invoker IAM Binding

**File**: `terraform/main.tf` (new resource after line 124)

**Add**:
```hcl
# Grant Cloud Tasks service account permission to invoke unified Cloud Function
# Required for /batch/continue and /batch/retry endpoints
resource "google_cloud_run_service_iam_member" "cloudtasks_invoker" {
  project  = var.project_id
  location = var.region
  service  = "calendarsync"  # Your unified Cloud Function (Cloud Run service)
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
}
```

**Why this is needed**:
- Your Cloud Function is deployed as Cloud Run Gen2
- Cloud Tasks needs `roles/run.invoker` to call HTTP endpoints
- The service account format is `service-PROJECT_NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com`

#### 4. Apply Terraform Changes

```bash
cd terraform

# Review changes
terraform plan

# Expected output:
# ~ google_cloud_tasks_queue.calendar_sync_queue will be updated in-place
# + google_cloud_run_service_iam_member.cloudtasks_invoker will be created

# Apply changes
terraform apply

# Verify
terraform output cloudtasks_service_account
```

#### 5. Verify Cloud Run Service Name

If IAM binding fails, check the actual Cloud Run service name:

```bash
# List Cloud Run services
gcloud run services list --region=us-central1 --project=calendar-merge-1759477062

# Should show:
# NAME            REGION       URL
# calendarsync    us-central1  https://calendarsync-xxx.a.run.app
```

If the service name is different, update the `service` field in the IAM resource.

### Future (Multi-User)

When scaling to multiple users:
1. Change `max_dispatches_per_second` to `5`
2. Change `max_concurrent_dispatches` to `10`
3. Keep retry config the same

---

## References

- [Cloud Tasks Queue Configuration](https://cloud.google.com/tasks/docs/creating-queues)
- [Terraform google_cloud_tasks_queue](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_tasks_queue)
- [Rate Limits Documentation](https://cloud.google.com/tasks/docs/configuring-queues#rate)
- [Retry Configuration](https://cloud.google.com/tasks/docs/configuring-queues#retry-parameters)
