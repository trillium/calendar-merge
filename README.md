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

- **Source Calendars** → Push notifications → **handleWebhook Function**
- **handleWebhook** → Real-time incremental sync → **Target Calendar**
- **Cloud Tasks** → Orchestrates → **batchSync Function** (initial sync)
- **batchSync** → Processes events in batches → **Target Calendar**
- **Firestore** → Stores event mappings & sync state
- **Cloud Scheduler** → Renews watches daily

See [Architecture Documentation](docs/ARCHITECTURE.md) for details.

## Environment Variables

### Required for Cloud Functions

Set these when deploying the `batchSync` function:

```bash
PROJECT_ID=your-gcp-project-id
PROJECT_NUMBER=123456789012  # Get from: terraform output project_number
REGION=us-central1           # Or your deployment region
```

### Required for Next.js (Vercel)

```bash
FUNCTION_URL=https://REGION-PROJECT_ID.cloudfunctions.net
PROJECT_ID=your-gcp-project-id
REGION=us-central1
```

## Deployment

### Individual Functions

```bash
# Deploy batch sync function
pnpm deploy:batchSync

# Deploy webhook handler
pnpm deploy:handleWebhook

# Deploy watch renewal
pnpm deploy:renewWatches

# Deploy all functions
pnpm deploy:functions
```

### Grant Permissions

After deploying `batchSync`, grant Cloud Tasks permission to invoke it:

```bash
./scripts/deploy/grant-batchSync-permissions.sh
```

## Troubleshooting

### Sync Status Shows "Failed"

1. Check Cloud Function logs:
   ```bash
   gcloud functions logs read batchSync --gen2 --region=us-central1 --limit=50
   ```

2. Check for common issues:
   - Missing environment variables (PROJECT_ID, PROJECT_NUMBER)
   - Insufficient IAM permissions
   - Google Calendar API quota exceeded

### Events Not Syncing

1. Verify watch is active:
   - Check Firestore `watches` collection
   - Confirm `syncState.status = 'complete'`

2. Check webhook delivery:
   ```bash
   gcloud functions logs read handleWebhook --gen2 --region=us-central1 --limit=50
   ```

3. Verify API access:
   - OAuth consent screen configured
   - Calendar API enabled
   - Service account has calendar access

### Slow Initial Sync

This is expected for large calendars:
- 50 events per batch
- 150ms delay between events (rate limiting)
- Example: 500 events = ~90 seconds

Check progress in Firestore: `watches/{channelId}/syncState`

## Project Structure

```
├── terraform/              # Infrastructure as code
│   └── main.tf            # Cloud Tasks, Firestore, IAM
├── functions/             # Cloud Function source code
│   └── calendar-sync/
│       ├── batchSync.ts   # Async initial sync
│       ├── watch.ts       # Watch management
│       └── sync.ts        # Event sync logic
├── nextjs/                # Frontend web app
├── scripts/               # Automation scripts
│   └── deploy/            # Deployment scripts
└── docs/                  # Documentation
    └── ARCHITECTURE.md    # System architecture
```

## Manual Steps Required

1. Create GCP account (one-time)
2. OAuth consent screen setup (2 minutes, one-time)

Everything else is automated!
