import {
  AttachmentEnvelopeSchema,
  AttachmentUploadContentInputSchema,
  AttachmentUploadEnvelopeOutputSchema,
  AttachmentUploadFinalizeOutputSchema,
  AttachmentUploadFinalizeInputSchema,
  AttachmentUploadInitInputSchema,
  AttachmentUploadInitOutputSchema,
  AttachmentUploadListOutputSchema,
  AttachmentStateOutputSchema,
  AttachmentUploadRecordSchema,
  ExtensionLinkActionOutputSchema,
  ExtensionLinkApproveInputSchema,
  ExtensionLinkConsumeInputSchema,
  ExtensionLinkConsumeOutputSchema,
  ExtensionLinkPendingListOutputSchema,
  ExtensionLinkRejectInputSchema,
  ExtensionLinkRequestInputSchema,
  ExtensionLinkRequestOutputSchema,
  ExtensionLinkStatusInputSchema,
  ExtensionLinkStatusOutputSchema,
  ExtensionSessionRecoverInputSchema,
  ExtensionSessionRecoverOutputSchema,
  SiteIconDiscoverBatchInputSchema,
  SiteIconDiscoverBatchOutputSchema,
  IconsDomainBatchPutInputSchema,
  IconsDomainBatchPutOutputSchema,
  IconsDomainItemPutInputSchema,
  IconsDomainItemPutOutputSchema,
  IconsDomainReindexChunkInputSchema,
  IconsDomainReindexCommitInputSchema,
  IconsDomainReindexOutputSchema,
  IconsDomainReindexStartInputSchema,
  IconsObjectTicketIssueInputSchema,
  IconsObjectTicketIssueOutputSchema,
  IconsStateOutputSchema,
  SiteIconManualActionOutputSchema,
  SiteIconManualListOutputSchema,
  SiteIconManualRemoveInputSchema,
  SiteIconManualUpsertInputSchema,
  PasswordGeneratorHistoryActionOutputSchema,
  PasswordGeneratorHistoryListOutputSchema,
  PasswordGeneratorHistoryUpsertInputSchema,
  SiteIconResolveBatchInputSchema,
  SiteIconResolveBatchOutputSchema,
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
  MAX_ATTACHMENT_UPLOAD_ENVELOPE_BODY_BYTES,
  MAX_ATTACHMENT_UPLOAD_SIZE_BYTES,
  MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES,
  LocalUnlockEnvelopeSchema,
  OnboardingAccountKitSignInputSchema,
  OnboardingCompleteInputSchema,
  PasswordRotationCompleteOutputSchema,
  PasswordRotationInputSchema,
  RecentReauthInputSchema,
  RecentReauthOutputSchema,
  SessionPolicyOutputSchema,
  SessionPolicyUpdateInputSchema,
  SessionLockInputSchema,
  SessionLockOutputSchema,
  RemoteAuthenticationChallengeInputSchema,
  RemoteAuthenticationChallengeOutputSchema,
  RealtimeConnectTokenOutputSchema,
  RuntimeMetadataSchema,
  RemoteAuthenticationInputSchema,
  SessionRestoreResponseSchema,
  SyncSnapshotOutputSchema,
  TrustedSessionResponseSchema,
  UnlockGrantActionOutputSchema,
  UnlockGrantApproveInputSchema,
  UnlockGrantConsumeInputSchema,
  UnlockGrantConsumeOutputSchema,
  UnlockGrantPendingListOutputSchema,
  UnlockGrantRejectInputSchema,
  UnlockGrantRequestInputSchema,
  UnlockGrantRequestOutputSchema,
  UnlockGrantStatusInputSchema,
  UnlockGrantStatusOutputSchema,
  WebBootstrapGrantConsumeInputSchema,
  WebBootstrapGrantConsumeOutputSchema,
  WebBootstrapGrantRequestInputSchema,
  WebBootstrapGrantRequestOutputSchema,
  DeviceListOutputSchema,
  DeviceRevokeOutputSchema,
  VaultItemCreateInputSchema,
  VaultItemListOutputSchema,
  VaultItemRecordSchema,
  VaultItemRestoreOutputSchema,
  VaultItemUpdateInputSchema,
  type AttachmentStateEntry,
  type RealtimeTopic,
  type TrustedSessionResponse,
} from '@vaultlite/contracts';
import {
  canonicalizeAccountKitPayload,
  signAccountKitPayload,
  verifyAccountKitSignature,
} from '@vaultlite/crypto/account-kit';
import { fromBase64Url, toBase64Url } from '@vaultlite/crypto/base64';
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
import { createHash, createHmac, randomBytes, timingSafeEqual, type KeyObject } from 'node:crypto';
import { ZodError } from 'zod';
import { discoverSiteIcon, normalizeDomainCandidate, registrableDomain } from './site-icons';
import {
  REALTIME_CLOSE_CODES,
  createRealtimeConnectToken,
  verifyRealtimeConnectToken,
} from './realtime';

const GENERIC_INVALID_CREDENTIALS = GenericAuthFailureSchema.parse({
  ok: false,
  code: 'invalid_credentials',
  message: 'Invalid credentials',
});

interface VaultLiteApiOptions {
  storage: VaultLiteStorage;
  clock: Clock;
  idGenerator: IdGenerator;
  runtimeMode: 'development' | 'test' | 'production';
  deploymentFingerprint: string;
  serverUrl: string;
  bootstrapAdminToken: string;
  secureCookies: boolean;
  accountKitPrivateKey: KeyObject | string;
  accountKitPublicKey: KeyObject | string;
  iconBlobBucket?: {
    put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string,
      options?: {
        httpMetadata?: {
          contentType?: string;
        };
      },
    ): Promise<unknown>;
    get(key: string): Promise<
      | null
      | {
          arrayBuffer(): Promise<ArrayBuffer>;
          httpMetadata?: {
            contentType?: string;
          };
        }
    >;
    delete(key: string): Promise<void>;
  };
  iconsAssetBaseUrl?: string;
  iconsTicketSecret?: string;
  csrfValidator?: MutableRequestCsrfValidator;
  iconsDiscoveryQueue?: {
    send(message: unknown): Promise<void>;
  } | null;
  iconsDiscoveryInternalToken?: string;
  realtime?: {
    enabled: boolean;
    wsBaseUrl: string;
    webAllowedOrigins?: string[];
    connectTokenSecret: string;
    connectTokenTtlSeconds: number;
    authLeaseSeconds: number;
    heartbeatIntervalMs: number;
    flags: {
      realtime_ws_v1: boolean;
      realtime_delta_vault_v1: boolean;
      realtime_delta_icons_v1: boolean;
      realtime_delta_history_v1: boolean;
      realtime_delta_attachments_v1: boolean;
      realtime_apply_web_v1: boolean;
      realtime_apply_extension_v1: boolean;
      icons_state_sync_v1: boolean;
      icons_ws_apply_web_v1: boolean;
      icons_ws_apply_extension_v1: boolean;
      icons_discovery_v2_v1: boolean;
      icons_fast_first_v1: boolean;
      icons_best_later_v1: boolean;
      icons_http_fallback_v1: boolean;
      icons_manual_private_ticket_v1: boolean;
      icons_provider_favicon_vemetric_enabled: boolean;
      icons_provider_google_s2_enabled: boolean;
      icons_provider_icon_horse_enabled: boolean;
      icons_provider_duckduckgo_ip3_enabled: boolean;
      icons_provider_faviconextractor_enabled: boolean;
    };
    hubNamespace: {
      idFromName(name: string): unknown;
      get(id: unknown): {
        fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
      };
    } | null;
  };
}

type IconDiscoveryQueueMessage = {
  domain: string;
  userId: string;
  sourceDeviceId: string | null;
  trigger: 'domains_item' | 'domains_batch' | 'internal_requeue';
  requestedAt: string;
};

type CanonicalResult = 'success_changed' | 'success_no_op' | 'conflict' | 'denied';

type SessionContext = {
  session: SessionRecord;
  user: UserAccountRecord;
  device: DeviceRecord;
  authMode: 'cookie' | 'extension_bearer';
  extensionToken: string | null;
};

const VERIFY_TOKEN_TTL_SECONDS = 10 * 60;
const RECENT_REAUTH_TTL_SECONDS = 5 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const EXTENSION_LINK_REQUEST_TTL_SECONDS = 10 * 60;
const EXTENSION_LINK_DEFAULT_INTERVAL_SECONDS = 5;
const EXTENSION_LINK_MAX_INTERVAL_SECONDS = 30;
const EXTENSION_LINK_STATUS_SLOWDOWN_SECONDS = 5;
const EXTENSION_LINK_REQUEST_IP_ATTEMPT_LIMIT = 15;
const EXTENSION_LINK_REQUEST_IP_WINDOW_SECONDS = 10 * 60;
const EXTENSION_LINK_STATUS_ATTEMPT_LIMIT = 1;
const EXTENSION_LINK_STATUS_WINDOW_SECONDS = EXTENSION_LINK_DEFAULT_INTERVAL_SECONDS;
const EXTENSION_SESSION_TTL_SECONDS = 30 * 60;
const EXTENSION_SESSION_ROTATE_THRESHOLD_SECONDS = 10 * 60;
const SESSION_POLICY_DEFAULT_UNLOCK_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_POLICY_MIN_UNLOCK_IDLE_TIMEOUT_MS = 30 * 1000;
const SESSION_POLICY_MAX_UNLOCK_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const UNLOCK_GRANT_TTL_SECONDS = 2 * 60;
const UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS = 2;
const UNLOCK_GRANT_MAX_INTERVAL_SECONDS = 30;
const UNLOCK_GRANT_STATUS_SLOWDOWN_SECONDS = 5;
const UNLOCK_GRANT_STATUS_ATTEMPT_LIMIT = 1;
const UNLOCK_GRANT_STATUS_WINDOW_SECONDS = UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS;
const WEB_BOOTSTRAP_GRANT_TTL_SECONDS = 60;
const WEB_BOOTSTRAP_GRANT_DEFAULT_INTERVAL_SECONDS = 2;
const WEB_BOOTSTRAP_GRANT_REQUEST_IP_ATTEMPT_LIMIT = 20;
const WEB_BOOTSTRAP_GRANT_REQUEST_PAIR_ATTEMPT_LIMIT = 12;
const WEB_BOOTSTRAP_GRANT_REQUEST_WINDOW_SECONDS = 5 * 60;
const WEB_BOOTSTRAP_GRANT_CONSUME_IP_ATTEMPT_LIMIT = 30;
const WEB_BOOTSTRAP_GRANT_CONSUME_PAIR_ATTEMPT_LIMIT = 20;
const WEB_BOOTSTRAP_GRANT_CONSUME_WINDOW_SECONDS = 5 * 60;
const EXTENSION_SESSION_RECOVER_ATTEMPT_LIMIT = 10;
const EXTENSION_SESSION_RECOVER_WINDOW_SECONDS = 5 * 60;
const BOOTSTRAP_VERIFY_ATTEMPT_LIMIT = 20;
const BOOTSTRAP_VERIFY_WINDOW_SECONDS = 5 * 60;
const AUTH_RATE_LIMIT_ATTEMPT_LIMIT = 5;
const AUTH_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const SYNC_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const SYNC_RATE_LIMIT_SESSION_ATTEMPT_LIMIT = 120;
const SYNC_RATE_LIMIT_USER_ATTEMPT_LIMIT = 300;
const SYNC_RATE_LIMIT_IP_ATTEMPT_LIMIT = 1000;
const SYNC_SNAPSHOT_TOKEN_TTL_SECONDS = 5 * 60;
const SYNC_SNAPSHOT_PAGE_SIZE_DEFAULT = 25;
const SYNC_SNAPSHOT_PAGE_SIZE_MAX = 100;
const SYNC_SNAPSHOT_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES = 200;
const VAULT_TOMBSTONE_RESTORE_RETENTION_DAYS = 30;
const VAULT_ITEM_BODY_LIMIT_BYTES = MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES + 16 * 1024;
const ATTACHMENT_INIT_BODY_LIMIT_BYTES = 16 * 1024;
const ATTACHMENT_ENVELOPE_BODY_LIMIT_BYTES = MAX_ATTACHMENT_UPLOAD_ENVELOPE_BODY_BYTES;
const REALTIME_CONNECT_TOKEN_RATE_LIMIT_ATTEMPTS = 30;
const REALTIME_CONNECT_TOKEN_RATE_LIMIT_WINDOW_SECONDS = 60;
const REALTIME_WS_UPGRADE_INITIAL_GLOBAL_RATE_LIMIT_ATTEMPTS = 600;
const REALTIME_WS_UPGRADE_INITIAL_IP_RATE_LIMIT_ATTEMPTS = 180;
const REALTIME_WS_UPGRADE_INITIAL_RATE_LIMIT_WINDOW_SECONDS = 60;
const REALTIME_WS_UPGRADE_RATE_LIMIT_ATTEMPTS = 60;
const REALTIME_WS_UPGRADE_RATE_LIMIT_WINDOW_SECONDS = 60;
const REALTIME_JTI_CONSUME_WINDOW_SECONDS = 120;
const REALTIME_OUTBOX_DISPATCH_BATCH_SIZE = 100;
const REALTIME_OUTBOX_PUBLISHED_RETENTION_HOURS = 24;
const REALTIME_OUTBOX_PRUNE_LIMIT = 500;
const ICONS_OBJECT_TICKET_TTL_SECONDS_DEFAULT = 60;
const ICONS_OBJECT_TICKET_TTL_SECONDS_MAX = 300;
const ICONS_STATE_INCLUDE_DOMAINS_MAX = 500;
const ICONS_DISCOVERY_RETRY_COOLDOWN_MS = 60_000;
const ICONS_DISCOVERY_SUCCESS_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const ICONS_DISCOVERY_NEGATIVE_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const ICONS_DISCOVERY_NEGATIVE_BASE_TTL_MS = 60 * 60 * 1_000;
const ICONS_DOMAINS_WRITE_RATE_LIMIT_WINDOW_SECONDS = 60;
const ICONS_DOMAINS_WRITE_RATE_LIMIT_PER_DEVICE = 240;
const ICONS_DOMAINS_WRITE_RATE_LIMIT_PER_USER = 800;

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

function addMillisecondsIso(baseIso: string, deltaMs: number): string {
  const base = Date.parse(baseIso);
  if (!Number.isFinite(base)) {
    return new Date(Date.now() + Math.max(0, Math.trunc(deltaMs))).toISOString();
  }
  return new Date(base + Math.max(0, Math.trunc(deltaMs))).toISOString();
}

function isWithinRestoreRetentionWindow(input: {
  deletedAtIso: string;
  referenceIso: string;
  retentionDays: number;
}): boolean {
  const deletedAtMillis = Date.parse(input.deletedAtIso);
  const referenceMillis = Date.parse(input.referenceIso);
  if (!Number.isFinite(deletedAtMillis) || !Number.isFinite(referenceMillis)) {
    return false;
  }
  const retentionMillis = input.retentionDays * 24 * 60 * 60 * 1000;
  return deletedAtMillis + retentionMillis >= referenceMillis;
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

function resolveRequestIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    'unknown'
  );
}

function toSubjectHash(value: string): string {
  return sha256Base64Url(value.trim().toLowerCase());
}

function canonicalizeServerOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeAllowedWebOrigins(origins: string[]): string[] {
  const normalized = new Set<string>();
  for (const origin of origins) {
    const canonicalOrigin = canonicalizeServerOrigin(origin);
    if (!canonicalOrigin) {
      continue;
    }
    normalized.add(canonicalOrigin);
  }
  return Array.from(normalized);
}

type ResolvedSiteIcon = {
  domain: string;
  dataUrl: string;
  source: 'manual' | 'automatic';
  sourceUrl: string | null;
  resolvedBy?: string;
  finalUrl?: string | null;
  candidateCount?: number;
  reasonCode?: string;
  updatedAt: string;
};

type AutomaticSiteIconRecord = {
  domain: string;
  dataUrl: string;
  sourceUrl: string | null;
  fetchedAt: string;
  updatedAt: string;
  resolvedBy?: string;
  finalUrl?: string | null;
  candidateCount?: number;
  reasonCode?: string;
};

function normalizeSiteIconDomains(rawDomains: string[]): string[] {
  const deduped = new Set<string>();
  for (const rawDomain of rawDomains) {
    const normalized = normalizeDomainCandidate(rawDomain);
    if (!normalized) {
      continue;
    }
    deduped.add(normalized);
  }
  return Array.from(deduped);
}

function mergeResolvedSiteIcons(input: {
  domains: string[];
  manual: Array<{ domain: string; dataUrl: string; source: 'url' | 'file'; updatedAt: string }>;
  automatic: AutomaticSiteIconRecord[];
}): ResolvedSiteIcon[] {
  const manualByDomain = new Map<string, ResolvedSiteIcon>(
    input.manual.map((entry) => [
      entry.domain,
      {
        domain: entry.domain,
        dataUrl: entry.dataUrl,
        source: 'manual',
        sourceUrl: null,
        updatedAt: entry.updatedAt,
      },
    ]),
  );
  const automaticByDomain = new Map<string, ResolvedSiteIcon>(
    input.automatic.map((entry) => [
      entry.domain,
      {
        domain: entry.domain,
        dataUrl: entry.dataUrl,
        source: 'automatic',
        sourceUrl: entry.sourceUrl,
        resolvedBy: entry.resolvedBy ?? 'cache',
        finalUrl: entry.finalUrl ?? entry.sourceUrl,
        candidateCount: entry.candidateCount,
        reasonCode: entry.reasonCode ?? 'cache_hit',
        updatedAt: entry.updatedAt,
      },
    ]),
  );

  return input.domains
    .map((domain) => manualByDomain.get(domain) ?? automaticByDomain.get(domain) ?? null)
    .filter((entry): entry is ResolvedSiteIcon => Boolean(entry));
}

function isSafeIconDataUrl(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < 32 || value.length > 1_500_000) {
    return false;
  }
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/iu.test(value);
}

function parseIconDataUrl(value: string): {
  contentType: string;
  bytes: Uint8Array;
} | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/iu.exec(value.trim());
  if (!match) {
    return null;
  }
  const contentType = match[1]?.toLowerCase() ?? '';
  const base64Payload = match[2] ?? '';
  if (!contentType.startsWith('image/')) {
    return null;
  }
  try {
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index) & 0xff;
    }
    return { contentType, bytes };
  } catch {
    return null;
  }
}

function sha256Hex(input: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(input)).digest('hex');
}

function normalizeHostEntries(hosts: string[]): string[] {
  const normalized = new Set<string>();
  for (const rawHost of hosts) {
    const next = normalizeDomainCandidate(rawHost);
    if (!next) {
      continue;
    }
    normalized.add(next);
    const apex = registrableDomain(next);
    if (apex && apex !== next) {
      normalized.add(apex);
    }
  }
  return Array.from(normalized).sort();
}

function stableIconsStateEtag(input: {
  userId: string;
  iconsVersion: number;
  records: Array<{
    domain: string;
    status: string;
    objectId: string | null;
    objectClass: string | null;
    objectSha256: string | null;
    contentType: string | null;
    updatedAt: string;
  }>;
}): string {
  const payload = JSON.stringify({
    userId: input.userId,
    iconsVersion: input.iconsVersion,
    records: [...input.records].sort((left, right) => left.domain.localeCompare(right.domain)),
  });
  return `"${createHash('sha256').update(payload).digest('hex')}"`;
}

function stableManualIconsEtag(input: {
  userId: string;
  icons: Array<{ domain: string; dataUrl: string; source: string; updatedAt: string }>;
}): string {
  const payload = JSON.stringify({
    userId: input.userId,
    icons: [...input.icons].sort((left, right) => left.domain.localeCompare(right.domain)),
  });
  return `"${createHash('sha256').update(payload).digest('hex')}"`;
}

function shouldQueueIconDiscovery(input: {
  status: 'pending' | 'ready' | 'absent' | 'removed';
  updatedAt: string;
  domainsChanged: boolean;
  nowIso: string;
}): boolean {
  if (input.status === 'ready') {
    return false;
  }
  if (input.domainsChanged) {
    return true;
  }
  const nowMillis = Date.parse(input.nowIso);
  const updatedMillis = Date.parse(input.updatedAt);
  if (!Number.isFinite(nowMillis) || !Number.isFinite(updatedMillis)) {
    return true;
  }
  return nowMillis - updatedMillis >= ICONS_DISCOVERY_RETRY_COOLDOWN_MS;
}

function resolveExecutionWaitUntil(
  context: unknown,
): ((promise: Promise<unknown>) => void) | null {
  try {
    const executionCtx = (context as { executionCtx?: { waitUntil?: (promise: Promise<unknown>) => void } })
      .executionCtx;
    if (executionCtx && typeof executionCtx.waitUntil === 'function') {
      return executionCtx.waitUntil.bind(executionCtx);
    }
  } catch {
    // Hono throws when executionCtx is not available in this runtime/test.
  }
  return null;
}

function createIconObjectTicket(input: {
  userId: string;
  objectId: string;
  expUnixSeconds: number;
  secret: string;
}): string {
  const headerPayload = JSON.stringify({
    sub: input.userId,
    oid: input.objectId,
    exp: input.expUnixSeconds,
  });
  const payloadB64 = toBase64Url(new TextEncoder().encode(headerPayload));
  const signatureB64 = toBase64Url(
    createHmac('sha256', input.secret).update(payloadB64).digest(),
  );
  return `${payloadB64}.${signatureB64}`;
}

