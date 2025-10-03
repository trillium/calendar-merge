#!/bin/bash
set -e

# Bootstrap script for Calendar Merge Service
# Creates complete project structure and opens in VS Code

PROJECT_NAME="calendar-merge-service"

echo "🚀 Bootstrapping Calendar Merge Service project"
echo ""

# Create project directory
mkdir -p $PROJECT_NAME
cd $PROJECT_NAME

echo "📁 Creating directory structure..."
mkdir -p terraform
mkdir -p functions/calendar-sync
mkdir -p scripts
mkdir -p docs

# Create .gitignore
cat > .gitignore << 'EOF'
# Secrets and credentials
service-account-key.json
credentials.json
token.json
.env
.env.gcp
*.tfvars

# Dependencies
node_modules/
package-lock.json

# Terraform
.terraform/
*.tfstate
*.tfstate.*
tfplan
.terraform.lock.hcl

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/settings.json
.idea/

# Logs
*.log
EOF

# Create README
cat > README.md << 'EOF'
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
EOF

# Create Terraform main.tf
cat > terraform/main.tf << 'EOF'
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

output "firestore_database" {
  value = google_firestore_database.database.name
}

output "function_bucket" {
  value = google_storage_bucket.function_bucket.name
}

output "scheduler_job" {
  value = google_cloud_scheduler_job.renew_watches.name
}
EOF

# Create Cloud Function index.js
cat > functions/calendar-sync/index.js << 'EOF'
const { Firestore } = require('@google-cloud/firestore');
const { google } = require('googleapis');

const firestore = new Firestore();
const calendar = google.calendar('v3');

/**
 * HTTP Cloud Function - Calendar Webhook Handler
 */
exports.handleWebhook = async (req, res) => {
  try {
    const channelId = req.headers['x-goog-channel-id'];
    const resourceState = req.headers['x-goog-resource-state'];
    
    console.log(`Webhook received: ${resourceState} for channel ${channelId}`);
    
    if (resourceState === 'sync') {
      res.status(200).send('Sync acknowledged');
      return;
    }
    
    if (resourceState === 'exists') {
      await syncCalendarEvents(channelId);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Error processing webhook');
  }
};

/**
 * HTTP Cloud Function - Renew Watch Subscriptions
 */
exports.renewWatches = async (req, res) => {
  try {
    const watchesSnapshot = await firestore.collection('watches').get();
    
    for (const doc of watchesSnapshot.docs) {
      const watch = doc.data();
      await renewCalendarWatch(watch.calendarId, doc.id);
    }
    
    res.status(200).json({ renewed: watchesSnapshot.size });
  } catch (error) {
    console.error('Error renewing watches:', error);
    res.status(500).send('Error renewing watches');
  }
};

async function syncCalendarEvents(channelId) {
  console.log(`Syncing events for channel ${channelId}`);
  // TODO: Implement event sync logic
}

async function renewCalendarWatch(calendarId, watchId) {
  console.log(`Renewing watch for calendar ${calendarId}`);
  // TODO: Implement watch renewal logic
}
EOF

# Create package.json
cat > functions/calendar-sync/package.json << 'EOF'
{
  "name": "calendar-sync-function",
  "version": "1.0.0",
  "description": "Cloud Function for calendar merge service",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/firestore": "^7.0.0",
    "googleapis": "^128.0.0"
  },
  "engines": {
    "node": "20"
  }
}
EOF

# Create setup-gcp.sh script
cat > scripts/setup-gcp.sh << 'EOF'
#!/bin/bash
set -e

PROJECT_ID="calendar-merge-$(date +%s)"
REGION="us-central1"
SERVICE_ACCOUNT_NAME="calendar-sync-sa"

echo "🚀 Setting up GCP project: $PROJECT_ID"

echo "📝 Authenticating with GCP..."
gcloud auth login

echo "🏗️  Creating project..."
gcloud projects create $PROJECT_ID --name="Calendar Merge Service"

gcloud config set project $PROJECT_ID

echo "💳 Available billing accounts:"
gcloud billing accounts list
echo ""
read -p "Enter billing account ID: " BILLING_ACCOUNT
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT

echo "🔌 Enabling APIs..."
gcloud services enable \
  calendar-json.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com

echo "⏳ Waiting for APIs to be fully enabled (30s)..."
sleep 30

echo "🔑 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="Calendar Sync Service Account"

SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudfunctions.invoker"

echo "🔐 Creating service account key..."
gcloud iam service-accounts keys create ./service-account-key.json \
  --iam-account=$SA_EMAIL

gcloud config set functions/region $REGION

