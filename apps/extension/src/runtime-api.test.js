import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createExtensionApiClient } from '../runtime-api.js';

describe('runtime api client', () => {
  test('uses no-store cache policy for metadata and snapshot fetches', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ snapshotToken: 'snapshot_1', nextCursor: null, entries: [] }),
      clone() {
        return this;
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createExtensionApiClient('http://127.0.0.1:8787');

    await client.getRuntimeMetadata();
    await client.fetchSnapshot({
      bearerToken: 'token_1',
      pageSize: 100,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      method: 'GET',
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      method: 'GET',
    });
  });

  test('calls LTS link endpoints with expected HTTP methods and body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          requestId: 'req_1',
          shortCode: 'ABCDEFG2',
          fingerprintPhrase: 'amber-delta-zenith',
          expiresAt: '2026-03-20T12:00:00.000Z',
          interval: 5,
          serverOrigin: 'http://127.0.0.1:8787',
        }),
        clone() {
          return this;
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          status: 'authorization_pending',
          interval: 5,
        }),
        clone() {
          return this;
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: 'success_changed',
          extensionSessionToken: 'token_1',
          sessionExpiresAt: '2026-03-20T12:30:00.000Z',
          user: { userId: 'user_1', username: 'alice', role: 'owner', bundleVersion: 0, lifecycleState: 'active' },
          device: { deviceId: 'device_1', deviceName: 'Browser', platform: 'extension' },
          package: {
            authSalt: 'A'.repeat(22),
            encryptedAccountBundle: 'bundle',
            accountKeyWrapped: 'wrapped',
            localUnlockEnvelope: {
              version: 'local-unlock.v1',
              nonce: 'B'.repeat(22),
              ciphertext: 'C'.repeat(43),
            },
          },
        }),
        clone() {
          return this;
        },
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = createExtensionApiClient('http://127.0.0.1:8787');

    await client.createLinkRequest({
      deploymentFingerprint: 'deployment_fp_v1',
      requestPublicKey: 'pub_key_1',
      clientNonce: 'nonce_1_nonce_1',
      deviceNameHint: 'Notebook',
    });
    await client.getLinkStatus({
      requestId: 'request_1_request_1',
      requestProof: {
        nonce: 'nonce_status_12345',
        signature: 'A'.repeat(64),
      },
    });
    await client.consumeLinkRequest({
      requestId: 'request_1_request_1',
      requestProof: {
        nonce: 'nonce_consume_1234',
        signature: 'B'.repeat(64),
      },
      consumeNonce: 'consume_nonce_123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8787/api/auth/extension/link/request');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
    });
    expect(fetchMock.mock.calls[1][0]).toBe('http://127.0.0.1:8787/api/auth/extension/link/status');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
    });
    expect(fetchMock.mock.calls[2][0]).toBe('http://127.0.0.1:8787/api/auth/extension/link/consume');
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
    });
  });
});

describe('runtime api client manual icon payloads', () => {
  const serverOrigin = 'http://127.0.0.1:8787';
  const api = createExtensionApiClient(serverOrigin);
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('upsertManualSiteIcon does not leak bearerToken in request body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: 'success_changed' }),
    });

    await api.upsertManualSiteIcon({
      bearerToken: 'secret-token',
      domain: 'example.com',
      dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
      source: 'file',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverOrigin}/api/icons/manual/upsert`);
    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody).toEqual({
      domain: 'example.com',
      dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
      source: 'file',
    });
    expect(parsedBody).not.toHaveProperty('bearerToken');
    expect(init.headers.authorization).toBe('Bearer secret-token');
  });

  test('removeManualSiteIcon does not leak bearerToken in request body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: 'success_changed' }),
    });

    await api.removeManualSiteIcon({
      bearerToken: 'secret-token',
      domain: 'example.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverOrigin}/api/icons/manual/remove`);
    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody).toEqual({
      domain: 'example.com',
    });
    expect(parsedBody).not.toHaveProperty('bearerToken');
    expect(init.headers.authorization).toBe('Bearer secret-token');
  });

  test('updateVaultItem sends extension endpoint payload without leaking bearer token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        itemId: 'item_1',
        itemType: 'login',
        revision: 2,
        encryptedPayload: 'encrypted_payload_v2',
      }),
    });

    await api.updateVaultItem({
      bearerToken: 'secret-token',
      itemId: 'item_1',
      itemType: 'login',
      encryptedPayload: 'encrypted_payload_v2',
      expectedRevision: 1,
      encryptedDiffPayload: 'encrypted_diff_payload_v1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverOrigin}/api/extension/vault/items/item_1`);
    expect(init.method).toBe('PUT');
    expect(init.headers.authorization).toBe('Bearer secret-token');
    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody).toEqual({
      itemType: 'login',
      encryptedPayload: 'encrypted_payload_v2',
      expectedRevision: 1,
      encryptedDiffPayload: 'encrypted_diff_payload_v1',
    });
    expect(parsedBody).not.toHaveProperty('bearerToken');
  });

  test('listVaultItemHistory sends paginated query params and bearer auth', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        records: [],
        nextCursor: null,
      }),
    });

    await api.listVaultItemHistory({
      bearerToken: 'secret-token',
      itemId: 'item_1',
      limit: 40,
      cursor: 'cursor_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverOrigin}/api/vault/items/item_1/history?limit=40&cursor=cursor_1`);
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe('Bearer secret-token');
  });

  test('deleteVaultItem calls extension delete endpoint with bearer auth and no request body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
      clone() {
        return this;
      },
    });

    await api.deleteVaultItem({
      bearerToken: 'secret-token',
      itemId: 'item_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverOrigin}/api/extension/vault/items/item_1`);
    expect(init.method).toBe('DELETE');
    expect(init.headers.authorization).toBe('Bearer secret-token');
    expect(init.body).toBeUndefined();
  });

  test('restoreVaultItem calls extension restore endpoint with bearer auth and no request body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: 'success_changed',
        item: {
          itemId: 'item_1',
          itemType: 'login',
          revision: 3,
          encryptedPayload: 'encrypted_payload_v3',
          createdAt: '2026-03-30T12:00:00.000Z',
          updatedAt: '2026-03-31T12:00:00.000Z',
        },
      }),
      clone() {
        return this;
      },
    });

    await api.restoreVaultItem({
      bearerToken: 'secret-token',
      itemId: 'item_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${serverOrigin}/api/extension/vault/items/item_1/restore`);
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer secret-token');
    expect(init.body).toBeUndefined();
  });
});
