import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pauseSync, resumeSync, stopSync, clearUserData, restartSync } from './control';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';
import * as authModule from './auth';
import * as watchModule from './watch';
import { Request, Response } from 'express';

// Mock batch functions at module level
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockSet = vi.fn();
  const mockGet = vi.fn();
  const mockWhere = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate, delete: mockDelete, set: mockSet, ref: { delete: mockDelete, update: mockUpdate } }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc, where: mockWhere, get: mockGet }));

  return {
    Firestore: vi.fn(() => ({
      collection: mockCollection,
      batch: () => ({
        update: mockBatchUpdate,
        delete: mockBatchDelete,
        commit: mockBatchCommit,
      }),
    })),
  };
});

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      channels: {
        stop: vi.fn(),
      },
    })),
  },
}));

// Mock auth module
vi.mock('./auth', () => ({
  getAuthClient: vi.fn(),
}));

// Mock watch module
vi.mock('./watch', () => ({
  createCalendarWatch: vi.fn(),
}));

describe('control.ts', () => {
  let mockFirestore: any;
  let mockCollection: any;
  let mockWhere: any;
  let mockGet: any;
  let mockDoc: any;
  let mockCalendar: any;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonSpy: any;
  let statusSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFirestore = new Firestore();
    mockCollection = mockFirestore.collection;
    mockWhere = vi.fn().mockReturnThis();
    mockGet = vi.fn();
    mockDoc = mockCollection().doc;

    mockCollection.mockReturnValue({
      where: mockWhere,
      doc: mockDoc,
      get: mockGet,
    });

    mockWhere.mockReturnValue({
      get: mockGet,
    });

    mockCalendar = {
      channels: {
        stop: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(google.calendar).mockReturnValue(mockCalendar as any);
    vi.mocked(authModule.getAuthClient).mockResolvedValue({} as any);
    vi.mocked(watchModule.createCalendarWatch).mockResolvedValue(undefined);

    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockReq = { body: {} };
    mockRes = {
      json: jsonSpy,
      status: statusSpy,
    };
  });

  describe('pauseSync', () => {
    it('should pause all watches for a user', async () => {
      mockReq.body = { userId: 'user123' };

      const mockDocs = [
        { ref: { id: 'watch1' } },
        { ref: { id: 'watch2' } },
      ];

      mockGet.mockResolvedValue({
        size: 2,
        docs: mockDocs,
      });

      await pauseSync(mockReq as Request, mockRes as Response);

      expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'user123');
      expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
      expect(mockBatchUpdate).toHaveBeenCalledWith(mockDocs[0].ref, { paused: true });
      expect(mockBatchCommit).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        message: 'Paused 2 watch(es) for user user123',
      });
    });

    it('should return 400 if userId is missing', async () => {
      mockReq.body = {};

      await pauseSync(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({ error: 'userId is required' });
    });
  });

  describe('resumeSync', () => {
    it('should resume all watches for a user', async () => {
      mockReq.body = { userId: 'user123' };

      const mockDocs = [
        { ref: { id: 'watch1' } },
      ];

      mockGet.mockResolvedValue({
        size: 1,
        docs: mockDocs,
      });

      await resumeSync(mockReq as Request, mockRes as Response);

      expect(mockBatchUpdate).toHaveBeenCalledWith(mockDocs[0].ref, { paused: false });
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        message: 'Resumed 1 watch(es) for user user123',
      });
    });
  });

  describe('stopSync', () => {
    it('should stop watches via Google API and delete from Firestore', async () => {
      mockReq.body = { userId: 'user123' };

      const mockDocs = [
        {
          data: () => ({
            channelId: 'channel123',
            resourceId: 'resource123',
          }),
          ref: { delete: vi.fn().mockResolvedValue(undefined) },
        },
      ];

      mockGet.mockResolvedValue({
        docs: mockDocs,
      });

      await stopSync(mockReq as Request, mockRes as Response);

      expect(mockCalendar.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'channel123',
          resourceId: 'resource123',
        },
      });
      expect(mockDocs[0].ref.delete).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        message: 'Stopped 1 watch(es) for user user123',
      });
    });
  });

  describe('clearUserData', () => {
    it('should clear watches and event mappings for a user', async () => {
      mockReq.body = { userId: 'trillium@example.com' };

      const mockWatchDocs = [
        {
          data: () => ({
            channelId: 'channel123',
            resourceId: 'resource123',
          }),
          ref: { delete: vi.fn().mockResolvedValue(undefined) },
        },
      ];

      const mockMappingDocs = [
        {
          data: () => ({
            sourceCalendarId: 'trillium@example.com',
          }),
          ref: { id: 'mapping1' },
        },
        {
          data: () => ({
            sourceCalendarId: 'other@example.com',
          }),
          ref: { id: 'mapping2' },
        },
      ];

      // First get() for watches, second get() for mappings
      mockGet
        .mockResolvedValueOnce({ docs: mockWatchDocs })
        .mockResolvedValueOnce({ docs: mockMappingDocs });

      await clearUserData(mockReq as Request, mockRes as Response);

      expect(mockCalendar.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'channel123',
          resourceId: 'resource123',
        },
      });
      expect(mockWatchDocs[0].ref.delete).toHaveBeenCalled();
      expect(mockBatchDelete).toHaveBeenCalledTimes(1); // Only trillium's mapping
      expect(mockBatchDelete).toHaveBeenCalledWith(mockMappingDocs[0].ref);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        message: 'Cleared data for user trillium@example.com: deleted 1 watch(es) and 1 event mapping(s). OAuth tokens preserved.',
      });
    });
  });

  describe('restartSync', () => {
    it('should stop existing watches and create new ones', async () => {
      mockReq.body = {
        userId: 'user123',
        sourceCalendarIds: ['cal1', 'cal2'],
        targetCalendarId: 'target',
        webhookUrl: 'https://webhook.example.com',
      };

      const mockWatchDocs = [
        {
          data: () => ({
            channelId: 'old-channel',
            resourceId: 'old-resource',
          }),
          ref: { delete: vi.fn().mockResolvedValue(undefined) },
        },
      ];

      mockGet.mockResolvedValue({
        size: 1,
        docs: mockWatchDocs,
      });

      await restartSync(mockReq as Request, mockRes as Response);

      expect(mockCalendar.channels.stop).toHaveBeenCalled();
      expect(watchModule.createCalendarWatch).toHaveBeenCalledTimes(2);
      expect(watchModule.createCalendarWatch).toHaveBeenCalledWith(
        'user123',
        'cal1',
        'https://webhook.example.com',
        'target'
      );
      expect(watchModule.createCalendarWatch).toHaveBeenCalledWith(
        'user123',
        'cal2',
        'https://webhook.example.com',
        'target'
      );
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        message: 'Restarted sync: stopped 1 watch(es), created 2 new watch(es)',
      });
    });

    it('should return 400 if required parameters are missing', async () => {
      mockReq.body = { userId: 'user123' };

      await restartSync(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'userId, sourceCalendarIds, targetCalendarId, and webhookUrl are required',
      });
    });
  });
});
