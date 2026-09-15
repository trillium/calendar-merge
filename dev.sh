#!/bin/bash

# Terminal 1: GCP Backend
cd /Users/trilliumsmith/code/calendar-merge-service/gcp && pnpm dev

# Terminal 2: Next.js Frontend
cd /Users/trilliumsmith/code/calendar-merge-service/nextjs && pnpm dev

# Terminal 3: Cloudflare tunnel
cloudflared tunnel --url http://localhost:8080
