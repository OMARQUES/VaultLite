import { describe, expect, test } from 'vitest';

import { buildFaviconCandidates, registrableDomain } from '../favicon-candidates.js';

describe('favicon candidate helpers', () => {
  test('uses registrable domain (without subdomain) for S2 fallback', () => {
    expect(registrableDomain('api.app.example.com.br')).toBe('example.com.br');
    expect(registrableDomain('portal.accounts.example.co.uk')).toBe('example.co.uk');
  });

  test('keeps loopback and ip hosts unchanged for S2 fallback', () => {
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1');
  });

  test('builds candidates with host-first strategy and S2 fallback', () => {
    expect(buildFaviconCandidates('https://foo.bar.example.com/path')).toEqual([
      'https://foo.bar.example.com/favicon.ico',
      'https://foo.bar.example.com/favicon.png',
      'https://foo.bar.example.com/apple-touch-icon.png',
      'https://foo.bar.example.com/apple-touch-icon-precomposed.png',
      'https://www.google.com/s2/favicons?domain=foo.bar.example.com&sz=64',
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    ]);
  });

  test('uses host S2 fallback only once when host already equals registrable domain', () => {
    expect(buildFaviconCandidates('https://example.com/account')).toEqual([
      'https://example.com/favicon.ico',
      'https://example.com/favicon.png',
      'https://example.com/apple-touch-icon.png',
      'https://example.com/apple-touch-icon-precomposed.png',
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    ]);
  });

  test('returns empty candidates for invalid url', () => {
    expect(buildFaviconCandidates('')).toEqual([]);
    expect(buildFaviconCandidates('not a url')).toEqual([]);
  });
});
