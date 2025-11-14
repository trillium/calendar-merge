import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';
import { gcpBackend } from '@/app/lib/gcp-backend';

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

    // Create watch subscriptions via GCP backend
    const results = [];
    const errors = [];

    for (const calendarId of sourceCalendars) {
      try {
        const result = await gcpBackend.createWatch({
          userId,
          calendarId,
          targetCalendarId: targetCalendar,
        });
        results.push(result);
        console.log(`Watch created for calendar ${calendarId}`);
      } catch (error) {
        console.error(`Failed to create watch for ${calendarId}:`, error);
        errors.push({ calendarId, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // If all watches failed, return error
    if (results.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to create any watches',
          details: errors,
        },
        { status: 500 }
      );
    }

    // Trigger initial sync for all calendars
    // Round-robin will automatically chain through all calendars via self-triggering
    try {
      console.log(`Triggering initial sync for user ${userId}`);
      await gcpBackend.triggerSync({ userId });
      console.log(`Initial sync triggered successfully`);
    } catch (syncError) {
      console.error('Failed to trigger initial sync:', syncError);
      // Don't fail the setup if sync fails - watches are still created
    }

    return NextResponse.json({
      success: true,
      watchesCreated: results.length,
      message: `Sync configured for ${results.length} calendars`,
      watches: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      {
        error: 'Setup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
