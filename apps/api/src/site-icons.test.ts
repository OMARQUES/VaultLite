import { describe, expect, test } from 'vitest';

import { discoverSiteIcon, isBlockedIconHost, normalizeDomainCandidate, registrableDomain } from './site-icons';

function createResponse(input: {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  url?: string;
}): Response {
  const responseBody =
    input.body instanceof Uint8Array ? new Blob([new Uint8Array(Array.from(input.body))]) : (input.body ?? '');
  const response = new Response(responseBody, {
    status: input.status ?? 200,
    headers: input.headers ?? {},
  });
  if (input.url) {
    Object.defineProperty(response, 'url', {
      configurable: true,
      value: input.url,
    });
  }
  return response;
}

describe('site icon discovery', () => {
  test('normalizes domain candidates from host and URL', () => {
    expect(normalizeDomainCandidate('https://WWW.Example.com/login')).toBe('www.example.com');
    expect(normalizeDomainCandidate('foo.bar.example.com')).toBe('foo.bar.example.com');
    expect(normalizeDomainCandidate('')).toBeNull();
  });

  test('blocks private and localhost hosts', () => {
    expect(isBlockedIconHost('localhost')).toBe(true);
    expect(isBlockedIconHost('127.0.0.1')).toBe(true);
    expect(isBlockedIconHost('10.10.1.4')).toBe(true);
    expect(isBlockedIconHost('example.com')).toBe(false);
  });

  test('extracts registrable domain', () => {
    expect(registrableDomain('foo.bar.example.com.br')).toBe('example.com.br');
    expect(registrableDomain('localhost')).toBeNull();
  });

  test('prefers rel icon declared in html head', async () => {
    const fetchCalls: string[] = [];
    const fetchImpl = async (url: string | URL): Promise<Response> => {
      const value = String(url);
      fetchCalls.push(value);
      if (value === 'https://portal.example.com/') {
        return createResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><head><link rel="icon" href="/assets/favicon-64.png"></head></html>',
          url: 'https://portal.example.com/',
        });
      }
      if (value === 'https://portal.example.com/assets/favicon-64.png') {
        return createResponse({
          headers: { 'content-type': 'image/png' },
          body: new Uint8Array([1, 2, 3, 4]),
          url: value,
        });
      }
      throw new Error(`Unexpected URL ${value}`);
    };

    const resolved = await discoverSiteIcon({
      domain: 'portal.example.com',
      nowIso: '2026-03-22T12:00:00.000Z',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        domain: 'portal.example.com',
        sourceUrl: 'https://portal.example.com/assets/favicon-64.png',
      }),
    );
    expect(fetchCalls).toContain('https://portal.example.com/assets/favicon-64.png');
  });

  test('parses unquoted link attributes in head icon tags', async () => {
    const fetchImpl = async (url: string | URL): Promise<Response> => {
      const value = String(url);
      if (value === 'https://plain-attrs.example.com/') {
        return createResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><head><link rel=icon href=/favicon.ico></head></html>',
          url: value,
        });
      }
      if (value === 'https://plain-attrs.example.com/favicon.ico') {
        return createResponse({
          headers: { 'content-type': 'image/x-icon' },
          body: new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]),
          url: value,
        });
      }
      return createResponse({ status: 404, body: 'missing', url: value });
    };

    const resolved = await discoverSiteIcon({
      domain: 'plain-attrs.example.com',
      nowIso: '2026-03-22T12:00:00.000Z',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolved?.sourceUrl).toBe('https://plain-attrs.example.com/favicon.ico');
    expect(resolved?.resolvedBy).toBe('html_link_icon');
  });

  test('uses google s2 fallback after host candidate miss and registrable domain fallback', async () => {
    const fetchCalls: string[] = [];
    const fetchImpl = async (url: string | URL): Promise<Response> => {
      const value = String(url);
      fetchCalls.push(value);
      if (value === 'https://foo.bar.example.com/') {
        return createResponse({
          headers: { 'content-type': 'text/html' },
          body: '<html><head></head><body></body></html>',
          url: value,
        });
      }
      if (value.startsWith('https://www.google.com/s2/favicons?domain=foo.bar.example.com')) {
        return createResponse({
          status: 404,
          headers: { 'content-type': 'text/plain' },
          body: 'not-found',
          url: value,
        });
      }
      if (value.startsWith('https://www.google.com/s2/favicons?domain=example.com')) {
        return createResponse({
          headers: { 'content-type': 'image/png' },
          body: new Uint8Array([8, 7, 6, 5]),
          url: value,
        });
      }
      return createResponse({
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: 'not-found',
        url: value,
      });
    };

    const resolved = await discoverSiteIcon({
      domain: 'foo.bar.example.com',
      nowIso: '2026-03-22T12:00:00.000Z',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolved?.sourceUrl).toContain('domain=example.com');
    expect(
      fetchCalls.some((entry) => entry.includes('domain=foo.bar.example.com')),
    ).toBe(true);
    expect(fetchCalls.some((entry) => entry.includes('domain=example.com'))).toBe(true);
  });

  test('falls back to conventional /favicon.ico even when homepage fetch fails', async () => {
    const fetchCalls: string[] = [];
    const fetchImpl = async (url: string | URL): Promise<Response> => {
      const value = String(url);
      fetchCalls.push(value);
      if (value === 'https://direct-icon.example.com/') {
        return createResponse({
          status: 403,
          headers: { 'content-type': 'text/plain' },
          body: 'forbidden',
          url: value,
        });
      }
      if (value === 'https://direct-icon.example.com/favicon.ico') {
        return createResponse({
          headers: { 'content-type': 'image/x-icon' },
          body: new Uint8Array([0, 1, 2, 3, 4, 5]),
          url: value,
        });
      }
      return createResponse({
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: 'not-found',
        url: value,
      });
    };

    const resolved = await discoverSiteIcon({
      domain: 'direct-icon.example.com',
      nowIso: '2026-03-22T12:00:00.000Z',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        domain: 'direct-icon.example.com',
        sourceUrl: 'https://direct-icon.example.com/favicon.ico',
      }),
    );
    expect(fetchCalls).toContain('https://direct-icon.example.com/favicon.ico');
  });

  test('accepts favicon bytes when content-type is ambiguous', async () => {
    const fetchImpl = async (url: string | URL): Promise<Response> => {
      const value = String(url);
      if (value === 'https://mime-miss.example.com/') {
        return createResponse({
          status: 403,
          headers: { 'content-type': 'text/plain' },
          body: 'forbidden',
          url: value,
        });
      }
      if (value === 'https://mime-miss.example.com/favicon.ico') {
        return createResponse({
          headers: { 'content-type': 'text/plain' },
          body: new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]),
          url: value,
        });
      }
      return createResponse({
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: 'not-found',
        url: value,
      });
    };

    const resolved = await discoverSiteIcon({
      domain: 'mime-miss.example.com',
      nowIso: '2026-03-22T12:00:00.000Z',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolved?.sourceUrl).toBe('https://mime-miss.example.com/favicon.ico');
  });

  test('tries conventional aliases between apex and www hosts', async () => {
    const fetchCalls: string[] = [];
    const fetchImpl = async (url: string | URL): Promise<Response> => {
      const value = String(url);
      fetchCalls.push(value);
      if (value === 'https://alias-example.com/') {
        return createResponse({
          status: 404,
          headers: { 'content-type': 'text/plain' },
          body: 'missing',
          url: value,
        });
      }
      if (value === 'https://www.alias-example.com/favicon.png') {
        return createResponse({
          headers: { 'content-type': 'image/png' },
          body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]),
          url: value,
        });
      }
      return createResponse({
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: 'missing',
        url: value,
      });
    };

    const resolved = await discoverSiteIcon({
      domain: 'alias-example.com',
      nowIso: '2026-03-22T12:00:00.000Z',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchCalls).toContain('https://www.alias-example.com/favicon.png');
    expect(resolved?.sourceUrl).toBe('https://www.alias-example.com/favicon.png');
  });
});
