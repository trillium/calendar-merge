import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';
import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();

export async function POST() {
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

    // Update all watches to paused
    const batch = firestore.batch();
    watchesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { paused: true });
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Paused ${watchesSnapshot.size} watch(es)`
    });
  } catch (error) {
    console.error('Error pausing sync:', error);
    return NextResponse.json(
      { error: 'Failed to pause sync' },
      { status: 500 }
    );
  }
}


