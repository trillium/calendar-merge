/**
 * Portable Timestamp
 * Drop-in replacement for Firestore Timestamp that works with both backends.
 * In Firestore mode, these get serialized/deserialized as Firestore Timestamps.
 * In SQLite mode, they're stored as ISO strings and reconstructed on read.
 */

export class PortableTimestamp {
  private _seconds: number;
  private _nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this._seconds = seconds;
    this._nanoseconds = nanoseconds;
  }

  get seconds(): number {
    return this._seconds;
  }

  get nanoseconds(): number {
    return this._nanoseconds;
  }

  toMillis(): number {
    return this._seconds * 1000 + Math.floor(this._nanoseconds / 1_000_000);
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toJSON(): { _seconds: number; _nanoseconds: number } {
    return { _seconds: this._seconds, _nanoseconds: this._nanoseconds };
  }

  static now(): PortableTimestamp {
    const ms = Date.now();
    return new PortableTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
  }

  static fromMillis(ms: number): PortableTimestamp {
    return new PortableTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
  }

  static fromDate(date: Date): PortableTimestamp {
    return PortableTimestamp.fromMillis(date.getTime());
  }

  /**
   * Revive a plain object (from JSON parse) back into a PortableTimestamp
   */
  static revive(obj: any): PortableTimestamp | null {
    if (obj && typeof obj._seconds === 'number' && typeof obj._nanoseconds === 'number') {
      return new PortableTimestamp(obj._seconds, obj._nanoseconds);
    }
    return null;
  }
}
