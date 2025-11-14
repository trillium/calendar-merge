# Local Development Setup with CloudFlare Tunnel

Google Calendar webhooks require HTTPS URLs. For local development, we use CloudFlare Tunnel to expose your local server via HTTPS.

## Quick Start

### 1. Install CloudFlare Tunnel (one-time setup)

```bash
brew install cloudflare/cloudflare/cloudflared
```

### 2. Start the Tunnel

**Option A: Use the helper script**
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
./dev-tunnel.sh
```

**Option B: Manual command**
```bash
cloudflared tunnel --url http://localhost:8080
```

You'll see output like:
```
2025-11-14T06:15:00Z INF +--------------------------------------------------------------------------------------------+
2025-11-14T06:15:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
2025-11-14T06:15:00Z INF |  https://abc123xyz.trycloudflare.com                                                       |
2025-11-14T06:15:00Z INF +--------------------------------------------------------------------------------------------+
```

### 3. Copy the HTTPS URL

Copy the URL that looks like: `https://abc123xyz.trycloudflare.com`

### 4. Update your .env file

Edit `/Users/trilliumsmith/code/calendar-merge-service/gcp/.env`:

```bash
# Change this line:
CLOUD_FUNCTION_URL=http://localhost:8080

# To your CloudFlare Tunnel URL:
CLOUD_FUNCTION_URL=https://abc123xyz.trycloudflare.com
```

### 5. Restart your dev server

```bash
# Stop the current dev server (Ctrl+C), then:
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
pnpm dev
```

### 6. Test the setup

Now try creating watches from your Next.js app. The webhooks should work!

## Running Everything

You'll need **3 terminal windows**:

**Terminal 1: CloudFlare Tunnel**
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
./dev-tunnel.sh
```

**Terminal 2: GCP Backend**
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
pnpm dev
```

**Terminal 3: Next.js Frontend**
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/nextjs
pnpm dev
```

## Notes

- CloudFlare Tunnel URLs change each time you restart the tunnel
- For longer sessions, consider using a permanent ngrok URL or deploy to Cloud Run
- The tunnel only needs to be running when testing webhook functionality
- You can test other features (OAuth, calendar listing) without the tunnel

## Troubleshooting

**"cloudflared: command not found"**
- Run: `brew install cloudflare/cloudflare/cloudflared`

**"Port 8080 not responding"**
- Make sure your GCP dev server is running first

**"WebHook callback must be HTTPS"**
- Double-check your .env file has the HTTPS URL
- Restart the dev server after updating .env

**Webhooks not arriving**
- Check the tunnel is running
- Verify the URL in .env matches the tunnel URL
- Check GCP server logs for incoming requests
