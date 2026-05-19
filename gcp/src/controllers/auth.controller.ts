/**
 * Auth controller
 * Handles OAuth authentication flow
 */

import { Request, Response } from 'express';
import { generateAuthUrl, handleOAuthCallback, revokeAccess } from '../services';
import { db, Timestamp } from '../db';
import { logger } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Initiate OAuth flow
 */
export async function initiateAuth(req: Request, res: Response): Promise<void> {
  const { userId } = req.query;

  try {
    const { url, state } = await generateAuthUrl(userId as string | undefined);

    res.status(200).json({
      authUrl: url,
      state,
    });
  } catch (error) {
    log.error('Error generating auth URL', error);
    res.status(500).json({ error: 'Error initiating authentication' });
  }
}

/**
 * Handle OAuth callback
 */
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state } = req.query;

  if (!code || !state) {
    res.status(400).json({ error: 'code and state are required' });
    return;
  }

  try {
    const { userId } = await handleOAuthCallback(
      code as string,
      state as string
    );

    // Redirect to frontend with success
    const redirectUrl = `${APP_CONFIG.FRONTEND_URL}/?success=true&userId=${userId}`;
    res.redirect(redirectUrl);
  } catch (error) {
    log.error('Error handling OAuth callback', error);

    // Redirect to frontend with error
    const redirectUrl = `${APP_CONFIG.FRONTEND_URL}/?error=oauth_failed&message=${encodeURIComponent(
      error instanceof Error ? error.message : 'Authentication failed'
    )}`;
    res.redirect(redirectUrl);
  }
}

/**
 * Store OAuth tokens (called by the Next.js frontend after OAuth callback)
 */
export async function storeTokens(req: Request, res: Response): Promise<void> {
  const { userId, email, accessToken, refreshToken, tokenExpiry } = req.body;

  if (!userId || !accessToken) {
    res.status(400).json({ error: 'userId and accessToken are required' });
    return;
  }

  try {
    const existing = await db.getDoc('users', userId);
    const now = Timestamp.now();

    if (existing) {
      await db.updateDoc('users', userId, {
        email,
        accessToken,
        ...(refreshToken && { refreshToken }),
        tokenExpiry,
        lastLogin: now,
      });
    } else {
      await db.setDoc('users', userId, {
        userId,
        email,
        accessToken,
        refreshToken,
        tokenExpiry,
        createdAt: now,
        lastLogin: now,
      });
    }

    log.info('Stored OAuth tokens', { userId, email });
    res.status(200).json({ success: true, userId });
  } catch (error) {
    log.error('Error storing tokens', error, { userId });
    res.status(500).json({ error: 'Failed to store tokens' });
  }
}

/**
 * Revoke OAuth access
 */
export async function revokeAuth(req: Request, res: Response): Promise<void> {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    await revokeAccess(userId);
    res.status(200).json({ success: true, message: 'Access revoked' });
  } catch (error) {
    log.error('Error revoking access', error, { userId });
    res.status(500).json({ error: 'Error revoking access' });
  }
}
