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

function cookieHeaderFromSetCookie(setCookies: string[]): string {
  return setCookies.map((value) => value.split(';')[0]).join('; ');
}

function getCookieValue(setCookies: string[], cookieName: string): string {
  for (const value of setCookies) {
    const firstSegment = value.split(';')[0] ?? '';
    if (firstSegment.startsWith(`${cookieName}=`)) {
      return decodeURIComponent(firstSegment.slice(cookieName.length + 1));
    }
  }
  throw new Error(`Missing cookie ${cookieName}`);
}

async function createFixture() {
  const storage = createTestStorage();
  const clock = new FixedClock(new Date('2026-03-17T10:00:00.000Z'));
  const idGenerator = new IncrementingIdGenerator();
  const accountKitKeys = generateAccountKitKeyPair();

  const app = createVaultLiteApi({
    storage,
    clock,
    idGenerator,
    deploymentFingerprint: 'deployment_fp_v1',
    serverUrl: 'https://vaultlite.example.com',
    bootstrapAdminToken: 'bootstrap-secret',
    secureCookies: true,
    accountKitPrivateKey: accountKitKeys.privateKey,
    accountKitPublicKey: accountKitKeys.publicKey,
  });

  return { app, storage };
}

describe('bootstrap and admin canonical flows', () => {
  test('creates first owner through bootstrap and moves state to checkpoint pending', async () => {
    const { app, storage } = await createFixture();

    const stateBefore = await app.request('/api/bootstrap/state');
    expect(stateBefore.status).toBe(200);
    expect(await stateBefore.json()).toEqual({
      bootstrapState: 'UNINITIALIZED_PUBLIC_OPEN',
    });

    const verifyResponse = await app.request('/api/bootstrap/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        bootstrapToken: 'bootstrap-secret',
      }),
    });
    expect(verifyResponse.status).toBe(200);
    const verifyPayload = (await verifyResponse.json()) as {
      verificationToken: string;
    };
    expect(verifyPayload.verificationToken.length).toBeGreaterThan(10);

    const initializeResponse = await app.request('/api/bootstrap/initialize-owner', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'init-owner-1',
      },
      body: JSON.stringify({
        verificationToken: verifyPayload.verificationToken,
        username: 'owner',
        authSalt: 'A'.repeat(22),
        authVerifier: 'owner-proof',
        encryptedAccountBundle: 'owner-bundle',
        accountKeyWrapped: 'owner-wrapped',
        initialDeviceName: 'Primary Browser',
        initialDevicePlatform: 'web',
      }),
    });

    expect(initializeResponse.status).toBe(201);
    const initializePayload = (await initializeResponse.json()) as {
      result: string;
      bootstrapState: string;
      user: { role: string };
    };
    expect(initializePayload.result).toBe('success_changed');
    expect(initializePayload.bootstrapState).toBe('OWNER_CREATED_CHECKPOINT_PENDING');
    expect(initializePayload.user.role).toBe('owner');

    const stateAfter = await storage.deploymentState.get();
    expect(stateAfter.bootstrapState).toBe('OWNER_CREATED_CHECKPOINT_PENDING');
    expect(stateAfter.ownerUserId).toBeTruthy();
  });

  test('requires checkpoint download before checkpoint completion', async () => {
    const { app } = await createFixture();

    const verifyResponse = await app.request('/api/bootstrap/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bootstrapToken: 'bootstrap-secret' }),
    });
    const verifyPayload = (await verifyResponse.json()) as { verificationToken: string };

    const initializeResponse = await app.request('/api/bootstrap/initialize-owner', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'init-owner-1',
      },
      body: JSON.stringify({
        verificationToken: verifyPayload.verificationToken,
        username: 'owner',
        authSalt: 'A'.repeat(22),
        authVerifier: 'owner-proof',
        encryptedAccountBundle: 'owner-bundle',
        accountKeyWrapped: 'owner-wrapped',
        initialDeviceName: 'Primary Browser',
        initialDevicePlatform: 'web',
      }),
    });
    const setCookies = initializeResponse.headers.getSetCookie();
    const cookies = cookieHeaderFromSetCookie(setCookies);
    const csrf = getCookieValue(setCookies, 'vl_csrf');

    const completeBeforeDownload = await app.request('/api/bootstrap/checkpoint/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'checkpoint-complete-1',
      },
      body: JSON.stringify({
        confirmSavedOutsideBrowser: true,
      }),
    });
    expect(completeBeforeDownload.status).toBe(409);

    const downloadResponse = await app.request('/api/bootstrap/checkpoint/download-account-kit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'owner',
          accountKey: 'B'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-17T10:00:00.000Z',
        },
        signature: 'C'.repeat(32),
      }),
    });
    expect(downloadResponse.status).toBe(200);

    const completeAfterDownload = await app.request('/api/bootstrap/checkpoint/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'checkpoint-complete-2',
      },
      body: JSON.stringify({
        confirmSavedOutsideBrowser: true,
      }),
    });
    expect(completeAfterDownload.status).toBe(200);
    expect(await completeAfterDownload.json()).toEqual({
      ok: true,
      result: 'success_changed',
      bootstrapState: 'INITIALIZED',
    });
  });

  test('returns invite token only on first create and blocks replay token delivery', async () => {
    const { app } = await createFixture();

    const verifyResponse = await app.request('/api/bootstrap/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bootstrapToken: 'bootstrap-secret' }),
    });
    const verifyPayload = (await verifyResponse.json()) as { verificationToken: string };
    const initializeResponse = await app.request('/api/bootstrap/initialize-owner', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'init-owner-1',
      },
      body: JSON.stringify({
        verificationToken: verifyPayload.verificationToken,
        username: 'owner',
        authSalt: 'A'.repeat(22),
        authVerifier: 'owner-proof',
        encryptedAccountBundle: 'owner-bundle',
        accountKeyWrapped: 'owner-wrapped',
        initialDeviceName: 'Primary Browser',
        initialDevicePlatform: 'web',
      }),
    });
    const setCookies = initializeResponse.headers.getSetCookie();
    const cookies = cookieHeaderFromSetCookie(setCookies);
    const csrf = getCookieValue(setCookies, 'vl_csrf');

    await app.request('/api/bootstrap/checkpoint/download-account-kit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'owner',
          accountKey: 'B'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-17T10:00:00.000Z',
        },
        signature: 'C'.repeat(32),
      }),
    });
    await app.request('/api/bootstrap/checkpoint/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'checkpoint-complete-1',
      },
      body: JSON.stringify({ confirmSavedOutsideBrowser: true }),
    });

    await app.request('/api/auth/recent-reauth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({
        authProof: 'owner-proof',
      }),
    });

    const firstCreate = await app.request('/api/admin/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'invite-create-1',
        origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-18T10:00:00.000Z',
      }),
    });
    expect(firstCreate.status).toBe(201);
    const firstPayload = (await firstCreate.json()) as { inviteLink?: string };
    expect(firstPayload.inviteLink).toContain('/onboarding');
    expect(firstPayload.inviteLink?.startsWith('http://127.0.0.1:5173/')).toBe(true);

    const replayCreate = await app.request('/api/admin/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'invite-create-1',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-18T10:00:00.000Z',
      }),
    });
    expect(replayCreate.status).toBe(200);
    const replayPayload = (await replayCreate.json()) as { tokenDelivery?: string; inviteLink?: string };
    expect(replayPayload.tokenDelivery).toBe('not_available_on_replay');
    expect(replayPayload.inviteLink).toBeUndefined();
  });

  test('lists admin audit events for initialized owner sessions', async () => {
    const { app } = await createFixture();

    const verifyResponse = await app.request('/api/bootstrap/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bootstrapToken: 'bootstrap-secret' }),
    });
    const verifyPayload = (await verifyResponse.json()) as { verificationToken: string };
    const initializeResponse = await app.request('/api/bootstrap/initialize-owner', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'init-owner-audit-1',
      },
      body: JSON.stringify({
        verificationToken: verifyPayload.verificationToken,
        username: 'owner',
        authSalt: 'A'.repeat(22),
        authVerifier: 'owner-proof',
        encryptedAccountBundle: 'owner-bundle',
        accountKeyWrapped: 'owner-wrapped',
        initialDeviceName: 'Primary Browser',
        initialDevicePlatform: 'web',
      }),
    });
    const setCookies = initializeResponse.headers.getSetCookie();
    const cookies = cookieHeaderFromSetCookie(setCookies);
    const csrf = getCookieValue(setCookies, 'vl_csrf');

    await app.request('/api/bootstrap/checkpoint/download-account-kit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'owner',
          accountKey: 'B'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-17T10:00:00.000Z',
        },
        signature: 'C'.repeat(32),
      }),
    });
    await app.request('/api/bootstrap/checkpoint/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'checkpoint-complete-audit-1',
      },
      body: JSON.stringify({ confirmSavedOutsideBrowser: true }),
    });
    await app.request('/api/auth/recent-reauth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({ authProof: 'owner-proof' }),
    });
    await app.request('/api/admin/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookies,
        'x-csrf-token': csrf,
        'x-idempotency-key': 'invite-create-audit-1',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-18T10:00:00.000Z',
      }),
    });

    const auditResponse = await app.request('/api/admin/audit?limit=10', {
      headers: {
        cookie: cookies,
      },
    });
    expect(auditResponse.status).toBe(200);
    const auditPayload = (await auditResponse.json()) as {
      events: Array<{
        eventType: string;
      }>;
    };
    expect(auditPayload.events.length).toBeGreaterThan(0);
    expect(auditPayload.events.some((event) => event.eventType === 'admin_invite_create')).toBe(true);
  });
});