function verifyIconObjectTicket(input: {
  ticket: string;
  nowUnixSeconds: number;
  secret: string;
}): { ok: true; userId: string; objectId: string } | { ok: false; reason: string } {
  const [payloadB64, signatureB64] = input.ticket.split('.');
  if (!payloadB64 || !signatureB64) {
    return { ok: false, reason: 'ticket_malformed' };
  }
  const expectedSignature = toBase64Url(
    createHmac('sha256', input.secret).update(payloadB64).digest(),
  );
  try {
    if (!timingSafeEqual(fromBase64Url(signatureB64), fromBase64Url(expectedSignature))) {
      return { ok: false, reason: 'ticket_signature_invalid' };
    }
  } catch {
    return { ok: false, reason: 'ticket_signature_invalid' };
  }
  try {
    const payload = JSON.parse(base64UrlToUtf8(payloadB64)) as {
      sub?: string;
      oid?: string;
      exp?: number;
    };
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.oid !== 'string' ||
      payload.oid.length === 0 ||
      typeof payload.exp !== 'number' ||
      input.nowUnixSeconds >= payload.exp
    ) {
      return { ok: false, reason: 'ticket_invalid' };
    }
    return { ok: true, userId: payload.sub, objectId: payload.oid };
  } catch {
    return { ok: false, reason: 'ticket_invalid' };
  }
}

async function discoverAndPersistSiteIcons(input: {
  domains: string[];
  nowIso: string;
  storage: VaultLiteStorage;
}): Promise<{
  discovered: Array<{
    domain: string;
    dataUrl: string;
    sourceUrl: string | null;
    updatedAt: string;
    resolvedBy?: string;
    finalUrl?: string | null;
    candidateCount?: number;
    reasonCode?: string;
  }>;
  unresolved: string[];
}> {
  const discovered: Array<{
    domain: string;
    dataUrl: string;
    sourceUrl: string | null;
    updatedAt: string;
    resolvedBy?: string;
    finalUrl?: string | null;
    candidateCount?: number;
    reasonCode?: string;
  }> = [];
  const unresolved: string[] = [];

  for (const domain of input.domains) {
    const next = await discoverSiteIcon({
      domain,
      nowIso: input.nowIso,
    });
    if (!next) {
      unresolved.push(domain);
      continue;
    }
    await input.storage.siteIconCache.upsert({
      domain: next.domain,
      dataUrl: next.dataUrl,
      sourceUrl: next.sourceUrl,
      fetchedAt: next.fetchedAt,
      updatedAt: next.updatedAt,
    });
    discovered.push({
      domain: next.domain,
      dataUrl: next.dataUrl,
      sourceUrl: next.sourceUrl,
      resolvedBy: next.resolvedBy,
      finalUrl: next.finalUrl ?? null,
      candidateCount: next.candidateCount,
      reasonCode: next.reasonCode,
      updatedAt: next.updatedAt,
    });
  }

  return { discovered, unresolved };
}

function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = randomBytes(8);
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[bytes[index] % alphabet.length] ?? 'A';
  }
  return code;
}

function issueExtensionLinkRequestId(): string {
  return toBase64Url(randomBytes(24));
}

function issueUnlockGrantRequestId(): string {
  return toBase64Url(randomBytes(24));
}

function issueWebBootstrapGrantId(): string {
  return toBase64Url(randomBytes(24));
}

function issueExtensionSessionRecoverKey(): string {
  return toBase64Url(randomBytes(32));
}

function normalizeUnlockIdleTimeoutMs(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return SESSION_POLICY_DEFAULT_UNLOCK_IDLE_TIMEOUT_MS;
  }
  const rounded = Math.trunc(value as number);
  if (rounded < SESSION_POLICY_MIN_UNLOCK_IDLE_TIMEOUT_MS) {
    return SESSION_POLICY_MIN_UNLOCK_IDLE_TIMEOUT_MS;
  }
  if (rounded > SESSION_POLICY_MAX_UNLOCK_IDLE_TIMEOUT_MS) {
    return SESSION_POLICY_MAX_UNLOCK_IDLE_TIMEOUT_MS;
  }
  return rounded;
}

function generateExtensionLinkShortCode(): string {
  return generatePairingCode();
}

function generateFingerprintPhrase(): string {
  const words = [
    'amber',
    'anchor',
    'breeze',
    'cedar',
    'comet',
    'delta',
    'ember',
    'frost',
    'harbor',
    'ivory',
    'juniper',
    'lumen',
    'matrix',
    'nova',
    'onyx',
    'orbit',
    'quartz',
    'raven',
    'signal',
    'tundra',
    'ultra',
    'vector',
    'willow',
    'zenith',
  ];
  const picks = [randomBytes(1)[0], randomBytes(1)[0], randomBytes(1)[0]]
    .map((byte) => words[byte % words.length] ?? 'signal');
  return `${picks[0]}-${picks[1]}-${picks[2]}`;
}

function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader.trim());
  if (!match) {
    return null;
  }
  const token = match[1]?.trim() ?? '';
  return token.length > 0 ? token : null;
}

function issueExtensionSessionToken(): string {
  return toBase64Url(randomBytes(32));
}

function extensionLinkSignaturePayload(input: {
  action: 'status' | 'consume';
  requestId: string;
  nonce: string;
  clientNonce: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): Uint8Array {
  const payload = [
    'vaultlite-extension-link-v1',
    input.action,
    input.requestId,
    input.nonce,
    input.clientNonce,
    input.serverOrigin,
    input.deploymentFingerprint,
  ].join('|');
  return new TextEncoder().encode(payload);
}

function unlockGrantSignaturePayload(input: {
  action: 'status' | 'consume';
  requestId: string;
  nonce: string;
  clientNonce: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): Uint8Array {
  const payload = [
    'vaultlite-unlock-grant-v1',
    input.action,
    input.requestId,
    input.nonce,
    input.clientNonce,
    input.serverOrigin,
    input.deploymentFingerprint,
  ].join('|');
  return new TextEncoder().encode(payload);
}

function webBootstrapGrantSignaturePayload(input: {
  action: 'consume';
  grantId: string;
  nonce: string;
  clientNonce: string;
  webChallenge: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): Uint8Array {
  const payload = [
    'vaultlite-web-bootstrap-grant-v1',
    input.action,
    input.grantId,
    input.nonce,
    input.clientNonce,
    input.webChallenge,
    input.serverOrigin,
    input.deploymentFingerprint,
  ].join('|');
  return new TextEncoder().encode(payload);
}

function toFixedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  return normalized.buffer;
}

async function verifyExtensionLinkProof(input: {
  requestPublicKey: string;
  signature: string;
  action: 'status' | 'consume';
  requestId: string;
  nonce: string;
  clientNonce: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): Promise<boolean> {
  try {
    const keyData = Uint8Array.from(fromBase64Url(input.requestPublicKey));
    const signature = Uint8Array.from(fromBase64Url(input.signature));
    const publicKey = await crypto.subtle.importKey(
      'spki',
      toFixedArrayBuffer(keyData),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify'],
    );
    const payload = extensionLinkSignaturePayload({
      action: input.action,
      requestId: input.requestId,
      nonce: input.nonce,
      clientNonce: input.clientNonce,
      serverOrigin: input.serverOrigin,
      deploymentFingerprint: input.deploymentFingerprint,
    });
    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      toFixedArrayBuffer(signature),
      toFixedArrayBuffer(payload),
    );
  } catch {
    return false;
  }
}

async function verifyUnlockGrantProof(input: {
  requesterPublicKey: string;
  signature: string;
  action: 'status' | 'consume';
  requestId: string;
  nonce: string;
  clientNonce: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): Promise<boolean> {
  try {
    const keyData = Uint8Array.from(fromBase64Url(input.requesterPublicKey));
    const signature = Uint8Array.from(fromBase64Url(input.signature));
    const publicKey = await crypto.subtle.importKey(
      'spki',
      toFixedArrayBuffer(keyData),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify'],
    );
    const payload = unlockGrantSignaturePayload({
      action: input.action,
      requestId: input.requestId,
      nonce: input.nonce,
      clientNonce: input.clientNonce,
      serverOrigin: input.serverOrigin,
      deploymentFingerprint: input.deploymentFingerprint,
    });
    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      toFixedArrayBuffer(signature),
      toFixedArrayBuffer(payload),
    );
  } catch {
    return false;
  }
}

async function verifyWebBootstrapGrantProof(input: {
  requesterPublicKey: string;
  signature: string;
  action: 'consume';
  grantId: string;
  nonce: string;
  clientNonce: string;
  webChallenge: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): Promise<boolean> {
  try {
    const keyData = Uint8Array.from(fromBase64Url(input.requesterPublicKey));
    const signature = Uint8Array.from(fromBase64Url(input.signature));
    const publicKey = await crypto.subtle.importKey(
      'spki',
      toFixedArrayBuffer(keyData),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify'],
    );
    const payload = webBootstrapGrantSignaturePayload({
      action: input.action,
      grantId: input.grantId,
      nonce: input.nonce,
      clientNonce: input.clientNonce,
      webChallenge: input.webChallenge,
      serverOrigin: input.serverOrigin,
      deploymentFingerprint: input.deploymentFingerprint,
    });
    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      toFixedArrayBuffer(signature),
      toFixedArrayBuffer(payload),
    );
  } catch {
    return false;
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

function resolveServerUrlProtocol(serverUrl: string): string {
  try {
    return new URL(serverUrl).protocol;
  } catch {
    return '';
  }
}

function isContentLengthAboveLimit(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get('content-length');
  if (!raw) {
    return false;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return false;
  }
  return parsed > maxBytes;
}

async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error('body_limit_exceeded');
    }
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

async function parseJsonBodyWithLimit<T>(input: {
  request: Request;
  maxBytes: number;
  tooLargeCode: string;
}): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  if (isContentLengthAboveLimit(input.request, input.maxBytes)) {
    return {
      ok: false,
      response: jsonResponse(413, {
        ok: false,
        code: input.tooLargeCode,
      }),
    };
  }

  let text = '';
  try {
    text = await readBodyWithLimit(input.request, input.maxBytes);
  } catch {
    return {
      ok: false,
      response: jsonResponse(413, {
        ok: false,
        code: input.tooLargeCode,
      }),
    };
  }

  try {
    return {
      ok: true,
      body: JSON.parse(text) as T,
    };
  } catch {
    return {
      ok: false,
      response: jsonResponse(400, {
        ok: false,
        code: 'invalid_input',
      }),
    };
  }
}

function hasTooBigIssue(error: ZodError, pathKey: string): boolean {
  return error.issues.some((issue) => issue.code === 'too_big' && issue.path.join('.') === pathKey);
}

function base64UrlDecodedByteLength(value: string): number | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded).length;
  } catch {
    return null;
  }
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

type SyncSnapshotTokenPayload = {
  v: 'sync.snapshot.v1';
  userId: string;
  snapshotAsOf: string;
  snapshotDigest: string;
  pageSize: number;
  exp: string;
};

type SyncSnapshotCursorPayload = {
  v: 'sync.cursor.v1';
  snapshotDigest: string;
  offset: number;
};

function createSyncSnapshotToken(input: {
  bootstrapSecret: string;
  payload: SyncSnapshotTokenPayload;
}): string {
  const payloadEncoded = utf8ToBase64Url(JSON.stringify(input.payload));
  const signature = toBase64Url(createHmac('sha256', input.bootstrapSecret).update(payloadEncoded).digest());
  return `${payloadEncoded}.${signature}`;
}

