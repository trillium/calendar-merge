import { NextRequest, NextResponse } from 'next/server';
import { backend } from '@/app/lib/backend';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, sourceCalendarIds, targetCalendarId, webhookUrl } = body;
    if (!userId || !sourceCalendarIds || !targetCalendarId || !webhookUrl) {
      return NextResponse.json({
        error: 'userId, sourceCalendarIds, targetCalendarId, and webhookUrl are required',
      }, { status: 400 });
    }

    const data = await backend.restartSync({ userId, sourceCalendarIds, targetCalendarId, webhookUrl });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error restarting sync:', error);
    return NextResponse.json({ error: 'Failed to restart sync' }, { status: 500 });
  }
}
