import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
    }
    const accessToken = authHeader.replace('Bearer ', '');
    const body = await req.json();
    const { sourceCalendars, targetCalendar } = body;
    if (!sourceCalendars || !targetCalendar) {
      return NextResponse.json({ error: 'Missing sourceCalendars or targetCalendar' }, { status: 400 });
    }
    const { Firestore } = await import('@google-cloud/firestore');
    const firestore = new Firestore();
    // Find user by access token
    const usersSnapshot = await firestore.collection('users').get();
    let userId = null;
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      if (data.tokens?.access_token === accessToken) {
        userId = doc.id;
        break;
      }
    }
    if (!userId) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
    }
    // Get user tokens
    const userDoc = await firestore.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
// Import helpers at the top of the file:
// import { cleanupUserWatches } from '../../../../functions/calendar-sync/control';
// import { createCalendarWatch } from '../../../../functions/calendar-sync/watch';

// Clean up any existing watches before creating new ones
const { cleanupUserWatches } = await import('../../../../functions/calendar-sync/control');
const { createCalendarWatch } = await import('../../../../functions/calendar-sync/watch');

const cleanedCount = await cleanupUserWatches(userId);

// Store configuration
await firestore.collection('users').doc(userId).update({
  config: {
    sourceCalendars,
    targetCalendar,
    updatedAt: new Date(),
  },
});

// Create watch subscriptions
let watchesCreated = 0;
const webhookUrl = process.env.WEBHOOK_URL || '';
if (!webhookUrl) {
  return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
}
for (const calendarId of sourceCalendars) {
  try {
    await createCalendarWatch(userId, calendarId, webhookUrl, targetCalendar);
    watchesCreated++;
  } catch (error) {
    console.error(`Failed to create watch for ${calendarId}:`, error);
  }
}
return NextResponse.json({
  success: true,
  watchesCreated,
  message: `Sync configured for ${watchesCreated} calendars`,
});
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}


