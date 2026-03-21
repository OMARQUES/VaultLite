import { describe, expect, test } from 'vitest';

import {
  buildPairingDescription,
  buildServerUrlSuggestion,
  buildWebSettingsUrl,
  buildWebVaultUrl,
} from '../runtime-onboarding.js';

describe('runtime onboarding helpers', () => {
  test('builds reconnect description for remote authentication required phase', () => {
    expect(
      buildPairingDescription({
        phase: 'remote_authentication_required',
      }),
    ).toContain('trusted-device request');
  });

  test('suggests local development URL when no server is configured', () => {
    expect(buildServerUrlSuggestion('')).toBe('http://127.0.0.1:8787');
  });

  test('keeps configured server URL when available', () => {
    expect(buildServerUrlSuggestion('https://vaultlite.example.com')).toBe(
      'https://vaultlite.example.com',
    );
  });

  test('maps local api origin to local web vault route', () => {
    expect(buildWebVaultUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:5173/vault');
  });

  test('falls back to /vault for non-local origins', () => {
    expect(buildWebVaultUrl('https://vaultlite.example.com')).toBe(
      'https://vaultlite.example.com/vault',
    );
  });

  test('maps local api origin to local web extension settings route', () => {
    expect(buildWebSettingsUrl('http://127.0.0.1:8787')).toBe(
      'http://127.0.0.1:5173/settings/extension',
    );
  });

  test('builds extension settings route for non-local origins', () => {
    expect(buildWebSettingsUrl('https://vaultlite.example.com')).toBe(
      'https://vaultlite.example.com/settings/extension',
    );
  });
});
