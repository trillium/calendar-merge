#!/bin/bash
# Setup GitHub Secrets programmatically using GitHub CLI

set -e

echo "🔐 GitHub Secrets Setup (No Clickops!)"
echo "======================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    echo ""
    echo "Install it with:"
    echo "  macOS:  brew install gh"
    echo "  Linux:  See https://github.com/cli/cli#installation"
    echo ""
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub CLI"
    echo ""
    echo "Run: gh auth login"
    echo ""
    exit 1
fi

# Load environment variables
if [ -f .env.gcp ]; then
    source .env.gcp
else
    echo "❌ Error: .env.gcp file not found"
    exit 1
fi

# Set repository (change this to match your repo)
REPO="trillium/calendar-merge"

echo "📋 Configuration:"
echo "  Repository: $REPO"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Service Account: $SERVICE_ACCOUNT_EMAIL"
echo ""

# Check if github-actions-key.json exists
if [ ! -f "github-actions-key.json" ]; then
    echo "❌ Error: github-actions-key.json not found"
    echo ""
    echo "Run this first:"
    echo "  ./scripts/setup-github-actions.sh"
    echo ""
    exit 1
fi

echo "Setting GitHub secrets..."
echo ""

# Set GCP_PROJECT_ID
echo "1/4 Setting GCP_PROJECT_ID..."
echo "$PROJECT_ID" | gh secret set GCP_PROJECT_ID --repo "$REPO"
echo "✅ GCP_PROJECT_ID set"

# Set GCP_REGION
echo "2/4 Setting GCP_REGION..."
echo "$REGION" | gh secret set GCP_REGION --repo "$REPO"
echo "✅ GCP_REGION set"

# Set GCP_SERVICE_ACCOUNT_EMAIL
echo "3/4 Setting GCP_SERVICE_ACCOUNT_EMAIL..."
echo "$SERVICE_ACCOUNT_EMAIL" | gh secret set GCP_SERVICE_ACCOUNT_EMAIL --repo "$REPO"
echo "✅ GCP_SERVICE_ACCOUNT_EMAIL set"

# Set GCP_SA_KEY from file
echo "4/4 Setting GCP_SA_KEY..."
gh secret set GCP_SA_KEY --repo "$REPO" < github-actions-key.json
echo "✅ GCP_SA_KEY set"

echo ""
echo "🎉 All secrets set successfully!"
echo ""

# Verify secrets
echo "Verifying secrets..."
gh secret list --repo "$REPO"
echo ""

# Security reminder
echo "⚠️  SECURITY REMINDER"
echo "===================="
echo ""
echo "Delete the local key file:"
echo "  rm github-actions-key.json"
echo ""

# Ask to delete the key file
read -p "Delete github-actions-key.json now? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    rm github-actions-key.json
    echo "✅ Deleted github-actions-key.json"
else
    echo "⚠️  Remember to delete it manually!"
fi

echo ""
echo "Next steps:"
echo "1. git add .github/workflows/ci-cd.yml"
echo "2. git commit -m 'ci: add GitHub Actions workflow'"
echo "3. git push origin main"
echo "4. Check https://github.com/$REPO/actions"
echo ""
echo "✅ Setup complete!"
