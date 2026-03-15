import {
  AccountKitSignatureOutputSchema,
  AccountKitSignatureInputSchema,
  AccountKitVerificationInputSchema,
  GenericAuthFailureSchema,
  InviteCreateInputSchema,
  InviteCreateOutputSchema,
  OnboardingAccountKitSignInputSchema,
  OnboardingCompleteInputSchema,
  RemoteAuthenticationChallengeInputSchema,
  RemoteAuthenticationChallengeOutputSchema,
  RuntimeMetadataSchema,
  RemoteAuthenticationInputSchema,
  SessionRestoreResponseSchema,
  TrustedSessionResponseSchema,
  VaultItemCreateInputSchema,
  VaultItemListOutputSchema,
  VaultItemRecordSchema,
  VaultItemUpdateInputSchema,
  type TrustedSessionResponse,
} from '@vaultlite/contracts';
import {
  canonicalizeAccountKitPayload,
  signAccountKitPayload,
  verifyAccountKitSignature,
} from '@vaultlite/crypto/account-kit';
import { toBase64Url } from '@vaultlite/crypto/base64';
import type {
  Clock,
  EqualityCsrfValidator,
  IdGenerator,
  MutableRequestCsrfValidator,
} from '@vaultlite/runtime-abstractions';
import type { DeviceRecord, SessionRecord, UserAccountRecord, VaultLiteStorage } from '@vaultlite/storage-abstractions';
import {
  createDefaultSecurityHeaders,
  createSessionCookieBundle,
  parseCookieHeader,
  serializeCookie,
} from '@vaultlite/cloudflare-runtime';
import { Hono } from 'hono';
import { createHash, type KeyObject } from 'node:crypto';

const GENERIC_INVALID_CREDENTIALS = GenericAuthFailureSchema.parse({
  ok: false,
  code: 'invalid_credentials',
  message: 'Invalid credentials',
});

interface VaultLiteApiOptions {
  storage: VaultLiteStorage;
  clock: Clock;
  idGenerator: IdGenerator;
  deploymentFingerprint: string;
  serverUrl: string;
  bootstrapAdminToken: string;
  secureCookies: boolean;
  accountKitPrivateKey: KeyObject | string;
  accountKitPublicKey: KeyObject | string;
  csrfValidator?: MutableRequestCsrfValidator;
}

type SessionContext = {
  session: SessionRecord;
  user: UserAccountRecord;
  device: DeviceRecord;
};

function isoNow(clock: Clock): string {
  return clock.now().toISOString();
}

function normalizeIsoTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }

  return parsed.toISOString();
}

function addSecurityHeaders(response: Response): Response {
  const headers = createDefaultSecurityHeaders(
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );

  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });

  return response;
}

function jsonResponse(status: number, body: unknown, init?: ResponseInit): Response {
  const response = Response.json(body, { status, ...(init ?? {}) });
  return addSecurityHeaders(response);
}

function emptyResponse(status: number, init?: ResponseInit): Response {
  const response = new Response(null, { status, ...(init ?? {}) });
  return addSecurityHeaders(response);
}

function fakeAuthSalt(username: string, deploymentFingerprint: string): string {
  const digest = createHash('sha256')
    .update(`${deploymentFingerprint}:${username}`)
    .digest()
    .subarray(0, 16);
  return toBase64Url(digest);
}

function buildTrustedSessionResponse(input: {
  session: SessionRecord;
  user: UserAccountRecord;
  device: DeviceRecord;
}): TrustedSessionResponse {
  return TrustedSessionResponseSchema.parse({
    ok: true,
    sessionId: input.session.sessionId,
    csrfToken: input.session.csrfToken,
    user: {
      userId: input.user.userId,
      username: input.user.username,
      lifecycleState: input.user.lifecycleState,
    },
    device: {
      deviceId: input.device.deviceId,
      deviceName: input.device.deviceName,
      platform: input.device.platform,
    },
  });
}

