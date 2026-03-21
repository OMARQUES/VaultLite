import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { FixedClock, createTestStorage } from '@vaultlite/test-utils';
import { describe, expect, test } from 'vitest';

import { createVaultLiteApi } from './app';

class IncrementingIdGenerator {
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }
}

function toBase64Url(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64url');
}

async function createLinkRequester() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify'],
  );
  const publicSpki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const requestPublicKey = toBase64Url(publicSpki);

  async function sign(input: {
    requestId: string;
    clientNonce: string;
    serverOrigin: string;
    deploymentFingerprint: string;
    action: 'status' | 'consume';
    nonce: string;
  }): Promise<string> {
    const payload = Buffer.from(
      [
        'vaultlite-extension-link-v1',
        input.action,
        input.requestId,
        input.nonce,
        input.clientNonce,
        input.serverOrigin,
        input.deploymentFingerprint,
      ].join('|'),
      'utf8',
    );
    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      pair.privateKey,
      payload,
    );
    return toBase64Url(signature);
  }

  return {
    requestPublicKey,
    sign,
  };
}

async function createFixture() {
  const storage = createTestStorage();
  const clock = new FixedClock(new Date('2026-03-19T12:00:00.000Z'));
  const idGenerator = new IncrementingIdGenerator();
  const accountKitKeys = generateAccountKitKeyPair();

  await storage.deploymentState.transitionToOwnerCreatedCheckpointPending({
    ownerUserId: 'user_1',
    ownerCreatedAt: clock.now().toISOString(),
    bootstrapPublicClosedAt: clock.now().toISOString(),
  });
  await storage.deploymentState.completeInitialization({
    completedAt: clock.now().toISOString(),
  });

  await storage.users.create({
    userId: 'user_1',
    username: 'alice',
    role: 'owner',
    authSalt: 'A'.repeat(22),
    authVerifier: 'proof_alice',
    encryptedAccountBundle: 'bundle_alice',
    accountKeyWrapped: 'wrapped_alice',
    bundleVersion: 0,
    lifecycleState: 'active',
    createdAt: '2026-03-19T12:00:00.000Z',
    updatedAt: '2026-03-19T12:00:00.000Z',
  });
  await storage.devices.register({
    deviceId: 'device_web_1',
    userId: 'user_1',
    deviceName: 'Alice Web',
    platform: 'web',
    deviceState: 'active',
    createdAt: '2026-03-19T12:00:00.000Z',
    revokedAt: null,
  });
  await storage.sessions.create({
    sessionId: 'session_web_1',
    userId: 'user_1',
    deviceId: 'device_web_1',
    csrfToken: 'csrf_web_1',
    createdAt: '2026-03-19T12:00:00.000Z',
    expiresAt: '2026-03-19T20:00:00.000Z',
    recentReauthAt: '2026-03-19T12:00:00.000Z',
    revokedAt: null,
    rotatedFromSessionId: null,
  });

  const app = createVaultLiteApi({
    storage,
    clock,
    idGenerator,
    runtimeMode: 'test',
    deploymentFingerprint: 'deployment_fp_v1',
    serverUrl: 'https://vaultlite.example.com',
    bootstrapAdminToken: 'bootstrap-secret',
    secureCookies: true,
    accountKitPrivateKey: accountKitKeys.privateKey,
    accountKitPublicKey: accountKitKeys.publicKey,
  });

  const webHeaders = {
    cookie: 'vl_session=session_web_1; vl_csrf=csrf_web_1',
    'content-type': 'application/json',
    'x-csrf-token': 'csrf_web_1',
  };

  return { app, storage, clock, webHeaders };
}

