import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';

const firestore = new Firestore();

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user tokens and set up auth
    const userDoc = await firestore.collection('users').doc(session.userId).get();
    const userData = userDoc.data();

    if (!userData?.tokens) {
      return NextResponse.json({ error: 'No tokens found' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(userData.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get all watches for this user
    const watchesSnapshot = await firestore
      .collection('watches')
      .where('userId', '==', session.userId)
      .get();

    // Fetch calendar names
    const watches = await Promise.all(watchesSnapshot.docs.map(async (doc) => {
      const data = doc.data();

      let calendarName = data.calendarId;
      let targetCalendarName = data.targetCalendarId;

      try {
        // Fetch source calendar name
        const sourceCalendar = await calendar.calendarList.get({
          calendarId: data.calendarId,
        });
        calendarName = sourceCalendar.data.summary || data.calendarId;

        // Fetch target calendar name
        if (data.targetCalendarId) {
          const targetCalendar = await calendar.calendarList.get({
            calendarId: data.targetCalendarId,
          });
          targetCalendarName = targetCalendar.data.summary || data.targetCalendarId;
        }
      } catch (error) {
        console.error('Error fetching calendar names:', error);
        // Fall back to IDs if fetch fails
      }

      return {
        calendarId: data.calendarId,
        calendarName,
        expiration: data.expiration,
        paused: data.paused || false,
        targetCalendarId: data.targetCalendarId,
        targetCalendarName,
        stats: data.stats || {
          totalEventsSynced: 0,
          lastSyncTime: null,
          lastSyncEventCount: null,
        },
      };
    }));

    return NextResponse.json({
      watches,
      config: userData?.config || null,
      email: userData?.email || null,
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}
