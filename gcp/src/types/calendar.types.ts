/**
 * Calendar-related type definitions
 */

import { Timestamp } from '@google-cloud/firestore';
import { calendar_v3 } from 'googleapis';

/**
 * Event mapping between source and target calendars
 */
export interface EventMapping {
  sourceCalendarId: string;
  sourceEventId: string;
  targetEventId: string;
  lastSynced: Timestamp;
}

/**
 * User data stored in Firestore
 */
export interface UserData {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  targetCalendarId?: string;
  createdAt: Timestamp;
  lastLogin?: Timestamp;
}

/**
 * OAuth state for CSRF protection
 */
export interface OAuthState {
  state: string;
  userId?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * Google Calendar Event (re-export from googleapis)
 */
export type CalendarEvent = calendar_v3.Schema$Event;

/**
 * Google Calendar (re-export from googleapis)
 */
export type Calendar = calendar_v3.Schema$Calendar;

/**
 * Google Calendar List Entry
 */
export type CalendarListEntry = calendar_v3.Schema$CalendarListEntry;
