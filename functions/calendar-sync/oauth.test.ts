import { describe, it, expect, vi, beforeEach } from 'vitest';
import { oauthStart, oauthCallback, setup } from './oauth';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';
import type { Request, Response } from 'express';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({ set: mockSet, get: mockGet, update: mockUpdate }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
    })),
  };
});

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => ({
        generateAuthUrl: vi.fn(() => 'https://accounts.google.com/oauth/authorize?...'),
        getToken: vi.fn(),
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn(() => ({
      events: {
        watch: vi.fn(),
      },
    })),
  },
}));

// Mock Secret Manager
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn(() => ({})),
}));

describe('oauth.ts', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockFirestore: any;
  let mockOAuth2Client: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      query: {},
      body: {},
      headers: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn(),
      redirect: vi.fn(),
    };

    mockFirestore = new Firestore();

    mockOAuth2Client = {
      generateAuthUrl: vi.fn(() => 'https://accounts.google.com/oauth/authorize'),
      getToken: vi.fn(),
      setCredentials: vi.fn(),
    };

    vi.mocked(google.auth.OAuth2).mockReturnValue(mockOAuth2Client as any);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  });

  describe('oauthStart', () => {
    it('should redirect to Google OAuth URL', async () => {
      mockReq.query = { redirect_uri: 'http://localhost:5173' };

      await oauthStart(mockReq as Request, mockRes as Response);

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'http://localhost:5173'
      );

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
        ],
        prompt: 'consent',
      });

      expect(mockRes.redirect).toHaveBeenCalledWith('https://accounts.google.com/oauth/authorize');
    });

    it('should return 400 if redirect_uri is missing', async () => {
      mockReq.query = {};

      await oauthStart(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Missing redirect_uri parameter');
    });
  });

  describe('oauthCallback', () => {
    it('should exchange code for tokens and store in Firestore', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      mockReq.body = {
        code: 'auth-code-123',
        redirect_uri: 'http://localhost:5173',
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      await oauthCallback(mockReq as Request, mockRes as Response);

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'http://localhost:5173'
      );

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('auth-code-123');

      expect(mockFirestore.collection().doc().set).toHaveBeenCalledWith({
        tokens: mockTokens,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      expect(mockRes.json).toHaveBeenCalledWith({
        access_token: 'test-access-token',
        user_id: expect.any(String),
      });
    });

    it('should return 400 if code is missing', async () => {
      mockReq.body = { redirect_uri: 'http://localhost:5173' };

      await oauthCallback(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing code or redirect_uri' });
    });

    it('should return 400 if redirect_uri is missing', async () => {
      mockReq.body = { code: 'auth-code-123' };

      await oauthCallback(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing code or redirect_uri' });
    });

    it('should handle OAuth errors', async () => {
      mockReq.body = {
        code: 'auth-code-123',
        redirect_uri: 'http://localhost:5173',
      };

      mockOAuth2Client.getToken.mockRejectedValue(new Error('OAuth failed'));

      await oauthCallback(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'OAuth failed' });
    });
  });

  describe('setup', () => {
    it('should return 401 if authorization header is missing', async () => {
      mockReq.headers = {};

      await setup(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing authorization header' });
    });

    it('should return 400 if sourceCalendars is missing', async () => {
      mockReq.headers = { authorization: 'Bearer test-token' };
      mockReq.body = { targetCalendar: 'target-cal' };

      await setup(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing sourceCalendars or targetCalendar',
      });
    });

    it('should return 400 if targetCalendar is missing', async () => {
      mockReq.headers = { authorization: 'Bearer test-token' };
      mockReq.body = { sourceCalendars: ['cal1', 'cal2'] };

      await setup(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing sourceCalendars or targetCalendar',
      });
    });
  });
});
