import { describe, expect, test } from 'vitest';

import { buildWebCsp } from './vite.config';

describe('buildWebCsp', () => {
  test('includes api origin and derived websocket origin in production', () => {
    const csp = buildWebCsp('production', {
      VITE_API_ORIGIN: 'https://vaultlite-api-prod.example.workers.dev',
    });

    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain('https://vaultlite-api-prod.example.workers.dev');
    expect(csp).toContain('wss://vaultlite-api-prod.example.workers.dev');
  });

  test('accepts explicit websocket origin in production', () => {
    const csp = buildWebCsp('production', {
      VITE_REALTIME_WS_BASE_URL: 'wss://vaultlite-realtime.example.workers.dev',
    });

    expect(csp).toContain('wss://vaultlite-realtime.example.workers.dev');
  });

  test('keeps local origins in development', () => {
    const csp = buildWebCsp('development', {});

    expect(csp).toContain('http://127.0.0.1:8787');
    expect(csp).toContain('ws://127.0.0.1:8787');
  });
});
