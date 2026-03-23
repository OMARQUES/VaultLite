import { describe, expect, test } from 'vitest';

import {
  deriveWebOriginFromServerOrigin,
  isAllowedUnlockPath,
  isAllowedSettingsPath,
  resolveSenderContext,
} from '../runtime-common.js';

globalThis.chrome = {
  runtime: {
    id: 'abcdefghijklmnop',
  },
};

describe('resolveSenderContext', () => {
  const extensionOrigin = 'chrome-extension://abcdefghijklmnop';

  test('classifies options and popup pages as privileged extension contexts even when sender.tab exists', () => {
    expect(
      resolveSenderContext(
        {
          id: 'abcdefghijklmnop',
          url: 'chrome-extension://abcdefghijklmnop/options.html?from=tab',
          tab: { id: 11 },
        },
        extensionOrigin,
      ),
    ).toBe('options');

    expect(
      resolveSenderContext(
        {
          id: 'abcdefghijklmnop',
          url: 'chrome-extension://abcdefghijklmnop/popup.html',
          tab: { id: 12 },
        },
        extensionOrigin,
      ),
    ).toBe('popup');
  });

  test('classifies tab senders outside extension origin as content_script', () => {
    expect(
      resolveSenderContext(
        {
          id: 'abcdefghijklmnop',
          url: 'https://example.com/login',
          tab: { id: 13 },
        },
        extensionOrigin,
      ),
    ).toBe('content_script');
  });

  test('rejects messages from foreign extension ids', () => {
    expect(
      resolveSenderContext(
        {
          id: 'different-extension-id',
          url: 'chrome-extension://different-extension-id/options.html',
        },
        extensionOrigin,
      ),
    ).toBe('unknown');
  });

  test('classifies extension pages when sender.url is missing but sender.origin matches extension', () => {
    expect(
      resolveSenderContext(
        {
          id: 'abcdefghijklmnop',
          origin: 'chrome-extension://abcdefghijklmnop',
        },
        extensionOrigin,
      ),
    ).toBe('popup');
  });
});

describe('deriveWebOriginFromServerOrigin', () => {
  test('maps local api origin on 8787 to local web origin on 5173', () => {
    expect(deriveWebOriginFromServerOrigin('http://127.0.0.1:8787')).toBe('http://127.0.0.1:5173');
    expect(deriveWebOriginFromServerOrigin('http://localhost:8787')).toBe('http://localhost:5173');
  });

  test('keeps production origins unchanged', () => {
    expect(deriveWebOriginFromServerOrigin('https://vaultlite.example.com')).toBe(
      'https://vaultlite.example.com',
    );
  });

  test('returns null for invalid server origin input', () => {
    expect(deriveWebOriginFromServerOrigin('')).toBeNull();
    expect(deriveWebOriginFromServerOrigin('notaurl')).toBeNull();
  });
});

describe('isAllowedSettingsPath', () => {
  test('allows dedicated extension settings route', () => {
    expect(
      isAllowedSettingsPath({
        pathname: '/settings/extension',
        search: '',
      }),
    ).toBe(true);
  });

  test('allows legacy extension panel query route', () => {
    expect(
      isAllowedSettingsPath({
        pathname: '/settings',
        search: '?panel=extension',
      }),
    ).toBe(true);
  });

  test('rejects other settings routes', () => {
    expect(
      isAllowedSettingsPath({
        pathname: '/settings/security',
        search: '',
      }),
    ).toBe(false);
    expect(
      isAllowedSettingsPath({
        pathname: '/settings',
        search: '?panel=data',
      }),
    ).toBe(false);
  });
});

describe('isAllowedUnlockPath', () => {
  test('allows unlock route with optional trailing slash', () => {
    expect(
      isAllowedUnlockPath({
        pathname: '/unlock',
      }),
    ).toBe(true);
    expect(
      isAllowedUnlockPath({
        pathname: '/unlock/',
      }),
    ).toBe(true);
  });

  test('rejects non-unlock routes', () => {
    expect(
      isAllowedUnlockPath({
        pathname: '/settings',
      }),
    ).toBe(false);
    expect(
      isAllowedUnlockPath({
        pathname: '/unlocking',
      }),
    ).toBe(false);
  });
});
