import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';
import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all watches for this user
    const watchesSnapshot = await firestore
      .collection('watches')
      .where('userId', '==', session.userId)
      .get();

    const watches = watchesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        calendarId: data.calendarId,
        expiration: data.expiration,
        paused: data.paused || false,
        targetCalendarId: data.targetCalendarId,
      };
    });

    // Get user config
    const userDoc = await firestore.collection('users').doc(session.userId).get();
    const userData = userDoc.data();

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
