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
