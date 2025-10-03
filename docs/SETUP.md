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
