import { describe, expect, test, vi } from 'vitest';

import { VaultLiteRealtimeHub, redactRealtimeTokenInUrl } from './realtime';

function createHubFixture() {
  const storageMap = new Map<string, unknown>();
  const sockets: WebSocket[] = [];
  const state = {
    storage: {
      async get(key: string) {
        return storageMap.get(key);
      },
      async put(key: string, value: unknown) {
        storageMap.set(key, value);
      },
    },
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: vi.fn(() => sockets),
    acceptWebSocket: vi.fn((socket: WebSocket) => {
      sockets.push(socket);
    }),
  };
  const hub = new VaultLiteRealtimeHub(state, {});
  return { hub, storageMap };
}

describe('realtime helpers', () => {
  test('redacts connect token in websocket url', () => {
    const redacted = redactRealtimeTokenInUrl(
      'wss://api.vaultlite.test/api/realtime/ws?token=secret-token&cursor=12',
    );
    expect(redacted).toContain('token=%3Credacted%3E');
    expect(redacted).toContain('cursor=12');
    expect(redacted).not.toContain('secret-token');
  });
});

describe('VaultLiteRealtimeHub', () => {
  test('deduplicates publishes by eventId', async () => {
    const { hub, storageMap } = createHubFixture();
    const nowIso = new Date().toISOString();
    const body = {
      eventId: 'evt_1',
      occurredAt: nowIso,
      deploymentFingerprint: 'fp_1',
      topic: 'vault.item.upserted',
      sourceDeviceId: 'device_1',
      payload: {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        updatedAt: nowIso,
        encryptedPayload: 'payload_1',
      },
    };

    const first = await hub.fetch(
      new Request('https://vaultlite.realtime.internal/publish', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
    const second = await hub.fetch(
      new Request('https://vaultlite.realtime.internal/publish', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ ok: true, seq: 1 });
    await expect(second.json()).resolves.toEqual({ ok: true, seq: 1, duplicate: true });
    const events = storageMap.get('realtime.events');
    expect(Array.isArray(events)).toBe(true);
    expect((events as unknown[]).length).toBe(1);
  });
});
