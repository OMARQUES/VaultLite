import {
  AttachmentEnvelopeSchema,
  AttachmentUploadContentInputSchema,
  AttachmentUploadFinalizeInputSchema,
  AttachmentUploadInitInputSchema,
  AttachmentUploadInitOutputSchema,
  AttachmentUploadListOutputSchema,
  AttachmentUploadRecordSchema,
  AdminInviteCreateInputSchema,
  AdminInviteCreateOutputSchema,
  AdminInviteListOutputSchema,
  AdminInviteRecordSchema,
  AdminInviteRevokeOutputSchema,
  AdminAuditListOutputSchema,
  AdminUserLifecycleMutationOutputSchema,
  AdminUserListOutputSchema,
  AccountKitSignatureOutputSchema,
  AccountKitSignatureInputSchema,
  AccountKitVerificationInputSchema,
  BootstrapCheckpointCompleteInputSchema,
  BootstrapCheckpointCompleteOutputSchema,
  BootstrapCheckpointDownloadInputSchema,
  BootstrapCheckpointDownloadOutputSchema,
  BootstrapInitializeOwnerInputSchema,
  BootstrapInitializeOwnerOutputSchema,
  BootstrapStateOutputSchema,
  BootstrapVerifyInputSchema,
  BootstrapVerifyOutputSchema,
  CanonicalResultSchema,
  GenericAuthFailureSchema,
  OnboardingAccountKitSignInputSchema,
  OnboardingCompleteInputSchema,
  RecentReauthInputSchema,
  RecentReauthOutputSchema,
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
import { createHash, createHmac, timingSafeEqual, type KeyObject } from 'node:crypto';

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

type CanonicalResult = 'success_changed' | 'success_no_op' | 'conflict' | 'denied';

type SessionContext = {
  session: SessionRecord;
  user: UserAccountRecord;
  device: DeviceRecord;
};

const VERIFY_TOKEN_TTL_SECONDS = 10 * 60;
const RECENT_REAUTH_TTL_SECONDS = 5 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const BOOTSTRAP_VERIFY_ATTEMPT_LIMIT = 20;

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

function addMinutes(value: Date, minutes: number): string {
  return new Date(value.getTime() + minutes * 60 * 1000).toISOString();
}

function base64UrlToUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

function utf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return toBase64Url(bytes);
}

function sha256Base64Url(value: string): string {
  return toBase64Url(createHash('sha256').update(value).digest());
}

function timingSafeSecretEquals(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function toTokenPreview(rawToken: string): string {
  const visibleStart = rawToken.slice(0, 6);
  const visibleEnd = rawToken.slice(-4);
  return `${visibleStart}…${visibleEnd}`;
}

function resolveOnboardingLinkBaseUrl(input: {
  request: Request;
  fallbackServerUrl: string;
}): string {
  const originHeader = input.request.headers.get('origin');
  if (!originHeader) {
    return input.fallbackServerUrl;
  }

  try {
    const parsed = new URL(originHeader);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return input.fallbackServerUrl;
    }
    return parsed.origin;
  } catch {
    return input.fallbackServerUrl;
  }
}

function toCanonicalResult(value: CanonicalResult): CanonicalResult {
  return CanonicalResultSchema.parse(value);
}

function toStatusFromResult(result: CanonicalResult): number {
  if (result === 'conflict') {
    return 409;
  }
  if (result === 'denied') {
    return 403;
  }
  return 200;
}

function addSeconds(isoValue: string, seconds: number): string {
  return new Date(new Date(isoValue).getTime() + seconds * 1000).toISOString();
}

function parseIsoTimestamp(isoValue: string): number {
  return new Date(isoValue).getTime();
}

function createBootstrapVerificationToken(input: {
  bootstrapSecret: string;
  nowIso: string;
  nonce: string;
}): string {
  const payloadEncoded = utf8ToBase64Url(
    JSON.stringify({
      iat: input.nowIso,
      nonce: input.nonce,
    }),
  );
  const signature = toBase64Url(
    createHmac('sha256', input.bootstrapSecret).update(payloadEncoded).digest(),
  );
  return `${payloadEncoded}.${signature}`;
}

function verifyBootstrapVerificationToken(input: {
  token: string;
  bootstrapSecret: string;
  nowIso: string;
}): boolean {
  const [payloadEncoded, signature] = input.token.split('.');
  if (!payloadEncoded || !signature) {
    return false;
  }

  const expectedSignature = toBase64Url(
    createHmac('sha256', input.bootstrapSecret).update(payloadEncoded).digest(),
  );
  if (!timingSafeSecretEquals(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlToUtf8(payloadEncoded)) as {
      iat?: string;
      nonce?: string;
    };
    if (typeof payload.iat !== 'string' || typeof payload.nonce !== 'string') {
      return false;
    }
    const ageMs = parseIsoTimestamp(input.nowIso) - parseIsoTimestamp(payload.iat);
    if (!Number.isFinite(ageMs) || ageMs < 0) {
      return false;
    }
    return ageMs <= VERIFY_TOKEN_TTL_SECONDS * 1000;
  } catch {
    return false;
  }
}

function toPayloadHash(payload: unknown): string {
  return sha256Base64Url(JSON.stringify(payload));
}

function getActorScope(input: {
  deploymentFingerprint: string;
  userId: string | null;
  sessionId: string | null;
}): string {
  if (input.userId && input.sessionId) {
    return `deployment:${input.deploymentFingerprint}:user:${input.userId}:session:${input.sessionId}`;
  }
  return `deployment:${input.deploymentFingerprint}:bootstrap_public`;
}

