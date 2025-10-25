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
  cloudtasks.googleapis.com \
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
