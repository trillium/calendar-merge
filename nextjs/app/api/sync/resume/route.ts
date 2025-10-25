import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const { Firestore } = await import('@google-cloud/firestore');
    const firestore = new Firestore();
    // Update all watches for this user to unpaused
    const watchesSnapshot = await firestore
      .collection('watches')
      .where('userId', '==', userId)
      .get();
    const batch = firestore.batch();
    watchesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { paused: false });
    });
    await batch.commit();
    return NextResponse.json({
      success: true,
      message: `Resumed ${watchesSnapshot.size} watch(es) for user ${userId}`,
    });
  } catch (error) {
    console.error('Error resuming sync:', error);
    return NextResponse.json({ error: 'Failed to resume sync' }, { status: 500 });
  }
}