function getIdempotencyScope(input: {
  method: string;
  routeTemplate: string;
  actorScope: string;
  idempotencyKey: string;
}): string {
  return `${input.method.toUpperCase()}|${input.routeTemplate}|${input.actorScope}|${input.idempotencyKey}`;
}

async function createAuditEvent(input: {
  storage: VaultLiteStorage;
  idGenerator: IdGenerator;
  clock: Clock;
  request: Request;
  eventType: string;
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  result: CanonicalResult;
  reasonCode: string | null;
  requestId?: string | null;
}) {
  const nowIso = isoNow(input.clock);
  const requestId =
    input.requestId ??
    input.request.headers.get('x-request-id') ??
    input.request.headers.get('cf-ray') ??
    input.idGenerator.nextId('request');
  const ipValue =
    input.request.headers.get('cf-connecting-ip') ??
    input.request.headers.get('x-forwarded-for') ??
    null;
  const userAgent = input.request.headers.get('user-agent') ?? null;

  return input.storage.auditEvents.create({
    eventId: input.idGenerator.nextId('audit'),
    eventType: input.eventType,
    actorUserId: input.actorUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    result: input.result,
    reasonCode: input.reasonCode,
    requestId,
    createdAt: nowIso,
    ipHash: ipValue ? sha256Base64Url(ipValue) : null,
    userAgentHash: userAgent ? sha256Base64Url(userAgent) : null,
  });
}

async function resolveIdempotencyPrecheck(input: {
  storage: VaultLiteStorage;
  clock: Clock;
  scope: string;
  payloadHash: string;
}): Promise<{ replayResponse: Response | null; existingAuditEventId: string | null }> {
  const nowIso = isoNow(input.clock);
  const existing = await input.storage.idempotency.get(input.scope, nowIso);
  if (!existing) {
    return {
      replayResponse: null,
      existingAuditEventId: null,
    };
  }

  if (existing.payloadHash !== input.payloadHash) {
    return {
      replayResponse: jsonResponse(409, {
        ok: false,
        code: 'idempotency_key_payload_mismatch',
      }),
      existingAuditEventId: null,
    };
  }

  return {
    replayResponse: jsonResponse(existing.statusCode, JSON.parse(existing.responseBody)),
    existingAuditEventId: existing.auditEventId,
  };
}

async function persistIdempotencyResult(input: {
  storage: VaultLiteStorage;
  clock: Clock;
  scope: string;
  payloadHash: string;
  statusCode: number;
  responseBody: unknown;
  result: CanonicalResult;
  reasonCode: string | null;
  resourceRefs: string;
  auditEventId: string | null;
}) {
  const createdAt = isoNow(input.clock);
  await input.storage.idempotency.put({
    scope: input.scope,
    payloadHash: input.payloadHash,
    statusCode: input.statusCode,
    responseBody: JSON.stringify(input.responseBody),
    result: input.result,
    reasonCode: input.reasonCode,
    resourceRefs: input.resourceRefs,
    auditEventId: input.auditEventId,
    createdAt,
    expiresAt: addSeconds(createdAt, IDEMPOTENCY_TTL_SECONDS),
  });
}

const ATTACHMENT_PENDING_TTL_MINUTES = 15;

