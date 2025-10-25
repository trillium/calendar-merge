#!/bin/bash

# Monitor Calendar Sync Cloud Functions
# Usage: ./scripts/monitor-sync.sh [--channel=CHANNEL_ID]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Config
REGION="${REGION:-us-central1}"
CHANNEL_FILTER=""

# Parse arguments
for arg in "$@"; do
  case $arg in
    --channel=*)
      CHANNEL_FILTER="${arg#*=}"
      shift
      ;;
    --help)
      echo "Usage: $0 [--channel=CHANNEL_ID]"
      echo ""
      echo "Monitor Cloud Function logs for calendar sync operations"
      echo ""
      echo "Options:"
      echo "  --channel=ID    Filter logs for specific channel ID"
      echo "  --help          Show this help message"
      exit 0
      ;;
  esac
done

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Calendar Sync Monitor${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -n "$CHANNEL_FILTER" ]; then
  echo -e "${YELLOW}Filtering for channel: ${CHANNEL_FILTER}${NC}"
  echo ""
fi

# Function to format log line
format_log() {
  local function_name=$1
  local log_line=$2
  local timestamp=$(date +"%H:%M:%S")

  # Skip empty lines
  if [ -z "$log_line" ]; then
    return
  fi

  # Apply channel filter if set
  if [ -n "$CHANNEL_FILTER" ] && ! echo "$log_line" | grep -q "$CHANNEL_FILTER"; then
    return
  fi

  # Color code based on content
  if echo "$log_line" | grep -qi "error\|fail\|exception"; then
    echo -e "${GRAY}[${timestamp}]${NC} ${RED}[${function_name}]${NC} ${RED}${log_line}${NC}"
  elif echo "$log_line" | grep -qi "complete\|success\|✓"; then
    echo -e "${GRAY}[${timestamp}]${NC} ${GREEN}[${function_name}]${NC} ${log_line}"
  elif echo "$log_line" | grep -qi "starting\|fetched\|processed\|synced\|enqueuing"; then
    echo -e "${GRAY}[${timestamp}]${NC} ${BLUE}[${function_name}]${NC} ${log_line}"
  elif echo "$log_line" | grep -qi "webhook\|notification"; then
    echo -e "${GRAY}[${timestamp}]${NC} ${CYAN}[${function_name}]${NC} ${log_line}"
  else
    echo -e "${GRAY}[${timestamp}]${NC} ${GRAY}[${function_name}]${NC} ${log_line}"
  fi
}

# Function to tail logs for a specific function
tail_function_logs() {
  local function_name=$1
  local last_timestamp=""

  while true; do
    # Get recent logs
    logs=$(gcloud functions logs read "$function_name" \
      --gen2 \
      --region="$REGION" \
      --limit=20 \
      --format="value(log)" 2>/dev/null || echo "")

    if [ -n "$logs" ]; then
      # Process each line
      while IFS= read -r line; do
        format_log "$function_name" "$line"
      done <<< "$logs"
    fi

    sleep 3
  done
}

# Check if functions exist
echo -e "${GRAY}Checking for deployed functions...${NC}"

FUNCTIONS=$(gcloud functions list --gen2 --region="$REGION" --format="value(name)" 2>/dev/null || echo "")

if [ -z "$FUNCTIONS" ]; then
  echo -e "${RED}Error: No functions found in region ${REGION}${NC}"
  echo -e "${YELLOW}Make sure you have deployed your Cloud Functions${NC}"
  exit 1
fi

HAS_BATCH_SYNC=false
HAS_WEBHOOK=false

while IFS= read -r func; do
  if [ "$func" = "batchSync" ]; then
    HAS_BATCH_SYNC=true
  elif [ "$func" = "handleWebhook" ]; then
    HAS_WEBHOOK=true
  fi
done <<< "$FUNCTIONS"

if ! $HAS_BATCH_SYNC && ! $HAS_WEBHOOK; then
  echo -e "${RED}Error: Neither batchSync nor handleWebhook functions found${NC}"
  echo -e "${YELLOW}Available functions:${NC}"
  echo "$FUNCTIONS"
  exit 1
fi

echo -e "${GREEN}✓ Found functions${NC}"
$HAS_BATCH_SYNC && echo -e "  ${BLUE}→${NC} batchSync"
$HAS_WEBHOOK && echo -e "  ${BLUE}→${NC} handleWebhook"
echo ""
echo -e "${GRAY}Starting log monitor... (Ctrl+C to stop)${NC}"
echo ""

# Monitor both functions in parallel
if $HAS_BATCH_SYNC && $HAS_WEBHOOK; then
  # Monitor both
  tail_function_logs "batchSync" &
  BATCH_PID=$!
  tail_function_logs "handleWebhook" &
  WEBHOOK_PID=$!

  # Wait for either to exit
  wait $BATCH_PID $WEBHOOK_PID
elif $HAS_BATCH_SYNC; then
  # Monitor only batchSync
  tail_function_logs "batchSync"
elif $HAS_WEBHOOK; then
  # Monitor only handleWebhook
  tail_function_logs "handleWebhook"
fi
