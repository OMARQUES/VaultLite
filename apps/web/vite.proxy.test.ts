import { describe, expect, test } from 'vitest';

import { createApiProxyTarget, createLocalApiProxyConfig } from './vite.proxy';

describe('local api proxy config', () => {
  test('uses the default local worker target', () => {
    expect(createApiProxyTarget({})).toBe('http://127.0.0.1:8787');
  });

  test('allows overriding the local worker target from env', () => {
    expect(createApiProxyTarget({ VITE_API_PROXY_TARGET: 'http://127.0.0.1:9999' })).toBe(
      'http://127.0.0.1:9999',
    );
  });

  test('proxies /api requests to the configured local worker target', () => {
    const proxy = createLocalApiProxyConfig({ VITE_API_PROXY_TARGET: 'http://127.0.0.1:9999' });

    expect(proxy).toHaveProperty('/api');
    expect(proxy['/api']).toMatchObject({
      target: 'http://127.0.0.1:9999',
      changeOrigin: true,
      secure: false,
    });
  });
});