function toAttachmentUploadRecord(record: {
  key: string;
  itemId: string | null;
  lifecycleState: 'pending' | 'uploaded' | 'attached' | 'deleted' | 'orphaned';
  contentType: string;
  size: number;
  expiresAt: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return AttachmentUploadRecordSchema.parse({
    uploadId: record.key,
    itemId: record.itemId ?? '',
    lifecycleState: record.lifecycleState,
    contentType: record.contentType,
    size: record.size,
    expiresAt: record.expiresAt ?? record.createdAt,
    uploadedAt: record.uploadedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function addSecurityHeaders(response: Response): Response {
  const headers = createDefaultSecurityHeaders(
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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
      role: input.user.role,
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
    recentReauthAt: null,
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
  if (!user || !device || device.revokedAt !== null || device.deviceState !== 'active') {
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

function hasValidRecentReauth(input: {
  nowIso: string;
  session: SessionRecord;
}): boolean {
  if (!input.session.recentReauthAt) {
    return false;
  }
  const ageMs = parseIsoTimestamp(input.nowIso) - parseIsoTimestamp(input.session.recentReauthAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= RECENT_REAUTH_TTL_SECONDS * 1000;
}

function inviteStatus(input: {
  nowIso: string;
  consumedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}): 'active' | 'used' | 'expired' | 'revoked' {
  if (input.revokedAt) {
    return 'revoked';
  }
  if (input.consumedAt) {
    return 'used';
  }
  if (input.expiresAt <= input.nowIso) {
    return 'expired';
  }
  return 'active';
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

  async function requireOwnerMutationContext(request: Request): Promise<
    | {
        ok: true;
        sessionContext: SessionContext;
        nowIso: string;
      }
    | {
        ok: false;
        response: Response;
      }
  > {
    const sessionContext = await requireAuthenticatedSession(request);
    if (!sessionContext) {
      return { ok: false, response: jsonResponse(401, { ok: false, code: 'unauthorized' }) };
    }
    if (sessionContext.user.role !== 'owner') {
      return { ok: false, response: jsonResponse(403, { ok: false, code: 'forbidden' }) };
    }
    if (!hasValidCsrf(request)) {
      return { ok: false, response: jsonResponse(403, { ok: false, code: 'csrf_invalid' }) };
    }

    const nowIso = isoNow(options.clock);
    if (!hasValidRecentReauth({ nowIso, session: sessionContext.session })) {
      return {
        ok: false,
        response: jsonResponse(403, { ok: false, code: 'recent_reauth_required' }),
      };
    }

    return {
      ok: true,
      sessionContext,
      nowIso,
    };
  }

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

  app.get('/api/bootstrap/state', async () => {
    const state = await options.storage.deploymentState.get();
    return jsonResponse(
      200,
      BootstrapStateOutputSchema.parse({
        bootstrapState: state.bootstrapState,
      }),
    );
  });

  app.post('/api/bootstrap/verify', async (c) => {
    const input = BootstrapVerifyInputSchema.parse(await c.req.json());
    const nowIso = isoNow(options.clock);
    const state = await options.storage.deploymentState.get();
    if (state.bootstrapState !== 'UNINITIALIZED_PUBLIC_OPEN') {
      return jsonResponse(409, {
        ok: false,
        code: 'bootstrap_already_initialized',
      });
    }

    const ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for') ??
      'unknown';
    const globalRate = await options.storage.authRateLimits.increment(
      'bootstrap-verify:global',
      nowIso,
    );
    const ipRate = await options.storage.authRateLimits.increment(`bootstrap-verify:ip:${ip}`, nowIso);
    if (
      globalRate.attemptCount > BOOTSTRAP_VERIFY_ATTEMPT_LIMIT ||
      ipRate.attemptCount > BOOTSTRAP_VERIFY_ATTEMPT_LIMIT
    ) {
      return jsonResponse(429, {
        ok: false,
        code: 'rate_limited',
      });
    }

    if (!timingSafeSecretEquals(input.bootstrapToken, options.bootstrapAdminToken)) {
      return jsonResponse(401, {
        ok: false,
        code: 'invalid_bootstrap_token',
      });
    }

    const verificationToken = createBootstrapVerificationToken({
      bootstrapSecret: options.bootstrapAdminToken,
      nowIso,
      nonce: options.idGenerator.nextId('verify'),
    });

    return jsonResponse(
      200,
      BootstrapVerifyOutputSchema.parse({
        ok: true,
        verificationToken,
        validUntil: addSeconds(nowIso, VERIFY_TOKEN_TTL_SECONDS),
      }),
    );
  });

  app.post('/api/bootstrap/initialize-owner', async (c) => {
    const idempotencyKey = c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }

    const input = BootstrapInitializeOwnerInputSchema.parse(await c.req.json());
    const nowIso = isoNow(options.clock);
    const actorScope = getActorScope({
      deploymentFingerprint: options.deploymentFingerprint,
      userId: null,
      sessionId: null,
    });
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: '/api/bootstrap/initialize-owner',
      actorScope,
      idempotencyKey,
    });
    const payloadHash = toPayloadHash(input);
    const idempotencyPrecheck = await resolveIdempotencyPrecheck({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
    });
    if (idempotencyPrecheck.replayResponse) {
      return idempotencyPrecheck.replayResponse;
    }

    const initialState = await options.storage.deploymentState.get();
    if (initialState.bootstrapState !== 'UNINITIALIZED_PUBLIC_OPEN') {
      const conflictBody = {
        ok: false,
        code: 'bootstrap_already_initialized',
      };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_initialize_owner',
        actorUserId: null,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'conflict',
        reasonCode: 'bootstrap_already_initialized',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 409,
        responseBody: conflictBody,
        result: 'conflict',
        reasonCode: 'bootstrap_already_initialized',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(409, conflictBody);
    }

    const verificationValid = verifyBootstrapVerificationToken({
      token: input.verificationToken,
      bootstrapSecret: options.bootstrapAdminToken,
      nowIso,
    });
    if (!verificationValid) {
      const deniedBody = {
        ok: false,
        code: 'bootstrap_verification_invalid',
      };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_initialize_owner',
        actorUserId: null,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'denied',
        reasonCode: 'bootstrap_verification_invalid',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 401,
        responseBody: deniedBody,
        result: 'denied',
        reasonCode: 'bootstrap_verification_invalid',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(401, deniedBody);
    }

    const userId = options.idGenerator.nextId('user');
    const transition = await options.storage.deploymentState.transitionToOwnerCreatedCheckpointPending({
      ownerUserId: userId,
      ownerCreatedAt: nowIso,
      bootstrapPublicClosedAt: nowIso,
    });
    if (!transition.changed) {
      const conflictBody = {
        ok: false,
        code: 'bootstrap_already_initialized',
      };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_initialize_owner',
        actorUserId: null,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'conflict',
        reasonCode: 'bootstrap_already_initialized',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 409,
        responseBody: conflictBody,
        result: 'conflict',
        reasonCode: 'bootstrap_already_initialized',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(409, conflictBody);
    }

    const user: UserAccountRecord = {
      userId,
      username: input.username,
      role: 'owner',
      authSalt: input.authSalt,
      authVerifier: input.authVerifier,
      encryptedAccountBundle: input.encryptedAccountBundle,
      accountKeyWrapped: input.accountKeyWrapped,
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const device: DeviceRecord = {
      deviceId: options.idGenerator.nextId('device'),
      userId: user.userId,
      deviceName: input.initialDeviceName,
      platform: input.initialDevicePlatform,
      deviceState: 'active',
      createdAt: nowIso,
      revokedAt: null,
    };
    await options.storage.users.create(user);
    await options.storage.devices.register(device);
    const session = await options.storage.sessions.create({
      ...buildTrustedSessionRecord({
        clock: options.clock,
        idGenerator: options.idGenerator,
        user,
        device,
      }),
      recentReauthAt: nowIso,
    });

    const body = BootstrapInitializeOwnerOutputSchema.parse({
      ok: true,
      result: toCanonicalResult('success_changed'),
      bootstrapState: 'OWNER_CREATED_CHECKPOINT_PENDING',
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        lifecycleState: user.lifecycleState,
      },
      device: {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        platform: device.platform,
      },
    });
    const audit = await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'bootstrap_initialize_owner',
      actorUserId: user.userId,
      targetType: 'deployment',
      targetId: options.deploymentFingerprint,
      result: 'success_changed',
      reasonCode: null,
    });
    await persistIdempotencyResult({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
      statusCode: 201,
      responseBody: body,
      result: 'success_changed',
      reasonCode: null,
      resourceRefs: `deployment:${options.deploymentFingerprint},user:${user.userId}`,
      auditEventId: audit.eventId,
    });

    const response = jsonResponse(201, body);
    addSessionCookies(response, {
      sessionId: session.sessionId,
      csrfToken: session.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.post('/api/bootstrap/checkpoint/download-account-kit', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.user.role !== 'owner') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = BootstrapCheckpointDownloadInputSchema.parse(await c.req.json());
    const state = await options.storage.deploymentState.get();
    if (state.bootstrapState === 'INITIALIZED') {
      return jsonResponse(409, {
        ok: false,
        code: 'checkpoint_already_completed',
      });
    }
    if (state.bootstrapState !== 'OWNER_CREATED_CHECKPOINT_PENDING') {
      return jsonResponse(409, {
        ok: false,
        code: 'checkpoint_not_available',
      });
    }
    if (state.ownerUserId !== sessionContext.user.userId) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }

    const tracked = await options.storage.deploymentState.recordCheckpointDownloadAttempt({
      ownerUserId: sessionContext.user.userId,
      requestId: c.req.header('x-request-id') ?? options.idGenerator.nextId('request'),
      attemptedAt: isoNow(options.clock),
    });

    return jsonResponse(
      200,
      BootstrapCheckpointDownloadOutputSchema.parse({
        ok: true,
        result: toCanonicalResult('success_changed'),
        downloadAttemptCount: tracked.checkpointDownloadAttemptCount,
        accountKit: {
          payload: input.payload,
          signature: input.signature,
        },
      }),
    );
  });

  app.post('/api/bootstrap/checkpoint/complete', async (c) => {
    const idempotencyKey = c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }

    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.user.role !== 'owner') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = BootstrapCheckpointCompleteInputSchema.parse(await c.req.json());
    const actorScope = getActorScope({
      deploymentFingerprint: options.deploymentFingerprint,
      userId: sessionContext.user.userId,
      sessionId: sessionContext.session.sessionId,
    });
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: '/api/bootstrap/checkpoint/complete',
      actorScope,
      idempotencyKey,
    });
    const payloadHash = toPayloadHash(input);
    const idempotencyPrecheck = await resolveIdempotencyPrecheck({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
    });
    if (idempotencyPrecheck.replayResponse) {
      return idempotencyPrecheck.replayResponse;
    }

    const currentState = await options.storage.deploymentState.get();
    if (currentState.bootstrapState === 'INITIALIZED') {
      const noOpBody = BootstrapCheckpointCompleteOutputSchema.parse({
        ok: true,
        result: toCanonicalResult('success_no_op'),
        bootstrapState: 'INITIALIZED',
      });
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_checkpoint_complete',
        actorUserId: sessionContext.user.userId,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'success_no_op',
        reasonCode: 'already_initialized',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 200,
        responseBody: noOpBody,
        result: 'success_no_op',
        reasonCode: 'already_initialized',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(200, noOpBody);
    }
    if (currentState.bootstrapState !== 'OWNER_CREATED_CHECKPOINT_PENDING') {
      const conflictBody = {
        ok: false,
        code: 'checkpoint_not_available',
      };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_checkpoint_complete',
        actorUserId: sessionContext.user.userId,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'conflict',
        reasonCode: 'checkpoint_not_available',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 409,
        responseBody: conflictBody,
        result: 'conflict',
        reasonCode: 'checkpoint_not_available',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(409, conflictBody);
    }
    if (currentState.ownerUserId !== sessionContext.user.userId) {
      const deniedBody = { ok: false, code: 'forbidden' };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_checkpoint_complete',
        actorUserId: sessionContext.user.userId,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'denied',
        reasonCode: 'forbidden_owner_mismatch',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 403,
        responseBody: deniedBody,
        result: 'denied',
        reasonCode: 'forbidden_owner_mismatch',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(403, deniedBody);
    }
    if (currentState.checkpointDownloadAttemptCount < 1) {
      const conflictBody = {
        ok: false,
        code: 'checkpoint_download_required',
      };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'bootstrap_checkpoint_complete',
        actorUserId: sessionContext.user.userId,
        targetType: 'deployment',
        targetId: options.deploymentFingerprint,
        result: 'conflict',
        reasonCode: 'checkpoint_download_required',
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode: 409,
        responseBody: conflictBody,
        result: 'conflict',
        reasonCode: 'checkpoint_download_required',
        resourceRefs: 'deployment',
        auditEventId: audit.eventId,
      });
      return jsonResponse(409, conflictBody);
    }

    const transition = await options.storage.deploymentState.completeInitialization({
      completedAt: isoNow(options.clock),
    });
    const result: CanonicalResult = transition.changed ? 'success_changed' : 'success_no_op';
    const body = BootstrapCheckpointCompleteOutputSchema.parse({
      ok: true,
      result: toCanonicalResult(result),
      bootstrapState: transition.state.bootstrapState,
    });
    const audit = await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'bootstrap_checkpoint_complete',
      actorUserId: sessionContext.user.userId,
      targetType: 'deployment',
      targetId: options.deploymentFingerprint,
      result,
      reasonCode: result === 'success_no_op' ? 'already_initialized' : null,
    });
    await persistIdempotencyResult({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
      statusCode: 200,
      responseBody: body,
      result,
      reasonCode: result === 'success_no_op' ? 'already_initialized' : null,
      resourceRefs: 'deployment',
      auditEventId: audit.eventId,
    });
    return jsonResponse(200, body);
  });

  app.post('/api/auth/recent-reauth', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.user.role !== 'owner') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = RecentReauthInputSchema.parse(await c.req.json());
    if (input.authProof !== sessionContext.user.authVerifier) {
      return jsonResponse(401, GENERIC_INVALID_CREDENTIALS);
    }

    const nowIso = isoNow(options.clock);
    await options.storage.sessions.updateRecentReauth(sessionContext.session.sessionId, nowIso);
    return jsonResponse(
      200,
      RecentReauthOutputSchema.parse({
        ok: true,
        validUntil: addSeconds(nowIso, RECENT_REAUTH_TTL_SECONDS),
      }),
    );
  });

  app.post('/api/admin/invites', async (c) => {
    const ownerContext = await requireOwnerMutationContext(c.req.raw);
    if (!ownerContext.ok) {
      return ownerContext.response;
    }
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const idempotencyKey = c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }

    const input = AdminInviteCreateInputSchema.parse(await c.req.json());
    const payloadHash = toPayloadHash(input);
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: '/api/admin/invites',
      actorScope: getActorScope({
        deploymentFingerprint: options.deploymentFingerprint,
        userId: ownerContext.sessionContext.user.userId,
        sessionId: ownerContext.sessionContext.session.sessionId,
      }),
      idempotencyKey,
    });
    const precheck = await resolveIdempotencyPrecheck({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
    });
    if (precheck.replayResponse) {
      return precheck.replayResponse;
    }

    const nowIso = ownerContext.nowIso;
    const inviteId = options.idGenerator.nextId('invite');
    const inviteToken = options.idGenerator.nextId('invite_token');
    const normalizedExpiresAt = normalizeIsoTimestamp(input.expiresAt);
    const tokenPreview = toTokenPreview(inviteToken);
    const onboardingBaseUrl = resolveOnboardingLinkBaseUrl({
      request: c.req.raw,
      fallbackServerUrl: options.serverUrl,
    });
    await options.storage.invites.create({
      inviteId,
      tokenHash: sha256Base64Url(inviteToken),
      tokenPreview,
      createdByUserId: ownerContext.sessionContext.user.userId,
      expiresAt: normalizedExpiresAt,
      consumedAt: null,
      consumedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: nowIso,
    });

    const firstBody = AdminInviteCreateOutputSchema.parse({
      ok: true,
      result: toCanonicalResult('success_changed'),
      inviteId,
      expiresAt: normalizedExpiresAt,
      tokenPreview,
      inviteLink: `${onboardingBaseUrl}/onboarding?invite=${encodeURIComponent(inviteToken)}`,
      tokenDelivery: 'delivered_once',
    });
    const replayBody = AdminInviteCreateOutputSchema.parse({
      ok: true,
      result: toCanonicalResult('success_no_op'),
      inviteId,
      expiresAt: normalizedExpiresAt,
      tokenPreview,
      tokenDelivery: 'not_available_on_replay',
      reasonCode: 'token_not_redelivered',
    });
    const audit = await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'admin_invite_create',
      actorUserId: ownerContext.sessionContext.user.userId,
      targetType: 'invite',
      targetId: inviteId,
      result: 'success_changed',
      reasonCode: null,
    });
    await persistIdempotencyResult({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
      statusCode: 200,
      responseBody: replayBody,
      result: 'success_no_op',
      reasonCode: 'token_not_redelivered',
      resourceRefs: `invite:${inviteId}`,
      auditEventId: audit.eventId,
    });

    return jsonResponse(201, firstBody);
  });

  app.get('/api/admin/invites', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.user.role !== 'owner') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const nowIso = isoNow(options.clock);
    const invites = await options.storage.invites.list();
    return jsonResponse(
      200,
      AdminInviteListOutputSchema.parse({
        invites: invites.map((invite) =>
          AdminInviteRecordSchema.parse({
            inviteId: invite.inviteId,
            tokenPreview: invite.tokenPreview,
            status: inviteStatus({
              nowIso,
              consumedAt: invite.consumedAt,
              revokedAt: invite.revokedAt,
              expiresAt: invite.expiresAt,
            }),
            createdByUserId: invite.createdByUserId,
            expiresAt: invite.expiresAt,
            consumedAt: invite.consumedAt,
            consumedByUserId: invite.consumedByUserId,
            revokedAt: invite.revokedAt,
            revokedByUserId: invite.revokedByUserId,
            createdAt: invite.createdAt,
          }),
        ),
      }),
    );
  });

  app.post('/api/admin/invites/:inviteId/revoke', async (c) => {
    const ownerContext = await requireOwnerMutationContext(c.req.raw);
    if (!ownerContext.ok) {
      return ownerContext.response;
    }
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const idempotencyKey = c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }
    const payloadHash = toPayloadHash({ inviteId: c.req.param('inviteId') });
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: '/api/admin/invites/:inviteId/revoke',
      actorScope: getActorScope({
        deploymentFingerprint: options.deploymentFingerprint,
        userId: ownerContext.sessionContext.user.userId,
        sessionId: ownerContext.sessionContext.session.sessionId,
      }),
      idempotencyKey,
    });
    const precheck = await resolveIdempotencyPrecheck({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
    });
    if (precheck.replayResponse) {
      return precheck.replayResponse;
    }

    const invite = await options.storage.invites.findById(c.req.param('inviteId'));
    if (!invite) {
      return jsonResponse(404, { ok: false, code: 'invite_not_found' });
    }

    const currentStatus = inviteStatus({
      nowIso: ownerContext.nowIso,
      consumedAt: invite.consumedAt,
      revokedAt: invite.revokedAt,
      expiresAt: invite.expiresAt,
    });
    let result: CanonicalResult = 'success_changed';
    let reasonCode: string | null = null;
    if (currentStatus === 'active') {
      await options.storage.invites.markRevoked({
        inviteId: invite.inviteId,
        revokedAtIso: ownerContext.nowIso,
        revokedByUserId: ownerContext.sessionContext.user.userId,
      });
    } else if (currentStatus === 'revoked') {
      result = 'success_no_op';
      reasonCode = 'already_revoked';
    } else {
      result = 'conflict';
      reasonCode = currentStatus === 'used' ? 'already_consumed' : 'already_expired';
    }

    const body = AdminInviteRevokeOutputSchema.parse({
      ok: true,
      result: toCanonicalResult(result),
      ...(reasonCode ? { reasonCode } : {}),
    });
    const statusCode = toStatusFromResult(result);
    const audit = await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'admin_invite_revoke',
      actorUserId: ownerContext.sessionContext.user.userId,
      targetType: 'invite',
      targetId: invite.inviteId,
      result,
      reasonCode,
    });
    await persistIdempotencyResult({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
      statusCode,
      responseBody: body,
      result,
      reasonCode,
      resourceRefs: `invite:${invite.inviteId}`,
      auditEventId: audit.eventId,
    });
    return jsonResponse(statusCode, body);
  });

  app.get('/api/admin/users', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.user.role !== 'owner') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const users = await options.storage.users.list();
    const usersView = await Promise.all(
      users.map(async (user) => ({
        userId: user.userId,
        username: user.username,
        role: user.role,
        lifecycleState: user.lifecycleState,
        createdAt: user.createdAt,
        trustedDevicesCount: await options.storage.devices.countActiveByUserId(user.userId),
      })),
    );
    return jsonResponse(
      200,
      AdminUserListOutputSchema.parse({
        users: usersView,
      }),
    );
  });

  app.get('/api/admin/audit', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.user.role !== 'owner') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const requestedLimit = Number.parseInt(c.req.query('limit') ?? '', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(500, requestedLimit))
      : 250;
    const events = await options.storage.auditEvents.listRecent(limit);
    return jsonResponse(
      200,
      AdminAuditListOutputSchema.parse({
        events: events.map((event) => ({
          eventId: event.eventId,
          eventType: event.eventType,
          actorUserId: event.actorUserId,
          targetType: event.targetType,
          targetId: event.targetId,
          result: CanonicalResultSchema.parse(event.result),
          reasonCode: event.reasonCode,
          requestId: event.requestId,
          createdAt: event.createdAt,
          ipHash: event.ipHash,
          userAgentHash: event.userAgentHash,
        })),
      }),
    );
  });

  async function handleUserLifecycleMutation(input: {
    request: Request;
    routeTemplate:
      | '/api/admin/users/:id/suspend'
      | '/api/admin/users/:id/reactivate'
      | '/api/admin/users/:id/deprovision';
    targetUserId: string;
    desiredAction: 'suspend' | 'reactivate' | 'deprovision';
    idempotencyKey: string | null;
  }): Promise<Response> {
    const ownerContext = await requireOwnerMutationContext(input.request);
    if (!ownerContext.ok) {
      return ownerContext.response;
    }
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }
    if (!input.idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }

    const payloadHash = toPayloadHash({
      targetUserId: input.targetUserId,
      desiredAction: input.desiredAction,
    });
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: input.routeTemplate,
      actorScope: getActorScope({
        deploymentFingerprint: options.deploymentFingerprint,
        userId: ownerContext.sessionContext.user.userId,
        sessionId: ownerContext.sessionContext.session.sessionId,
      }),
      idempotencyKey: input.idempotencyKey,
    });
    const precheck = await resolveIdempotencyPrecheck({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
    });
    if (precheck.replayResponse) {
      return precheck.replayResponse;
    }

    const targetUser = await options.storage.users.findByUserId(input.targetUserId);
    if (!targetUser) {
      return jsonResponse(404, { ok: false, code: 'user_not_found' });
    }

    const ownerUserId = ownerContext.sessionContext.user.userId;
    let result: CanonicalResult = 'success_changed';
    let reasonCode: string | null = null;

    if (
      targetUser.userId === ownerUserId &&
      (input.desiredAction === 'suspend' || input.desiredAction === 'deprovision')
    ) {
      result = 'conflict';
      reasonCode = 'owner_self_protection';
    } else if (input.desiredAction === 'suspend') {
      if (targetUser.lifecycleState === 'active') {
        await options.storage.users.updateLifecycle(
          targetUser.userId,
          'suspended',
          ownerContext.nowIso,
        );
        await options.storage.sessions.revokeByUserId(targetUser.userId, ownerContext.nowIso);
      } else if (targetUser.lifecycleState === 'suspended') {
        result = 'success_no_op';
        reasonCode = 'already_suspended';
      } else {
        result = 'conflict';
        reasonCode = 'already_deprovisioned';
      }
    } else if (input.desiredAction === 'reactivate') {
      if (targetUser.lifecycleState === 'suspended') {
        await options.storage.users.updateLifecycle(targetUser.userId, 'active', ownerContext.nowIso);
      } else if (targetUser.lifecycleState === 'active') {
        result = 'success_no_op';
        reasonCode = 'already_active';
      } else {
        result = 'conflict';
        reasonCode = 'already_deprovisioned';
      }
    } else if (targetUser.lifecycleState === 'deprovisioned') {
      result = 'success_no_op';
      reasonCode = 'already_deprovisioned';
    } else {
      await options.storage.users.updateLifecycle(
        targetUser.userId,
        'deprovisioned',
        ownerContext.nowIso,
      );
      await options.storage.sessions.revokeByUserId(targetUser.userId, ownerContext.nowIso);
      await options.storage.devices.setDeviceStateByUserId(
        targetUser.userId,
        'deprovisioned',
        ownerContext.nowIso,
      );
    }

    const updatedUser = (await options.storage.users.findByUserId(targetUser.userId)) ?? targetUser;
    const trustedDevicesCount = await options.storage.devices.countActiveByUserId(updatedUser.userId);
    const body = AdminUserLifecycleMutationOutputSchema.parse({
      ok: true,
      result: toCanonicalResult(result),
      ...(reasonCode ? { reasonCode } : {}),
      user: {
        userId: updatedUser.userId,
        username: updatedUser.username,
        role: updatedUser.role,
        lifecycleState: updatedUser.lifecycleState,
        createdAt: updatedUser.createdAt,
        trustedDevicesCount,
      },
    });
    const statusCode = toStatusFromResult(result);
    const eventType =
      input.desiredAction === 'suspend'
        ? 'admin_user_suspend'
        : input.desiredAction === 'reactivate'
          ? 'admin_user_reactivate'
          : 'admin_user_deprovision';
    const audit = await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: input.request,
      eventType,
      actorUserId: ownerUserId,
      targetType: 'user',
      targetId: updatedUser.userId,
      result,
      reasonCode,
    });
    await persistIdempotencyResult({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
      statusCode,
      responseBody: body,
      result,
      reasonCode,
      resourceRefs: `user:${updatedUser.userId}`,
      auditEventId: audit.eventId,
    });
    return jsonResponse(statusCode, body);
  }

  app.post('/api/admin/users/:id/suspend', async (c) =>
    handleUserLifecycleMutation({
      request: c.req.raw,
      routeTemplate: '/api/admin/users/:id/suspend',
      targetUserId: c.req.param('id'),
      desiredAction: 'suspend',
      idempotencyKey: c.req.header('x-idempotency-key') ?? null,
    }),
  );

  app.post('/api/admin/users/:id/reactivate', async (c) =>
    handleUserLifecycleMutation({
      request: c.req.raw,
      routeTemplate: '/api/admin/users/:id/reactivate',
      targetUserId: c.req.param('id'),
      desiredAction: 'reactivate',
      idempotencyKey: c.req.header('x-idempotency-key') ?? null,
    }),
  );

  app.post('/api/admin/users/:id/deprovision', async (c) =>
    handleUserLifecycleMutation({
      request: c.req.raw,
      routeTemplate: '/api/admin/users/:id/deprovision',
      targetUserId: c.req.param('id'),
      desiredAction: 'deprovision',
      idempotencyKey: c.req.header('x-idempotency-key') ?? null,
    }),
  );

  app.post('/api/auth/invites', async (c) => {
    void c;
    return jsonResponse(410, {
      ok: false,
      code: 'deprecated_use_admin_invites',
    });
  });

  app.post('/api/auth/onboarding/complete', async (c) => {
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const input = OnboardingCompleteInputSchema.parse(await c.req.json());
    const nowIso = isoNow(options.clock);
    const userId = options.idGenerator.nextId('user');
    const user = {
      userId,
      username: input.username,
      role: 'user',
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
      deviceState: 'active',
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
        inviteTokenHash: sha256Base64Url(input.inviteToken),
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
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const input = OnboardingAccountKitSignInputSchema.parse(await c.req.json());
    const invite = await options.storage.invites.findUsableByTokenHash(
      sha256Base64Url(input.inviteToken),
      isoNow(options.clock),
    );
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
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState === 'UNINITIALIZED_PUBLIC_OPEN') {
      return jsonResponse(409, { ok: false, code: 'bootstrap_required' });
    }

    const input = RemoteAuthenticationChallengeInputSchema.parse(await c.req.json());
    const user = await options.storage.users.findByUsername(input.username);
    if (
      deploymentState.bootstrapState === 'OWNER_CREATED_CHECKPOINT_PENDING' &&
      (!user || user.role !== 'owner')
    ) {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    return jsonResponse(
      200,
      RemoteAuthenticationChallengeOutputSchema.parse({
        authSalt: user?.authSalt ?? fakeAuthSalt(input.username, options.deploymentFingerprint),
        requiresRemoteAuthentication: true,
      }),
    );
  });

  app.post('/api/auth/remote-authentication/complete', async (c) => {
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState === 'UNINITIALIZED_PUBLIC_OPEN') {
      return jsonResponse(409, { ok: false, code: 'bootstrap_required' });
    }

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
      (deploymentState.bootstrapState === 'OWNER_CREATED_CHECKPOINT_PENDING' && user.role !== 'owner') ||
      !device ||
      device.userId !== user.userId ||
      device.revokedAt !== null ||
      device.deviceState !== 'active' ||
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
    const deploymentState = await options.storage.deploymentState.get();
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

    if (
      deploymentState.bootstrapState === 'OWNER_CREATED_CHECKPOINT_PENDING' &&
      sessionContext.user.role !== 'owner'
    ) {
      await options.storage.sessions.revoke(sessionContext.session.sessionId, isoNow(options.clock));
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
          role: sessionContext.user.role,
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
    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

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
      deviceState: 'active',
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

  app.post('/api/attachments/uploads/init', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = AttachmentUploadInitInputSchema.parse(await c.req.json());
    const item = await options.storage.vaultItems.findByItemId(input.itemId, sessionContext.user.userId);
    if (!item) {
      return jsonResponse(404, { ok: false, code: 'item_not_found' });
    }

    const nowIso = isoNow(options.clock);
    const existing = await options.storage.attachmentBlobs.findByOwnerItemAndIdempotency(
      sessionContext.user.userId,
      input.itemId,
      input.idempotencyKey,
    );

    if (existing && existing.expiresAt && existing.expiresAt > nowIso) {
      return jsonResponse(
        200,
        AttachmentUploadInitOutputSchema.parse({
          ...toAttachmentUploadRecord(existing),
          uploadToken: existing.uploadToken ?? '',
        }),
      );
    }

    const pending = await options.storage.attachmentBlobs.put({
      key: options.idGenerator.nextId('attachment'),
      ownerUserId: sessionContext.user.userId,
      itemId: input.itemId,
      lifecycleState: 'pending',
      envelope: '',
      contentType: input.contentType,
      size: input.size,
      idempotencyKey: input.idempotencyKey,
      uploadToken: options.idGenerator.nextId('upload_token'),
      expiresAt: addMinutes(options.clock.now(), ATTACHMENT_PENDING_TTL_MINUTES),
      uploadedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return jsonResponse(
      201,
      AttachmentUploadInitOutputSchema.parse({
        ...toAttachmentUploadRecord(pending),
        uploadToken: pending.uploadToken ?? '',
      }),
    );
  });

  app.put('/api/attachments/uploads/:uploadId/content', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = AttachmentUploadContentInputSchema.parse(await c.req.json());
    const uploadId = c.req.param('uploadId');
    const record = await options.storage.attachmentBlobs.get(uploadId);
    if (!record || record.ownerUserId !== sessionContext.user.userId) {
      return jsonResponse(404, { ok: false, code: 'attachment_not_found' });
    }

    const nowIso = isoNow(options.clock);
    if (!record.expiresAt || record.expiresAt <= nowIso) {
      return jsonResponse(410, { ok: false, code: 'attachment_upload_expired' });
    }
    if (record.lifecycleState !== 'pending') {
      return jsonResponse(409, { ok: false, code: 'attachment_upload_incomplete' });
    }
    if (!record.uploadToken || record.uploadToken !== input.uploadToken) {
      return jsonResponse(403, { ok: false, code: 'attachment_upload_token_invalid' });
    }

    let parsedEnvelope: unknown;
    try {
      parsedEnvelope = JSON.parse(base64UrlToUtf8(input.encryptedEnvelope));
    } catch {
      return jsonResponse(400, { ok: false, code: 'attachment_envelope_invalid' });
    }

    const envelope = AttachmentEnvelopeSchema.safeParse(parsedEnvelope);
    if (!envelope.success) {
      return jsonResponse(400, { ok: false, code: 'attachment_envelope_invalid' });
    }
    if (
      envelope.data.contentType !== record.contentType ||
      envelope.data.originalSize !== record.size
    ) {
      return jsonResponse(400, { ok: false, code: 'attachment_envelope_mismatch' });
    }

    const uploaded = await options.storage.attachmentBlobs.markUploaded({
      key: uploadId,
      ownerUserId: sessionContext.user.userId,
      envelope: input.encryptedEnvelope,
      updatedAt: nowIso,
      uploadedAt: nowIso,
    });

    return jsonResponse(200, toAttachmentUploadRecord(uploaded));
  });

  app.post('/api/attachments/uploads/finalize', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const input = AttachmentUploadFinalizeInputSchema.parse(await c.req.json());
    const record = await options.storage.attachmentBlobs.get(input.uploadId);
    if (!record || record.ownerUserId !== sessionContext.user.userId || record.itemId !== input.itemId) {
      return jsonResponse(404, { ok: false, code: 'attachment_not_found' });
    }

    const nowIso = isoNow(options.clock);
    if (!record.expiresAt || record.expiresAt <= nowIso) {
      return jsonResponse(410, { ok: false, code: 'attachment_upload_expired' });
    }
    if (record.lifecycleState !== 'uploaded') {
      return jsonResponse(409, { ok: false, code: 'attachment_upload_incomplete' });
    }

    return jsonResponse(501, { ok: false, code: 'attachment_finalize_not_implemented' });
  });

  app.get('/api/attachments', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const itemId = c.req.query('itemId');
    if (!itemId) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }

    const uploads = await options.storage.attachmentBlobs.listByOwnerAndItem(
      sessionContext.user.userId,
      itemId,
    );
    return jsonResponse(
      200,
      AttachmentUploadListOutputSchema.parse({
        uploads: uploads.map((upload) => toAttachmentUploadRecord(upload)),
      }),
    );
  });
  app.notFound(() => jsonResponse(404, { ok: false, code: 'not_found' }));

  return app;
}
