import { NextRequest, NextResponse } from 'next/server';

// Stub: OAuth start endpoint
export async function GET(req: NextRequest) {
  return NextResponse.json({ message: 'OAuth start stub' });
}

