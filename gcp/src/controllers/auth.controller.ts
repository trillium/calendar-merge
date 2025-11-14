/**
 * Auth controller
 * Handles OAuth authentication flow
 */

import { Request, Response } from 'express';
import { generateAuthUrl, handleOAuthCallback, revokeAccess } from '../services';
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
    const redirectUrl = `${APP_CONFIG.FRONTEND_URL}/auth/success?userId=${userId}`;
    res.redirect(redirectUrl);
  } catch (error) {
    log.error('Error handling OAuth callback', error);

    // Redirect to frontend with error
    const redirectUrl = `${APP_CONFIG.FRONTEND_URL}/auth/error?message=${encodeURIComponent(
      error instanceof Error ? error.message : 'Authentication failed'
    )}`;
    res.redirect(redirectUrl);
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
