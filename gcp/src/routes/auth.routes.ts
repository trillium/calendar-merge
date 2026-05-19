/**
 * OAuth flow routes
 */

import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { asyncHandler } from '../middleware';
import * as authController from '../controllers/auth.controller';

const router: ExpressRouter = Router();

/**
 * GET /auth/google
 * Initiate Google OAuth flow
 */
router.get('/auth/google', asyncHandler(authController.initiateAuth));

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback (direct)
 */
router.get('/auth/google/callback', asyncHandler(authController.handleCallback));

/**
 * GET /auth/google/local-callback
 * Handle OAuth callback bounced from Vercel
 */
router.get('/auth/google/local-callback', asyncHandler(authController.handleCallback));

/**
 * POST /auth/store-tokens
 * Store OAuth tokens from the Next.js frontend callback
 */
router.post('/auth/store-tokens', asyncHandler(authController.storeTokens));

/**
 * POST /auth/revoke
 * Revoke OAuth tokens for a user
 */
router.post('/auth/revoke', asyncHandler(authController.revokeAuth));

export default router;