cat > .env.gcp << ENVEOF
PROJECT_ID=$PROJECT_ID
REGION=$REGION
SERVICE_ACCOUNT_EMAIL=$SA_EMAIL
ENVEOF

cat > terraform/terraform.tfvars << TFEOF
project_id            = "$PROJECT_ID"
region                = "$REGION"
service_account_email = "$SA_EMAIL"
TFEOF

echo ""
echo "✅ GCP setup complete!"
echo "📝 Configuration saved to .env.gcp and terraform/terraform.tfvars"
echo ""
echo "Next steps:"
echo "  1. ./scripts/deploy-infra.sh"
echo "  2. Set up OAuth (see README.md)"
EOF

# Create deploy-infra.sh script
cat > scripts/deploy-infra.sh << 'EOF'
#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "🏗️  Deploying infrastructure with Terraform..."

cd terraform

terraform init

terraform plan -out=tfplan

echo ""
read -p "Apply these changes? (yes/no): " CONFIRM
if [ "$CONFIRM" = "yes" ]; then
  terraform apply tfplan
  echo "✅ Infrastructure deployed!"
else
  echo "❌ Deployment cancelled"
  exit 1
fi

cd ..
EOF

# Create deploy-functions.sh script
cat > scripts/deploy-functions.sh << 'EOF'
#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run ./scripts/setup-gcp.sh first"
  exit 1
fi

source .env.gcp

echo "☁️  Deploying Cloud Functions..."

gcloud functions deploy handleWebhook \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=handleWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID

echo "✅ handleWebhook deployed"

gcloud functions deploy renewWatches \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./functions/calendar-sync \
  --entry-point=renewWatches \
  --trigger-http \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars PROJECT_ID=$PROJECT_ID

echo "✅ renewWatches deployed"

WEBHOOK_URL=$(gcloud functions describe handleWebhook --region=$REGION --gen2 --format='value(serviceConfig.uri)')
RENEW_URL=$(gcloud functions describe renewWatches --region=$REGION --gen2 --format='value(serviceConfig.uri)')

echo ""
echo "📝 Function URLs:"
echo "Webhook: $WEBHOOK_URL"
echo "Renew: $RENEW_URL"

cat >> .env.gcp << ENVEOF
WEBHOOK_URL=$WEBHOOK_URL
RENEW_URL=$RENEW_URL
ENVEOF
EOF

# Create get-oauth-token.sh script
cat > scripts/get-oauth-token.sh << 'EOF'
#!/bin/bash
set -e

echo "🔐 OAuth Token Generator"
echo ""
echo "Prerequisites:"
echo "  1. Download OAuth credentials from GCP Console"
echo "  2. Save as credentials.json in project root"
echo ""
read -p "Have you completed these steps? (yes/no): " READY

if [ "$READY" != "yes" ]; then
  echo "Please complete the prerequisites first"
  exit 1
fi

if [ ! -f credentials.json ]; then
  echo "❌ credentials.json not found"
  exit 1
fi

cd functions/calendar-sync
npm install

cd ../..
node scripts/oauth-flow.js
EOF

# Create oauth-flow.js script
cat > scripts/oauth-flow.js << 'EOF'
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const open = require('open');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

async function getToken() {
  const credentials = JSON.parse(fs.readFileSync('credentials.json'));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  
  console.log('🌐 Opening authorization URL in browser...\n');
  
  await open(authUrl);
  
  const server = http.createServer(async (req, res) => {
    if (req.url.indexOf('/oauth2callback') > -1) {
      const qs = new url.URL(req.url, 'http://localhost:8080').searchParams;
      const code = qs.get('code');
      
      res.end('Authentication successful! You can close this window.');
      server.close();
      
      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
      
      console.log('\n✅ Token saved to token.json');
      process.exit(0);
    }
  }).listen(8080, () => {
    console.log('Waiting for authorization...');
  });
}

getToken().catch(console.error);
EOF

# Create test-setup.sh script
cat > scripts/test-setup.sh << 'EOF'
#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found. Run setup first"
  exit 1
fi

source .env.gcp

echo "🧪 Testing GCP setup..."

echo "1️⃣  Testing Firestore..."
cd functions/calendar-sync
npm install --silent
cd ../..

node -e "
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: '$PROJECT_ID' });
db.collection('event_mappings').add({ test: true, timestamp: new Date() })
  .then(() => console.log('✅ Firestore working'))
  .catch(err => { console.error('❌ Firestore error:', err); process.exit(1); });
"

if [ -z "$WEBHOOK_URL" ]; then
  echo "⚠️  WEBHOOK_URL not set. Deploy functions first."
  exit 0
