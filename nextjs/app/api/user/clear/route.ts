import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const { Firestore } = await import('@google-cloud/firestore');
    const firestore = new Firestore();
    // Delete all watches for this user
    const watchesSnapshot = await firestore
      .collection('watches')
      .where('userId', '==', userId)
      .get();
    let stoppedCount = 0;
    for (const doc of watchesSnapshot.docs) {
      await doc.ref.delete();
      stoppedCount++;
    }
    // Delete all event mappings for this user's calendars (stub: delete all mappings for now)
    const mappingsSnapshot = await firestore
      .collection('event_mappings')
      .get();
    let deletedMappings = 0;
    for (const doc of mappingsSnapshot.docs) {
      const mapping = doc.data();
      if (mapping.sourceCalendarId?.includes(userId.split('@')[0])) {
        await doc.ref.delete();
        deletedMappings++;
      }
    }
    return NextResponse.json({
      success: true,
      message: `Cleared data for user ${userId}: deleted ${stoppedCount} watch(es) and ${deletedMappings} event mapping(s). OAuth tokens preserved.`
    });
  } catch (error) {
    console.error('Error clearing user data:', error);
    return NextResponse.json({ error: 'Failed to clear user data' }, { status: 500 });
  }
}


