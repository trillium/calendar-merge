import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';

const firestore = new Firestore();

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user tokens
    const userDoc = await firestore.collection('users').doc(session.userId).get();
    const userData = userDoc.data();

    if (!userData?.tokens) {
      return NextResponse.json({ error: 'No tokens found' }, { status: 400 });
    }

    // Set up OAuth client
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

    // Stop all watches via Google Calendar API
    const stopPromises = watchesSnapshot.docs.map(async (doc) => {
      const watchData = doc.data();
      try {
        await calendar.channels.stop({
          requestBody: {
            id: watchData.channelId,
            resourceId: watchData.resourceId,
          },
        });
      } catch (error) {
        console.error(`Error stopping watch ${watchData.channelId}:`, error);
        // Continue even if individual watch stop fails (might already be expired)
      }
    });

    await Promise.all(stopPromises);

    // Delete all watch documents from Firestore
    const batch = firestore.batch();
    watchesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Clear user config
    await firestore.collection('users').doc(session.userId).update({
      config: null,
    });

    return NextResponse.json({
      success: true,
      message: `Stopped and deleted ${watchesSnapshot.size} watch(es)`
    });
  } catch (error) {
    console.error('Error stopping sync:', error);
    return NextResponse.json(
      { error: 'Failed to stop sync' },
      { status: 500 }
    );
  }
}


