import { NextRequest, NextResponse } from 'next/server';

// Stub: Stop sync endpoint
export async function POST(req: NextRequest) {
  return NextResponse.json({ message: 'Stop sync stub' });
}

