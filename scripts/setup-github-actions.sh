#!/bin/bash
# Setup script for GitHub Actions CI/CD

set -e

echo "🚀 GitHub Actions CI/CD Setup"
echo "=============================="
echo ""

# Load environment variables
if [ -f .env.gcp ]; then
    source .env.gcp
else
    echo "❌ Error: .env.gcp file not found"
    exit 1
fi

echo "📋 Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Service Account: $SERVICE_ACCOUNT_EMAIL"
echo ""

# Step 1: Create service account key
echo "Step 1: Creating service account key for GitHub Actions..."
KEY_FILE="github-actions-key.json"

if [ -f "$KEY_FILE" ]; then
    echo "⚠️  Warning: $KEY_FILE already exists. Delete it first if you want to create a new one."
    read -p "Delete existing key and create new one? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm "$KEY_FILE"
    else
        echo "Skipping key creation."
        exit 0
    fi
fi

gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SERVICE_ACCOUNT_EMAIL"

echo "✅ Service account key created: $KEY_FILE"
echo ""

# Step 2: Grant required permissions
echo "Step 2: Granting required IAM permissions..."

ROLES=(
    "roles/cloudfunctions.developer"
    "roles/iam.serviceAccountUser"
    "roles/cloudbuild.builds.editor"
    "roles/storage.admin"
)

for role in "${ROLES[@]}"; do
    echo "  Granting $role..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
      --role="$role" \
      --quiet > /dev/null
done

echo "✅ IAM permissions granted"
echo ""

# Step 3: Display secrets to add to GitHub
echo "Step 3: GitHub Secrets Configuration"
echo "====================================="
echo ""
echo "Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions"
echo ""
echo "Add these secrets:"
echo ""
echo "1. GCP_PROJECT_ID"
echo "   Value: $PROJECT_ID"
echo ""
echo "2. GCP_REGION"
echo "   Value: $REGION"
echo ""
echo "3. GCP_SERVICE_ACCOUNT_EMAIL"
echo "   Value: $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "4. GCP_SA_KEY"
echo "   Value: (paste the entire contents below)"
echo ""
echo "--- Copy from here ---"
cat "$KEY_FILE"
echo ""
echo "--- Copy to here ---"
echo ""

# Step 4: Security reminder
echo "⚠️  SECURITY REMINDER"
echo "===================="
echo ""
echo "After copying the key to GitHub Secrets, DELETE the local file:"
echo "  rm $KEY_FILE"
echo ""
echo "To verify the workflow:"
echo "1. git add .github/workflows/ci-cd.yml"
echo "2. git commit -m \"ci: add GitHub Actions workflow\""
echo "3. git push"
echo ""
echo "✅ Setup complete! Check the GitHub Actions tab after pushing."
