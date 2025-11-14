/**
 * User data model
 */

import { UserData } from '../types';

export class User {
  constructor(public data: UserData) {}

  get userId(): string {
    return this.data.userId;
  }

  get email(): string {
    return this.data.email;
  }

  hasValidTokens(): boolean {
    return !!(this.data.accessToken && this.data.refreshToken);
  }

  isTokenExpired(): boolean {
    return Date.now() >= this.data.tokenExpiry;
  }
}
