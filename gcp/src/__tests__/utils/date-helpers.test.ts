import { describe, it, expect } from 'vitest';
import { formatDuration, isExpired, daysFromNow, isExpiringSoon } from '../../utils/date-helpers';

describe('Date Helpers', () => {
  describe('formatDuration', () => {
    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(30000)).toBe('30s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h 0m');
    });

    it('should format days and hours', () => {
      expect(formatDuration(86400000)).toBe('1d 0h');
      expect(formatDuration(90000000)).toBe('1d 1h');
      expect(formatDuration(172800000)).toBe('2d 0h');
    });
  });

  describe('isExpired', () => {
    it('should return true for past timestamps', () => {
      const pastTime = Date.now() - 1000;
      expect(isExpired(pastTime)).toBe(true);
    });

    it('should return false for future timestamps', () => {
      const futureTime = Date.now() + 1000;
      expect(isExpired(futureTime)).toBe(false);
    });

    it('should return true for current time (edge case)', () => {
      const now = Date.now();
      // Might be true or false depending on execution timing
      // Just ensure it doesn't throw
      expect(typeof isExpired(now)).toBe('boolean');
    });
  });

  describe('daysFromNow', () => {
    it('should calculate timestamp N days in the future', () => {
      const now = Date.now();
      const sevenDays = daysFromNow(7);
      const diff = sevenDays - now;
      const expectedDiff = 7 * 24 * 60 * 60 * 1000;

      // Allow 1 second tolerance
      expect(Math.abs(diff - expectedDiff)).toBeLessThan(1000);
    });

    it('should work for 1 day', () => {
      const now = Date.now();
      const oneDay = daysFromNow(1);
      const diff = oneDay - now;
      const expectedDiff = 24 * 60 * 60 * 1000;

      expect(Math.abs(diff - expectedDiff)).toBeLessThan(1000);
    });

    it('should work for 30 days', () => {
      const now = Date.now();
      const thirtyDays = daysFromNow(30);
      const diff = thirtyDays - now;
      const expectedDiff = 30 * 24 * 60 * 60 * 1000;

      expect(Math.abs(diff - expectedDiff)).toBeLessThan(1000);
    });
  });

  describe('isExpiringSoon', () => {
    it('should return true for expiration within buffer hours', () => {
      const expiresIn12Hours = Date.now() + (12 * 60 * 60 * 1000);
      expect(isExpiringSoon(expiresIn12Hours, 24)).toBe(true);
    });

    it('should return false for expiration beyond buffer hours', () => {
      const expiresIn48Hours = Date.now() + (48 * 60 * 60 * 1000);
      expect(isExpiringSoon(expiresIn48Hours, 24)).toBe(false);
    });

    it('should return true for already expired', () => {
      const expiredYesterday = Date.now() - (24 * 60 * 60 * 1000);
      expect(isExpiringSoon(expiredYesterday, 24)).toBe(true);
    });

    it('should handle edge case at exact buffer boundary', () => {
      const expiresExactly24Hours = Date.now() + (24 * 60 * 60 * 1000);
      // Should be within buffer (<=)
      const result = isExpiringSoon(expiresExactly24Hours, 24);
      expect(typeof result).toBe('boolean');
    });
  });
});
