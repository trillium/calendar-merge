import { NextRequest, NextResponse } from 'next/server';
import { backend } from '@/app/lib/backend';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
    || req.headers.get('x-user-id');

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await backend.getSyncStatus(userId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}
