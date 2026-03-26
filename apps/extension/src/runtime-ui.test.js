import { describe, expect, test, vi } from 'vitest';

import { ensureServerOriginPermission, sendBackgroundCommand } from '../runtime-ui.js';

describe('sendBackgroundCommand', () => {
  test('retries once when background connection fails transiently', async () => {
    let attempts = 0;
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('Could not establish connection. Receiving end does not exist.');
          }
          return { ok: true, state: { phase: 'pairing_required' } };
        }),
      },
    };

    const response = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true });

    expect(response.ok).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('classifies transient background transport failure with retry metadata', async () => {
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }),
      },
    };

    await expect(sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true })).rejects.toMatchObject({
      code: 'background_unavailable',
      kind: 'transport_transient',
      retriable: true,
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });
});

describe('ensureServerOriginPermission', () => {
  test('returns ok when origin permission is already granted', async () => {
    globalThis.chrome = {
      permissions: {
        contains: vi.fn(async () => true),
        request: vi.fn(async () => false),
      },
    };

    const result = await ensureServerOriginPermission('http://127.0.0.1:8787');

    expect(result).toEqual({ ok: true });
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['http://127.0.0.1/*'],
    });
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  test('requests permission when not yet granted', async () => {
    globalThis.chrome = {
      permissions: {
        contains: vi.fn(async () => false),
        request: vi.fn(async () => true),
      },
    };

    const result = await ensureServerOriginPermission('https://vaultlite.example.com');

    expect(result).toEqual({ ok: true });
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://vaultlite.example.com/*'],
    });
  });

  test('returns explicit failure when permission request throws due invalid context', async () => {
    globalThis.chrome = {
      permissions: {
        contains: vi.fn(async () => false),
        request: vi.fn(async () => {
          throw new Error('This action is not allowed in this extension context.');
        }),
      },
    };

    const result = await ensureServerOriginPermission('http://127.0.0.1:8787');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('permission_request_failed');
  });
});
