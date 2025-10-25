terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {
  project_id = var.project_id
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "service_account_email" {
  description = "Service account email"
  type        = string
}

# Firestore Database
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  lifecycle {
    prevent_destroy = false
  }
}

# Firestore Index for efficient queries
resource "google_firestore_index" "event_mappings_index" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "event_mappings"

  fields {
    field_path = "source_calendar_id"
    order      = "ASCENDING"
  }

  fields {
    field_path = "source_event_id"
    order      = "ASCENDING"
  }

  fields {
    field_path = "__name__"
    order      = "ASCENDING"
  }
}

# Storage bucket for Cloud Function source code
resource "google_storage_bucket" "function_bucket" {
  name     = "${var.project_id}-function-source"
  location = var.region
  
  uniform_bucket_level_access = true
  
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 30
    }
  }
}

# Secret Manager for OAuth tokens
resource "google_secret_manager_secret" "oauth_tokens" {
  secret_id = "calendar-oauth-tokens"
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "oauth_access" {
  secret_id = google_secret_manager_secret.oauth_tokens.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_account_email}"
}

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

# IAM binding for Cloud Tasks to invoke Cloud Functions
resource "google_project_iam_member" "cloudtasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${var.service_account_email}"
}

# Cloud Scheduler job for watch renewal
resource "google_cloud_scheduler_job" "renew_watches" {
  name             = "renew-calendar-watches"
  description      = "Renews Google Calendar watch subscriptions"
  schedule         = "0 0 * * *"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-${var.project_id}.cloudfunctions.net/renewWatches"

    oidc_token {
      service_account_email = var.service_account_email
    }
  }

  depends_on = [google_firestore_database.database]
}

output "project_id" {
  value = var.project_id
}

output "project_number" {
  value       = data.google_project.project.number
  description = "Project number for Cloud Tasks OIDC authentication"
}

output "firestore_database" {
  value = google_firestore_database.database.name
}

output "function_bucket" {
  value = google_storage_bucket.function_bucket.name
}

output "cloud_tasks_queue" {
  value = google_cloud_tasks_queue.calendar_sync_queue.name
}

output "scheduler_job" {
  value = google_cloud_scheduler_job.renew_watches.name
}

output "cloudtasks_service_account" {
  value       = "service-${data.google_project.project.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
  description = "Cloud Tasks service account for OIDC authentication"
}
