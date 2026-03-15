import { randomBytes } from 'node:crypto';

import { fromBase64Url, toBase64Url } from './base64';

const ACCOUNT_KEY_SIZE = 32;

export function generateAccountKey(): string {
  return toBase64Url(randomBytes(ACCOUNT_KEY_SIZE));
}

export function normalizeAccountKey(accountKey: string): Buffer {
  const normalized = fromBase64Url(accountKey);

  if (normalized.length !== ACCOUNT_KEY_SIZE) {
    throw new Error('Invalid Account Key length');
  }

  return normalized;
}
