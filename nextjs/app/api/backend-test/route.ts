/**
 * Test endpoint to verify Next.js can communicate with the backend
 * Visit: http://localhost:13014/api/backend-test
 */

import { NextResponse } from 'next/server';
import { backend } from '@/app/lib/backend';

export async function GET() {
  try {
    const health = await backend.health();

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to backend!',
      backend: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to connect to backend. Is it running on port 13013?',
      },
      { status: 500 }
    );
  }
}
