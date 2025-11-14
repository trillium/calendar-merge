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
 * Handle Google OAuth callback
 */
router.get('/auth/google/callback', asyncHandler(authController.handleCallback));

/**
 * POST /auth/revoke
 * Revoke OAuth tokens for a user
 */
router.post('/auth/revoke', asyncHandler(authController.revokeAuth));

export default router;
