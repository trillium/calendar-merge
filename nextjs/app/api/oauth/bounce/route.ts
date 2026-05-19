import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth bounce endpoint.
 * Google redirects here (registered redirect URI on Vercel).
 * In dev mode, bounces the code+state to the local backend.
 * In production, handles the callback directly.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Dev bounce: redirect to local backend with code+state
  const localBackend = searchParams.get('bounce_to') || 'http://localhost:13013';

  if (error) {
    return NextResponse.redirect(
      `${localBackend.replace(':13013', ':13014')}/?error=${error}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${localBackend.replace(':13013', ':13014')}/?error=no_code`
    );
  }

  // Bounce to local backend's callback handler
  const bounceUrl = `${localBackend}/auth/google/local-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  return NextResponse.redirect(bounceUrl);
}
