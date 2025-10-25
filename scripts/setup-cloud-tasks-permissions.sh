#!/bin/bash
set -e

# Load environment variables
if [ -f .env.gcp ]; then
    source .env.gcp
else
    echo "Error: .env.gcp not found"
    exit 1
fi

echo "🔧 Setting up Cloud Tasks permissions..."
echo "Project: $PROJECT_ID"
echo "Project Number: $PROJECT_NUMBER"
echo ""

echo "📝 Granting service account permissions for Cloud Tasks..."

# Grant the service account permission to create tasks
echo "  - Granting Cloud Tasks enqueuer role to $SERVICE_ACCOUNT_EMAIL"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/cloudtasks.enqueuer" \
    --condition=None

# Grant the service account permission to act as itself (for OIDC token generation)
echo "  - Granting iam.serviceAccountUser to $SERVICE_ACCOUNT_EMAIL (self)"
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/iam.serviceAccountUser" \
    --project=$PROJECT_ID

# Get current user for local development
CURRENT_USER=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
if [ -n "$CURRENT_USER" ]; then
    echo "  - Granting iam.serviceAccountUser to $CURRENT_USER (for local dev)"
    gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
        --member="user:${CURRENT_USER}" \
        --role="roles/iam.serviceAccountUser" \
        --project=$PROJECT_ID
fi

echo ""
echo "✅ Cloud Tasks permissions configured successfully!"
