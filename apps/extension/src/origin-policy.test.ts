import { describe, expect, test } from 'vitest';

import {
  canonicalOrigin,
  isCredentialAllowedForSite,
  isPageUrlEligibleForFill,
  scoreDomainMatch,
} from './origin-policy';

describe('origin policy', () => {
  test('canonicalizes origin with normalized default ports', () => {
    expect(canonicalOrigin('https://EXAMPLE.com/login')).toBe('https://example.com:443');
    expect(canonicalOrigin('http://example.com')).toBe('http://example.com:80');
  });

  test('allows only eligible page URLs', () => {
    expect(isPageUrlEligibleForFill('https://vaultlite.example.com/login', { isDevelopment: false })).toBe(
      true,
    );
    expect(isPageUrlEligibleForFill('http://localhost:3000/login', { isDevelopment: true })).toBe(true);
    expect(isPageUrlEligibleForFill('http://example.com/login', { isDevelopment: false })).toBe(false);
    expect(isPageUrlEligibleForFill('chrome://settings', { isDevelopment: true })).toBe(false);
  });

  test('authorizes credential only on exact canonical origin', () => {
    expect(
      isCredentialAllowedForSite({
        pageUrl: 'https://app.example.com/login',
        credentialUrls: ['https://app.example.com/auth', 'https://example.com/login'],
        options: { isDevelopment: false },
      }),
    ).toBe(true);

    expect(
      isCredentialAllowedForSite({
        pageUrl: 'https://evil.example.com/login',
        credentialUrls: ['https://app.example.com/auth'],
        options: { isDevelopment: false },
      }),
    ).toBe(false);
  });

  test('scores domain matches for ranking only', () => {
    expect(
      scoreDomainMatch({
        pageUrl: 'https://app.example.com/login',
        candidateUrls: ['https://app.example.com/auth'],
      }),
    ).toBe(2);
    expect(
      scoreDomainMatch({
        pageUrl: 'https://app.example.com/login',
        candidateUrls: ['https://example.com/auth'],
      }),
    ).toBe(1);
  });
});
