import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthClient, getUserIdFromChannelId } from './auth';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockGet }));
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
        setCredentials: vi.fn(),
      })),
    },
  },
}));

describe('auth.ts', () => {
  let mockFirestore: any;
  let mockGet: any;
  let mockDoc: any;
  let mockCollection: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mocked Firestore instance
    mockFirestore = new Firestore();
    mockCollection = mockFirestore.collection;
    mockDoc = mockCollection().doc;
    mockGet = mockDoc().get;

    // Set environment variables
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  });

  describe('getAuthClient', () => {
    it('should return OAuth2 client with user tokens', async () => {
      const mockUserData = {
        tokens: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        },
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockUserData,
      });

      const client = await getAuthClient('user123');

      expect(mockCollection).toHaveBeenCalledWith('users');
      expect(mockDoc).toHaveBeenCalledWith('user123');
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret'
      );
      expect(client.setCredentials).toHaveBeenCalledWith(mockUserData.tokens);
    });

    it('should throw error if user does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      await expect(getAuthClient('nonexistent')).rejects.toThrow(
        'User nonexistent not found'
      );
    });

    it('should throw error if user has no tokens', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({}),
      });

      await expect(getAuthClient('user123')).rejects.toThrow(
        'No tokens found for user user123'
      );
    });

    it('should handle Firestore errors', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));

      await expect(getAuthClient('user123')).rejects.toThrow('Firestore error');
    });
  });

  describe('getUserIdFromChannelId', () => {
    it('should return userId from watch document', async () => {
      const mockWatchData = {
        userId: 'user456',
        calendarId: 'cal123',
        channelId: 'channel789',
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => mockWatchData,
      });

      const userId = await getUserIdFromChannelId('channel789');

      expect(mockCollection).toHaveBeenCalledWith('watches');
      expect(mockDoc).toHaveBeenCalledWith('channel789');
      expect(userId).toBe('user456');
    });

    it('should return null if watch document does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      const userId = await getUserIdFromChannelId('nonexistent');

      expect(userId).toBeNull();
    });

    it('should return null if watch data has no userId', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({}),
      });

      const userId = await getUserIdFromChannelId('channel789');

      expect(userId).toBeNull();
    });

    it('should return null on Firestore errors', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));

      const userId = await getUserIdFromChannelId('channel789');

      expect(userId).toBeNull();
    });
  });
});
