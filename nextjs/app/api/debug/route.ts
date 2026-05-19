import { NextRequest, NextResponse } from 'next/server';
import { appendFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE = join(process.cwd(), 'debug.jsonl');

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const entry = { ts: new Date().toISOString(), ...params };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  return NextResponse.json({ ok: true });
}
