import { describe, expect, test, vi } from 'vitest';

import {
  copyToClipboard,
  ensureServerOriginPermission,
  ensureSiteAutomationPermission,
  sendBackgroundCommand,
} from '../runtime-ui.js';

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

describe('ensureSiteAutomationPermission', () => {
  test('returns ok when broad automation permission is already granted', async () => {
    globalThis.chrome = {
      permissions: {
        contains: vi.fn(async () => true),
        request: vi.fn(async () => false),
      },
    };

    const result = await ensureSiteAutomationPermission();

    expect(result).toEqual({ ok: true });
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['https://*/*'],
    });
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  test('requests broad automation permission when not yet granted', async () => {
    globalThis.chrome = {
      permissions: {
        contains: vi.fn(async () => false),
        request: vi.fn(async () => true),
      },
    };

    const result = await ensureSiteAutomationPermission();

    expect(result).toEqual({ ok: true });
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://*/*'],
    });
  });
});

describe('copyToClipboard', () => {
  test('falls back to execCommand copy when Clipboard API is unavailable', async () => {
    const execCommand = vi.fn(() => true);
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'remove');
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    await copyToClipboard('hello world');

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  test('prefers execCommand copy before Clipboard API when available', async () => {
    const execCommand = vi.fn(() => true);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await copyToClipboard('hello world');

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(writeText).not.toHaveBeenCalled();
  });
});
