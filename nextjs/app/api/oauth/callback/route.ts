import { NextRequest, NextResponse } from 'next/server';

// Stub: OAuth callback endpoint
export async function GET(req: NextRequest) {
  return NextResponse.json({ message: 'OAuth callback stub' });
}

