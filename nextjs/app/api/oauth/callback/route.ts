import { NextRequest, NextResponse } from 'next/server';

// GET handler: for browser-based OAuth callback, redirects to frontend with token or error
export async function GET(req: NextRequest) {
  try {
    console.log('OAuth callback route hit!', req.method, req.url);
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.log('OAuth error received:', error);
      const frontendUrl = new URL('/', req.url);
      frontendUrl.searchParams.set('error', error);
      return NextResponse.redirect(frontendUrl);
    }

    if (!code) {
      console.log('No authorization code received');
      const frontendUrl = new URL('/', req.url);
      frontendUrl.searchParams.set('error', 'no_code');
      return NextResponse.redirect(frontendUrl);
    }

    // Exchange code for tokens
    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${req.nextUrl.origin}/api/oauth/callback`
    );
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received successfully');

    // For now, redirect to frontend with access token in URL (not secure for production)
    const frontendUrl = new URL('/', req.url);
    frontendUrl.searchParams.set('access_token', tokens.access_token || '');
    return NextResponse.redirect(frontendUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = new URL('/', req.url);
    frontendUrl.searchParams.set('error', 'oauth_failed');
    return NextResponse.redirect(frontendUrl);
  }
}

// POST handler: for API-based OAuth callback, stores tokens in Firestore
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, redirect_uri } = body;
    if (!code || !redirect_uri) {
      return NextResponse.json({ error: 'Missing code or redirect_uri' }, { status: 400 });
    }
    const { google } = await import('googleapis');
    const { Firestore } = await import('@google-cloud/firestore');
    const firestore = new Firestore();
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri
    );
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    // Generate user ID (simple hash, not for production)
    const userId = Buffer.from(tokens.access_token || '').toString('base64').substring(0, 16);
    // Store tokens in Firestore
    await firestore
      .collection('users')
      .doc(userId)
      .set({
        tokens,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    return NextResponse.json({
      access_token: tokens.access_token,
      user_id: userId,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 });
  }
}
