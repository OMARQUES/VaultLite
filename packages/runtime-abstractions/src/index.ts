import { randomBytes } from 'node:crypto';

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  nextId(prefix: string): string;
}

export interface SessionCookieOptions {
  name: string;
  domain?: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  maxAgeSeconds: number;
}

export interface SessionCookieBundle {
  session: SessionCookieOptions;
  csrf: Omit<SessionCookieOptions, 'httpOnly'> & {
    httpOnly: false;
  };
}

export interface MutableRequestCsrfValidator {
  ensureValid(headerToken: string | null, cookieToken: string | null): boolean;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter.toString(16).padStart(6, '0')}`;
  }
}

export class CryptoIdGenerator implements IdGenerator {
  nextId(prefix: string): string {
    return `${prefix}_${randomBytes(16).toString('hex')}`;
  }
}

export class EqualityCsrfValidator implements MutableRequestCsrfValidator {
  ensureValid(headerToken: string | null, cookieToken: string | null): boolean {
    if (!headerToken || !cookieToken) {
      return false;
    }

    return headerToken === cookieToken;
  }
}

