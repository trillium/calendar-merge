import { SessionOptions } from 'iron-session';

export interface SessionData {
  userId?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'calendar_merge_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};