function addSessionCookies(response: Response, input: {
  sessionId: string;
  csrfToken: string;
  secure: boolean;
}): void {
  const cookies = createSessionCookieBundle({
    secure: input.secure,
    sessionMaxAgeSeconds: 60 * 60 * 8,
    csrfMaxAgeSeconds: 60 * 60 * 8,
  });
  response.headers.append(
    'set-cookie',
    serializeCookie(cookies.session.name, input.sessionId, cookies.session),
  );
  response.headers.append(
    'set-cookie',
    serializeCookie(cookies.csrf.name, input.csrfToken, cookies.csrf),
  );
}

async function issueTrustedSession(input: {
  storage: VaultLiteStorage;
  clock: Clock;
  idGenerator: IdGenerator;
  user: UserAccountRecord;
  device: DeviceRecord;
}): Promise<SessionRecord> {
  const session = buildTrustedSessionRecord(input);
  return input.storage.sessions.create(session);
}

function buildTrustedSessionRecord(input: {
  clock: Clock;
  idGenerator: IdGenerator;
  user: UserAccountRecord;
  device: DeviceRecord;
}): SessionRecord {
  const nowIso = isoNow(input.clock);
  const expiresAtIso = new Date(input.clock.now().getTime() + 1000 * 60 * 60 * 8).toISOString();
  const sessionId = input.idGenerator.nextId('session');
  const csrfToken = input.idGenerator.nextId('csrf');

  return {
    sessionId,
    userId: input.user.userId,
    deviceId: input.device.deviceId,
    csrfToken,
    createdAt: nowIso,
    expiresAt: expiresAtIso,
    revokedAt: null,
    rotatedFromSessionId: null,
  };
}

async function resolveAuthenticatedSession(input: {
  storage: VaultLiteStorage;
  clock: Clock;
  sessionId: string | undefined;
}): Promise<SessionContext | null> {
  if (!input.sessionId) {
    return null;
  }

  const session = await input.storage.sessions.findBySessionId(input.sessionId);
  if (!session || session.revokedAt !== null || session.expiresAt <= isoNow(input.clock)) {
    return null;
  }

  const user = await input.storage.users.findByUserId(session.userId);
  const device = await input.storage.devices.findById(session.deviceId);
  if (!user || !device || device.revokedAt !== null) {
    return null;
  }

  if (user.lifecycleState !== 'active') {
    const nowIso = isoNow(input.clock);
    await input.storage.sessions.revoke(session.sessionId, nowIso);
    if (user.lifecycleState === 'deprovisioned') {
      await input.storage.devices.revokeByUserId(user.userId, nowIso);
    }
    return null;
  }

  return { session, user, device };
}

