#!/bin/bash
# CloudFlare Tunnel helper script for local development
# This creates an HTTPS tunnel to your local dev server for Google Calendar webhooks

set -e

echo "🚇 Starting CloudFlare Tunnel for local development..."
echo ""
echo "This will create an HTTPS URL for your local server at http://localhost:8080"
echo "Google Calendar webhooks require HTTPS, so this is necessary for local testing."
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed"
    echo ""
    echo "Installing cloudflared with Homebrew..."
    brew install cloudflare/cloudflare/cloudflared
    echo "✅ cloudflared installed successfully"
    echo ""
fi

# Check if port 8080 is in use
if ! nc -z localhost 8080 2>/dev/null; then
    echo "⚠️  WARNING: Port 8080 is not responding"
    echo "Make sure your GCP dev server is running:"
    echo "  cd /Users/trilliumsmith/code/calendar-merge-service/gcp && pnpm dev"
    echo ""
    echo "Starting tunnel anyway (you can start the dev server after)..."
    echo ""
fi

echo "🚀 Starting CloudFlare Tunnel..."
echo "📝 Copy the HTTPS URL (looks like https://xxx.trycloudflare.com)"
echo "📝 Update your .env file: CLOUD_FUNCTION_URL=<your-https-url>"
echo "📝 Then restart your dev server: pnpm dev"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""

cloudflared tunnel --url http://localhost:8080
