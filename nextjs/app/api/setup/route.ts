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
    const { createCalendarWatch, createSyncCoordination } = await import('../../../../functions/calendar-sync/watch');
    const { enqueueBatchSync } = await import('../../../../functions/calendar-sync/batchSync');

    await cleanupUserWatches(userId);

    // Store configuration
    await firestore.collection('users').doc(userId).update({
      config: {
        sourceCalendars,
        targetCalendar,
        updatedAt: new Date(),
      },
    });

    // Create watch subscriptions and collect channelIds
    const channelIds: string[] = [];
    const webhookUrl = process.env.WEBHOOK_URL || '';
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
    }

    for (const calendarId of sourceCalendars) {
      try {
        const channelId = await createCalendarWatch(userId, calendarId, webhookUrl, targetCalendar);
        channelIds.push(channelId);
      } catch (error) {
        console.error(`Failed to create watch for ${calendarId}:`, error);
      }
    }

    // Create sync coordination for round-robin processing
    if (channelIds.length > 0) {
      await createSyncCoordination(userId, channelIds);

      // Enqueue ONE task for round-robin batch sync
      await enqueueBatchSync(userId, 5);
    }

    return NextResponse.json({
      success: true,
      watchesCreated: channelIds.length,
      message: `Sync configured for ${channelIds.length} calendars`,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}