function verifySyncSnapshotToken(input: {
  token: string;
  bootstrapSecret: string;
  nowIso: string;
}): { ok: true; payload: SyncSnapshotTokenPayload } | { ok: false; reason: 'invalid' | 'expired' } {
  const [payloadEncoded, signature] = input.token.split('.');
  if (!payloadEncoded || !signature) {
    return { ok: false, reason: 'invalid' };
  }
  const expectedSignature = toBase64Url(createHmac('sha256', input.bootstrapSecret).update(payloadEncoded).digest());
  if (!timingSafeSecretEquals(signature, expectedSignature)) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const parsed = JSON.parse(base64UrlToUtf8(payloadEncoded)) as Partial<SyncSnapshotTokenPayload>;
    if (
      parsed.v !== 'sync.snapshot.v1' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.snapshotAsOf !== 'string' ||
      typeof parsed.snapshotDigest !== 'string' ||
      typeof parsed.pageSize !== 'number' ||
      !Number.isInteger(parsed.pageSize) ||
      parsed.pageSize <= 0 ||
      typeof parsed.exp !== 'string'
    ) {
      return { ok: false, reason: 'invalid' };
    }
    if (parseIsoTimestamp(parsed.exp) <= parseIsoTimestamp(input.nowIso)) {
      return { ok: false, reason: 'expired' };
    }
    return {
      ok: true,
      payload: {
        v: 'sync.snapshot.v1',
        userId: parsed.userId,
        snapshotAsOf: parsed.snapshotAsOf,
        snapshotDigest: parsed.snapshotDigest,
        pageSize: parsed.pageSize,
        exp: parsed.exp,
      },
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

function encodeSyncSnapshotCursor(input: SyncSnapshotCursorPayload): string {
  return utf8ToBase64Url(JSON.stringify(input));
}

function decodeSyncSnapshotCursor(cursor: string): SyncSnapshotCursorPayload | null {
  try {
    const parsed = JSON.parse(base64UrlToUtf8(cursor)) as Partial<SyncSnapshotCursorPayload>;
    if (
      parsed.v !== 'sync.cursor.v1' ||
      typeof parsed.snapshotDigest !== 'string' ||
      typeof parsed.offset !== 'number' ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0
    ) {
      return null;
    }
    return {
      v: 'sync.cursor.v1',
      snapshotDigest: parsed.snapshotDigest,
      offset: parsed.offset,
    };
  } catch {
    return null;
  }
}

type AttachmentStateCursorPayload = {
  v: 'attachments.cursor.v1';
  offset: number;
};

function encodeAttachmentStateCursor(input: AttachmentStateCursorPayload): string {
  return utf8ToBase64Url(JSON.stringify(input));
}

function decodeAttachmentStateCursor(cursor: string): AttachmentStateCursorPayload | null {
  try {
    const parsed = JSON.parse(base64UrlToUtf8(cursor)) as Partial<AttachmentStateCursorPayload>;
    if (parsed.v !== 'attachments.cursor.v1' || typeof parsed.offset !== 'number') {
      return null;
    }
    return {
      v: 'attachments.cursor.v1',
      offset: Math.max(0, Math.trunc(parsed.offset)),
    };
  } catch {
    return null;
  }
}

function buildSyncSnapshotDigest(entries: Array<Record<string, unknown>>): string {
  return sha256Base64Url(JSON.stringify(entries));
}

function parseSyncSnapshotPageSize(rawValue: string | undefined): number | null {
  if (!rawValue) {
    return SYNC_SNAPSHOT_PAGE_SIZE_DEFAULT;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, SYNC_SNAPSHOT_PAGE_SIZE_MAX);
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
let SECURITY_HEADERS_INCLUDE_HSTS = false;

function toAttachmentUploadRecord(record: {
  key: string;
  itemId: string | null;
  fileName: string;
  lifecycleState: 'pending' | 'uploaded' | 'attached' | 'deleted' | 'orphaned';
  contentType: string;
  size: number;
  expiresAt: string | null;
  uploadedAt: string | null;
  attachedAt: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return AttachmentUploadRecordSchema.parse({
    uploadId: record.key,
    itemId: record.itemId ?? '',
    fileName: record.fileName.trim().length > 0 ? record.fileName : `${record.key}.bin`,
    lifecycleState: record.lifecycleState,
    contentType: record.contentType,
    size: record.size,
    expiresAt: record.expiresAt ?? record.createdAt,
    uploadedAt: record.uploadedAt,
    attachedAt: record.attachedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function addSecurityHeaders(response: Response): Response {
  const headers = createDefaultSecurityHeaders(
    {
      cspValue:
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      includeHsts: SECURITY_HEADERS_INCLUDE_HSTS,
      noStore: true,
    },
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
      bundleVersion: input.user.bundleVersion,
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
  recentReauthAt?: string | null;
}): Promise<SessionRecord> {
  const session = buildTrustedSessionRecord(input);
  return input.storage.sessions.create(session);
}

async function issueExtensionSession(input: {
  storage: VaultLiteStorage;
  clock: Clock;
  idGenerator: IdGenerator;
  user: UserAccountRecord;
  device: DeviceRecord;
  rotatedFromSessionId: string | null;
  ttlSeconds?: number;
}): Promise<{ token: string; session: SessionRecord }> {
  const nowIso = isoNow(input.clock);
  const token = issueExtensionSessionToken();
  const tokenHash = sha256Base64Url(token);
  const ttlSeconds = Number.isFinite(input.ttlSeconds)
    ? Math.max(60, Math.trunc(input.ttlSeconds as number))
    : EXTENSION_SESSION_TTL_SECONDS;
  const session: SessionRecord = {
    sessionId: tokenHash,
    userId: input.user.userId,
    deviceId: input.device.deviceId,
    csrfToken: input.idGenerator.nextId('csrf_ext'),
    createdAt: nowIso,
    expiresAt: addSeconds(nowIso, ttlSeconds),
    recentReauthAt: null,
    revokedAt: null,
    rotatedFromSessionId: input.rotatedFromSessionId,
  };
  await input.storage.sessions.create(session);
  return {
    token,
    session,
  };
}

function buildTrustedSessionRecord(input: {
  clock: Clock;
  idGenerator: IdGenerator;
  user: UserAccountRecord;
  device: DeviceRecord;
  recentReauthAt?: string | null;
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
    recentReauthAt: input.recentReauthAt ?? null,
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

  return {
    session,
    user,
    device,
    authMode: 'cookie',
    extensionToken: null,
  };
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
  const includeHsts =
    options.runtimeMode === 'production' && resolveServerUrlProtocol(options.serverUrl) === 'https:';
  SECURITY_HEADERS_INCLUDE_HSTS = includeHsts;
  const configuredServerOrigin = canonicalizeServerOrigin(options.serverUrl) ?? options.serverUrl;
  const realtimeConfig = options.realtime ?? {
    enabled: false,
    wsBaseUrl: '',
    webAllowedOrigins: [configuredServerOrigin],
    connectTokenSecret: '',
    connectTokenTtlSeconds: 45,
    authLeaseSeconds: 600,
    heartbeatIntervalMs: 25_000,
    flags: {
      realtime_ws_v1: false,
      realtime_delta_vault_v1: false,
      realtime_delta_icons_v1: false,
      realtime_delta_history_v1: false,
      realtime_delta_attachments_v1: false,
      realtime_apply_web_v1: false,
      realtime_apply_extension_v1: false,
      icons_state_sync_v1: false,
      icons_ws_apply_web_v1: false,
      icons_ws_apply_extension_v1: false,
      icons_discovery_v2_v1: false,
      icons_fast_first_v1: false,
      icons_best_later_v1: false,
      icons_http_fallback_v1: false,
      icons_manual_private_ticket_v1: false,
      icons_provider_favicon_vemetric_enabled: false,
      icons_provider_google_s2_enabled: false,
      icons_provider_icon_horse_enabled: false,
      icons_provider_duckduckgo_ip3_enabled: false,
      icons_provider_faviconextractor_enabled: false,
    },
    hubNamespace: null,
  };
  const allowedWebSocketWebOrigins = new Set(
    normalizeAllowedWebOrigins(realtimeConfig.webAllowedOrigins ?? [configuredServerOrigin]),
  );
  const iconsDiscoveryQueue = options.iconsDiscoveryQueue ?? null;
  const internalIconsDiscoveryToken = options.iconsDiscoveryInternalToken?.trim() ?? '';

  function resolveAllowedIconCorsOrigin(request: Request): string | null {
    const originHeader = request.headers.get('origin');
    if (!originHeader) {
      return null;
    }
    const requestOrigin = canonicalizeServerOrigin(originHeader);
    if (!requestOrigin) {
      return null;
    }
    if (requestOrigin === configuredServerOrigin || allowedWebSocketWebOrigins.has(requestOrigin)) {
      return requestOrigin;
    }
    return null;
  }

  function isRealtimeOperational(): boolean {
    return realtimeConfig.enabled && realtimeConfig.flags.realtime_ws_v1 && Boolean(realtimeConfig.hubNamespace);
  }

  function getRealtimeHubStub(userId: string) {
    if (!realtimeConfig.hubNamespace) {
      return null;
    }
    const id = realtimeConfig.hubNamespace.idFromName(`${options.deploymentFingerprint}:${userId}`);
    return realtimeConfig.hubNamespace.get(id);
  }

  function isRealtimeTopicEnabled(topic: RealtimeTopic): boolean {
    if (!isRealtimeOperational()) {
      return false;
    }
    if (topic.startsWith('vault.item.')) {
      return realtimeConfig.flags.realtime_delta_vault_v1;
    }
    if (topic.startsWith('icons.')) {
      return realtimeConfig.flags.realtime_delta_icons_v1;
    }
    if (topic.startsWith('password_history.')) {
      return realtimeConfig.flags.realtime_delta_history_v1;
    }
    if (topic.startsWith('vault.attachment.')) {
      return realtimeConfig.flags.realtime_delta_attachments_v1;
    }
    return false;
  }

  function resolveRealtimeAggregateId(topic: RealtimeTopic, payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const record = payload as Record<string, unknown>;
    if (topic.startsWith('vault.item.')) {
      return typeof record.itemId === 'string' ? record.itemId : null;
    }
    if (topic.startsWith('icons.manual.')) {
      return typeof record.domain === 'string' ? record.domain : null;
    }
    if (topic.startsWith('icons.state.')) {
      if (typeof record.domain === 'string') {
        return record.domain;
      }
      if (record.record && typeof record.record === 'object') {
        const nested = record.record as Record<string, unknown>;
        return typeof nested.domain === 'string' ? nested.domain : null;
      }
      return null;
    }
    if (topic.startsWith('password_history.')) {
      return typeof record.entryId === 'string' ? record.entryId : null;
    }
    if (topic.startsWith('vault.attachment.')) {
      return typeof record.uploadId === 'string' ? record.uploadId : null;
    }
    return null;
  }

  async function dispatchRealtimeOutboxForUser(userId: string): Promise<void> {
    if (!isRealtimeOperational()) {
      return;
    }
    const stub = getRealtimeHubStub(userId);
    if (!stub) {
      return;
    }

    for (let iteration = 0; iteration < 10; iteration += 1) {
      const pending = await options.storage.realtimeOutbox.listPendingByUserId(
        userId,
        REALTIME_OUTBOX_DISPATCH_BATCH_SIZE,
      );
      if (pending.length === 0) {
        break;
      }
      for (const entry of pending) {
        try {
          const response = await stub.fetch('https://vaultlite.realtime.internal/publish', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              eventId: entry.eventId,
              occurredAt: entry.occurredAt,
              deploymentFingerprint: options.deploymentFingerprint,
              topic: entry.topic,
              sourceDeviceId: entry.sourceDeviceId,
              payload: JSON.parse(entry.payloadJson),
            }),
          });
          if (response.status >= 400) {
            throw new Error(`realtime_publish_failed_${response.status}`);
          }
          await options.storage.realtimeOutbox.markPublished({
            id: entry.id,
            publishedAt: isoNow(options.clock),
          });
        } catch (error) {
          await options.storage.realtimeOutbox.markFailed({
            id: entry.id,
            failedAt: isoNow(options.clock),
            lastError: error instanceof Error ? error.message : 'publish_failed',
          });
          return;
        }
      }
    }

    const cutoffIso = new Date(
      options.clock.now().getTime() - REALTIME_OUTBOX_PUBLISHED_RETENTION_HOURS * 60 * 60 * 1000,
    ).toISOString();
    await options.storage.realtimeOutbox.deletePublishedBefore({
      cutoffIso,
      limit: REALTIME_OUTBOX_PRUNE_LIMIT,
    });
  }

  async function publishRealtimeEvent(input: {
    userId: string;
    topic: RealtimeTopic;
    payload: unknown;
    sourceDeviceId: string | null;
    occurredAt?: string;
    eventId?: string;
  }): Promise<void> {
    if (!isRealtimeTopicEnabled(input.topic)) {
      return;
    }

    const occurredAt = input.occurredAt ?? isoNow(options.clock);
    const eventId = input.eventId ?? options.idGenerator.nextId('realtime_event');
    const aggregateId = resolveRealtimeAggregateId(input.topic, input.payload);
    const idempotencyKey = `${input.userId}:${input.topic}:${aggregateId ?? 'none'}:${eventId}`;
    try {
      await options.storage.realtimeOutbox.enqueue({
        id: options.idGenerator.nextId('realtime_outbox'),
        userId: input.userId,
        topic: input.topic,
        aggregateId,
        idempotencyKey,
        eventId,
        occurredAt,
        sourceDeviceId: input.sourceDeviceId,
        payloadJson: JSON.stringify(input.payload),
        createdAt: isoNow(options.clock),
        publishedAt: null,
        attemptCount: 0,
        lastError: null,
      });
      await dispatchRealtimeOutboxForUser(input.userId);
    } catch {
      // Keep mutation path resilient. Replay fallback will recover state.
    }
  }

  async function invalidateRealtimeConnections(input: {
    userId: string;
    code: keyof typeof REALTIME_CLOSE_CODES;
    message: string;
  }): Promise<void> {
    if (!isRealtimeOperational()) {
      return;
    }
    const stub = getRealtimeHubStub(input.userId);
    if (!stub) {
      return;
    }
    try {
      await stub.fetch('https://vaultlite.realtime.internal/invalidate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code: input.code,
          message: input.message,
        }),
      });
    } catch {
      // best effort
    }
  }

  const iconBlobBucket = options.iconBlobBucket ?? null;
  const iconsAssetBaseUrl = (options.iconsAssetBaseUrl?.trim() || configuredServerOrigin).replace(/\/+$/u, '');
  const iconsTicketSecret =
    options.iconsTicketSecret?.trim() ||
    realtimeConfig.connectTokenSecret ||
    `${options.deploymentFingerprint}_icons_ticket_secret_dev`;

  async function buildUserIconsState(input: {
    userId: string;
    includeDomains?: string[];
  }): Promise<{
    iconsVersion: number;
    etag: string;
    records: Array<{
      domain: string;
      status: 'pending' | 'ready' | 'absent' | 'removed';
      objectId: string | null;
      objectClass: 'automatic_public' | 'manual_private' | null;
      objectSha256: string | null;
      contentType: string | null;
      updatedAt: string;
    }>;
  }> {
    const normalizedDomains =
      input.includeDomains && input.includeDomains.length > 0
        ? normalizeHostEntries(input.includeDomains)
        : null;
    const stateRows = normalizedDomains
      ? await options.storage.userIconState.listByUserIdAndDomains(input.userId, normalizedDomains)
      : await options.storage.userIconState.listByUserId(input.userId);
    const objectIds = Array.from(
      new Set(
        stateRows
          .map((row) => row.objectId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    );
    const objectById = new Map<
      string,
      {
        objectClass: 'automatic_public' | 'manual_private';
        sha256: string;
        contentType: string;
      }
    >();
    for (const objectId of objectIds) {
      const objectRecord = await options.storage.iconObjects.findByObjectId(objectId);
      if (!objectRecord) {
        continue;
      }
      objectById.set(objectId, {
        objectClass: objectRecord.objectClass,
        sha256: objectRecord.sha256,
        contentType: objectRecord.contentType,
      });
    }
    const records = stateRows.map((row) => {
      const object = row.objectId ? objectById.get(row.objectId) : null;
      return {
        domain: row.domain,
        status: row.status,
        objectId: row.objectId,
        objectClass: object?.objectClass ?? null,
        objectSha256: object?.sha256 ?? null,
        contentType: object?.contentType ?? null,
        updatedAt: row.updatedAt,
      };
    });
    const iconsVersion = await options.storage.userIconState.getVersion(input.userId);
    const etag = stableIconsStateEtag({
      userId: input.userId,
      iconsVersion,
      records,
    });
    return {
      iconsVersion,
      etag,
      records,
    };
  }

  async function persistIconObjectFromDataUrl(input: {
    userId: string;
    objectClass: 'automatic_public' | 'manual_private';
    dataUrl: string;
    nowIso: string;
  }) {
    if (!iconBlobBucket) {
      throw new Error('icon_blob_bucket_unavailable');
    }
    const parsed = parseIconDataUrl(input.dataUrl);
    if (!parsed) {
      throw new Error('icon_data_invalid');
    }
    const sha256 = sha256Hex(parsed.bytes);
    const existing = await options.storage.iconObjects.findByClassAndSha256({
      objectClass: input.objectClass,
      sha256,
      ownerUserId: input.objectClass === 'manual_private' ? input.userId : null,
    });
    if (existing) {
      return existing;
    }

    const objectId = options.idGenerator.nextId('icon_object');
    const r2Key =
      input.objectClass === 'automatic_public'
        ? `icons/automatic/${sha256}`
        : `icons/manual/${input.userId}/${sha256}`;
    const ingestJobId = options.idGenerator.nextId('icon_ingest');
    await options.storage.iconIngestJobs.create({
      jobId: ingestJobId,
      userId: input.userId,
      domain: '',
      objectClass: input.objectClass,
      status: 'staged',
      sha256,
      r2Key,
      objectId: null,
      errorCode: null,
      createdAt: input.nowIso,
      updatedAt: input.nowIso,
    });
    try {
      await options.storage.iconIngestJobs.updateStatus({
        jobId: ingestJobId,
        status: 'uploading',
        updatedAt: input.nowIso,
      });
      await iconBlobBucket.put(r2Key, parsed.bytes, {
        httpMetadata: {
          contentType: parsed.contentType,
        },
      });
      await options.storage.iconIngestJobs.updateStatus({
        jobId: ingestJobId,
        status: 'uploaded_uncommitted',
        updatedAt: input.nowIso,
      });
      const created = await options.storage.iconObjects.create({
        objectId,
        objectClass: input.objectClass,
        ownerUserId: input.objectClass === 'manual_private' ? input.userId : null,
        sha256,
        r2Key,
        contentType: parsed.contentType,
        byteLength: parsed.bytes.byteLength,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      });
      await options.storage.iconIngestJobs.updateStatus({
        jobId: ingestJobId,
        status: 'committed',
        objectId: created.objectId,
        updatedAt: input.nowIso,
      });
      return created;
    } catch (error) {
      await options.storage.iconIngestJobs.updateStatus({
        jobId: ingestJobId,
        status: 'upload_failed',
        errorCode: error instanceof Error ? error.message : 'icon_upload_failed',
        updatedAt: input.nowIso,
      });
      throw error;
    }
  }

  async function upsertIconStateAndPublish(input: {
    userId: string;
    sourceDeviceId: string | null;
    domain: string;
    status: 'pending' | 'ready' | 'absent' | 'removed';
    objectId: string | null;
    occurredAt: string;
  }): Promise<void> {
    const domain = normalizeDomainCandidate(input.domain);
    if (!domain) {
      return;
    }
    const upsert = await options.storage.userIconState.upsert({
      userId: input.userId,
      domain,
      status: input.status,
      objectId: input.objectId,
      updatedAt: input.occurredAt,
    });
    if (!upsert.changed) {
      return;
    }
    const iconsVersion = await options.storage.userIconState.bumpVersion({
      userId: input.userId,
      updatedAt: input.occurredAt,
    });
    const object = upsert.record.objectId
      ? await options.storage.iconObjects.findByObjectId(upsert.record.objectId)
      : null;
    await publishRealtimeEvent({
      userId: input.userId,
      sourceDeviceId: input.sourceDeviceId,
      topic: 'icons.state.upserted',
      occurredAt: input.occurredAt,
      payload: {
        iconsVersion,
        record: {
          domain,
          status: upsert.record.status,
          objectId: upsert.record.objectId,
          objectClass: object?.objectClass ?? null,
          objectSha256: object?.sha256 ?? null,
          contentType: object?.contentType ?? null,
          updatedAt: upsert.record.updatedAt,
        },
      },
    });
  }

  async function removeIconStateAndPublish(input: {
    userId: string;
    sourceDeviceId: string | null;
    domain: string;
    occurredAt: string;
  }): Promise<void> {
    const domain = normalizeDomainCandidate(input.domain);
    if (!domain) {
      return;
    }
    const changed = await options.storage.userIconState.remove({
      userId: input.userId,
      domain,
      updatedAt: input.occurredAt,
    });
    if (!changed) {
      return;
    }
    const iconsVersion = await options.storage.userIconState.bumpVersion({
      userId: input.userId,
      updatedAt: input.occurredAt,
    });
    await publishRealtimeEvent({
      userId: input.userId,
      sourceDeviceId: input.sourceDeviceId,
      topic: 'icons.state.removed',
      occurredAt: input.occurredAt,
      payload: {
        iconsVersion,
        domain,
        updatedAt: input.occurredAt,
      },
    });
  }

  function iconDiscoveryNegativeBackoffMs(failCount: number): number {
    const safeFailCount = Math.max(1, Math.trunc(failCount));
    const exponent = Math.min(safeFailCount - 1, 8);
    return Math.min(ICONS_DISCOVERY_NEGATIVE_BASE_TTL_MS * 2 ** exponent, ICONS_DISCOVERY_NEGATIVE_MAX_TTL_MS);
  }

  async function enqueueIconDiscoveryJobs(input: {
    userId: string;
    sourceDeviceId: string | null;
    domains: string[];
    trigger: IconDiscoveryQueueMessage['trigger'];
    requestedAt: string;
  }): Promise<void> {
    if (!iconsDiscoveryQueue) {
      return;
    }
    const normalizedDomains = Array.from(
      new Set(
        input.domains
          .map((domain) => normalizeDomainCandidate(domain))
          .filter((domain): domain is string => Boolean(domain)),
      ),
    );
    for (const domain of normalizedDomains) {
      const payload: IconDiscoveryQueueMessage = {
        domain,
        userId: input.userId,
        sourceDeviceId: input.sourceDeviceId ?? null,
        trigger: input.trigger,
        requestedAt: input.requestedAt,
      };
      await iconsDiscoveryQueue.send(payload);
    }
  }

  async function enforceIconsDomainWriteRateLimit(input: {
    userId: string;
    deviceId: string;
    nowIso: string;
  }): Promise<Response | null> {
    const [deviceRate, userRate] = await Promise.all([
      options.storage.authRateLimits.increment({
        key: `icons_domains_write:device:${input.userId}:${input.deviceId}`,
        nowIso: input.nowIso,
        windowSeconds: ICONS_DOMAINS_WRITE_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: `icons_domains_write:user:${input.userId}`,
        nowIso: input.nowIso,
        windowSeconds: ICONS_DOMAINS_WRITE_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);
    if (
      deviceRate.attemptCount <= ICONS_DOMAINS_WRITE_RATE_LIMIT_PER_DEVICE &&
      userRate.attemptCount <= ICONS_DOMAINS_WRITE_RATE_LIMIT_PER_USER
    ) {
      return null;
    }
    const nowMs = Date.parse(input.nowIso);
    const retryAfterMs = Math.max(
      1_000,
      Math.max(
        Date.parse(deviceRate.windowEndsAt) - nowMs,
        Date.parse(userRate.windowEndsAt) - nowMs,
      ),
    );
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1_000));
    return jsonResponse(
      429,
      {
        ok: false,
        code: 'rate_limited',
      },
      {
        headers: {
          'retry-after': String(retryAfterSeconds),
        },
      },
    );
  }

  async function processIconDiscoveryQueueMessage(
    message: IconDiscoveryQueueMessage,
  ): Promise<{ status: 'ready' | 'absent' | 'pending' | 'skipped' }> {
    const domain = normalizeDomainCandidate(message.domain);
    const userId = typeof message.userId === 'string' ? message.userId.trim() : '';
    if (!domain || !userId) {
      return { status: 'skipped' };
    }
    const sourceDeviceId =
      typeof message.sourceDeviceId === 'string' && message.sourceDeviceId.length > 0
        ? message.sourceDeviceId
        : null;
    const nowIso = isoNow(options.clock);
    const registry = await options.storage.automaticIconRegistry.findByDomain(domain);

    if (registry && registry.nextEligibleAt > nowIso) {
      if (registry.status === 'ready' && registry.objectId) {
        const object = await options.storage.iconObjects.findByObjectId(registry.objectId);
        if (object && object.objectClass === 'automatic_public') {
          await upsertIconStateAndPublish({
            userId,
            sourceDeviceId,
            domain,
            status: 'ready',
            objectId: registry.objectId,
            occurredAt: nowIso,
          });
          return { status: 'ready' };
        }
      }
      if (registry.status === 'absent') {
        await upsertIconStateAndPublish({
          userId,
          sourceDeviceId,
          domain,
          status: 'absent',
          objectId: null,
          occurredAt: nowIso,
        });
        return { status: 'absent' };
      }
      await upsertIconStateAndPublish({
        userId,
        sourceDeviceId,
        domain,
        status: 'pending',
        objectId: null,
        occurredAt: nowIso,
      });
      return { status: 'pending' };
    }

    let discoveredDataUrl: string | null = null;
    let discoveredSourceUrl: string | null = null;
    const cachedAutomatic = await options.storage.siteIconCache.findByDomain(domain);
    if (cachedAutomatic) {
      const updatedAtMs = Date.parse(cachedAutomatic.updatedAt);
      const nowMs = Date.parse(nowIso);
      if (Number.isFinite(updatedAtMs) && Number.isFinite(nowMs) && nowMs - updatedAtMs <= ICONS_DISCOVERY_SUCCESS_TTL_MS) {
        discoveredDataUrl = cachedAutomatic.dataUrl;
        discoveredSourceUrl = cachedAutomatic.sourceUrl;
      }
    }

    if (!discoveredDataUrl) {
      const discovered = await discoverSiteIcon({
        domain,
        nowIso,
      });
      if (discovered && isSafeIconDataUrl(discovered.dataUrl)) {
        discoveredDataUrl = discovered.dataUrl;
        discoveredSourceUrl = discovered.sourceUrl ?? null;
        await options.storage.siteIconCache.upsert({
          domain,
          dataUrl: discovered.dataUrl,
          sourceUrl: discovered.sourceUrl ?? null,
          fetchedAt: discovered.fetchedAt,
          updatedAt: nowIso,
        });
      }
    }

    if (!discoveredDataUrl) {
      const nextFailCount = Math.max(1, (registry?.failCount ?? 0) + 1);
      await options.storage.automaticIconRegistry.upsert({
        domain,
        status: 'absent',
        objectId: null,
        sourceUrl: null,
        failCount: nextFailCount,
        lastCheckedAt: nowIso,
        nextEligibleAt: addMillisecondsIso(nowIso, iconDiscoveryNegativeBackoffMs(nextFailCount)),
        updatedAt: nowIso,
      });
      await upsertIconStateAndPublish({
        userId,
        sourceDeviceId,
        domain,
        status: 'absent',
        objectId: null,
        occurredAt: nowIso,
      });
      return { status: 'absent' };
    }

    const objectRecord = await persistIconObjectFromDataUrl({
      userId,
      objectClass: 'automatic_public',
      dataUrl: discoveredDataUrl,
      nowIso,
    });
    await options.storage.automaticIconRegistry.upsert({
      domain,
      status: 'ready',
      objectId: objectRecord.objectId,
      sourceUrl: discoveredSourceUrl,
      failCount: 0,
      lastCheckedAt: nowIso,
      nextEligibleAt: addMillisecondsIso(nowIso, ICONS_DISCOVERY_SUCCESS_TTL_MS),
      updatedAt: nowIso,
    });
    await upsertIconStateAndPublish({
      userId,
      sourceDeviceId,
      domain,
      status: 'ready',
      objectId: objectRecord.objectId,
      occurredAt: nowIso,
    });
    return { status: 'ready' };
  }

  async function processIconDiscoveryHostsInline(input: {
    userId: string;
    sourceDeviceId: string | null;
    domains: string[];
    trigger: IconDiscoveryQueueMessage['trigger'];
  }): Promise<void> {
    for (const domain of input.domains) {
      await processIconDiscoveryQueueMessage({
        domain,
        userId: input.userId,
        sourceDeviceId: input.sourceDeviceId,
        trigger: input.trigger,
        requestedAt: isoNow(options.clock),
      });
    }
  }

  app.use('*', async (c, next) => {
    await next();
    if (includeHsts) {
      c.res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
  });

  app.onError((error) => {
    if (error instanceof ZodError) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    console.error('[api] Unhandled route error', error);
    return jsonResponse(500, { ok: false, code: 'internal_error' });
  });

  const csrfValidator =
    options.csrfValidator ??
    ({
      ensureValid(headerToken, cookieToken) {
        return headerToken !== null && cookieToken !== null && headerToken === cookieToken;
      },
    } satisfies MutableRequestCsrfValidator);

  async function resolveExtensionBearerSession(request: Request): Promise<SessionContext | null> {
    const bearerToken = parseBearerToken(request.headers.get('authorization'));
    if (!bearerToken) {
      return null;
    }
    const tokenHash = sha256Base64Url(bearerToken);
    const resolved = await resolveAuthenticatedSession({
      storage: options.storage,
      clock: options.clock,
      sessionId: tokenHash,
    });
    if (!resolved || resolved.device.platform !== 'extension') {
      return null;
    }
    return {
      ...resolved,
      authMode: 'extension_bearer',
      extensionToken: bearerToken,
    };
  }

  async function requireAuthenticatedSession(
    request: Request,
    optionsInput: {
      allowExtensionBearer?: boolean;
    } = {},
  ): Promise<SessionContext | null> {
    if (optionsInput.allowExtensionBearer) {
      const bearerSession = await resolveExtensionBearerSession(request);
      if (bearerSession) {
        return bearerSession;
      }
    }

    const cookies = parseCookieHeader(request.headers.get('cookie'));
    const cookieSession = await resolveAuthenticatedSession({
      storage: options.storage,
      clock: options.clock,
      sessionId: cookies.vl_session,
    });
    if (cookieSession) {
      return cookieSession;
    }
    return null;
  }

  function hasValidCsrf(request: Request): boolean {
    const cookies = parseCookieHeader(request.headers.get('cookie'));
    return csrfValidator.ensureValid(request.headers.get('x-csrf-token'), cookies.vl_csrf ?? null);
  }

  async function resolvePrimarySurfaceLink(input: {
    userId: string;
    device: DeviceRecord;
  }) {
    if (input.device.platform === 'web') {
      return options.storage.surfaceLinks.findByWebDeviceId(input.userId, input.device.deviceId);
    }
    if (input.device.platform === 'extension') {
      return options.storage.surfaceLinks.findByExtensionDeviceId(input.userId, input.device.deviceId);
    }
    return null;
  }

  async function resolveEffectiveLockRevision(input: {
    userId: string;
    device: DeviceRecord;
  }): Promise<number> {
    const link = await resolvePrimarySurfaceLink(input);
    if (!link || !Number.isFinite(link.lockRevision)) {
      return 0;
    }
    return Math.max(0, Math.trunc(link.lockRevision));
  }

  async function bumpLinkedSurfaceLockRevision(input: {
    userId: string;
    deviceId: string;
    nowIso: string;
  }): Promise<number> {
    const nextLockRevision = await options.storage.surfaceLinks.bumpLockRevisionByDevice({
      userId: input.userId,
      deviceId: input.deviceId,
      updatedAtIso: input.nowIso,
    });
    if (nextLockRevision <= 0) {
      return 0;
    }
    await options.storage.unlockGrants.revokePendingByDeviceWithLockRevision({
      userId: input.userId,
      deviceId: input.deviceId,
      minLockRevisionExclusive: nextLockRevision,
      revokedAt: input.nowIso,
      reasonCode: 'locked_by_linked_surface',
    });
    await options.storage.webBootstrapGrants.revokePendingByDeviceWithLockRevision({
      userId: input.userId,
      deviceId: input.deviceId,
      minLockRevisionExclusive: nextLockRevision,
      revokedAt: input.nowIso,
      reasonCode: 'locked_by_linked_surface',
    });
    return nextLockRevision;
  }

  async function hasMatchingLinkLockRevision(input: {
    userId: string;
    requesterSurface: 'web' | 'extension';
    requesterDeviceId: string;
    approverDeviceId: string;
    expectedLockRevision: number;
  }): Promise<boolean> {
    const webDeviceId =
      input.requesterSurface === 'web' ? input.requesterDeviceId : input.approverDeviceId;
    const extensionDeviceId =
      input.requesterSurface === 'extension' ? input.requesterDeviceId : input.approverDeviceId;
    const link = await options.storage.surfaceLinks.findByPair(input.userId, webDeviceId, extensionDeviceId);
    if (!link) {
      return false;
    }
    return Math.max(0, Math.trunc(link.lockRevision ?? 0)) === Math.max(0, Math.trunc(input.expectedLockRevision));
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

  async function requireRecentReauthMutationContext(request: Request): Promise<
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
    if (!sessionContext || sessionContext.authMode !== 'cookie') {
      return { ok: false, response: jsonResponse(401, { ok: false, code: 'unauthorized' }) };
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

  async function requireTrustedRecentReauthMutationContext(request: Request): Promise<
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
    const context = await requireRecentReauthMutationContext(request);
    if (!context.ok) {
      return context;
    }
    const device = await options.storage.devices.findById(context.sessionContext.device.deviceId);
    if (
      !device ||
      device.userId !== context.sessionContext.user.userId ||
      device.deviceState !== 'active' ||
      device.revokedAt !== null
    ) {
      return { ok: false, response: jsonResponse(403, { ok: false, code: 'device_not_trusted' }) };
    }
    return context;
  }

  async function getEffectiveUnlockIdleTimeoutMs(userId: string): Promise<number> {
    const policy = await options.storage.sessionPolicies.findByUserId(userId);
    return normalizeUnlockIdleTimeoutMs(policy?.unlockIdleTimeoutMs);
  }

  function sessionPolicyBounds() {
    return {
      minUnlockIdleTimeoutMs: SESSION_POLICY_MIN_UNLOCK_IDLE_TIMEOUT_MS,
      maxUnlockIdleTimeoutMs: SESSION_POLICY_MAX_UNLOCK_IDLE_TIMEOUT_MS,
      defaultUnlockIdleTimeoutMs: SESSION_POLICY_DEFAULT_UNLOCK_IDLE_TIMEOUT_MS,
    };
  }

  app.get('/api/health', (c) => jsonResponse(200, { status: 'ok' }));

  app.get('/api/runtime/metadata', () =>
    jsonResponse(
      200,
      RuntimeMetadataSchema.parse({
        serverUrl: options.serverUrl,
        iconsAssetBaseUrl,
        deploymentFingerprint: options.deploymentFingerprint,
        ...(options.realtime
          ? {
              realtime: {
                enabled: isRealtimeOperational(),
                wsBaseUrl: realtimeConfig.wsBaseUrl,
                authLeaseSeconds: realtimeConfig.authLeaseSeconds,
                heartbeatIntervalMs: realtimeConfig.heartbeatIntervalMs,
                flags: realtimeConfig.flags,
              },
            }
          : {}),
      }),
    ),
  );

  app.post('/api/realtime/connect-token', async (c) => {
    if (!isRealtimeOperational()) {
      return jsonResponse(404, { ok: false, code: 'realtime_disabled' });
    }
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const ip = resolveRequestIp(c.req.raw);
    const connectTokenRate = await options.storage.authRateLimits.increment({
      key: `realtime-connect-token:${ip}:${sessionContext.user.userId}:${sessionContext.device.deviceId}`,
      nowIso: isoNow(options.clock),
      windowSeconds: REALTIME_CONNECT_TOKEN_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (connectTokenRate.attemptCount > REALTIME_CONNECT_TOKEN_RATE_LIMIT_ATTEMPTS) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    let bodyCursor = 0;
    try {
      const parsed = (await c.req.json()) as { cursor?: number };
      if (typeof parsed?.cursor === 'number' && Number.isFinite(parsed.cursor)) {
        bodyCursor = Math.max(0, Math.trunc(parsed.cursor));
      }
    } catch {
      // optional body
    }

    const now = options.clock.now();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const expiresAtSeconds = nowSeconds + realtimeConfig.connectTokenTtlSeconds;
    const authLeaseExpiresAt = new Date(now.getTime() + realtimeConfig.authLeaseSeconds * 1000).toISOString();
    const jti = options.idGenerator.nextId('realtime_jti');
    const token = createRealtimeConnectToken({
      claims: {
        userId: sessionContext.user.userId,
        sessionId: sessionContext.session.sessionId,
        deviceId: sessionContext.device.deviceId,
        surface: sessionContext.authMode === 'extension_bearer' ? 'extension' : 'web',
        deploymentFingerprint: options.deploymentFingerprint,
        jti,
        issuedAtUnixSeconds: nowSeconds,
        expiresAtUnixSeconds: expiresAtSeconds,
      },
      deploymentFingerprint: options.deploymentFingerprint,
      secret: realtimeConfig.connectTokenSecret,
    });
    const wsBase = realtimeConfig.wsBaseUrl.replace(/\/+$/u, '');
    return jsonResponse(
      200,
      RealtimeConnectTokenOutputSchema.parse({
        wsUrl: `${wsBase}/api/realtime/ws`,
        connectToken: token,
        expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
        resumeCursor: bodyCursor,
        authLeaseExpiresAt,
        heartbeatIntervalMs: realtimeConfig.heartbeatIntervalMs,
      }),
    );
  });

  app.get('/api/realtime/ws', async (c) => {
    if (!isRealtimeOperational()) {
      return jsonResponse(404, { ok: false, code: 'realtime_disabled' });
    }
    if (c.req.raw.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse(426, { ok: false, code: 'websocket_upgrade_required' });
    }

    const token = c.req.query('token')?.trim() ?? '';
    if (!token) {
      return jsonResponse(401, { ok: false, code: 'invalid_connect_token' });
    }
    const verified = verifyRealtimeConnectToken({
      token,
      deploymentFingerprint: options.deploymentFingerprint,
      secret: realtimeConfig.connectTokenSecret,
      nowUnixSeconds: Math.floor(options.clock.now().getTime() / 1000),
    });
    if (!verified.ok) {
      return jsonResponse(401, { ok: false, code: 'invalid_connect_token' });
    }

    const requestIp = resolveRequestIp(c.req.raw);
    const nowIso = isoNow(options.clock);
    const initialGlobalRate = await options.storage.authRateLimits.increment({
      key: 'realtime-ws-upgrade-initial:global',
      nowIso,
      windowSeconds: REALTIME_WS_UPGRADE_INITIAL_RATE_LIMIT_WINDOW_SECONDS,
    });
    const initialIpRate = await options.storage.authRateLimits.increment({
      key: `realtime-ws-upgrade-initial:${requestIp}`,
      nowIso,
      windowSeconds: REALTIME_WS_UPGRADE_INITIAL_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (
      initialGlobalRate.attemptCount > REALTIME_WS_UPGRADE_INITIAL_GLOBAL_RATE_LIMIT_ATTEMPTS ||
      initialIpRate.attemptCount > REALTIME_WS_UPGRADE_INITIAL_IP_RATE_LIMIT_ATTEMPTS
    ) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const resolved = await resolveAuthenticatedSession({
      storage: options.storage,
      clock: options.clock,
      sessionId: verified.claims.sid,
    });
    if (!resolved) {
      return jsonResponse(401, { ok: false, code: 'session_invalid' });
    }
    if (resolved.user.userId !== verified.claims.sub || resolved.device.deviceId !== verified.claims.did) {
      return jsonResponse(401, { ok: false, code: 'session_context_mismatch' });
    }
    if (verified.claims.surface === 'web') {
      const originHeader = c.req.raw.headers.get('origin');
      const requestOrigin = originHeader ? canonicalizeServerOrigin(originHeader) ?? '' : '';
      if (!requestOrigin || !allowedWebSocketWebOrigins.has(requestOrigin)) {
        return jsonResponse(403, { ok: false, code: 'origin_not_allowed' });
      }
      if (resolved.device.platform !== 'web') {
        return jsonResponse(403, { ok: false, code: 'surface_mismatch' });
      }
    } else if (resolved.device.platform !== 'extension') {
      return jsonResponse(403, { ok: false, code: 'surface_mismatch' });
    }

    const jtiConsume = await options.storage.realtimeOneTimeTokens.consume({
      tokenKey: `realtime-connect-jti:${verified.claims.jti}`,
      consumedAt: nowIso,
      expiresAt: addSeconds(nowIso, REALTIME_JTI_CONSUME_WINDOW_SECONDS),
    });
    if (!jtiConsume.consumed) {
      return jsonResponse(401, { ok: false, code: 'connect_token_replayed' });
    }

    const upgradeRate = await options.storage.authRateLimits.increment({
      key: `realtime-ws-upgrade:${requestIp}:${verified.claims.sub}`,
      nowIso,
      windowSeconds: REALTIME_WS_UPGRADE_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (upgradeRate.attemptCount > REALTIME_WS_UPGRADE_RATE_LIMIT_ATTEMPTS) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const stub = getRealtimeHubStub(resolved.user.userId);
    if (!stub) {
      return jsonResponse(503, { ok: false, code: 'realtime_unavailable' });
    }
    void dispatchRealtimeOutboxForUser(resolved.user.userId).catch(() => undefined);
    const queryCursor = Math.max(0, Math.trunc(Number(c.req.query('cursor') ?? '0')));
    const cursor = Number.isFinite(queryCursor) ? queryCursor : 0;
    const now = options.clock.now();
    const authLeaseExpiresAt = new Date(now.getTime() + realtimeConfig.authLeaseSeconds * 1000).toISOString();
    const headers = new Headers(c.req.raw.headers);
    headers.set('x-vl-user-id', resolved.user.userId);
    headers.set('x-vl-device-id', resolved.device.deviceId);
    headers.set('x-vl-surface', verified.claims.surface);
    headers.set('x-vl-cursor', String(cursor));
    headers.set('x-vl-auth-lease-expires-at', authLeaseExpiresAt);
    headers.set('x-vl-heartbeat-interval-ms', String(realtimeConfig.heartbeatIntervalMs));
    headers.delete('cookie');
    headers.delete('authorization');
    const response = await stub.fetch(
      new Request('https://vaultlite.realtime.internal/ws', {
        method: 'GET',
        headers,
      }),
    );
    if (response.status >= 400) {
      return jsonResponse(503, { ok: false, code: 'realtime_upgrade_failed' });
    }
    return response;
  });

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

    const ip = resolveRequestIp(c.req.raw);
    const globalRate = await options.storage.authRateLimits.increment({
      key: 'bootstrap-verify:global',
      nowIso,
      windowSeconds: BOOTSTRAP_VERIFY_WINDOW_SECONDS,
    });
    const ipRate = await options.storage.authRateLimits.increment({
      key: `bootstrap-verify:ip:${ip}`,
      nowIso,
      windowSeconds: BOOTSTRAP_VERIFY_WINDOW_SECONDS,
    });
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
        bundleVersion: user.bundleVersion,
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
    if (result === 'success_changed' && updatedUser.lifecycleState !== 'active') {
      await invalidateRealtimeConnections({
        userId: updatedUser.userId,
        code: 'lifecycle_not_active',
        message: `User lifecycle transitioned to ${updatedUser.lifecycleState}.`,
      });
    }
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
      recentReauthAt: nowIso,
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
    const nowIso = isoNow(options.clock);
    const ip = resolveRequestIp(c.req.raw);
    const subjectHash = toSubjectHash(input.username);
    const scopeKeys = {
      ip: `remote-auth:ip:${ip}`,
      subject: `remote-auth:subject:${subjectHash}`,
      burst: `remote-auth:ip-subject:${ip}:${subjectHash}`,
    };
    const [ipRate, subjectRate, burstRate] = await Promise.all([
      options.storage.authRateLimits.increment({
        key: scopeKeys.ip,
        nowIso,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: scopeKeys.subject,
        nowIso,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: scopeKeys.burst,
        nowIso,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);
    if (
      ipRate.attemptCount > AUTH_RATE_LIMIT_ATTEMPT_LIMIT ||
      subjectRate.attemptCount > AUTH_RATE_LIMIT_ATTEMPT_LIMIT ||
      burstRate.attemptCount > AUTH_RATE_LIMIT_ATTEMPT_LIMIT
    ) {
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

    await Promise.all([
      options.storage.authRateLimits.reset(scopeKeys.subject),
      options.storage.authRateLimits.reset(scopeKeys.burst),
    ]);
    const session = await issueTrustedSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device,
      recentReauthAt: nowIso,
    });

    const response = jsonResponse(200, buildTrustedSessionResponse({ session, user, device }));
    addSessionCookies(response, {
      sessionId: session.sessionId,
      csrfToken: session.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.post('/api/auth/extension/link/request', async (c) => {
    const nowIso = isoNow(options.clock);
    const requestIp = resolveRequestIp(c.req.raw);
    const ipRate = await options.storage.authRateLimits.increment({
      key: `extension-link:request:ip:${requestIp}`,
      nowIso,
      windowSeconds: EXTENSION_LINK_REQUEST_IP_WINDOW_SECONDS,
    });
    if (ipRate.attemptCount > EXTENSION_LINK_REQUEST_IP_ATTEMPT_LIMIT) {
      return jsonResponse(429, { ok: false, code: 'pairing_rate_limited' });
    }

    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 24 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = ExtensionLinkRequestInputSchema.parse(parsedBody.body);
    if (input.deploymentFingerprint !== options.deploymentFingerprint) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    const requestedServerOrigin = canonicalizeServerOrigin(configuredServerOrigin);
    if (!requestedServerOrigin || requestedServerOrigin !== configuredServerOrigin) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }

    const requestId = issueExtensionLinkRequestId();
    const shortCode = generateExtensionLinkShortCode();
    const fingerprintPhrase = generateFingerprintPhrase();
    const expiresAt = addSeconds(nowIso, EXTENSION_LINK_REQUEST_TTL_SECONDS);
    await options.storage.extensionLinkRequests.create({
      requestId,
      userId: null,
      deploymentFingerprint: options.deploymentFingerprint,
      serverOrigin: configuredServerOrigin,
      requestPublicKey: input.requestPublicKey,
      clientNonce: input.clientNonce,
      shortCode,
      fingerprintPhrase,
      deviceNameHint: input.deviceNameHint?.trim() || null,
      authSalt: null,
      encryptedAccountBundle: null,
      accountKeyWrapped: null,
      localUnlockEnvelope: null,
      status: 'pending',
      createdAt: nowIso,
      expiresAt,
      approvedAt: null,
      approvedByUserId: null,
      approvedByDeviceId: null,
      rejectedAt: null,
      rejectionReasonCode: null,
      consumedAt: null,
      consumedByDeviceId: null,
    });

    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_extension_link_request',
      actorUserId: null,
      targetType: 'extension_link_request',
      targetId: requestId,
      result: 'success_changed',
      reasonCode: null,
    });

    return jsonResponse(
      200,
      ExtensionLinkRequestOutputSchema.parse({
        ok: true,
        requestId,
        shortCode,
        fingerprintPhrase,
        expiresAt,
        interval: EXTENSION_LINK_DEFAULT_INTERVAL_SECONDS,
        serverOrigin: configuredServerOrigin,
      }),
    );
  });

  app.get('/api/auth/extension/link/pending', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext || sessionContext.authMode !== 'cookie') {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    const nowIso = isoNow(options.clock);
    const recent = await options.storage.extensionLinkRequests.listRecent(nowIso, 100);
    const records = recent
      .filter((record) => record.userId === null || record.userId === sessionContext.user.userId)
      .map((record) => {
        const computedStatus =
          record.expiresAt <= nowIso
            ? 'expired'
            : record.status === 'pending' ||
                record.status === 'approved' ||
                record.status === 'rejected' ||
                record.status === 'consumed'
              ? record.status
              : 'expired';
        return {
          requestId: record.requestId,
          status: computedStatus,
          shortCode: record.shortCode,
          fingerprintPhrase: record.fingerprintPhrase,
          deviceNameHint: record.deviceNameHint,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          approvedAt: record.approvedAt,
        };
      });
    return jsonResponse(
      200,
      ExtensionLinkPendingListOutputSchema.parse({
        ok: true,
        requests: records,
      }),
    );
  });

  app.post('/api/auth/extension/link/approve', async (c) => {
    const context = await requireTrustedRecentReauthMutationContext(c.req.raw);
    if (!context.ok) {
      return context.response;
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 64 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = ExtensionLinkApproveInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.extensionLinkRequests.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    if (requestRecord.expiresAt <= context.nowIso) {
      return jsonResponse(
        200,
        ExtensionLinkActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_expired',
        }),
      );
    }
    if (requestRecord.status !== 'pending') {
      return jsonResponse(
        200,
        ExtensionLinkActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_not_pending',
        }),
      );
    }

    const approved = await options.storage.extensionLinkRequests.approve({
      requestId: requestRecord.requestId,
      expectedStatus: 'pending',
      approvedAt: context.nowIso,
      approvedByUserId: context.sessionContext.user.userId,
      approvedByDeviceId: context.sessionContext.device.deviceId,
      userId: context.sessionContext.user.userId,
      authSalt: input.package.authSalt,
      encryptedAccountBundle: input.package.encryptedAccountBundle,
      accountKeyWrapped: input.package.accountKeyWrapped,
      localUnlockEnvelope: JSON.stringify(input.package.localUnlockEnvelope),
    });
    if (!approved) {
      return jsonResponse(
        200,
        ExtensionLinkActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_not_pending',
        }),
      );
    }

    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_extension_link_approve',
      actorUserId: context.sessionContext.user.userId,
      targetType: 'extension_link_request',
      targetId: requestRecord.requestId,
      result: 'success_changed',
      reasonCode: null,
    });

    return jsonResponse(
      200,
      ExtensionLinkActionOutputSchema.parse({
        ok: true,
        result: 'success_changed',
      }),
    );
  });

  app.post('/api/auth/extension/link/reject', async (c) => {
    const context = await requireTrustedRecentReauthMutationContext(c.req.raw);
    if (!context.ok) {
      return context.response;
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = ExtensionLinkRejectInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.extensionLinkRequests.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    if (requestRecord.expiresAt <= context.nowIso) {
      return jsonResponse(
        200,
        ExtensionLinkActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_expired',
        }),
      );
    }
    const rejected = await options.storage.extensionLinkRequests.reject({
      requestId: requestRecord.requestId,
      expectedStatus: 'pending',
      rejectedAt: context.nowIso,
      reasonCode: input.rejectionReasonCode ?? 'rejected_by_user',
    });
    if (!rejected) {
      return jsonResponse(
        200,
        ExtensionLinkActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_not_pending',
        }),
      );
    }
    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_extension_link_reject',
      actorUserId: context.sessionContext.user.userId,
      targetType: 'extension_link_request',
      targetId: requestRecord.requestId,
      result: 'success_changed',
      reasonCode: input.rejectionReasonCode ?? 'rejected_by_user',
    });
    return jsonResponse(
      200,
      ExtensionLinkActionOutputSchema.parse({
        ok: true,
        result: 'success_changed',
      }),
    );
  });

  app.post('/api/auth/extension/link/status', async (c) => {
    const nowIso = isoNow(options.clock);
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = ExtensionLinkStatusInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.extensionLinkRequests.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    const proofValid = await verifyExtensionLinkProof({
      requestPublicKey: requestRecord.requestPublicKey,
      signature: input.requestProof.signature,
      action: 'status',
      requestId: requestRecord.requestId,
      nonce: input.requestProof.nonce,
      clientNonce: requestRecord.clientNonce,
      serverOrigin: requestRecord.serverOrigin,
      deploymentFingerprint: requestRecord.deploymentFingerprint,
    });
    if (!proofValid) {
      return jsonResponse(
        200,
        ExtensionLinkStatusOutputSchema.parse({
          ok: true,
          status: 'denied',
          reasonCode: 'invalid_request_proof',
        }),
      );
    }

    if (requestRecord.expiresAt <= nowIso) {
      return jsonResponse(
        200,
        ExtensionLinkStatusOutputSchema.parse({
          ok: true,
          status: 'expired',
        }),
      );
    }
    const statusRate = await options.storage.authRateLimits.increment({
      key: `extension-link:status:${requestRecord.requestId}`,
      nowIso,
      windowSeconds: EXTENSION_LINK_STATUS_WINDOW_SECONDS,
    });
    if (statusRate.attemptCount > EXTENSION_LINK_STATUS_ATTEMPT_LIMIT) {
      const nextInterval = Math.min(
        EXTENSION_LINK_MAX_INTERVAL_SECONDS,
        EXTENSION_LINK_DEFAULT_INTERVAL_SECONDS + EXTENSION_LINK_STATUS_SLOWDOWN_SECONDS,
      );
      return jsonResponse(429, { ok: false, code: 'slow_down', interval: nextInterval });
    }

    if (requestRecord.status === 'pending') {
      return jsonResponse(
        200,
        ExtensionLinkStatusOutputSchema.parse({
          ok: true,
          status: 'authorization_pending',
          interval: EXTENSION_LINK_DEFAULT_INTERVAL_SECONDS,
        }),
      );
    }
    if (requestRecord.status === 'approved') {
      return jsonResponse(
        200,
        ExtensionLinkStatusOutputSchema.parse({
          ok: true,
          status: 'approved',
          interval: EXTENSION_LINK_DEFAULT_INTERVAL_SECONDS,
        }),
      );
    }
    if (requestRecord.status === 'rejected') {
      return jsonResponse(
        200,
        ExtensionLinkStatusOutputSchema.parse({
          ok: true,
          status: 'rejected',
          reasonCode: requestRecord.rejectionReasonCode ?? undefined,
        }),
      );
    }
    return jsonResponse(
      200,
      ExtensionLinkStatusOutputSchema.parse({
        ok: true,
        status: 'consumed',
      }),
    );
  });

  app.post('/api/auth/extension/link/consume', async (c) => {
    const nowIso = isoNow(options.clock);
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 24 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = ExtensionLinkConsumeInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.extensionLinkRequests.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    if (requestRecord.expiresAt <= nowIso) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_expired' });
    }
    const proofValid = await verifyExtensionLinkProof({
      requestPublicKey: requestRecord.requestPublicKey,
      signature: input.requestProof.signature,
      action: 'consume',
      requestId: requestRecord.requestId,
      nonce: input.requestProof.nonce,
      clientNonce: requestRecord.clientNonce,
      serverOrigin: requestRecord.serverOrigin,
      deploymentFingerprint: requestRecord.deploymentFingerprint,
    });
    if (!proofValid) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (requestRecord.status !== 'approved') {
      if (requestRecord.status === 'consumed') {
        return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
      }
      return jsonResponse(409, { ok: false, code: 'authorization_pending' });
    }
    if (
      !requestRecord.userId ||
      !requestRecord.authSalt ||
      !requestRecord.encryptedAccountBundle ||
      !requestRecord.accountKeyWrapped ||
      !requestRecord.localUnlockEnvelope
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }

    const user = await options.storage.users.findByUserId(requestRecord.userId);
    if (!user || user.lifecycleState !== 'active') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const deviceId = options.idGenerator.nextId('device_ext');
    const deviceName =
      requestRecord.deviceNameHint?.trim().length ? requestRecord.deviceNameHint.trim() : 'VaultLite Extension';
    const device: DeviceRecord = {
      deviceId,
      userId: user.userId,
      deviceName,
      platform: 'extension',
      deviceState: 'active',
      createdAt: nowIso,
      revokedAt: null,
    };
    const consumed = await options.storage.extensionLinkRequests.consume({
      requestId: requestRecord.requestId,
      expectedStatus: 'approved',
      consumedAt: nowIso,
      consumedByDeviceId: deviceId,
    });
    if (!consumed) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
    }
    await options.storage.devices.register(device);
    const nowPolicy = await getEffectiveUnlockIdleTimeoutMs(user.userId);
    const issued = await issueExtensionSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device,
      rotatedFromSessionId: null,
      ttlSeconds: Math.ceil(nowPolicy / 1000) * 3,
    });
    const sessionRecoverKey = issueExtensionSessionRecoverKey();
    await options.storage.extensionSessionRecoverSecrets.upsert({
      userId: user.userId,
      deviceId: device.deviceId,
      secretHash: sha256Base64Url(sessionRecoverKey),
      updatedAt: nowIso,
    });
    if (consumed.approvedByDeviceId) {
      await options.storage.surfaceLinks.upsert({
        userId: user.userId,
        webDeviceId: consumed.approvedByDeviceId,
        extensionDeviceId: device.deviceId,
        lockRevision: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_extension_link_consume',
      actorUserId: user.userId,
      targetType: 'device',
      targetId: device.deviceId,
      result: 'success_changed',
      reasonCode: null,
    });
    if (!consumed.localUnlockEnvelope) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
    }
    const localUnlockEnvelope = LocalUnlockEnvelopeSchema.parse(
      JSON.parse(consumed.localUnlockEnvelope),
    );
    return jsonResponse(
      200,
      ExtensionLinkConsumeOutputSchema.parse({
        ok: true,
        result: 'success_changed',
        extensionSessionToken: issued.token,
        sessionExpiresAt: issued.session.expiresAt,
        sessionRecoverKey,
        user: {
          userId: user.userId,
          username: user.username,
          role: user.role,
          bundleVersion: user.bundleVersion,
          lifecycleState: user.lifecycleState,
        },
        device: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
        },
        package: {
          authSalt: consumed.authSalt,
          encryptedAccountBundle: consumed.encryptedAccountBundle,
          accountKeyWrapped: consumed.accountKeyWrapped,
          localUnlockEnvelope,
        },
      }),
    );
  });

  app.post('/api/auth/unlock-grant/request', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 24 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = UnlockGrantRequestInputSchema.parse(parsedBody.body);
    if (input.deploymentFingerprint !== options.deploymentFingerprint) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    const requesterSurface = sessionContext.device.platform === 'extension' ? 'extension' : 'web';
    if (input.targetSurface === requesterSurface) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }

    const link =
      requesterSurface === 'web'
        ? await options.storage.surfaceLinks.findByWebDeviceId(
            sessionContext.user.userId,
            sessionContext.device.deviceId,
          )
        : await options.storage.surfaceLinks.findByExtensionDeviceId(
            sessionContext.user.userId,
            sessionContext.device.deviceId,
          );
    if (!link) {
      return jsonResponse(409, { ok: false, code: 'no_linked_surface' });
    }

    const approverDeviceId =
      requesterSurface === 'web' ? link.extensionDeviceId : link.webDeviceId;
    const requestId = issueUnlockGrantRequestId();
    const nowIso = isoNow(options.clock);
    const expiresAt = addSeconds(nowIso, UNLOCK_GRANT_TTL_SECONDS);
    await options.storage.unlockGrants.create({
      requestId,
      userId: sessionContext.user.userId,
      deploymentFingerprint: options.deploymentFingerprint,
      serverOrigin: configuredServerOrigin,
      requesterSurface,
      requesterDeviceId: sessionContext.device.deviceId,
      requesterPublicKey: input.requestPublicKey,
      requesterClientNonce: input.clientNonce,
      approverSurface: input.targetSurface,
      approverDeviceId,
      lockRevision: Math.max(0, Math.trunc(link.lockRevision ?? 0)),
      status: 'pending',
      createdAt: nowIso,
      expiresAt,
      approvedAt: null,
      approvedByDeviceId: null,
      unlockAccountKey: null,
      rejectedAt: null,
      rejectionReasonCode: null,
      consumedAt: null,
      consumedByDeviceId: null,
    });

    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_unlock_grant_request',
      actorUserId: sessionContext.user.userId,
      targetType: 'unlock_grant',
      targetId: requestId,
      result: 'success_changed',
      reasonCode: null,
    });

    return jsonResponse(
      200,
      UnlockGrantRequestOutputSchema.parse({
        ok: true,
        requestId,
        expiresAt,
        interval: UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS,
        serverOrigin: configuredServerOrigin,
        targetSurface: input.targetSurface,
      }),
    );
  });

  app.get('/api/auth/unlock-grant/pending', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    const nowIso = isoNow(options.clock);
    const approverSurface = sessionContext.device.platform === 'extension' ? 'extension' : 'web';
    const records = await options.storage.unlockGrants.listPendingForApprover(
      sessionContext.user.userId,
      approverSurface,
      sessionContext.device.deviceId,
      nowIso,
      50,
    );
    return jsonResponse(
      200,
      UnlockGrantPendingListOutputSchema.parse({
        ok: true,
        requests: records.map((record) => ({
          requestId: record.requestId,
          requesterSurface: record.requesterSurface,
          requesterDeviceId: record.requesterDeviceId,
          approverSurface: record.approverSurface,
          approverDeviceId: record.approverDeviceId,
          status: record.expiresAt <= nowIso ? 'expired' : record.status,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          approvedAt: record.approvedAt,
        })),
      }),
    );
  });

  app.post('/api/auth/unlock-grant/approve', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = UnlockGrantApproveInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.unlockGrants.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    const nowIso = isoNow(options.clock);
    const currentSurface = sessionContext.device.platform === 'extension' ? 'extension' : 'web';
    if (
      requestRecord.userId !== sessionContext.user.userId ||
      requestRecord.approverSurface !== currentSurface ||
      requestRecord.approverDeviceId !== sessionContext.device.deviceId
    ) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (requestRecord.expiresAt <= nowIso) {
      return jsonResponse(
        200,
        UnlockGrantActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_expired',
        }),
      );
    }
    const lockRevisionMatches = await hasMatchingLinkLockRevision({
      userId: requestRecord.userId,
      requesterSurface: requestRecord.requesterSurface,
      requesterDeviceId: requestRecord.requesterDeviceId,
      approverDeviceId: requestRecord.approverDeviceId,
      expectedLockRevision: requestRecord.lockRevision,
    });
    if (!lockRevisionMatches) {
      return jsonResponse(
        200,
        UnlockGrantActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'lock_revision_mismatch',
        }),
      );
    }
    const approved = await options.storage.unlockGrants.approve({
      requestId: requestRecord.requestId,
      expectedStatus: 'pending',
      approvedAt: nowIso,
      approvedByDeviceId: sessionContext.device.deviceId,
      unlockAccountKey:
        typeof input.unlockAccountKey === 'string' && input.unlockAccountKey.trim().length > 0
          ? input.unlockAccountKey.trim()
          : null,
    });
    if (!approved) {
      return jsonResponse(
        200,
        UnlockGrantActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_not_pending',
        }),
      );
    }
    return jsonResponse(
      200,
      UnlockGrantActionOutputSchema.parse({
        ok: true,
        result: 'success_changed',
      }),
    );
  });

  app.post('/api/auth/unlock-grant/reject', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = UnlockGrantRejectInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.unlockGrants.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const nowIso = isoNow(options.clock);
    const currentSurface = sessionContext.device.platform === 'extension' ? 'extension' : 'web';
    if (
      requestRecord.userId !== sessionContext.user.userId ||
      requestRecord.approverSurface !== currentSurface ||
      requestRecord.approverDeviceId !== sessionContext.device.deviceId
    ) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const rejected = await options.storage.unlockGrants.reject({
      requestId: requestRecord.requestId,
      expectedStatus: 'pending',
      rejectedAt: nowIso,
      reasonCode: input.rejectionReasonCode ?? 'rejected_by_user',
    });
    if (!rejected) {
      return jsonResponse(
        200,
        UnlockGrantActionOutputSchema.parse({
          ok: true,
          result: 'conflict',
          reasonCode: 'request_not_pending',
        }),
      );
    }
    return jsonResponse(
      200,
      UnlockGrantActionOutputSchema.parse({
        ok: true,
        result: 'success_changed',
      }),
    );
  });

  app.post('/api/auth/unlock-grant/status', async (c) => {
    const nowIso = isoNow(options.clock);
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = UnlockGrantStatusInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.unlockGrants.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    const proofValid = await verifyUnlockGrantProof({
      requesterPublicKey: requestRecord.requesterPublicKey,
      signature: input.requestProof.signature,
      action: 'status',
      requestId: requestRecord.requestId,
      nonce: input.requestProof.nonce,
      clientNonce: requestRecord.requesterClientNonce,
      serverOrigin: requestRecord.serverOrigin,
      deploymentFingerprint: requestRecord.deploymentFingerprint,
    });
    if (!proofValid) {
      return jsonResponse(
        200,
        UnlockGrantStatusOutputSchema.parse({
          ok: true,
          status: 'denied',
          reasonCode: 'invalid_request_proof',
        }),
      );
    }
    if (requestRecord.expiresAt <= nowIso) {
      return jsonResponse(
        200,
        UnlockGrantStatusOutputSchema.parse({
          ok: true,
          status: 'expired',
        }),
      );
    }

    const statusRate = await options.storage.authRateLimits.increment({
      key: `unlock-grant:status:${requestRecord.requestId}`,
      nowIso,
      windowSeconds: UNLOCK_GRANT_STATUS_WINDOW_SECONDS,
    });
    if (statusRate.attemptCount > UNLOCK_GRANT_STATUS_ATTEMPT_LIMIT) {
      const nextInterval = Math.min(
        UNLOCK_GRANT_MAX_INTERVAL_SECONDS,
        UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS + UNLOCK_GRANT_STATUS_SLOWDOWN_SECONDS,
      );
      return jsonResponse(429, { ok: false, code: 'slow_down', interval: nextInterval });
    }

    if (requestRecord.status === 'pending') {
      return jsonResponse(
        200,
        UnlockGrantStatusOutputSchema.parse({
          ok: true,
          status: 'authorization_pending',
          interval: UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS,
        }),
      );
    }
    if (requestRecord.status === 'approved') {
      return jsonResponse(
        200,
        UnlockGrantStatusOutputSchema.parse({
          ok: true,
          status: 'approved',
          interval: UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS,
        }),
      );
    }
    if (requestRecord.status === 'rejected') {
      return jsonResponse(
        200,
        UnlockGrantStatusOutputSchema.parse({
          ok: true,
          status: 'rejected',
          reasonCode: requestRecord.rejectionReasonCode ?? undefined,
        }),
      );
    }
    return jsonResponse(
      200,
      UnlockGrantStatusOutputSchema.parse({
        ok: true,
        status: 'consumed',
      }),
    );
  });

  app.post('/api/auth/unlock-grant/consume', async (c) => {
    const nowIso = isoNow(options.clock);
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 24 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = UnlockGrantConsumeInputSchema.parse(parsedBody.body);
    const requestRecord = await options.storage.unlockGrants.findByRequestId(input.requestId);
    if (!requestRecord) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (
      requestRecord.serverOrigin !== configuredServerOrigin ||
      requestRecord.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    if (requestRecord.expiresAt <= nowIso) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_expired' });
    }
    const proofValid = await verifyUnlockGrantProof({
      requesterPublicKey: requestRecord.requesterPublicKey,
      signature: input.requestProof.signature,
      action: 'consume',
      requestId: requestRecord.requestId,
      nonce: input.requestProof.nonce,
      clientNonce: requestRecord.requesterClientNonce,
      serverOrigin: requestRecord.serverOrigin,
      deploymentFingerprint: requestRecord.deploymentFingerprint,
    });
    if (!proofValid) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (requestRecord.status !== 'approved') {
      if (requestRecord.status === 'consumed') {
        return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
      }
      return jsonResponse(409, { ok: false, code: 'authorization_pending' });
    }

    const user = await options.storage.users.findByUserId(requestRecord.userId);
    if (!user || user.lifecycleState !== 'active') {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const requesterDevice = await options.storage.devices.findById(requestRecord.requesterDeviceId);
    if (
      !requesterDevice ||
      requesterDevice.userId !== user.userId ||
      requesterDevice.deviceState !== 'active' ||
      requesterDevice.revokedAt !== null
    ) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const consumed = await options.storage.unlockGrants.consume({
      requestId: requestRecord.requestId,
      expectedStatus: 'approved',
      consumedAt: nowIso,
      consumedByDeviceId: requesterDevice.deviceId,
    });
    if (!consumed) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
    }

    const timeoutMs = await getEffectiveUnlockIdleTimeoutMs(user.userId);
    if (requestRecord.requesterSurface === 'extension') {
      const issued = await issueExtensionSession({
        storage: options.storage,
        clock: options.clock,
        idGenerator: options.idGenerator,
        user,
        device: requesterDevice,
        rotatedFromSessionId: null,
        ttlSeconds: Math.ceil(timeoutMs / 1000) * 3,
      });
      return jsonResponse(
        200,
        UnlockGrantConsumeOutputSchema.parse({
          ok: true,
          result: 'success_changed',
          extensionSessionToken: issued.token,
          sessionExpiresAt: issued.session.expiresAt,
          unlockAccountKey: consumed.unlockAccountKey ?? undefined,
          sessionState: 'local_unlock_required',
          user: {
            userId: user.userId,
            username: user.username,
            role: user.role,
            bundleVersion: user.bundleVersion,
            lifecycleState: user.lifecycleState,
          },
          device: {
            deviceId: requesterDevice.deviceId,
            deviceName: requesterDevice.deviceName,
            platform: requesterDevice.platform,
          },
        }),
      );
    }

    const webSession = await issueTrustedSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device: requesterDevice,
    });
    const response = jsonResponse(
      200,
      UnlockGrantConsumeOutputSchema.parse({
        ok: true,
        result: 'success_changed',
        sessionState: 'local_unlock_required',
        unlockAccountKey: consumed.unlockAccountKey ?? undefined,
        user: {
          userId: user.userId,
          username: user.username,
          role: user.role,
          bundleVersion: user.bundleVersion,
          lifecycleState: user.lifecycleState,
        },
        device: {
          deviceId: requesterDevice.deviceId,
          deviceName: requesterDevice.deviceName,
          platform: requesterDevice.platform,
        },
      }),
    );
    addSessionCookies(response, {
      sessionId: webSession.sessionId,
      csrfToken: webSession.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.post('/api/auth/web-bootstrap-grant/request', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext || sessionContext.authMode !== 'extension_bearer') {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 24 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = WebBootstrapGrantRequestInputSchema.parse(parsedBody.body);
    if (input.deploymentFingerprint !== options.deploymentFingerprint) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    const link = await options.storage.surfaceLinks.findByExtensionDeviceId(
      sessionContext.user.userId,
      sessionContext.device.deviceId,
    );
    if (!link) {
      return jsonResponse(409, { ok: false, code: 'no_linked_surface' });
    }
    const nowIso = isoNow(options.clock);
    const requestIp = resolveRequestIp(c.req.raw);
    const [ipRate, pairRate] = await Promise.all([
      options.storage.authRateLimits.increment({
        key: `web-bootstrap-request:ip:${requestIp}`,
        nowIso,
        windowSeconds: WEB_BOOTSTRAP_GRANT_REQUEST_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: `web-bootstrap-request:pair:${sessionContext.user.userId}:${sessionContext.device.deviceId}:${link.webDeviceId}`,
        nowIso,
        windowSeconds: WEB_BOOTSTRAP_GRANT_REQUEST_WINDOW_SECONDS,
      }),
    ]);
    if (
      ipRate.attemptCount > WEB_BOOTSTRAP_GRANT_REQUEST_IP_ATTEMPT_LIMIT ||
      pairRate.attemptCount > WEB_BOOTSTRAP_GRANT_REQUEST_PAIR_ATTEMPT_LIMIT
    ) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }
    const grantId = issueWebBootstrapGrantId();
    const expiresAt = addSeconds(nowIso, WEB_BOOTSTRAP_GRANT_TTL_SECONDS);
    await options.storage.webBootstrapGrants.create({
      grantId,
      userId: sessionContext.user.userId,
      deploymentFingerprint: options.deploymentFingerprint,
      serverOrigin: configuredServerOrigin,
      extensionDeviceId: sessionContext.device.deviceId,
      webDeviceId: link.webDeviceId,
      requesterPublicKey: input.requestPublicKey,
      requesterClientNonce: input.clientNonce,
      webChallenge: input.webChallenge,
      unlockAccountKey: input.unlockAccountKey,
      lockRevision: Math.max(0, Math.trunc(link.lockRevision ?? 0)),
      status: 'pending',
      createdAt: nowIso,
      expiresAt,
      consumedAt: null,
      consumedByDeviceId: null,
      revokedAt: null,
      revocationReasonCode: null,
    });
    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_web_bootstrap_grant_request',
      actorUserId: sessionContext.user.userId,
      targetType: 'web_bootstrap_grant',
      targetId: grantId,
      result: 'success_changed',
      reasonCode: null,
    });
    return jsonResponse(
      200,
      WebBootstrapGrantRequestOutputSchema.parse({
        ok: true,
        grantId,
        expiresAt,
        interval: WEB_BOOTSTRAP_GRANT_DEFAULT_INTERVAL_SECONDS,
        serverOrigin: configuredServerOrigin,
      }),
    );
  });

  app.post('/api/auth/web-bootstrap-grant/consume', async (c) => {
    const nowIso = isoNow(options.clock);
    const requestIp = resolveRequestIp(c.req.raw);
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 24 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = WebBootstrapGrantConsumeInputSchema.parse(parsedBody.body);
    const record = await options.storage.webBootstrapGrants.findByGrantId(input.grantId);
    if (!record) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const [ipRate, pairRate] = await Promise.all([
      options.storage.authRateLimits.increment({
        key: `web-bootstrap-consume:ip:${requestIp}`,
        nowIso,
        windowSeconds: WEB_BOOTSTRAP_GRANT_CONSUME_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: `web-bootstrap-consume:pair:${record.userId}:${record.extensionDeviceId}:${record.webDeviceId}`,
        nowIso,
        windowSeconds: WEB_BOOTSTRAP_GRANT_CONSUME_WINDOW_SECONDS,
      }),
    ]);
    if (
      ipRate.attemptCount > WEB_BOOTSTRAP_GRANT_CONSUME_IP_ATTEMPT_LIMIT ||
      pairRate.attemptCount > WEB_BOOTSTRAP_GRANT_CONSUME_PAIR_ATTEMPT_LIMIT
    ) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }
    if (
      record.serverOrigin !== configuredServerOrigin ||
      record.deploymentFingerprint !== options.deploymentFingerprint
    ) {
      return jsonResponse(409, { ok: false, code: 'pairing_context_mismatch' });
    }
    if (record.expiresAt <= nowIso) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_expired' });
    }
    const proofValid = await verifyWebBootstrapGrantProof({
      requesterPublicKey: record.requesterPublicKey,
      signature: input.requestProof.signature,
      action: 'consume',
      grantId: record.grantId,
      nonce: input.requestProof.nonce,
      clientNonce: record.requesterClientNonce,
      webChallenge: record.webChallenge,
      serverOrigin: record.serverOrigin,
      deploymentFingerprint: record.deploymentFingerprint,
    });
    if (!proofValid) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    if (record.status !== 'pending') {
      return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
    }
    const user = await options.storage.users.findByUserId(record.userId);
    const webDevice = await options.storage.devices.findById(record.webDeviceId);
    if (
      !user ||
      user.lifecycleState !== 'active' ||
      !webDevice ||
      webDevice.userId !== user.userId ||
      webDevice.platform !== 'web' ||
      webDevice.deviceState !== 'active' ||
      webDevice.revokedAt !== null
    ) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const link = await options.storage.surfaceLinks.findByPair(
      user.userId,
      record.webDeviceId,
      record.extensionDeviceId,
    );
    if (!link || Math.max(0, Math.trunc(link.lockRevision ?? 0)) !== record.lockRevision) {
      return jsonResponse(409, { ok: false, code: 'lock_revision_mismatch' });
    }
    const consumed = await options.storage.webBootstrapGrants.consume({
      grantId: record.grantId,
      expectedStatus: 'pending',
      consumedAt: nowIso,
      consumedByDeviceId: webDevice.deviceId,
    });
    if (!consumed) {
      return jsonResponse(409, { ok: false, code: 'pairing_code_already_used' });
    }

    const webSession = await issueTrustedSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device: webDevice,
    });
    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_web_bootstrap_grant_consume',
      actorUserId: user.userId,
      targetType: 'web_bootstrap_grant',
      targetId: consumed.grantId,
      result: 'success_changed',
      reasonCode: null,
    });
    const response = jsonResponse(
      200,
      WebBootstrapGrantConsumeOutputSchema.parse({
        ok: true,
        result: 'success_changed',
        sessionState: 'local_unlock_required',
        unlockAccountKey: consumed.unlockAccountKey,
        lockRevision: consumed.lockRevision,
        user: {
          userId: user.userId,
          username: user.username,
          role: user.role,
          bundleVersion: user.bundleVersion,
          lifecycleState: user.lifecycleState,
        },
        device: {
          deviceId: webDevice.deviceId,
          deviceName: webDevice.deviceName,
          platform: webDevice.platform,
        },
      }),
    );
    addSessionCookies(response, {
      sessionId: webSession.sessionId,
      csrfToken: webSession.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.post('/api/auth/extension/session/recover', async (c) => {
    const nowIso = isoNow(options.clock);
    const requestIp = resolveRequestIp(c.req.raw);
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = ExtensionSessionRecoverInputSchema.parse(parsedBody.body);

    const rate = await options.storage.authRateLimits.increment({
      key: `extension-session-recover:${requestIp}:${input.deviceId}`,
      nowIso,
      windowSeconds: EXTENSION_SESSION_RECOVER_WINDOW_SECONDS,
    });
    if (rate.attemptCount > EXTENSION_SESSION_RECOVER_ATTEMPT_LIMIT) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const recoverSecret = await options.storage.extensionSessionRecoverSecrets.findByDeviceId(input.deviceId);
    if (!recoverSecret) {
      return jsonResponse(409, { ok: false, code: 'no_linked_surface' });
    }
    if (!timingSafeSecretEquals(recoverSecret.secretHash, sha256Base64Url(input.sessionRecoverKey))) {
      return jsonResponse(401, { ok: false, code: 'recover_key_invalid' });
    }
    const user = await options.storage.users.findByUserId(recoverSecret.userId);
    const device = await options.storage.devices.findById(input.deviceId);
    if (
      !user ||
      user.lifecycleState !== 'active' ||
      !device ||
      device.userId !== user.userId ||
      device.platform !== 'extension' ||
      device.deviceState !== 'active' ||
      device.revokedAt !== null
    ) {
      return jsonResponse(409, { ok: false, code: 'device_revoked' });
    }

    const timeoutMs = await getEffectiveUnlockIdleTimeoutMs(user.userId);
    const issued = await issueExtensionSession({
      storage: options.storage,
      clock: options.clock,
      idGenerator: options.idGenerator,
      user,
      device,
      rotatedFromSessionId: null,
      ttlSeconds: Math.ceil(timeoutMs / 1000) * 3,
    });

    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_extension_session_recover',
      actorUserId: user.userId,
      targetType: 'device',
      targetId: device.deviceId,
      result: 'success_changed',
      reasonCode: null,
    });

    return jsonResponse(
      200,
      ExtensionSessionRecoverOutputSchema.parse({
        ok: true,
        result: 'success_changed',
        extensionSessionToken: issued.token,
        sessionExpiresAt: issued.session.expiresAt,
        user: {
          userId: user.userId,
          username: user.username,
          role: user.role,
          bundleVersion: user.bundleVersion,
          lifecycleState: user.lifecycleState,
        },
        device: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
        },
      }),
    );
  });

  app.post('/internal/icons/discovery/process', async (c) => {
    if (!internalIconsDiscoveryToken) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    if (!realtimeConfig.flags.icons_discovery_v2_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const receivedToken = c.req.raw.headers.get('x-vl-internal-token') ?? '';
    if (!receivedToken || !timingSafeSecretEquals(receivedToken, internalIconsDiscoveryToken)) {
      return jsonResponse(403, { ok: false, code: 'forbidden' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const payload = parsedBody.body as Partial<IconDiscoveryQueueMessage>;
    const queueMessage: IconDiscoveryQueueMessage = {
      domain: typeof payload.domain === 'string' ? payload.domain : '',
      userId: typeof payload.userId === 'string' ? payload.userId : '',
      sourceDeviceId:
        typeof payload.sourceDeviceId === 'string' && payload.sourceDeviceId.length > 0
          ? payload.sourceDeviceId
          : null,
      trigger:
        payload.trigger === 'domains_item' ||
        payload.trigger === 'domains_batch' ||
        payload.trigger === 'internal_requeue'
          ? payload.trigger
          : 'internal_requeue',
      requestedAt: typeof payload.requestedAt === 'string' ? payload.requestedAt : isoNow(options.clock),
    };
    const result = await processIconDiscoveryQueueMessage(queueMessage);
    return jsonResponse(200, {
      ok: true,
      status: result.status,
    });
  });

  app.get('/api/icons/state', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!realtimeConfig.flags.icons_state_sync_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const includeDomainsParam = c.req.query('domains');
    const includeDomains =
      typeof includeDomainsParam === 'string' && includeDomainsParam.trim().length > 0
        ? normalizeHostEntries(
            includeDomainsParam
              .split(',')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0),
          ).slice(0, ICONS_STATE_INCLUDE_DOMAINS_MAX)
        : undefined;
    const state = await buildUserIconsState({
      userId: sessionContext.user.userId,
      includeDomains,
    });
    const ifNoneMatch = c.req.raw.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === state.etag) {
      const response = new Response(null, {
        status: 304,
      });
      response.headers.set('etag', state.etag);
      response.headers.set('cache-control', 'private, max-age=0, must-revalidate');
      return response;
    }
    const payload = IconsStateOutputSchema.parse({
      ok: true,
      iconsVersion: state.iconsVersion,
      etag: state.etag,
      records: state.records,
      serverNow: isoNow(options.clock),
    });
    const response = jsonResponse(200, payload);
    response.headers.set('etag', state.etag);
    response.headers.set('cache-control', 'private, max-age=0, must-revalidate');
    return response;
  });

  app.put('/api/icons/domains/item', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    if (!realtimeConfig.flags.icons_state_sync_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 64 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = IconsDomainItemPutInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    const rateLimitResponse = await enforceIconsDomainWriteRateLimit({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      nowIso,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const normalizedHosts = normalizeHostEntries(input.hosts);
    const replaceResult = await options.storage.userIconItemDomains.replaceItemHosts({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      surface: sessionContext.device.platform,
      itemId: input.itemId,
      itemRevision: input.itemRevision,
      hosts: normalizedHosts,
      updatedAt: nowIso,
    });
    const pendingHosts = new Set<string>();
    const discoveryHosts = new Set<string>();
    if (replaceResult.result !== 'success_no_op_stale_revision') {
      for (const host of normalizedHosts) {
        pendingHosts.add(host);
      }
    }
    const existingStates = await options.storage.userIconState.listByUserIdAndDomains(
      sessionContext.user.userId,
      Array.from(pendingHosts),
    );
    const existingStateByDomain = new Map(existingStates.map((entry) => [entry.domain, entry]));

    if (replaceResult.result !== 'success_no_op_stale_revision') {
      for (const host of pendingHosts) {
        const existingState = existingStateByDomain.get(host) ?? null;
        if (!existingState) {
          await upsertIconStateAndPublish({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domain: host,
            status: 'pending',
            objectId: null,
            occurredAt: nowIso,
          });
        }
        if (!realtimeConfig.flags.icons_discovery_v2_v1) {
          continue;
        }
        if (!existingState) {
          discoveryHosts.add(host);
          continue;
        }
        if (
          shouldQueueIconDiscovery({
            status: existingState.status,
            updatedAt: existingState.updatedAt,
            domainsChanged: replaceResult.changed,
            nowIso,
          })
        ) {
          discoveryHosts.add(host);
        }
      }
    }
    if (realtimeConfig.flags.icons_discovery_v2_v1 && discoveryHosts.size > 0) {
      const waitUntil = resolveExecutionWaitUntil(c);
      const domains = Array.from(discoveryHosts);
      const task = iconsDiscoveryQueue
        ? enqueueIconDiscoveryJobs({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domains,
            trigger: 'domains_item',
            requestedAt: nowIso,
          })
        : processIconDiscoveryHostsInline({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domains,
            trigger: 'domains_item',
          });
      if (waitUntil) {
        waitUntil(task);
      } else {
        void task;
      }
    }

    return jsonResponse(
      200,
      IconsDomainItemPutOutputSchema.parse({
        ok: true,
        result: replaceResult.result,
        domainsChanged: replaceResult.changed,
        itemId: input.itemId,
        itemRevision: input.itemRevision,
        updatedAt: nowIso,
      }),
    );
  });

  app.post('/api/icons/domains/batch', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    if (!realtimeConfig.flags.icons_state_sync_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 512 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = IconsDomainBatchPutInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    const rateLimitResponse = await enforceIconsDomainWriteRateLimit({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      nowIso,
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const pendingHosts = new Set<string>();
    const hostsWithChangedDomains = new Set<string>();
    const results: Array<{
      itemId: string;
      itemRevision: number;
      result: 'success_changed' | 'success_no_op' | 'success_no_op_stale_revision';
      domainsChanged: boolean;
    }> = [];

    for (const entry of input.entries) {
      const normalizedHosts = normalizeHostEntries(entry.hosts);
      const replaceResult = await options.storage.userIconItemDomains.replaceItemHosts({
        userId: sessionContext.user.userId,
        deviceId: sessionContext.device.deviceId,
        surface: sessionContext.device.platform,
        itemId: entry.itemId,
        itemRevision: entry.itemRevision,
        hosts: normalizedHosts,
        updatedAt: nowIso,
      });
      results.push({
        itemId: entry.itemId,
        itemRevision: entry.itemRevision,
        result: replaceResult.result,
        domainsChanged: replaceResult.changed,
      });
      if (replaceResult.result === 'success_no_op_stale_revision') {
        continue;
      }
      for (const host of normalizedHosts) {
        pendingHosts.add(host);
        if (replaceResult.changed) {
          hostsWithChangedDomains.add(host);
        }
      }
    }

    const discoveryHosts = new Set<string>();
    const existingStates = await options.storage.userIconState.listByUserIdAndDomains(
      sessionContext.user.userId,
      Array.from(pendingHosts),
    );
    const existingStateByDomain = new Map(existingStates.map((entry) => [entry.domain, entry]));
    for (const host of pendingHosts) {
      const existingState = existingStateByDomain.get(host) ?? null;
      if (!existingState) {
        await upsertIconStateAndPublish({
          userId: sessionContext.user.userId,
          sourceDeviceId: sessionContext.device.deviceId,
          domain: host,
          status: 'pending',
          objectId: null,
          occurredAt: nowIso,
        });
      }
      if (!realtimeConfig.flags.icons_discovery_v2_v1) {
        continue;
      }
      if (!existingState) {
        discoveryHosts.add(host);
        continue;
      }
      if (
        shouldQueueIconDiscovery({
          status: existingState.status,
          updatedAt: existingState.updatedAt,
          domainsChanged: hostsWithChangedDomains.has(host),
          nowIso,
        })
      ) {
        discoveryHosts.add(host);
      }
    }

    if (realtimeConfig.flags.icons_discovery_v2_v1 && discoveryHosts.size > 0) {
      const waitUntil = resolveExecutionWaitUntil(c);
      const domains = Array.from(discoveryHosts);
      const task = iconsDiscoveryQueue
        ? enqueueIconDiscoveryJobs({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domains,
            trigger: 'domains_batch',
            requestedAt: nowIso,
          })
        : processIconDiscoveryHostsInline({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domains,
            trigger: 'domains_batch',
          });
      if (waitUntil) {
        waitUntil(task);
      } else {
        void task;
      }
    }

    return jsonResponse(
      200,
      IconsDomainBatchPutOutputSchema.parse({
        ok: true,
        acceptedItems: results.filter((entry) => entry.result !== 'success_no_op_stale_revision').length,
        entries: results,
        updatedAt: nowIso,
      }),
    );
  });

  app.post('/api/icons/domains/reindex/start', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    if (!realtimeConfig.flags.icons_state_sync_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 8 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = IconsDomainReindexStartInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    await options.storage.userIconItemDomains.startReindex({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      surface: sessionContext.device.platform,
      generationId: input.generationId,
      startedAt: nowIso,
    });
    return jsonResponse(
      200,
      IconsDomainReindexOutputSchema.parse({
        ok: true,
        result: 'success_changed',
        generationId: input.generationId,
        acceptedItems: 0,
        updatedAt: nowIso,
      }),
    );
  });

  app.post('/api/icons/domains/reindex/chunk', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    if (!realtimeConfig.flags.icons_state_sync_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 512 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = IconsDomainReindexChunkInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    const normalizedEntries = input.entries.map((entry) => ({
      itemId: entry.itemId,
      itemRevision: entry.itemRevision,
      hosts: normalizeHostEntries(entry.hosts),
    }));
    const output = await options.storage.userIconItemDomains.upsertReindexChunk({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      surface: sessionContext.device.platform,
      generationId: input.generationId,
      entries: normalizedEntries,
      updatedAt: nowIso,
    });
    return jsonResponse(
      200,
      IconsDomainReindexOutputSchema.parse({
        ok: true,
        result: 'success_changed',
        generationId: input.generationId,
        acceptedItems: output.acceptedItems,
        updatedAt: nowIso,
      }),
    );
  });

  app.post('/api/icons/domains/reindex/commit', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    if (!realtimeConfig.flags.icons_state_sync_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 8 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = IconsDomainReindexCommitInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    const committed = await options.storage.userIconItemDomains.commitReindex({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      surface: sessionContext.device.platform,
      generationId: input.generationId,
      updatedAt: nowIso,
    });
    return jsonResponse(
      200,
      IconsDomainReindexOutputSchema.parse({
        ok: true,
        result: committed.changed ? 'success_changed' : 'success_no_op',
        generationId: input.generationId,
        acceptedItems: 0,
        updatedAt: nowIso,
      }),
    );
  });

  app.post('/api/icons/object-tickets', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 32 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = IconsObjectTicketIssueInputSchema.parse(parsedBody.body);
    const ttlSeconds = Math.min(
      ICONS_OBJECT_TICKET_TTL_SECONDS_MAX,
      Math.max(1, Math.trunc(input.ttlSeconds ?? ICONS_OBJECT_TICKET_TTL_SECONDS_DEFAULT)),
    );
    const nowUnixSeconds = Math.floor(options.clock.now().getTime() / 1000);
    const expiresAt = new Date((nowUnixSeconds + ttlSeconds) * 1000).toISOString();
    const tickets: Array<{ objectId: string; ticket: string }> = [];
    for (const objectId of input.objectIds) {
      const object = await options.storage.iconObjects.findByObjectId(objectId);
      if (!object || object.objectClass !== 'manual_private') {
        continue;
      }
      if (object.ownerUserId !== sessionContext.user.userId) {
        continue;
      }
      tickets.push({
        objectId,
        ticket: createIconObjectTicket({
          userId: sessionContext.user.userId,
          objectId,
          expUnixSeconds: nowUnixSeconds + ttlSeconds,
          secret: iconsTicketSecret,
        }),
      });
    }
    return jsonResponse(
      200,
      IconsObjectTicketIssueOutputSchema.parse({
        ok: true,
        expiresAt,
        tickets,
      }),
    );
  });

  app.get('/icons/a/:sha256', async (c) => {
    if (!iconBlobBucket) {
      return jsonResponse(503, { ok: false, code: 'icon_blob_bucket_unavailable' });
    }
    const sha256 = String(c.req.param('sha256') ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const object = await options.storage.iconObjects.findByClassAndSha256({
      objectClass: 'automatic_public',
      sha256,
    });
    if (!object) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const blob = await iconBlobBucket.get(object.r2Key);
    if (!blob) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const headers = new Headers();
    headers.set('content-type', blob.httpMetadata?.contentType || object.contentType || 'image/png');
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('etag', `"${object.sha256}"`);
    headers.set('access-control-allow-origin', '*');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "default-src 'none'; img-src 'none'; style-src 'none'; script-src 'none';");
    return new Response(await blob.arrayBuffer(), {
      status: 200,
      headers,
    });
  });

  app.get('/icons/m/:objectId', async (c) => {
    if (!iconBlobBucket) {
      return jsonResponse(503, { ok: false, code: 'icon_blob_bucket_unavailable' });
    }
    const objectId = String(c.req.param('objectId') ?? '').trim();
    const ticket = String(c.req.query('ticket') ?? '').trim();
    if (!objectId || !ticket) {
      return jsonResponse(401, { ok: false, code: 'invalid_ticket' });
    }
    const ticketValidation = verifyIconObjectTicket({
      ticket,
      nowUnixSeconds: Math.floor(options.clock.now().getTime() / 1000),
      secret: iconsTicketSecret,
    });
    if (!ticketValidation.ok) {
      return jsonResponse(401, { ok: false, code: 'invalid_ticket' });
    }
    if (ticketValidation.objectId !== objectId) {
      return jsonResponse(401, { ok: false, code: 'invalid_ticket' });
    }
    const object = await options.storage.iconObjects.findByObjectId(objectId);
    if (!object || object.objectClass !== 'manual_private' || object.ownerUserId !== ticketValidation.userId) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const blob = await iconBlobBucket.get(object.r2Key);
    if (!blob) {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    const headers = new Headers();
    headers.set('content-type', blob.httpMetadata?.contentType || object.contentType || 'image/png');
    headers.set('cache-control', 'private, no-store');
    headers.set('pragma', 'no-cache');
    headers.set('cdn-cache-control', 'no-store');
    const allowedCorsOrigin = resolveAllowedIconCorsOrigin(c.req.raw);
    if (allowedCorsOrigin) {
      headers.set('access-control-allow-origin', allowedCorsOrigin);
      headers.set('vary', 'origin');
    }
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "default-src 'none'; img-src 'none'; style-src 'none'; script-src 'none';");
    return new Response(await blob.arrayBuffer(), {
      status: 200,
      headers,
    });
  });

  app.post('/api/icons/resolve', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!realtimeConfig.flags.icons_http_fallback_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 32 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = SiteIconResolveBatchInputSchema.parse(parsedBody.body);
    const domains = normalizeSiteIconDomains(input.domains);
    if (domains.length === 0) {
      return jsonResponse(
        200,
        SiteIconResolveBatchOutputSchema.parse({
          ok: true,
          icons: [],
        }),
      );
    }

    const manualIcons = await options.storage.manualSiteIconOverrides.listByUserIdAndDomains(
      sessionContext.user.userId,
      domains,
    );
    const manualDomains = new Set(manualIcons.map((entry) => entry.domain));
    const automaticDomains = domains.filter((domain) => !manualDomains.has(domain));
    const automaticIcons =
      automaticDomains.length > 0 ? await options.storage.siteIconCache.listByDomains(automaticDomains) : [];
    const merged = mergeResolvedSiteIcons({
      domains,
      manual: manualIcons,
      automatic: automaticIcons,
    });

    return jsonResponse(
      200,
      SiteIconResolveBatchOutputSchema.parse({
        ok: true,
        icons: merged,
      }),
    );
  });

  app.post('/api/icons/discover', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!realtimeConfig.flags.icons_http_fallback_v1) {
      return jsonResponse(404, { ok: false, code: 'feature_disabled' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 32 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = SiteIconDiscoverBatchInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    const domains = normalizeSiteIconDomains(input.domains);
    if (domains.length === 0) {
      return jsonResponse(
        200,
        SiteIconDiscoverBatchOutputSchema.parse({
          ok: true,
          icons: [],
          unresolved: [],
        }),
      );
    }

    const manualIcons = await options.storage.manualSiteIconOverrides.listByUserIdAndDomains(
      sessionContext.user.userId,
      domains,
    );
    const manualDomains = new Set(manualIcons.map((entry) => entry.domain));
    const discoverableDomains = domains.filter((domain) => !manualDomains.has(domain));

    const existingAutomatic: AutomaticSiteIconRecord[] = input.forceRefresh
      ? []
      : await options.storage.siteIconCache.listByDomains(discoverableDomains);
    const existingAutomaticByDomain = new Map<string, AutomaticSiteIconRecord>(
      existingAutomatic.map((entry) => [entry.domain, entry]),
    );
    const targetDiscoveryDomains = discoverableDomains.filter(
      (domain) => input.forceRefresh === true || !existingAutomaticByDomain.has(domain),
    );

    const discovery = await discoverAndPersistSiteIcons({
      domains: targetDiscoveryDomains,
      nowIso,
      storage: options.storage,
    });

    const automaticMerged: AutomaticSiteIconRecord[] = [...existingAutomatic];
    for (const discovered of discovery.discovered) {
      existingAutomaticByDomain.set(discovered.domain, {
        domain: discovered.domain,
        dataUrl: discovered.dataUrl,
        sourceUrl: discovered.sourceUrl,
        resolvedBy: discovered.resolvedBy,
        finalUrl: discovered.finalUrl ?? null,
        candidateCount: discovered.candidateCount,
        reasonCode: discovered.reasonCode,
        fetchedAt: discovered.updatedAt,
        updatedAt: discovered.updatedAt,
      });
    }
    if (input.forceRefresh) {
      automaticMerged.splice(
        0,
        automaticMerged.length,
        ...Array.from(existingAutomaticByDomain.values()),
      );
    } else {
      automaticMerged.push(
        ...discovery.discovered.map((entry) => ({
          domain: entry.domain,
          dataUrl: entry.dataUrl,
          sourceUrl: entry.sourceUrl,
          resolvedBy: entry.resolvedBy,
          finalUrl: entry.finalUrl ?? null,
          candidateCount: entry.candidateCount,
          reasonCode: entry.reasonCode,
          fetchedAt: entry.updatedAt,
          updatedAt: entry.updatedAt,
        })),
      );
    }
    const merged = mergeResolvedSiteIcons({
      domains,
      manual: manualIcons,
      automatic: automaticMerged,
    });
    const unresolved = discovery.unresolved.filter((domain) => !existingAutomaticByDomain.has(domain));

    if (realtimeConfig.flags.icons_state_sync_v1) {
      for (const entry of merged) {
        if (entry.source !== 'automatic') {
          continue;
        }
        try {
          const object = await persistIconObjectFromDataUrl({
            userId: sessionContext.user.userId,
            objectClass: 'automatic_public',
            dataUrl: entry.dataUrl,
            nowIso,
          });
          await upsertIconStateAndPublish({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domain: entry.domain,
            status: 'ready',
            objectId: object.objectId,
            occurredAt: nowIso,
          });
        } catch {
          await upsertIconStateAndPublish({
            userId: sessionContext.user.userId,
            sourceDeviceId: sessionContext.device.deviceId,
            domain: entry.domain,
            status: 'absent',
            objectId: null,
            occurredAt: nowIso,
          });
        }
      }
      for (const unresolvedDomain of unresolved) {
        await upsertIconStateAndPublish({
          userId: sessionContext.user.userId,
          sourceDeviceId: sessionContext.device.deviceId,
          domain: unresolvedDomain,
          status: 'absent',
          objectId: null,
          occurredAt: nowIso,
        });
      }
    }

    await publishRealtimeEvent({
      userId: sessionContext.user.userId,
      topic: 'icons.discover.resolved',
      sourceDeviceId: sessionContext.device.deviceId,
      occurredAt: nowIso,
      payload: {
        icons: merged,
        unresolved,
        updatedAt: nowIso,
      },
    });

    return jsonResponse(
      200,
      SiteIconDiscoverBatchOutputSchema.parse({
        ok: true,
        icons: merged,
        unresolved,
      }),
    );
  });

  app.get('/api/icons/manual', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    const manual = await options.storage.manualSiteIconOverrides.listByUserId(sessionContext.user.userId);
    const payload = SiteIconManualListOutputSchema.parse({
      ok: true,
      icons: manual.map((entry) => ({
        domain: entry.domain,
        dataUrl: entry.dataUrl,
        source: entry.source,
        updatedAt: entry.updatedAt,
      })),
    });
    const etag = stableManualIconsEtag({
      userId: sessionContext.user.userId,
      icons: payload.icons,
    });
    const ifNoneMatch = c.req.raw.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      const response = new Response(null, { status: 304 });
      response.headers.set('etag', etag);
      response.headers.set('cache-control', 'private, max-age=0, must-revalidate');
      return addSecurityHeaders(response);
    }
    const response = jsonResponse(200, payload);
    response.headers.set('etag', etag);
    response.headers.set('cache-control', 'private, max-age=0, must-revalidate');
    return response;
  });

  app.post('/api/icons/manual/upsert', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie') {
      if (!hasValidCsrf(c.req.raw)) {
        return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
      }
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 2 * 1024 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = SiteIconManualUpsertInputSchema.parse(parsedBody.body);
    if (!isSafeIconDataUrl(input.dataUrl)) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    const previous = await options.storage.manualSiteIconOverrides.findByUserIdAndDomain(
      sessionContext.user.userId,
      input.domain,
    );
    const nowIso = isoNow(options.clock);
    await options.storage.manualSiteIconOverrides.upsert({
      userId: sessionContext.user.userId,
      domain: input.domain,
      dataUrl: input.dataUrl,
      source: input.source,
      updatedAt: nowIso,
    });
    if (realtimeConfig.flags.icons_state_sync_v1) {
      try {
        const object = await persistIconObjectFromDataUrl({
          userId: sessionContext.user.userId,
          objectClass: 'manual_private',
          dataUrl: input.dataUrl,
          nowIso,
        });
        await upsertIconStateAndPublish({
          userId: sessionContext.user.userId,
          sourceDeviceId: sessionContext.device.deviceId,
          domain: input.domain,
          status: 'ready',
          objectId: object.objectId,
          occurredAt: nowIso,
        });
      } catch {
        await upsertIconStateAndPublish({
          userId: sessionContext.user.userId,
          sourceDeviceId: sessionContext.device.deviceId,
          domain: input.domain,
          status: 'absent',
          objectId: null,
          occurredAt: nowIso,
        });
      }
    }
    const noChanges = previous?.dataUrl === input.dataUrl && previous.source === input.source;
    if (!noChanges) {
      await publishRealtimeEvent({
        userId: sessionContext.user.userId,
        topic: 'icons.manual.upserted',
        sourceDeviceId: sessionContext.device.deviceId,
        occurredAt: nowIso,
        payload: {
          domain: input.domain,
          dataUrl: input.dataUrl,
          source: input.source,
          updatedAt: nowIso,
        },
      });
    }
    return jsonResponse(
      200,
      SiteIconManualActionOutputSchema.parse({
        ok: true,
        result: noChanges ? 'success_no_op' : 'success_changed',
      }),
    );
  });

  app.post('/api/icons/manual/remove', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie') {
      if (!hasValidCsrf(c.req.raw)) {
        return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
      }
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 8 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = SiteIconManualRemoveInputSchema.parse(parsedBody.body);
    const changed = await options.storage.manualSiteIconOverrides.remove(
      sessionContext.user.userId,
      input.domain,
    );
    if (changed && realtimeConfig.flags.icons_state_sync_v1) {
      await removeIconStateAndPublish({
        userId: sessionContext.user.userId,
        sourceDeviceId: sessionContext.device.deviceId,
        domain: input.domain,
        occurredAt: isoNow(options.clock),
      });
    }
    if (changed) {
      await publishRealtimeEvent({
        userId: sessionContext.user.userId,
        topic: 'icons.manual.removed',
        sourceDeviceId: sessionContext.device.deviceId,
        payload: {
          domain: input.domain,
          updatedAt: isoNow(options.clock),
        },
      });
    }
    return jsonResponse(
      200,
      SiteIconManualActionOutputSchema.parse({
        ok: true,
        result: changed ? 'success_changed' : 'success_no_op',
      }),
    );
  });

  app.get('/api/password-generator/history', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    const entries = await options.storage.passwordGeneratorHistory.listByUserId(
      sessionContext.user.userId,
      PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES,
    );
    return jsonResponse(
      200,
      PasswordGeneratorHistoryListOutputSchema.parse({
        ok: true,
        entries: entries.map((entry) => ({
          entryId: entry.entryId,
          encryptedPayload: entry.encryptedPayload,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
      }),
    );
  });

  app.post('/api/password-generator/history/upsert', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 64 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = PasswordGeneratorHistoryUpsertInputSchema.parse(parsedBody.body);
    const beforeEntries = await options.storage.passwordGeneratorHistory.listByUserId(
      sessionContext.user.userId,
      PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES + 1,
    );
    const nowIso = isoNow(options.clock);
    await options.storage.passwordGeneratorHistory.upsert({
      userId: sessionContext.user.userId,
      entryId: input.entryId,
      encryptedPayload: input.encryptedPayload,
      createdAt: input.createdAt,
      updatedAt: nowIso,
    });
    await options.storage.passwordGeneratorHistory.pruneByUserId(
      sessionContext.user.userId,
      PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES,
    );
    const afterEntries = await options.storage.passwordGeneratorHistory.listByUserId(
      sessionContext.user.userId,
      PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES + 1,
    );
    const afterById = new Set(afterEntries.map((entry) => entry.entryId));
    const removedEntries = beforeEntries.filter((entry) => !afterById.has(entry.entryId));
    await publishRealtimeEvent({
      userId: sessionContext.user.userId,
      topic: 'password_history.upserted',
      sourceDeviceId: sessionContext.device.deviceId,
      occurredAt: nowIso,
      payload: {
        entryId: input.entryId,
        encryptedPayload: input.encryptedPayload,
        createdAt: input.createdAt,
        updatedAt: nowIso,
      },
    });
    for (const removedEntry of removedEntries) {
      await publishRealtimeEvent({
        userId: sessionContext.user.userId,
        topic: 'password_history.removed',
        sourceDeviceId: sessionContext.device.deviceId,
        occurredAt: nowIso,
        payload: {
          entryId: removedEntry.entryId,
          removedAt: nowIso,
        },
      });
    }
    return jsonResponse(
      200,
      PasswordGeneratorHistoryActionOutputSchema.parse({
        ok: true,
        result: 'success_changed',
      }),
    );
  });

  app.get('/api/auth/session-policy', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    const unlockIdleTimeoutMs = await getEffectiveUnlockIdleTimeoutMs(sessionContext.user.userId);
    return jsonResponse(
      200,
      SessionPolicyOutputSchema.parse({
        ok: true,
        policy: {
          unlockIdleTimeoutMs,
        },
        bounds: sessionPolicyBounds(),
      }),
    );
  });

  app.post('/api/auth/session-policy', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 16 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = SessionPolicyUpdateInputSchema.parse(parsedBody.body);
    const normalizedTimeout = normalizeUnlockIdleTimeoutMs(input.unlockIdleTimeoutMs);
    await options.storage.sessionPolicies.upsert({
      userId: sessionContext.user.userId,
      unlockIdleTimeoutMs: normalizedTimeout,
      updatedAt: isoNow(options.clock),
    });

    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_session_policy_update',
      actorUserId: sessionContext.user.userId,
      targetType: 'session_policy',
      targetId: sessionContext.user.userId,
      result: 'success_changed',
      reasonCode: null,
    });

    return jsonResponse(
      200,
      SessionPolicyOutputSchema.parse({
        ok: true,
        policy: {
          unlockIdleTimeoutMs: normalizedTimeout,
        },
        bounds: sessionPolicyBounds(),
      }),
    );
  });

  app.post('/api/auth/session/lock', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (sessionContext.authMode === 'cookie' && !hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: 8 * 1024,
      tooLargeCode: 'request_body_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const input = SessionLockInputSchema.parse(parsedBody.body);
    const nowIso = isoNow(options.clock);
    const lockRevision = await bumpLinkedSurfaceLockRevision({
      userId: sessionContext.user.userId,
      deviceId: sessionContext.device.deviceId,
      nowIso,
    });
    await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_session_lock',
      actorUserId: sessionContext.user.userId,
      targetType: 'session_lock',
      targetId: sessionContext.device.deviceId,
      result: 'success_changed',
      reasonCode: input.reasonCode ?? null,
    });
    await invalidateRealtimeConnections({
      userId: sessionContext.user.userId,
      code: 'lock_revision_advanced',
      message: 'Lock revision advanced for linked surface pair.',
    });
    return jsonResponse(
      200,
      SessionLockOutputSchema.parse({
        ok: true,
        lockRevision,
        appliedScope: 'linked_surface_pair',
      }),
    );
  });

  app.get('/api/auth/session/restore', async (c) => {
    const deploymentState = await options.storage.deploymentState.get();
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });

    if (!sessionContext) {
      return jsonResponse(
        200,
        SessionRestoreResponseSchema.parse({
          ok: true,
          sessionState: 'remote_authentication_required',
          unlockIdleTimeoutMs: SESSION_POLICY_DEFAULT_UNLOCK_IDLE_TIMEOUT_MS,
          unlockGrantEnabled: true,
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
          unlockIdleTimeoutMs: SESSION_POLICY_DEFAULT_UNLOCK_IDLE_TIMEOUT_MS,
          unlockGrantEnabled: true,
        }),
      );
    }

    const unlockIdleTimeoutMs = await getEffectiveUnlockIdleTimeoutMs(sessionContext.user.userId);
    const lockRevision = await resolveEffectiveLockRevision({
      userId: sessionContext.user.userId,
      device: sessionContext.device,
    });
    let extensionToken: string | undefined;
    let extensionExpiresAt: string | undefined;
    if (sessionContext.authMode === 'extension_bearer') {
      const nowMillis = parseIsoTimestamp(isoNow(options.clock));
      const expiresAtMillis = parseIsoTimestamp(sessionContext.session.expiresAt);
      const remainingMillis = expiresAtMillis - nowMillis;
      if (remainingMillis < EXTENSION_SESSION_ROTATE_THRESHOLD_SECONDS * 1000) {
        const rotated = await issueExtensionSession({
          storage: options.storage,
          clock: options.clock,
          idGenerator: options.idGenerator,
          user: sessionContext.user,
          device: sessionContext.device,
          rotatedFromSessionId: sessionContext.session.sessionId,
          ttlSeconds: Math.ceil(unlockIdleTimeoutMs / 1000) * 3,
        });
        await options.storage.sessions.revoke(sessionContext.session.sessionId, isoNow(options.clock));
        extensionToken = rotated.token;
        extensionExpiresAt = rotated.session.expiresAt;
      } else {
        extensionExpiresAt = sessionContext.session.expiresAt;
      }
    }

    return jsonResponse(
      200,
      SessionRestoreResponseSchema.parse({
        ok: true,
        sessionState: 'local_unlock_required',
        extensionSessionToken: extensionToken,
        sessionExpiresAt: extensionExpiresAt,
        unlockIdleTimeoutMs,
        unlockGrantEnabled: true,
        lockRevision,
        lockScope: 'linked_surface_pair',
        user: {
          userId: sessionContext.user.userId,
          username: sessionContext.user.username,
          role: sessionContext.user.role,
          bundleVersion: sessionContext.user.bundleVersion,
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

  app.get('/api/auth/devices', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const [devices, sessions] = await Promise.all([
      options.storage.devices.listByUserId(sessionContext.user.userId),
      options.storage.sessions.listByUserId(sessionContext.user.userId),
    ]);

    const lastAuthenticatedAtByDevice = new Map<string, string>();
    for (const session of sessions) {
      const candidates = [session.createdAt, session.recentReauthAt].filter(
        (candidate): candidate is string => candidate !== null,
      );
      if (candidates.length === 0) {
        continue;
      }
      const latestForSession = candidates.reduce((latest, value) =>
        parseIsoTimestamp(value) > parseIsoTimestamp(latest) ? value : latest,
      );
      const currentLatest = lastAuthenticatedAtByDevice.get(session.deviceId);
      if (!currentLatest || parseIsoTimestamp(latestForSession) > parseIsoTimestamp(currentLatest)) {
        lastAuthenticatedAtByDevice.set(session.deviceId, latestForSession);
      }
    }

    const body = DeviceListOutputSchema.parse({
      devices: devices
        .map((device) => ({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
          deviceState: device.deviceState,
          createdAt: device.createdAt,
          revokedAt: device.revokedAt,
          isCurrentDevice: device.deviceId === sessionContext.session.deviceId,
          lastAuthenticatedAt: lastAuthenticatedAtByDevice.get(device.deviceId) ?? null,
        }))
        .sort((left, right) => {
          if (left.isCurrentDevice !== right.isCurrentDevice) {
            return left.isCurrentDevice ? -1 : 1;
          }
          return right.createdAt.localeCompare(left.createdAt);
        }),
    });

    return jsonResponse(200, body);
  });

  app.post('/api/auth/devices/:deviceId/revoke', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }
    const nowIso = isoNow(options.clock);
    if (!hasValidRecentReauth({ nowIso, session: sessionContext.session })) {
      return jsonResponse(403, { ok: false, code: 'recent_reauth_required' });
    }

    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const idempotencyKey = c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }

    const targetDeviceId = c.req.param('deviceId');
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: '/api/auth/devices/:deviceId/revoke',
      actorScope: getActorScope({
        deploymentFingerprint: options.deploymentFingerprint,
        userId: sessionContext.user.userId,
        sessionId: sessionContext.session.sessionId,
      }),
      idempotencyKey,
    });
    const payloadHash = toPayloadHash({
      targetDeviceId,
      sessionId: sessionContext.session.sessionId,
      deviceId: sessionContext.session.deviceId,
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

    const targetDevice = await options.storage.devices.findById(targetDeviceId);
    if (!targetDevice || targetDevice.userId !== sessionContext.user.userId) {
      const notFoundBody = { ok: false, code: 'device_not_found' };
      return jsonResponse(404, notFoundBody);
    }

    let result: CanonicalResult = 'success_changed';
    let reasonCode: string | null = null;
    if (targetDevice.deviceId === sessionContext.session.deviceId) {
      result = 'conflict';
      reasonCode = 'cannot_revoke_current_device';
    } else if (targetDevice.deviceState !== 'active' || targetDevice.revokedAt !== null) {
      result = 'success_no_op';
      reasonCode = 'device_already_revoked';
    } else {
      await options.storage.revokeDeviceAndSessionsAtomic({
        userId: sessionContext.user.userId,
        deviceId: targetDevice.deviceId,
        revokedAtIso: nowIso,
      });
      await invalidateRealtimeConnections({
        userId: sessionContext.user.userId,
        code: 'session_revoked',
        message: 'A trusted device/session was revoked.',
      });
    }

    const body = DeviceRevokeOutputSchema.parse({
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
      eventType: 'auth_device_revoke',
      actorUserId: sessionContext.user.userId,
      targetType: 'device',
      targetId: targetDevice.deviceId,
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
      resourceRefs: `device:${targetDevice.deviceId}`,
      auditEventId: audit.eventId,
    });
    return jsonResponse(statusCode, body);
  });

  app.post('/api/auth/password-rotation/complete', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const deploymentState = await options.storage.deploymentState.get();
    if (deploymentState.bootstrapState !== 'INITIALIZED') {
      return jsonResponse(409, { ok: false, code: 'initialization_pending' });
    }

    const nowIso = isoNow(options.clock);
    if (!hasValidRecentReauth({ nowIso, session: sessionContext.session })) {
      return jsonResponse(403, { ok: false, code: 'recent_reauth_required' });
    }

    const idempotencyKey = c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return jsonResponse(400, { ok: false, code: 'idempotency_key_required' });
    }

    const input = PasswordRotationInputSchema.parse(await c.req.json());
    const idempotencyScope = getIdempotencyScope({
      method: 'POST',
      routeTemplate: '/api/auth/password-rotation/complete',
      actorScope: `deployment:${options.deploymentFingerprint}:user:${sessionContext.user.userId}:password-rotation`,
      idempotencyKey,
    });
    const payloadHash = toPayloadHash({
      input,
      userId: sessionContext.user.userId,
      deviceId: sessionContext.session.deviceId,
    });
    const existingIdempotency = await options.storage.idempotency.get(idempotencyScope, nowIso);
    if (existingIdempotency) {
      if (existingIdempotency.payloadHash !== payloadHash) {
        return jsonResponse(409, { ok: false, code: 'idempotency_key_reuse_conflict' });
      }
      return jsonResponse(existingIdempotency.statusCode, JSON.parse(existingIdempotency.responseBody));
    }

    const rotatedSession = buildTrustedSessionRecord({
      clock: options.clock,
      idGenerator: options.idGenerator,
      user: sessionContext.user,
      device: sessionContext.device,
    });
    const newSession: SessionRecord = {
      ...rotatedSession,
      recentReauthAt: nowIso,
      rotatedFromSessionId: sessionContext.session.sessionId,
    };

    let rotated;
    try {
      rotated = await options.storage.rotatePasswordAtomic({
        userId: sessionContext.user.userId,
        currentSessionId: sessionContext.session.sessionId,
        currentAuthVerifier: input.currentAuthProof,
        nextAuthSalt: input.nextAuthSalt,
        nextAuthVerifier: input.nextAuthVerifier,
        nextEncryptedAccountBundle: input.nextEncryptedAccountBundle,
        nextAccountKeyWrapped: input.nextAccountKeyWrapped,
        expectedBundleVersion: input.expected_bundle_version,
        updatedAtIso: nowIso,
        revokedAtIso: nowIso,
        newSession,
      });
    } catch (error) {
      let result: CanonicalResult = 'conflict';
      let statusCode = 409;
      let code = 'password_rotation_failed';
      let reasonCode: string | null = 'password_rotation_failed';

      if (error instanceof Error && error.message === 'invalid_credentials') {
        result = 'denied';
        statusCode = 401;
        code = 'invalid_credentials';
        reasonCode = 'invalid_credentials';
      } else if (error instanceof Error && error.message === 'stale_bundle_version') {
        code = 'stale_bundle_version';
        reasonCode = 'stale_bundle_version';
      } else if (
        error instanceof Error &&
        (error.message === 'unauthorized' || error.message === 'user_not_found')
      ) {
        code = 'rotation_context_invalid';
        reasonCode = 'rotation_context_invalid';
      }

      const failureBody = {
        ok: false,
        code,
      };
      const audit = await createAuditEvent({
        storage: options.storage,
        idGenerator: options.idGenerator,
        clock: options.clock,
        request: c.req.raw,
        eventType: 'auth_password_rotation_complete',
        actorUserId: sessionContext.user.userId,
        targetType: 'user',
        targetId: sessionContext.user.userId,
        result,
        reasonCode,
      });
      await persistIdempotencyResult({
        storage: options.storage,
        clock: options.clock,
        scope: idempotencyScope,
        payloadHash,
        statusCode,
        responseBody: failureBody,
        result,
        reasonCode,
        resourceRefs: `user:${sessionContext.user.userId}`,
        auditEventId: audit.eventId,
      });
      return jsonResponse(statusCode, failureBody);
    }

    const body = PasswordRotationCompleteOutputSchema.parse({
      ok: true,
      result: toCanonicalResult('success_changed'),
      bundleVersion: rotated.user.bundleVersion,
      user: {
        userId: rotated.user.userId,
        username: rotated.user.username,
        role: rotated.user.role,
        bundleVersion: rotated.user.bundleVersion,
        lifecycleState: rotated.user.lifecycleState,
      },
      device: {
        deviceId: sessionContext.device.deviceId,
        deviceName: sessionContext.device.deviceName,
        platform: sessionContext.device.platform,
      },
    });
    const audit = await createAuditEvent({
      storage: options.storage,
      idGenerator: options.idGenerator,
      clock: options.clock,
      request: c.req.raw,
      eventType: 'auth_password_rotation_complete',
      actorUserId: rotated.user.userId,
      targetType: 'user',
      targetId: rotated.user.userId,
      result: 'success_changed',
      reasonCode: null,
    });
    await persistIdempotencyResult({
      storage: options.storage,
      clock: options.clock,
      scope: idempotencyScope,
      payloadHash,
      statusCode: 200,
      responseBody: body,
      result: 'success_changed',
      reasonCode: null,
      resourceRefs: `user:${rotated.user.userId}`,
      auditEventId: audit.eventId,
    });

    const response = jsonResponse(200, body);
    addSessionCookies(response, {
      sessionId: rotated.session.sessionId,
      csrfToken: rotated.session.csrfToken,
      secure: options.secureCookies,
    });
    return response;
  });

  app.get('/api/sync/snapshot', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const nowIso = isoNow(options.clock);
    const ip = resolveRequestIp(c.req.raw);
    const [sessionRate, userRate, ipRate] = await Promise.all([
      options.storage.authRateLimits.increment({
        key: `sync-snapshot:session:${sessionContext.session.sessionId}`,
        nowIso,
        windowSeconds: SYNC_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: `sync-snapshot:user:${sessionContext.user.userId}`,
        nowIso,
        windowSeconds: SYNC_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: `sync-snapshot:ip:${ip}`,
        nowIso,
        windowSeconds: SYNC_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);
    if (
      sessionRate.attemptCount > SYNC_RATE_LIMIT_SESSION_ATTEMPT_LIMIT ||
      userRate.attemptCount > SYNC_RATE_LIMIT_USER_ATTEMPT_LIMIT ||
      ipRate.attemptCount > SYNC_RATE_LIMIT_IP_ATTEMPT_LIMIT
    ) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const snapshotTokenQuery = c.req.query('snapshotToken');
    const cursorQuery = c.req.query('cursor');
    const pageSizeQuery = parseSyncSnapshotPageSize(c.req.query('pageSize'));
    if (pageSizeQuery === null) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    if (!snapshotTokenQuery && cursorQuery) {
      return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
    }

    const buildSnapshotEntries = async (snapshotAsOf: string) => {
      const [items, tombstones] = await Promise.all([
        options.storage.vaultItems.listByOwnerUserId(sessionContext.user.userId),
        options.storage.vaultItems.listTombstonesByOwnerUserId(sessionContext.user.userId),
      ]);

      const itemEntries = items
        .filter((item) => item.updatedAt <= snapshotAsOf)
        .map((item) => ({
          entryType: 'item' as const,
          item: {
            itemId: item.itemId,
            itemType: item.itemType,
            revision: item.revision,
            encryptedPayload: item.encryptedPayload,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          },
          _sortAt: item.updatedAt,
          _sortId: item.itemId,
        }));
      const tombstoneEntries = tombstones
        .filter(
          (tombstone) =>
            tombstone.deletedAt <= snapshotAsOf &&
            isWithinRestoreRetentionWindow({
              deletedAtIso: tombstone.deletedAt,
              referenceIso: snapshotAsOf,
              retentionDays: VAULT_TOMBSTONE_RESTORE_RETENTION_DAYS,
            }),
        )
        .map((tombstone) => ({
          entryType: 'tombstone' as const,
          tombstone: {
            itemId: tombstone.itemId,
            ownerUserId: tombstone.ownerUserId,
            itemType: tombstone.itemType,
            revision: tombstone.revision,
            deletedAt: tombstone.deletedAt,
          },
          _sortAt: tombstone.deletedAt,
          _sortId: tombstone.itemId,
        }));

      const merged = [...itemEntries, ...tombstoneEntries]
        .sort((left, right) => {
          const byTimestamp = left._sortAt.localeCompare(right._sortAt);
          if (byTimestamp !== 0) {
            return byTimestamp;
          }
          const byId = left._sortId.localeCompare(right._sortId);
          if (byId !== 0) {
            return byId;
          }
          return left.entryType.localeCompare(right.entryType);
        })
        .map((entry) =>
          entry.entryType === 'item'
            ? {
                entryType: 'item' as const,
                item: entry.item,
              }
            : {
                entryType: 'tombstone' as const,
                tombstone: entry.tombstone,
              },
        );

      const snapshotDigest = buildSyncSnapshotDigest(merged as Array<Record<string, unknown>>);
      return {
        entries: merged,
        snapshotDigest,
      };
    };

    let snapshotAsOf = nowIso;
    let snapshotDigest = '';
    let pageSize = pageSizeQuery ?? SYNC_SNAPSHOT_PAGE_SIZE_DEFAULT;
    let offset = 0;
    let snapshotToken = snapshotTokenQuery ?? '';

    if (snapshotTokenQuery) {
      const verified = verifySyncSnapshotToken({
        token: snapshotTokenQuery,
        bootstrapSecret: options.bootstrapAdminToken,
        nowIso,
      });
      if (!verified.ok) {
        return jsonResponse(
          409,
          { ok: false, code: verified.reason === 'expired' ? 'snapshot_expired' : 'invalid_snapshot_context' },
        );
      }
      if (verified.payload.userId !== sessionContext.user.userId) {
        return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
      }
      if (pageSizeQuery !== null && pageSizeQuery !== undefined && pageSizeQuery !== verified.payload.pageSize) {
        return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
      }

      snapshotAsOf = verified.payload.snapshotAsOf;
      snapshotDigest = verified.payload.snapshotDigest;
      pageSize = verified.payload.pageSize;
      snapshotToken = snapshotTokenQuery;

      if (cursorQuery) {
        const cursor = decodeSyncSnapshotCursor(cursorQuery);
        if (!cursor || cursor.snapshotDigest !== snapshotDigest) {
          return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
        }
        offset = cursor.offset;
      }
    }

    const snapshot = await buildSnapshotEntries(snapshotAsOf);
    if (!snapshotTokenQuery) {
      snapshotDigest = snapshot.snapshotDigest;
      const ifNoneMatchRaw = c.req.header('if-none-match')?.trim();
      const ifNoneMatch = ifNoneMatchRaw?.replace(/^W\//, '').replace(/^"|"$/g, '');
      if (ifNoneMatch && ifNoneMatch === snapshotDigest) {
        const notModified = new Response(null, { status: 304 });
        notModified.headers.set('etag', `"${snapshotDigest}"`);
        return addSecurityHeaders(notModified);
      }
      snapshotToken = createSyncSnapshotToken({
        bootstrapSecret: options.bootstrapAdminToken,
        payload: {
          v: 'sync.snapshot.v1',
          userId: sessionContext.user.userId,
          snapshotAsOf,
          snapshotDigest,
          pageSize,
          exp: addSeconds(nowIso, SYNC_SNAPSHOT_TOKEN_TTL_SECONDS),
        },
      });
    } else if (snapshot.snapshotDigest !== snapshotDigest) {
      return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
    }

    if (offset < 0 || offset > snapshot.entries.length) {
      return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
    }

    let end = Math.min(offset + pageSize, snapshot.entries.length);
    let pageEntries = snapshot.entries.slice(offset, end);
    while (
      pageEntries.length > 1 &&
      new TextEncoder().encode(JSON.stringify(pageEntries)).length > SYNC_SNAPSHOT_RESPONSE_MAX_BYTES
    ) {
      end -= 1;
      pageEntries = snapshot.entries.slice(offset, end);
    }
    if (
      pageEntries.length === 1 &&
      new TextEncoder().encode(JSON.stringify(pageEntries)).length > SYNC_SNAPSHOT_RESPONSE_MAX_BYTES
    ) {
      return jsonResponse(413, { ok: false, code: 'payload_too_large' });
    }

    const nextCursor =
      end < snapshot.entries.length
        ? encodeSyncSnapshotCursor({
            v: 'sync.cursor.v1',
            snapshotDigest,
            offset: end,
          })
        : null;

    const body = SyncSnapshotOutputSchema.parse({
      snapshotToken,
      snapshotAsOf,
      snapshotDigest,
      pageSize,
      nextCursor,
      entries: pageEntries,
    });
    const response = jsonResponse(200, body);
    response.headers.set('etag', `"${snapshotDigest}"`);
    return response;
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

    const nowIso = isoNow(options.clock);
    const ip = resolveRequestIp(c.req.raw);
    const subjectHash = toSubjectHash(input.username);
    const scopeKeys = {
      ip: `device-bootstrap:ip:${ip}`,
      subject: `device-bootstrap:subject:${subjectHash}`,
      burst: `device-bootstrap:ip-subject:${ip}:${subjectHash}`,
    };
    const [ipRate, subjectRate, burstRate] = await Promise.all([
      options.storage.authRateLimits.increment({
        key: scopeKeys.ip,
        nowIso,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: scopeKeys.subject,
        nowIso,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      options.storage.authRateLimits.increment({
        key: scopeKeys.burst,
        nowIso,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);
    if (
      ipRate.attemptCount > AUTH_RATE_LIMIT_ATTEMPT_LIMIT ||
      subjectRate.attemptCount > AUTH_RATE_LIMIT_ATTEMPT_LIMIT ||
      burstRate.attemptCount > AUTH_RATE_LIMIT_ATTEMPT_LIMIT
    ) {
      return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const user = await options.storage.users.findByUsername(input.username);
    if (!user || user.lifecycleState !== 'active' || user.authVerifier !== input.authProof) {
      return jsonResponse(401, GENERIC_INVALID_CREDENTIALS);
    }

    await Promise.all([
      options.storage.authRateLimits.reset(scopeKeys.subject),
      options.storage.authRateLimits.reset(scopeKeys.burst),
    ]);
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
      recentReauthAt: nowIso,
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

    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: VAULT_ITEM_BODY_LIMIT_BYTES,
      tooLargeCode: 'payload_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const parsedInput = VaultItemCreateInputSchema.safeParse(parsedBody.body);
    if (!parsedInput.success) {
      if (hasTooBigIssue(parsedInput.error, 'encryptedPayload')) {
        return jsonResponse(413, { ok: false, code: 'payload_too_large' });
      }
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    const input = parsedInput.data;
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
    await publishRealtimeEvent({
      userId: sessionContext.user.userId,
      topic: 'vault.item.upserted',
      sourceDeviceId: sessionContext.device.deviceId,
      occurredAt: nowIso,
      payload: {
        itemId: item.itemId,
        itemType: item.itemType,
        revision: item.revision,
        updatedAt: item.updatedAt,
        encryptedPayload: item.encryptedPayload,
      },
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

    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: VAULT_ITEM_BODY_LIMIT_BYTES,
      tooLargeCode: 'payload_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const parsedInput = VaultItemUpdateInputSchema.safeParse(parsedBody.body);
    if (!parsedInput.success) {
      if (hasTooBigIssue(parsedInput.error, 'encryptedPayload')) {
        return jsonResponse(413, { ok: false, code: 'payload_too_large' });
      }
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    const input = parsedInput.data;

    try {
      const item = await options.storage.vaultItems.update({
        itemId: c.req.param('itemId'),
        ownerUserId: sessionContext.user.userId,
        itemType: input.itemType,
        encryptedPayload: input.encryptedPayload,
        expectedRevision: input.expectedRevision,
        updatedAt: isoNow(options.clock),
      });
      await publishRealtimeEvent({
        userId: sessionContext.user.userId,
        topic: 'vault.item.upserted',
        sourceDeviceId: sessionContext.device.deviceId,
        occurredAt: item.updatedAt,
        payload: {
          itemId: item.itemId,
          itemType: item.itemType,
          revision: item.revision,
          updatedAt: item.updatedAt,
          encryptedPayload: item.encryptedPayload,
        },
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
        const tombstones = await options.storage.vaultItems.listTombstonesByOwnerUserId(
          sessionContext.user.userId,
        );
        if (tombstones.some((tombstone) => tombstone.itemId === c.req.param('itemId'))) {
          return jsonResponse(409, { ok: false, code: 'item_deleted_conflict' });
        }
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

    const deletedAtIso = isoNow(options.clock);
    const deleted = await options.storage.vaultItems.delete(
      c.req.param('itemId'),
      sessionContext.user.userId,
      deletedAtIso,
    );
    if (!deleted) {
      const tombstones = await options.storage.vaultItems.listTombstonesByOwnerUserId(
        sessionContext.user.userId,
      );
      if (tombstones.some((tombstone) => tombstone.itemId === c.req.param('itemId'))) {
        return emptyResponse(204);
      }
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }

    const tombstones = await options.storage.vaultItems.listTombstonesByOwnerUserId(
      sessionContext.user.userId,
    );
    const deletedTombstone = tombstones.find((entry) => entry.itemId === c.req.param('itemId'));
    if (deletedTombstone) {
      await publishRealtimeEvent({
        userId: sessionContext.user.userId,
        topic: 'vault.item.tombstoned',
        sourceDeviceId: sessionContext.device.deviceId,
        occurredAt: deletedTombstone.deletedAt,
        payload: {
          itemId: deletedTombstone.itemId,
          itemType: deletedTombstone.itemType,
          revision: deletedTombstone.revision,
          deletedAt: deletedTombstone.deletedAt,
        },
      });
    }

    return emptyResponse(204);
  });

  app.post('/api/vault/items/:itemId/restore', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const restoredAtIso = isoNow(options.clock);
    let restoreResult: Awaited<ReturnType<typeof options.storage.vaultItems.restore>>;
    try {
      restoreResult = await options.storage.vaultItems.restore({
        itemId: c.req.param('itemId'),
        ownerUserId: sessionContext.user.userId,
        restoredAtIso,
        restoreRetentionDays: VAULT_TOMBSTONE_RESTORE_RETENTION_DAYS,
      });
    } catch {
      return jsonResponse(500, { ok: false, code: 'vault_item_restore_failed' });
    }

    if (restoreResult.status === 'not_found') {
      return jsonResponse(404, { ok: false, code: 'not_found' });
    }
    if (restoreResult.status === 'restore_window_expired') {
      return jsonResponse(409, { ok: false, code: 'restore_window_expired' });
    }
    if (!restoreResult.item) {
      return jsonResponse(500, { ok: false, code: 'vault_item_restore_failed' });
    }
    await publishRealtimeEvent({
      userId: sessionContext.user.userId,
      topic: 'vault.item.upserted',
      sourceDeviceId: sessionContext.device.deviceId,
      occurredAt: restoreResult.item.updatedAt,
      payload: {
        itemId: restoreResult.item.itemId,
        itemType: restoreResult.item.itemType,
        revision: restoreResult.item.revision,
        updatedAt: restoreResult.item.updatedAt,
        encryptedPayload: restoreResult.item.encryptedPayload,
      },
    });

    return jsonResponse(
      200,
      VaultItemRestoreOutputSchema.parse({
        ok: true,
        result: toCanonicalResult(restoreResult.status),
        item: VaultItemRecordSchema.parse({
          itemId: restoreResult.item.itemId,
          itemType: restoreResult.item.itemType,
          revision: restoreResult.item.revision,
          encryptedPayload: restoreResult.item.encryptedPayload,
          createdAt: restoreResult.item.createdAt,
          updatedAt: restoreResult.item.updatedAt,
        }),
      }),
    );
  });

  app.post('/api/attachments/uploads/init', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }
    if (!hasValidCsrf(c.req.raw)) {
      return jsonResponse(403, { ok: false, code: 'csrf_invalid' });
    }

    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: ATTACHMENT_INIT_BODY_LIMIT_BYTES,
      tooLargeCode: 'attachment_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const parsedInput = AttachmentUploadInitInputSchema.safeParse(parsedBody.body);
    if (!parsedInput.success) {
      if (hasTooBigIssue(parsedInput.error, 'size')) {
        return jsonResponse(413, { ok: false, code: 'attachment_too_large' });
      }
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    const input = parsedInput.data;
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
      fileName: input.fileName,
      lifecycleState: 'pending',
      envelope: '',
      contentType: input.contentType,
      size: input.size,
      idempotencyKey: input.idempotencyKey,
      uploadToken: options.idGenerator.nextId('upload_token'),
      expiresAt: addMinutes(options.clock.now(), ATTACHMENT_PENDING_TTL_MINUTES),
      uploadedAt: null,
      attachedAt: null,
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

    const parsedBody = await parseJsonBodyWithLimit<unknown>({
      request: c.req.raw,
      maxBytes: ATTACHMENT_ENVELOPE_BODY_LIMIT_BYTES,
      tooLargeCode: 'upload_envelope_too_large',
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const parsedInput = AttachmentUploadContentInputSchema.safeParse(parsedBody.body);
    if (!parsedInput.success) {
      if (hasTooBigIssue(parsedInput.error, 'encryptedEnvelope')) {
        return jsonResponse(413, { ok: false, code: 'upload_envelope_too_large' });
      }
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    const input = parsedInput.data;
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
    const ciphertextByteLength = base64UrlDecodedByteLength(envelope.data.ciphertext);
    if (
      envelope.data.contentType !== record.contentType ||
      envelope.data.originalSize !== record.size ||
      ciphertextByteLength === null ||
      ciphertextByteLength !== record.size
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

    const parsed = AttachmentUploadFinalizeInputSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return jsonResponse(400, { ok: false, code: 'invalid_input' });
    }
    const input = parsed.data;
    const record = await options.storage.attachmentBlobs.get(input.uploadId);
    if (!record || record.ownerUserId !== sessionContext.user.userId) {
      return jsonResponse(404, { ok: false, code: 'attachment_not_found' });
    }
    if (record.itemId !== input.itemId) {
      return jsonResponse(409, { ok: false, code: 'attachment_already_bound_to_other_item' });
    }

    if (record.lifecycleState === 'attached') {
      return jsonResponse(
        200,
        AttachmentUploadFinalizeOutputSchema.parse({
          ok: true,
          result: 'success_no_op',
          upload: toAttachmentUploadRecord(record),
        }),
      );
    }

    const nowIso = isoNow(options.clock);
    if (!record.expiresAt || record.expiresAt <= nowIso) {
      return jsonResponse(410, { ok: false, code: 'attachment_upload_expired' });
    }
    if (record.lifecycleState !== 'uploaded') {
      return jsonResponse(409, { ok: false, code: 'attachment_upload_incomplete' });
    }
    const item = await options.storage.vaultItems.findByItemId(input.itemId, sessionContext.user.userId);
    if (!item) {
      return jsonResponse(404, { ok: false, code: 'item_not_found' });
    }

    try {
      const attached = await options.storage.attachmentBlobs.markAttached({
        key: input.uploadId,
        ownerUserId: sessionContext.user.userId,
        itemId: input.itemId,
        updatedAt: nowIso,
        attachedAt: nowIso,
      });
      await publishRealtimeEvent({
        userId: sessionContext.user.userId,
        topic: 'vault.attachment.state_changed',
        sourceDeviceId: sessionContext.device.deviceId,
        occurredAt: attached.updatedAt,
        payload: {
          uploadId: attached.key,
          itemId: attached.itemId,
          lifecycleState: 'attached',
          contentType: attached.contentType,
          size: attached.size,
          uploadedAt: attached.uploadedAt,
          attachedAt: attached.attachedAt,
          updatedAt: attached.updatedAt,
        },
      });

      return jsonResponse(
        200,
        AttachmentUploadFinalizeOutputSchema.parse({
          ok: true,
          result: 'success_changed',
          upload: toAttachmentUploadRecord(attached),
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'attachment_finalize_failed';
      if (message === 'attachment_not_found') {
        return jsonResponse(404, { ok: false, code: 'attachment_not_found' });
      }
      if (message === 'attachment_already_bound_to_other_item') {
        return jsonResponse(409, { ok: false, code: 'attachment_already_bound_to_other_item' });
      }
      if (message === 'attachment_upload_incomplete') {
        return jsonResponse(409, { ok: false, code: 'attachment_upload_incomplete' });
      }
      return jsonResponse(500, { ok: false, code: 'attachment_finalize_failed' });
    }
  });

  app.get('/api/attachments/uploads/:uploadId/envelope', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw);
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const uploadId = c.req.param('uploadId');
    const record = await options.storage.attachmentBlobs.get(uploadId);
    if (!record || record.ownerUserId !== sessionContext.user.userId) {
      return jsonResponse(404, { ok: false, code: 'attachment_not_found' });
    }
    if (
      record.lifecycleState !== 'attached' ||
      !record.itemId ||
      !record.uploadedAt ||
      !record.attachedAt ||
      record.envelope.length === 0
    ) {
      return jsonResponse(409, { ok: false, code: 'attachment_upload_incomplete' });
    }

    return jsonResponse(
      200,
      AttachmentUploadEnvelopeOutputSchema.parse({
        uploadId: record.key,
        itemId: record.itemId,
        fileName: record.fileName.trim().length > 0 ? record.fileName : `${record.key}.bin`,
        contentType: record.contentType,
        size: record.size,
        uploadedAt: record.uploadedAt,
        attachedAt: record.attachedAt,
        encryptedEnvelope: record.envelope,
      }),
    );
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

  app.get('/api/attachments/state', async (c) => {
    const sessionContext = await requireAuthenticatedSession(c.req.raw, {
      allowExtensionBearer: true,
    });
    if (!sessionContext) {
      return jsonResponse(401, { ok: false, code: 'unauthorized' });
    }

    const requestedPageSize = Number(c.req.query('pageSize') ?? '100');
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.max(1, Math.min(200, Math.trunc(requestedPageSize)))
      : 100;
    const cursor = c.req.query('cursor');
    const decodedCursor = cursor ? decodeAttachmentStateCursor(cursor) : { v: 'attachments.cursor.v1' as const, offset: 0 };
    if (!decodedCursor) {
      return jsonResponse(409, { ok: false, code: 'invalid_snapshot_context' });
    }
    const offset = Math.max(0, Math.trunc(decodedCursor.offset));
    const uploads = await options.storage.attachmentBlobs.listByOwner(sessionContext.user.userId);
    const stateEntries = uploads
      .flatMap<AttachmentStateEntry>((upload) => {
        if (upload.lifecycleState === 'attached' && upload.itemId && upload.uploadedAt && upload.attachedAt) {
          return [
            {
              entryType: 'state_changed' as const,
              uploadId: upload.key,
              itemId: upload.itemId,
              lifecycleState: 'attached' as const,
              contentType: upload.contentType,
              size: upload.size,
              uploadedAt: upload.uploadedAt,
              attachedAt: upload.attachedAt,
              updatedAt: upload.updatedAt,
            },
          ];
        }
        if ((upload.lifecycleState === 'deleted' || upload.lifecycleState === 'orphaned') && upload.itemId) {
          return [
            {
              entryType: 'removed' as const,
              uploadId: upload.key,
              itemId: upload.itemId,
              removedAt: upload.updatedAt,
              reason: upload.lifecycleState,
            },
          ];
        }
        return [];
      });
    const page = stateEntries.slice(offset, offset + pageSize);
    const nextCursor =
      offset + page.length < stateEntries.length
        ? encodeAttachmentStateCursor({
            v: 'attachments.cursor.v1',
            offset: offset + page.length,
          })
        : null;

    return jsonResponse(
      200,
      AttachmentStateOutputSchema.parse({
        cursor: nextCursor,
        pageSize,
        entries: page,
      }),
    );
  });
  app.notFound(() => jsonResponse(404, { ok: false, code: 'not_found' }));

  return app;
}
