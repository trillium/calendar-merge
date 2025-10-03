# Architecture Documentation

## System Components

### 1. Source Calendars
- Multiple Google Calendars to monitor
- Push notifications enabled via Calendar API

### 2. Webhook Handler (Cloud Function)
- Receives push notifications from Google Calendar
- Triggered on event create/update/delete
- Processes events and updates target calendar

### 3. Firestore Database
Collections:
- `event_mappings`: source_event_id → target_event_id
- `watches`: Active calendar watch subscriptions

### 4. Target Calendar
- Single Google Calendar receiving merged events

### 5. Cloud Scheduler
- Renews watch subscriptions daily
- Prevents webhook expiration (7-day limit)

## Data Flow

```
Source Calendar Event Change
  ↓
Push Notification
  ↓
handleWebhook Cloud Function
  ↓
Fetch Event Details
  ↓
Check Firestore Mapping
  ↓
Update/Create in Target Calendar
  ↓
Update Firestore Mapping
```

## Scaling Considerations

- Cloud Functions auto-scale with load
- Firestore scales automatically
- Watch subscriptions limited to 1000/project
- Consider batching for high-volume scenarios
