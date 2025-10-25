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
// Import helper at the top of the file:
// import { cleanupUserWatches } from '../../../../../functions/calendar-sync/control';

const { cleanupUserWatches } = await import('../../../../../functions/calendar-sync/control');

// Stop all watches for this user
const stoppedCount = await cleanupUserWatches(userId);

return NextResponse.json({
  success: true,
  message: `Stopped ${stoppedCount} watch(es) for user ${userId}`,
});
  } catch (error) {
    console.error('Error stopping sync:', error);
    return NextResponse.json({ error: 'Failed to stop sync' }, { status: 500 });
  }
}


