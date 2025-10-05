# Calendar Merge Service - User Journey

**From Zero to Synced Calendars: A New User's Complete Experience**

---

## Overview

The Calendar Merge Service allows users to automatically sync multiple Google Calendars into one master calendar. Here's exactly what a new user experiences from start to finish.

## Step-by-Step User Journey

### 1. **Discovery & Landing** 🌐
- User visits: `https://calendar-merge-dnpzhx3ls-trillium.vercel.app`
- Sees clean landing page with title: "📅 Calendar Merge Service"
- Reads subtitle: "Sync multiple Google Calendars into one master calendar"
- Understands the value proposition immediately

### 2. **Connect Google Account** 🔐
**What the user sees:**
- Big blue button: "Connect Google Calendar"
- Clear instruction: "Grant access to your Google Calendars to enable syncing"

**What happens when they click:**
1. User clicks "Connect Google Calendar"
2. Redirected to Google OAuth consent screen
3. Google asks: "Calendar Merge Service wants to access your Google Calendar"
4. Shows requested permissions:
   - "See, edit, share, and permanently delete all calendars you can access using Google Calendar"
   - "View and edit events on all your calendars"
5. User clicks "Allow" (or "Deny" to exit)
6. Google redirects back to the app with authorization code
7. App exchanges code for access tokens automatically
8. User sees green success message: "Successfully connected!"

### 3. **Select Source Calendars** 📅
**What the user sees:**
- New section appears: "Step 2: Select Source Calendars"
- Loading message: "Loading your calendars..."
- List of all their Google Calendars with checkboxes:
  - ✅ Personal Calendar
  - ✅ Work Calendar  
  - ☐ Holidays in United States
  - ☐ Birthdays
  - ☐ Family Calendar

**User actions:**
- User checks the calendars they want to merge (e.g., Personal + Work)
- As soon as they select at least one calendar, Step 3 appears

### 4. **Choose Target Calendar** 🎯
**What the user sees:**
- New section: "Step 3: Choose Target Calendar"
- Two radio button options:
  - ⚪ "Use existing calendar" (selected by default)
  - ⚪ "Create new calendar"

**Option A - Use Existing Calendar:**
- User selects from dropdown of their existing calendars
- Chooses something like "Master Calendar" or "All Events"

**Option B - Create New Calendar:**
- User clicks "Create new calendar" radio button
- Text input appears: "Enter new calendar name"
- User types something like "Merged Events" or "All My Calendars"

### 5. **Start Syncing** ⚡
**What the user sees:**
- Blue "Start Syncing" button becomes enabled
- Clear call-to-action

**What happens when they click:**
1. Button shows "Setting up calendar sync..."
2. If creating new calendar:
   - Green message: "Creating new calendar..."
   - Then: "Created calendar 'Merged Events'. Setting up sync..."
3. App configures webhook subscriptions for each source calendar
4. Final success message: "✓ Sync configured! Watching 2 calendars."

### 6. **Immediate Results** ✨
**What the user experiences:**
- **Within minutes:** Existing events from source calendars appear in target calendar
- **Going forward:** Any new/modified events in source calendars automatically sync to target
- **Real-time:** Changes appear in target calendar within 1-2 minutes

---

## User Experience Examples

### Example 1: Working Professional
**Sarah's Journey:**
1. Has separate calendars for work meetings, personal appointments, and family events
2. Wants everything in one view for better planning
3. Connects Google account → selects Work + Personal calendars → creates new "Complete Schedule" calendar
4. Result: All meetings, appointments, and family events now appear in one unified calendar

### Example 2: Busy Parent
**Mike's Journey:**
1. Manages kids' school calendar, sports schedule, and personal calendar
2. Wife also adds events to family calendar
3. Connects account → selects Kids School + Sports + Family calendars → uses existing "Master Family" calendar
4. Result: Never misses a game, school event, or family commitment - everything is in one place

### Example 3: Freelancer
**Alex's Journey:**
1. Has separate calendars for different clients plus personal calendar
2. Wants to see availability across all projects
3. Connects account → selects Client A + Client B + Client C + Personal → creates "All Availability" calendar
4. Result: Can quickly see conflicts and free time across all commitments

---

## What Happens Behind the Scenes

**During Setup:**
1. App stores encrypted access tokens securely in Firestore
2. Creates webhook subscriptions with Google Calendar for each source calendar
3. Performs initial sync of all existing events
4. Sets up automatic renewal of webhook subscriptions (they expire after 7 days)

**During Operation:**
1. Google sends webhook notifications when events change in source calendars
2. App receives notification, fetches updated event data
3. Automatically creates/updates/deletes corresponding event in target calendar
4. Maintains mapping between source and target events to prevent duplicates

---

## User Control & Management

**What users can do after setup:**
- View their synced calendars in any Google Calendar app/website
- Edit events in source calendars (changes sync automatically)
- Edit events in target calendar (these are copies, won't affect source)
- The service runs completely in the background - no maintenance required

**What users should know:**
- Changes in source calendars sync to target within 1-2 minutes
- Deleting an event from source calendar removes it from target calendar
- Deleting the target calendar won't affect source calendars
- The service handles conflicts, duplicates, and edge cases automatically

---

## Success Metrics from User Perspective

**Immediate Value:**
- ✅ Single unified view of all calendar events
- ✅ No more switching between multiple calendars
- ✅ Automatic updates without manual work

**Long-term Benefits:**
- ✅ Better scheduling and conflict prevention
- ✅ Improved time management and awareness
- ✅ Reduced mental overhead of tracking multiple calendars
- ✅ Works seamlessly with existing Google Calendar workflows

---

## Technical Requirements for Users

**What users need:**
- Google account with Google Calendar access
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for initial setup

**What users DON'T need:**
- Technical knowledge
- Software installation
- Account creation (uses Google OAuth)
- Payment or subscription (currently free)
- Ongoing maintenance or management

---

## User Journey Summary

```
Visit Website → Connect Google → Select Sources → Choose Target → Start Sync → Enjoy Unified Calendar
     ↓              ↓              ↓              ↓             ↓              ↓
  30 seconds    30 seconds     1 minute      30 seconds    1 minute    Forever automated
```

**Total setup time:** ~3-4 minutes  
**Ongoing effort:** Zero - completely automated  
**Value delivered:** Immediate and continuous calendar unification