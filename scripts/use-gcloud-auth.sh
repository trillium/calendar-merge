#!/bin/bash
set -e

echo "🔐 Using gcloud credentials for Calendar API access"
echo ""
echo "This will use your personal Google account credentials"
echo "that are already set up with gcloud."
echo ""

# Login with calendar scope
gcloud auth application-default login \
  --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/calendar

echo ""
echo "✅ Credentials saved!"
echo "Your functions can now access the Calendar API using Application Default Credentials"
