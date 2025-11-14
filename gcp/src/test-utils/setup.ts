/**
 * Vitest test setup
 * Configures global test environment and mocks
 */

import { vi, beforeEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.GCP_PROJECT = 'test-project';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';
process.env.CLOUD_FUNCTION_URL = 'http://localhost:8080';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockTimestamp = {
    now: vi.fn(() => ({
      seconds: 1234567890,
      toMillis: () => 1234567890000,
    })),
    fromMillis: vi.fn((ms: number) => ({
      seconds: Math.floor(ms / 1000),
      toMillis: () => ms,
    })),
  };

  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockSet = vi.fn();
  const mockAdd = vi.fn();
  const mockGet = vi.fn();
  const mockLimit = vi.fn(() => ({ get: mockGet }));
  const mockWhere = vi.fn(() => ({
    where: mockWhere,
    limit: mockLimit,
    get: mockGet,
  }));
  const mockDoc = vi.fn(() => ({
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
    delete: mockDelete,
    ref: { delete: mockDelete, update: mockUpdate },
  }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
    where: mockWhere,
    add: mockAdd,
    get: mockGet,
  }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
    })),
    Timestamp: mockTimestamp,
  };
});

// Mock Google APIs
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
        setCredentials: vi.fn(),
        refreshAccessToken: vi.fn(),
        revokeCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        watch: vi.fn(),
      },
      calendars: {
        get: vi.fn(),
      },
      calendarList: {
        list: vi.fn(),
      },
      channels: {
        stop: vi.fn(),
      },
    })),
    oauth2: vi.fn(() => ({
      userinfo: {
        get: vi.fn(),
      },
    })),
  },
}));

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
