import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';
import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sourceCalendars, targetCalendar } = body;

    if (!sourceCalendars || !targetCalendar) {
      return NextResponse.json({ error: 'Missing sourceCalendars or targetCalendar' }, { status: 400 });
    }

    const userId = session.userId;

    // Clean up any existing watches before creating new ones
    const { cleanupUserWatches } = await import('../../../../functions/calendar-sync/control');
    const { createCalendarWatch } = await import('../../../../functions/calendar-sync/watch');

    await cleanupUserWatches(userId);

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


