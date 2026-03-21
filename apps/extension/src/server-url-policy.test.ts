import { describe, expect, test } from 'vitest';

import { normalizeServerUrl } from './server-url-policy';

describe('normalizeServerUrl', () => {
  test('accepts https origins in production', () => {
    expect(
      normalizeServerUrl('https://vaultlite.example.com/path?x=1', { isDevelopment: false }),
    ).toEqual({
      canonicalUrl: 'https://vaultlite.example.com',
      origin: 'https://vaultlite.example.com',
    });
  });

  test('rejects non-https origin in production', () => {
    expect(() => normalizeServerUrl('http://localhost:8787', { isDevelopment: false })).toThrow(
      'server_origin_not_allowed',
    );
  });

  test('accepts loopback http only in development', () => {
    expect(normalizeServerUrl('http://127.0.0.1:8787', { isDevelopment: true })).toEqual({
      canonicalUrl: 'http://127.0.0.1:8787',
      origin: 'http://127.0.0.1:8787',
    });
  });
});
