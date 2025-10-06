import { NextRequest, NextResponse } from 'next/server';

// Stub: Health check endpoint
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'ok' });
}

