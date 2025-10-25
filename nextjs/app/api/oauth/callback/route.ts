import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Firestore } from '@google-cloud/firestore';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/app/lib/session';
import { cookies } from 'next/headers';

const firestore = new Firestore();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/?error=${error}`, req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/?error=no_code', req.url)
      );
    }

    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${req.nextUrl.origin}/api/oauth/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get user info to create stable userId
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const userId = userInfo.id!;

    // Store tokens in Firestore
    await firestore
      .collection('users')
      .doc(userId)
      .set({
        tokens,
        email: userInfo.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });

    // Create session
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = userId;
    session.tokens = tokens;
    session.isLoggedIn = true;
    await session.save();

    // Redirect to home with success
    return NextResponse.redirect(new URL('/?success=true', req.url));
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/?error=oauth_failed', req.url)
    );
  }
}
