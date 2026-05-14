import { describe, expect, test, vi } from 'vitest';

import { createProxyHandler } from './_utils/proxy.js';

function createContext(overrides = {}) {
  return {
    env: {
      VAULTLITE_API_ORIGIN: 'https://worker.example.com',
      ...(overrides.env ?? {}),
    },
    params: {
      path: ['bootstrap', 'state'],
      ...(overrides.params ?? {}),
    },
    request: new Request('https://vaultlite-web.pages.dev/api/bootstrap/state?foo=bar', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        host: 'vaultlite-web.pages.dev',
      },
    }),
    ...overrides,
  };
}

describe('Pages proxy handlers', () => {
  test('proxies /api/* to upstream /api/* and preserves querystring', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = createProxyHandler({ prefix: '/api', timeoutMs: 25 });

    await handler(createContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const upstreamRequest = fetchMock.mock.calls[0][0];
    expect(upstreamRequest.url).toBe('https://worker.example.com/api/bootstrap/state?foo=bar');
    expect(upstreamRequest.headers.get('host')).toBeNull();
  });

  test('proxies /icons/* to upstream /icons/* and preserves ticket querystring', async () => {
    const fetchMock = vi.fn(async () => new Response('icon', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = createProxyHandler({ prefix: '/icons' });

    await handler(
      createContext({
        params: { path: ['m', 'object_123'] },
        request: new Request('https://vaultlite-web.pages.dev/icons/m/object_123?ticket=abc', {
          method: 'GET',
        }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const upstreamRequest = fetchMock.mock.calls[0][0];
    expect(upstreamRequest.url).toBe('https://worker.example.com/icons/m/object_123?ticket=abc');
  });

  test('returns controlled JSON when VAULTLITE_API_ORIGIN is missing', async () => {
    const handler = createProxyHandler({ prefix: '/api', timeoutMs: 25 });
    const response = await handler(
      createContext({
        env: {
          VAULTLITE_API_ORIGIN: '',
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: 'api_proxy_misconfigured',
      reasonCode: 'missing_api_origin',
    });
  });

  test('rejects recursive upstream that points back to Pages host', async () => {
    const fetchMock = vi.fn(async () => new Response('should-not-run', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = createProxyHandler({ prefix: '/api' });

    const response = await handler(
      createContext({
        env: {
          VAULTLITE_API_ORIGIN: 'https://vaultlite-web.pages.dev',
        },
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: 'api_proxy_misconfigured',
      reasonCode: 'recursive_api_origin',
    });
  });

  test('returns controlled JSON when upstream times out', async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw error;
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = createProxyHandler({ prefix: '/api', timeoutMs: 25 });

    const response = await handler(createContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      code: 'api_proxy_upstream_timeout',
      reasonCode: 'upstream_timeout',
    });
  });
});