describe('extension LTS pairing and extension bearer session', () => {
  test('returns not found for removed legacy pairing endpoints', async () => {
    const { app } = await createFixture();

    const initResponse = await app.request('/api/auth/extension/pairing/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(initResponse.status).toBe(404);

    const completeResponse = await app.request('/api/auth/extension/pairing/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(completeResponse.status).toBe(404);
  });

  test('LTS request/approve/status/consume requires requester proof and issues extension bearer', async () => {
    const { app, webHeaders } = await createFixture();
    const clientNonce = 'Q2xpZW50Tm9uY2VfMTIzNDU2Nzg5MA';
    const requester = await createLinkRequester();

    const requestResponse = await app.request('/api/auth/extension/link/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        deploymentFingerprint: 'deployment_fp_v1',
        requestPublicKey: requester.requestPublicKey,
        clientNonce,
        deviceNameHint: 'Browser Notebook',
      }),
    });
    expect(requestResponse.status).toBe(200);
    const requestPayload = (await requestResponse.json()) as {
      requestId: string;
      shortCode: string;
      interval: number;
      serverOrigin: string;
    };
    expect(requestPayload.shortCode).toMatch(/^[A-Z2-7]{8}$/);
    expect(requestPayload.interval).toBeGreaterThanOrEqual(1);

    const invalidStatus = await app.request('/api/auth/extension/link/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: requestPayload.requestId,
        requestProof: {
          nonce: 'bm9uY2VfZm9yX3N0YXR1cw',
          signature: 'A'.repeat(64),
        },
      }),
    });
    expect(invalidStatus.status).toBe(200);
    expect(await invalidStatus.json()).toEqual(
      expect.objectContaining({
        ok: true,
        status: 'denied',
      }),
    );

    const approveResponse = await app.request('/api/auth/extension/link/approve', {
      method: 'POST',
      headers: webHeaders,
      body: JSON.stringify({
        requestId: requestPayload.requestId,
        approvalNonce: 'YXBwcm92ZV9ub25jZV8xMjM0NQ',
        package: {
          authSalt: 'A'.repeat(22),
          encryptedAccountBundle: 'bundle_transfer_v1',
          accountKeyWrapped: 'wrapped_transfer_v1',
          localUnlockEnvelope: {
            version: 'local-unlock.v1',
            nonce: 'B'.repeat(22),
            ciphertext: 'C'.repeat(43),
          },
        },
      }),
    });
    expect(approveResponse.status).toBe(200);
    expect(await approveResponse.json()).toEqual({
      ok: true,
      result: 'success_changed',
    });

    const statusSignature = await requester.sign({
      requestId: requestPayload.requestId,
      clientNonce,
      serverOrigin: requestPayload.serverOrigin,
      deploymentFingerprint: 'deployment_fp_v1',
      action: 'status',
      nonce: 'bm9uY2VfZm9yX3N0YXR1cw',
    });
    const approvedStatus = await app.request('/api/auth/extension/link/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: requestPayload.requestId,
        requestProof: {
          nonce: 'bm9uY2VfZm9yX3N0YXR1cw',
          signature: statusSignature,
        },
      }),
    });
    expect(approvedStatus.status).toBe(200);
    expect(await approvedStatus.json()).toEqual(
      expect.objectContaining({
        ok: true,
        status: 'approved',
      }),
    );

    const consumeWithoutProof = await app.request('/api/auth/extension/link/consume', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: requestPayload.requestId,
        requestProof: {
          nonce: 'Y29uc3VtZV9ub25jZQ',
          signature: 'B'.repeat(64),
        },
        consumeNonce: 'Y29uc3VtZV9ub25jZV8xMjM',
      }),
    });
    expect(consumeWithoutProof.status).toBe(403);
    expect(await consumeWithoutProof.json()).toEqual({
      ok: false,
      code: 'forbidden',
    });

    const consumeSignature = await requester.sign({
      requestId: requestPayload.requestId,
      clientNonce,
      serverOrigin: requestPayload.serverOrigin,
      deploymentFingerprint: 'deployment_fp_v1',
      action: 'consume',
      nonce: 'Y29uc3VtZV9ub25jZV92YWxpZA',
    });
    const consumeResponse = await app.request('/api/auth/extension/link/consume', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: requestPayload.requestId,
        requestProof: {
          nonce: 'Y29uc3VtZV9ub25jZV92YWxpZA',
          signature: consumeSignature,
        },
        consumeNonce: 'Y29uc3VtZV9ub25jZV8xMjM',
      }),
    });
    expect(consumeResponse.status).toBe(200);
    const consumePayload = (await consumeResponse.json()) as {
      ok: boolean;
      result: string;
      extensionSessionToken: string;
    };
    expect(consumePayload).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
      }),
    );

    const restoreResponse = await app.request('/api/auth/session/restore', {
      headers: {
        authorization: `Bearer ${consumePayload.extensionSessionToken}`,
      },
    });
    expect(restoreResponse.status).toBe(200);
    const restorePayload = (await restoreResponse.json()) as {
      sessionState: string;
      user?: { username: string };
      device?: { platform: string };
    };
    expect(restorePayload.sessionState).toBe('local_unlock_required');
    expect(restorePayload.user?.username).toBe('alice');
    expect(restorePayload.device?.platform).toBe('extension');

    const syncResponse = await app.request('/api/sync/snapshot', {
      headers: {
        authorization: `Bearer ${consumePayload.extensionSessionToken}`,
      },
    });
    expect(syncResponse.status).toBe(200);

    const blocked = await app.request('/api/auth/devices', {
      headers: {
        authorization: `Bearer ${consumePayload.extensionSessionToken}`,
      },
    });
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual({
      ok: false,
      code: 'unauthorized',
    });
  });
});