export function createVaultLiteApi(options: VaultLiteApiOptions) {
  const app = new Hono();
  const csrfValidator =
    options.csrfValidator ??
    ({
      ensureValid(headerToken, cookieToken) {
        return headerToken !== null && cookieToken !== null && headerToken === cookieToken;
      },
    } satisfies MutableRequestCsrfValidator);

  app.get('/api/health', (c) => jsonResponse(200, { status: 'ok' }));

  app.get('/api/runtime/metadata', () =>
    jsonResponse(
      200,
      RuntimeMetadataSchema.parse({
        serverUrl: options.serverUrl,
        deploymentFingerprint: options.deploymentFingerprint,
      }),
    ),
  );

  app.post('/api/auth/invites', async (c) => {
    if (c.req.header('x-bootstrap-admin-token') !== options.bootstrapAdminToken) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }

    const input = InviteCreateInputSchema.parse(await c.req.json());
    const nowIso = isoNow(options.clock);
    const inviteId = options.idGenerator.nextId('invite');
    const inviteToken = inviteId;
    const normalizedExpiresAt = normalizeIsoTimestamp(input.expiresAt);
    await options.storage.invites.create({
      inviteId,
      inviteToken,
      createdByUserId: 'bootstrap_owner',
      expiresAt: normalizedExpiresAt,
      consumedAt: null,
      createdAt: nowIso,
    });

    return jsonResponse(201, InviteCreateOutputSchema.parse({
      inviteToken,
      expiresAt: normalizedExpiresAt,
    }));
  });

  app.post('/api/auth/onboarding/complete', async (c) => {
    const input = OnboardingCompleteInputSchema.parse(await c.req.json());
    const nowIso = isoNow(options.clock);
    const userId = options.idGenerator.nextId('user');
    const user = {
      userId,
      username: input.username,
      authSalt: input.authSalt,
      authVerifier: input.authVerifier,
      encryptedAccountBundle: input.encryptedAccountBundle,
      accountKeyWrapped: input.accountKeyWrapped,
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    } satisfies UserAccountRecord;

    const device = {
      userId,
      deviceId: input.initialDevice.deviceId,
      deviceName: input.initialDevice.deviceName,
      platform: input.initialDevice.platform,
      createdAt: nowIso,
      revokedAt: null,
    } satisfies DeviceRecord;
    const session = buildTrustedSessionRecord({
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device,
    });
    let completion;

    try {
      completion = await options.storage.completeOnboardingAtomic({
        nowIso,
        inviteToken: input.inviteToken,
        user,
        device,
        session,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_invite') {
        return jsonResponse(400, { ok: false, code: 'invalid_invite' });
      }
      if (error instanceof Error && error.message === 'username_unavailable') {
        return jsonResponse(409, { ok: false, code: 'username_unavailable' });
      }
      return jsonResponse(500, { ok: false, code: 'onboarding_failed' });
    }

    const response = jsonResponse(
      201,
      buildTrustedSessionResponse({
        session: completion.session,
        user: completion.user,
        device: completion.device,
      }),
    );
    addSessionCookies(response, {
      sessionId: completion.session.sessionId,
      csrfToken: completion.session.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.post('/api/auth/onboarding/account-kit/sign', async (c) => {
    const input = OnboardingAccountKitSignInputSchema.parse(await c.req.json());
    const invite = await options.storage.invites.findUsableByToken(input.inviteToken, isoNow(options.clock));
    if (!invite) {
      return jsonResponse(400, { ok: false, code: 'invalid_invite' });
    }

    if (
      input.payload.username !== input.username ||
      input.payload.serverUrl !== options.serverUrl ||
      input.payload.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(400, { ok: false, code: 'account_kit_payload_mismatch' });
    }

    if (await options.storage.users.findByUsername(input.username)) {
      return jsonResponse(409, { ok: false, code: 'username_unavailable' });
    }

    return jsonResponse(
      200,
      AccountKitSignatureOutputSchema.parse({
        signature: signAccountKitPayload({
          payload: input.payload,
          privateKey: options.accountKitPrivateKey,
        }),
        canonicalPayload: canonicalizeAccountKitPayload(input.payload),
      }),
    );
  });

  app.post('/api/auth/remote-authentication/challenge', async (c) => {
    const input = RemoteAuthenticationChallengeInputSchema.parse(await c.req.json());
    const user = await options.storage.users.findByUsername(input.username);
    return jsonResponse(
      200,
      RemoteAuthenticationChallengeOutputSchema.parse({
        authSalt: user?.authSalt ?? fakeAuthSalt(input.username, options.deploymentFingerprint),
        requiresRemoteAuthentication: true,
      }),
    );
  });

  app.post('/api/auth/remote-authentication/complete', async (c) => {
    const input = RemoteAuthenticationInputSchema.parse(await c.req.json());
    const rateLimitKey = `remote-auth:${input.username}`;
    const rateLimit = await options.storage.authRateLimits.increment(rateLimitKey, isoNow(options.clock));
    if (rateLimit.attemptCount > 5) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const user = await options.storage.users.findByUsername(input.username);
    const device = await options.storage.devices.findById(input.deviceId);
    if (
      !user ||
      user.lifecycleState !== 'active' ||
      !device ||
      device.userId !== user.userId ||
      device.revokedAt !== null ||
      user.authVerifier !== input.authProof
    ) {
      return jsonResponse(401, GENERIC_INVALID_CREDENTIALS);
    }

    await options.storage.authRateLimits.reset(rateLimitKey);
    const session = await issueTrustedSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device,
    });

    const response = jsonResponse(200, buildTrustedSessionResponse({ session, user, device }));
    addSessionCookies(response, {
      sessionId: session.sessionId,
      csrfToken: session.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.get('/api/auth/session/restore', async (c) => {
    const cookies = parseCookieHeader(c.req.header('cookie'));
    const sessionContext = await resolveAuthenticatedSession({
      storage: options.storage,
      clock: options.clock,
      sessionId: cookies.vl_session,
    });

    if (!sessionContext) {
      return jsonResponse(
        200,
        SessionRestoreResponseSchema.parse({
          ok: true,
          sessionState: 'remote_authentication_required',
        }),
      );
    }

    return jsonResponse(
      200,
      SessionRestoreResponseSchema.parse({
        ok: true,
        sessionState: 'local_unlock_required',
        user: {
          userId: sessionContext.user.userId,
          username: sessionContext.user.username,
          lifecycleState: sessionContext.user.lifecycleState,
        },
        device: {
          deviceId: sessionContext.device.deviceId,
          deviceName: sessionContext.device.deviceName,
          platform: sessionContext.device.platform,
        },
      }),
    );
  });

  app.post('/api/auth/devices/bootstrap', async (c) => {
    const payload = await c.req.json();
    const devicePlatform: 'web' | 'extension' =
      payload.devicePlatform === 'extension' ? 'extension' : 'web';
    const input = {
      username: String(payload.username ?? ''),
      authProof: String(payload.authProof ?? ''),
      deviceName: String(payload.deviceName ?? ''),
      devicePlatform,
    };
    const parsed = RemoteAuthenticationInputSchema.safeParse({
      username: input.username,
      authProof: input.authProof,
      deviceId: 'bootstrap-device-placeholder',
    });

    if (!parsed.success || !input.deviceName) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }

    const user = await options.storage.users.findByUsername(input.username);
    if (!user || user.lifecycleState !== 'active' || user.authVerifier !== input.authProof) {
      return jsonResponse(401, GENERIC_INVALID_CREDENTIALS);
    }

    const nowIso = isoNow(options.clock);
    const device = await options.storage.devices.register({
      userId: user.userId,
      deviceId: options.idGenerator.nextId('device'),
      deviceName: input.deviceName,
      platform: input.devicePlatform,
      createdAt: nowIso,
      revokedAt: null,
    });
    const session = await issueTrustedSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device,
    });
    const response = jsonResponse(201, {
      ...buildTrustedSessionResponse({ session, user, device }),
      encryptedAccountBundle: user.encryptedAccountBundle,
      accountKeyWrapped: user.accountKeyWrapped,
      authSalt: user.authSalt,
    });
    addSessionCookies(response, {
      sessionId: session.sessionId,
      csrfToken: session.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  async function requireAuthenticatedSession(request: Request): Promise<SessionContext | null> {
    const cookies = parseCookieHeader(request.headers.get('cookie'));
    return resolveAuthenticatedSession({
      storage: options.storage,
      clock: options.clock,
      sessionId: cookies.vl_session,
    });
  }

  function hasValidCsrf(request: Request): boolean {
    const cookies = parseCookieHeader(request.headers.get('cookie'));
    return csrfValidator.ensureValid(request.headers.get('x-csrf-token'), cookies.vl_csrf ?? null);
  }

  app.post('/api/auth/account-kit/sign', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = AccountKitSignatureInputSchema.parse(await c.req.json());
    if (
      input.payload.username !== sessionContext.user.username ||
      input.payload.serverUrl !== options.serverUrl ||
      input.payload.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(400, { ok: false, code: 'account_kit_payload_mismatch' });
    }

    const signature = signAccountKitPayload({
      payload: input.payload,
      privateKey: options.accountKitPrivateKey,
    });
    return jsonResponse(
      200,
      AccountKitSignatureOutputSchema.parse({
        signature,
        canonicalPayload: canonicalizeAccountKitPayload(input.payload),
      }),
    );
  });

  app.post('/api/auth/account-kit/reissue', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = AccountKitSignatureInputSchema.parse(await c.req.json());
    if (
      input.payload.username !== sessionContext.user.username ||
      input.payload.serverUrl !== options.serverUrl ||
      input.payload.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(400, { ok: false, code: 'account_kit_payload_mismatch' });
    }

    return jsonResponse(
      200,
      AccountKitSignatureOutputSchema.parse({
        signature: signAccountKitPayload({
          payload: input.payload,
          privateKey: options.accountKitPrivateKey,
        }),
      }),
    );
  });

  app.post('/api/auth/account-kit/verify', async (c) => {
    const input = AccountKitVerificationInputSchema.parse(await c.req.json());
    const status =
      input.payload.serverUrl === options.serverUrl &&
      input.payload.deploymentFingerprint === options.deploymentFingerprint &&
      verifyAccountKitSignature({
        payload: input.payload,
        signature: input.signature,
        publicKey: options.accountKitPublicKey,
      })
        ? 'valid'
        : 'invalid';

    return jsonResponse(200, {
      status,
    });
  });

  app.get('/api/vault/items', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const items = await options.storage.vaultItems.listByOwnerUserId(sessionContext.user.userId);
    return jsonResponse(
      200,
      VaultItemListOutputSchema.parse({
        items: items.map((item) =>
          VaultItemRecordSchema.parse({
            itemId: item.itemId,
            itemType: item.itemType,
            revision: item.revision,
            encryptedPayload: item.encryptedPayload,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }),
        ),
      }),
    );
  });

  app.get('/api/vault/items/:itemId', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const item = await options.storage.vaultItems.findByItemId(
      c.req.param('itemId'),
      sessionContext.user.userId,
    );
    if (!item) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }

    return jsonResponse(
      200,
      VaultItemRecordSchema.parse({
        itemId: item.itemId,
        itemType: item.itemType,
        revision: item.revision,
        encryptedPayload: item.encryptedPayload,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    );
  });

  app.post('/api/vault/items', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = VaultItemCreateInputSchema.parse(await c.req.json());
    const nowIso = isoNow(options.clock);
    const item = await options.storage.vaultItems.create({
      itemId: options.idGenerator.nextId('item'),
      ownerUserId: sessionContext.user.userId,
      itemType: input.itemType,
      revision: 1,
      encryptedPayload: input.encryptedPayload,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return jsonResponse(
      201,
      VaultItemRecordSchema.parse({
        itemId: item.itemId,
        itemType: item.itemType,
        revision: item.revision,
        encryptedPayload: item.encryptedPayload,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    );
  });

  app.put('/api/vault/items/:itemId', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = VaultItemUpdateInputSchema.parse(await c.req.json());

    try {
      const item = await options.storage.vaultItems.update({
        itemId: c.req.param('itemId'),
        ownerUserId: sessionContext.user.userId,
        itemType: input.itemType,
        encryptedPayload: input.encryptedPayload,
        expectedRevision: input.expectedRevision,
        updatedAt: isoNow(options.clock),
      });

      return jsonResponse(
        200,
        VaultItemRecordSchema.parse({
          itemId: item.itemId,
          itemType: item.itemType,
          revision: item.revision,
          encryptedPayload: item.encryptedPayload,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'item_not_found') {
        return jsonResponse(404, { ok: false, code: 'not_found' });
      }
      if (error instanceof Error && error.message === 'revision_conflict') {
        return jsonResponse(409, { ok: false, code: 'revision_conflict' });
      }

      return jsonResponse(500, { ok: false, code: 'vault_item_update_failed' });
    }
  });

  app.delete('/api/vault/items/:itemId', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const deleted = await options.storage.vaultItems.delete(
      c.req.param('itemId'),
      sessionContext.user.userId,
    );
    if (!deleted) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }

    return emptyResponse(204);
  });

  app.get('/api/attachments', () => jsonResponse(501, { ok: false, code: 'not_implemented' }));
  app.get('/api/admin/users', () => jsonResponse(501, { ok: false, code: 'not_implemented' }));

  app.notFound(() => jsonResponse(404, { ok: false, code: 'not_found' }));

  return app;
}