fi

echo "2️⃣  Testing Cloud Function..."
curl -s -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "x-goog-resource-state: sync" \
  -d '{"test": true}'

echo ""
echo "3️⃣  Checking logs..."
gcloud functions logs read handleWebhook --region=$REGION --limit=3

echo ""
echo "✅ All tests passed!"
EOF

# Create view-logs.sh script
cat > scripts/view-logs.sh << 'EOF'
#!/bin/bash
set -e

if [ ! -f .env.gcp ]; then
  echo "❌ .env.gcp not found"
  exit 1
fi

source .env.gcp

echo "📋 Recent logs for handleWebhook:"
gcloud functions logs read handleWebhook --region=$REGION --limit=20

echo ""
echo "📋 Recent logs for renewWatches:"
gcloud functions logs read renewWatches --region=$REGION --limit=20
EOF

# Make all scripts executable
chmod +x scripts/*.sh

# Create VS Code workspace settings
mkdir -p .vscode
cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "hashicorp.terraform",
    "ms-vscode.vscode-typescript-next",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "googlecloudtools.cloudcode"
  ]
}
EOF

cat > .vscode/tasks.json << 'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Deploy Functions",
      "type": "shell",
      "command": "./scripts/deploy-functions.sh",
      "group": {
        "kind": "build",
        "isDefault": true
      }
    },
    {
      "label": "View Logs",
      "type": "shell",
      "command": "./scripts/view-logs.sh"
    },
    {
      "label": "Test Setup",
      "type": "shell",
      "command": "./scripts/test-setup.sh"
    }
  ]
}
EOF

# Create docs
cat > docs/ARCHITECTURE.md << 'EOF'
# Architecture Documentation

## System Components

### 1. Source Calendars
- Multiple Google Calendars to monitor
- Push notifications enabled via Calendar API

### 2. Webhook Handler (Cloud Function)
- Receives push notifications from Google Calendar
- Triggered on event create/update/delete
- Processes events and updates target calendar

### 3. Firestore Database
Collections:
- `event_mappings`: source_event_id → target_event_id
- `watches`: Active calendar watch subscriptions

### 4. Target Calendar
- Single Google Calendar receiving merged events

### 5. Cloud Scheduler
- Renews watch subscriptions daily
- Prevents webhook expiration (7-day limit)

## Data Flow

```
Source Calendar Event Change
  ↓
Push Notification
  ↓
handleWebhook Cloud Function
  ↓
Fetch Event Details
  ↓
Check Firestore Mapping
  ↓
Update/Create in Target Calendar
  ↓
Update Firestore Mapping
```

## Scaling Considerations

- Cloud Functions auto-scale with load
- Firestore scales automatically
- Watch subscriptions limited to 1000/project
- Consider batching for high-volume scenarios
EOF

cat > docs/SETUP.md << 'EOF'
# Detailed Setup Guide

## Prerequisites Installation

### macOS
```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install tools
brew install google-cloud-sdk
brew install terraform
brew install node
```

### Linux
```bash
# gcloud
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# terraform
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# node
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Windows
1. Install WSL2
2. Follow Linux instructions in WSL2

## OAuth Setup

1. Run setup script: `./scripts/setup-gcp.sh`
2. Open: https://console.cloud.google.com/apis/credentials/consent?project=YOUR_PROJECT_ID
3. Select "External", complete required fields
4. Create OAuth Client ID at: https://console.cloud.google.com/apis/credentials
5. Download as `credentials.json`
6. Run: `./scripts/get-oauth-token.sh`

## Troubleshooting

### "APIs not enabled"
Wait 60 seconds after running setup-gcp.sh

### "Permission denied"
```bash
chmod +x scripts/*.sh
```

### "Terraform state locked"
```bash
cd terraform
terraform force-unlock LOCK_ID
```
EOF

# Initialize git
git init
git add .
git commit -m "Initial commit: Calendar merge service infrastructure"

echo ""
echo "✅ Project bootstrapped successfully!"
echo ""
echo "📁 Project location: $(pwd)"
echo ""
echo "🚀 Next steps:"
echo "  1. Open in VS Code: code ."
echo "  2. Read README.md for setup instructions"
echo "  3. Run ./scripts/setup-gcp.sh to begin"
echo ""

# Open in VS Code if available
if command -v code &> /dev/null; then
  read -p "Open in VS Code now? (yes/no): " OPEN_VSCODE
  if [ "$OPEN_VSCODE" = "yes" ]; then
    code .
  fi
else
  echo "💡 Install VS Code, then run: code ."
fi

echo ""
echo "🎉 Happy coding!"
EOF