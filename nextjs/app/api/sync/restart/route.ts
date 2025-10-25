import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, sourceCalendarIds, targetCalendarId, webhookUrl } = body;
    if (!userId || !sourceCalendarIds || !targetCalendarId || !webhookUrl) {
      return NextResponse.json({
        error: 'userId, sourceCalendarIds, targetCalendarId, and webhookUrl are required',
      }, { status: 400 });
    }
// Import helpers at the top of the file:
// import { cleanupUserWatches } from '../../../../../functions/calendar-sync/control';
// import { createCalendarWatch } from '../../../../../functions/calendar-sync/watch';

const { cleanupUserWatches } = await import('../../../../../functions/calendar-sync/control');
const { createCalendarWatch } = await import('../../../../../functions/calendar-sync/watch');

// Stop existing watches
const stoppedCount = await cleanupUserWatches(userId);

// Create new watches for each source calendar
let createdCount = 0;
for (const calendarId of sourceCalendarIds) {
  try {
    await createCalendarWatch(userId, calendarId, webhookUrl, targetCalendarId);
    createdCount++;
  } catch (error) {
    console.error(`Failed to create watch for ${calendarId}:`, error);
  }
}
return NextResponse.json({
  success: true,
  message: `Restarted sync: stopped ${stoppedCount} watch(es), created ${createdCount} new watch(es)`
});
  } catch (error) {
    console.error('Error restarting sync:', error);
    return NextResponse.json({ error: 'Failed to restart sync' }, { status: 500 });
  }
}


