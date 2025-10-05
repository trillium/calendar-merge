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
# 1. Set up GCP authentication and enable Calendar API
pnpm auth:setup

# 2. Build and deploy to GCP
pnpm build:deploy
```

### Development Workflow

```bash
# Local development
pnpm dev              # Run handleWebhook locally (http://localhost:8080)
pnpm dev:renew        # Run renewWatches locally
pnpm test             # Run test suite

# Manual deployment
pnpm build            # Compile TypeScript
pnpm deploy           # Deploy to GCP
pnpm build:deploy     # Build and deploy in one command

# Utilities
pnpm functions:list   # List deployed functions
```

### CI/CD (Automatic Deployment)

**Setup once:**
```bash
./scripts/setup-github-actions.sh
# Follow prompts to add secrets to GitHub
```

**Then just:**
- Push to any branch → Tests run automatically ✅
- Merge to `main` → Auto-deploy to GCP 🚀

See: [CI/CD Quick Start](docs/CI-CD-QUICK-START.md)

### Authentication

OAuth credentials are stored at:
- **Local development**: `~/.config/gcloud/application_default_credentials.json`
- **Production**: Secret Manager (`calendar-oauth-tokens`)

The credentials include:
- Google Calendar API access (read/write)
- Event create, update, delete permissions
- Watch subscription management

To refresh credentials: `pnpm auth:setup`

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
