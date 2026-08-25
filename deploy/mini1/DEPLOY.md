# mini1 Deployment

Express/Bun backend running on port 13013, exposed via **Tailscale Funnel** at `https://mini1.hippo-tilapia.ts.net`.

## Prerequisites

- Bun 1.3.14+ at `/Users/mini1/.bun/bin/bun`
- Tailscale running and signed in to the tailnet
- Repo cloned at `~/code/calendar-merge-service`

## First-time setup

### 1. Clone the repo

```bash
git clone https://github.com/trillium/calendar-merge ~/code/calendar-merge-service
```

### 2. Enable Tailscale Funnel

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg 13013
```

This makes port 13013 reachable at `https://mini1.hippo-tilapia.ts.net` over the public internet. Run once; Tailscale persists the funnel across reboots.

### 3. Create the data directory

```bash
mkdir -p ~/data
```

### 4. Write the .env

Create `~/code/calendar-merge-service/gcp/.env` with:

```
NODE_ENV=production
PORT=13013
DB_BACKEND=sqlite
SQLITE_DB_PATH=/Users/mini1/data/calendar-sync.db
CLOUD_TASKS_ENABLED=false
BATCH_API_ENABLED=true
BATCH_API_SIZE=50
GOOGLE_CLIENT_ID=<from 1Password / local .env>
GOOGLE_CLIENT_SECRET=<from 1Password / local .env>
CLOUD_FUNCTION_URL=https://mini1.hippo-tilapia.ts.net
GOOGLE_REDIRECT_URI=https://mini1.hippo-tilapia.ts.net/auth/callback
CORS_ORIGIN=https://mini1.hippo-tilapia.ts.net
```

### 5. Copy credential files

```bash
scp /path/to/client_secret.json mini1:~/code/calendar-merge-service/gcp/client_secret.json
scp /path/to/service-account-key.json mini1:~/code/calendar-merge-service/gcp/service-account-key.json
```

### 6. Install dependencies

```bash
cd ~/code/calendar-merge-service/gcp && bun install
```

### 7. Install the launchd service

```bash
cp deploy/mini1/com.trillium.calendar-merge.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.trillium.calendar-merge.plist
```

### 8. Verify

```bash
curl https://mini1.hippo-tilapia.ts.net/health
# → {"status":"ok", ...}
```

## Day-to-day operations

| Action | Command |
|--------|---------|
| View logs | `tail -f ~/Library/Logs/calendar-merge.out.log` |
| Restart | `launchctl kickstart -k gui/$(id -u)/com.trillium.calendar-merge` |
| Stop | `launchctl unload ~/Library/LaunchAgents/com.trillium.calendar-merge.plist` |
| Update | `cd ~/code/calendar-merge-service && git pull && launchctl kickstart -k gui/$(id -u)/com.trillium.calendar-merge` |

## SQLite database

Located at `/Users/mini1/data/calendar-sync.db`. Fresh empty DB is created automatically on first start.
