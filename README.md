# Calendar Merge Service

Near real-time Google Calendar merge service using GCP serverless infrastructure.

## Quick Start

### Prerequisites
- GCP account with billing enabled
- `gcloud` CLI installed
- `terraform` installed
- `node.js` 20+ installed

### Setup (First Time)

```bash
# 1. Bootstrap infrastructure
./scripts/setup-gcp.sh

# 2. Deploy infrastructure with Terraform
./scripts/deploy-infra.sh

# 3. Deploy Cloud Functions
./scripts/deploy-functions.sh

# 4. Get OAuth token (one-time)
./scripts/get-oauth-token.sh

# 5. Test the setup
./scripts/test-setup.sh
```

### Daily Development

```bash
# Deploy function changes
./scripts/deploy-functions.sh

# View logs
./scripts/view-logs.sh

# Destroy everything (careful!)
terraform destroy
```

## Architecture

- **Source Calendars** → Push notifications → **Cloud Functions**
- **Cloud Functions** → Read/Write → **Firestore** (mappings)
- **Cloud Functions** → Write → **Target Calendar**
- **Cloud Scheduler** → Renew watches daily

## Project Structure

```
├── terraform/          # Infrastructure as code
├── functions/          # Cloud Function source code
├── scripts/           # Automation scripts
└── docs/              # Documentation
```

## Manual Steps Required

1. Create GCP account (one-time)
2. OAuth consent screen setup (2 minutes, one-time)

Everything else is automated!
