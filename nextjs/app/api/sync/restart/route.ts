import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:13013';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, sourceCalendarIds, targetCalendarId, webhookUrl } = body;
    if (!userId || !sourceCalendarIds || !targetCalendarId || !webhookUrl) {
      return NextResponse.json({
        error: 'userId, sourceCalendarIds, targetCalendarId, and webhookUrl are required',
      }, { status: 400 });
    }

    // Proxy to GCP backend
    const res = await fetch(`${BACKEND_URL}/sync/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sourceCalendarIds, targetCalendarId, webhookUrl }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error restarting sync:', error);
    return NextResponse.json({ error: 'Failed to restart sync' }, { status: 500 });
  }
}
