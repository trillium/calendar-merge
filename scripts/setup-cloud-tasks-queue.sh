#!/bin/bash
set -e

# Load environment variables
if [ -f .env.gcp ]; then
    source .env.gcp
else
    echo "Error: .env.gcp not found"
    exit 1
fi

QUEUE_NAME="calendar-sync-queue"

echo "🔧 Setting up Cloud Tasks queue..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Queue: $QUEUE_NAME"
echo ""

# Check if queue already exists
if gcloud tasks queues describe $QUEUE_NAME --location=$REGION --project=$PROJECT_ID &>/dev/null; then
    echo "✅ Queue '$QUEUE_NAME' already exists"
else
    echo "📝 Creating queue '$QUEUE_NAME'..."
    gcloud tasks queues create $QUEUE_NAME \
        --location=$REGION \
        --project=$PROJECT_ID \
        --max-dispatches-per-second=10 \
        --max-concurrent-dispatches=100

    echo "✅ Queue '$QUEUE_NAME' created successfully"
fi

echo ""
echo "✅ Cloud Tasks setup complete!"
