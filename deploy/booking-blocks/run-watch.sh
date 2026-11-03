#!/bin/zsh
# One dry-run pass of the booking-blocks watcher. launchd runs this on a timer.
# Edit REPO and OUT for the machine it runs on; the account comes from the plist.
REPO="$HOME/code/calendar-merge-service"
ACCOUNT="${BOOKING_BLOCKS_ACCOUNT:?set BOOKING_BLOCKS_ACCOUNT in the plist}"
OUT="$HOME/data/massage-booking-blocks/dry-run.md"

# gog credentials (GOG_KEYRING_BACKEND / GOG_KEYRING_PASSWORD); kept out of the plist
. "$HOME/.config/gog/env"

export BOOKING_BLOCKS_ACCOUNT="$ACCOUNT" BOOKING_BLOCKS_OUT="$OUT"
exec "$HOME/.bun/bin/bun" "$REPO/gcp/src/cli/booking-blocks-watch.ts"
