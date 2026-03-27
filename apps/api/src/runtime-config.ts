import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import type { KeyObject } from 'node:crypto';

export const DEFAULT_LOCAL_API_ORIGIN = 'http://127.0.0.1:8787';
export const DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT = 'development_deployment';
export const DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN = 'development-bootstrap-admin-token';
const MIN_PRODUCTION_BOOTSTRAP_TOKEN_LENGTH = 24;

export const RUNTIME_MODES = ['development', 'test', 'production'] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export interface VaultLiteWorkerEnv {
  VAULTLITE_RUNTIME_MODE?: string;
  VAULTLITE_SERVER_URL?: string;
  VAULTLITE_DEPLOYMENT_FINGERPRINT?: string;
  VAULTLITE_BOOTSTRAP_ADMIN_TOKEN?: string;
  VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY?: string;
  VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY?: string;
  VAULTLITE_REALTIME_ENABLED?: string;
  VAULTLITE_REALTIME_WS_BASE_URL?: string;
  VAULTLITE_REALTIME_CONNECT_TOKEN_SECRET?: string;
  VAULTLITE_REALTIME_AUTH_LEASE_SECONDS?: string;
  VAULTLITE_REALTIME_HEARTBEAT_INTERVAL_MS?: string;
  VAULTLITE_WS_WEB_ALLOWED_ORIGINS?: string;
  VAULTLITE_REALTIME_FLAG_WS_V1?: string;
  VAULTLITE_REALTIME_FLAG_DELTA_VAULT_V1?: string;
  VAULTLITE_REALTIME_FLAG_DELTA_ICONS_V1?: string;
  VAULTLITE_REALTIME_FLAG_DELTA_HISTORY_V1?: string;
  VAULTLITE_REALTIME_FLAG_DELTA_ATTACHMENTS_V1?: string;
  VAULTLITE_REALTIME_FLAG_APPLY_WEB_V1?: string;
  VAULTLITE_REALTIME_FLAG_APPLY_EXTENSION_V1?: string;
}

export interface WorkerRealtimeFlagsConfig {
  realtime_ws_v1: boolean;
  realtime_delta_vault_v1: boolean;
  realtime_delta_icons_v1: boolean;
  realtime_delta_history_v1: boolean;
  realtime_delta_attachments_v1: boolean;
  realtime_apply_web_v1: boolean;
  realtime_apply_extension_v1: boolean;
}

export interface WorkerRealtimeConfig {
  enabled: boolean;
  wsBaseUrl: string;
  webAllowedOrigins: string[];
  connectTokenSecret: string;
  connectTokenTtlSeconds: number;
  authLeaseSeconds: number;
  heartbeatIntervalMs: number;
  flags: WorkerRealtimeFlagsConfig;
}

export interface WorkerRuntimeConfig {
  runtimeMode: RuntimeMode;
  serverUrl: string;
  deploymentFingerprint: string;
  bootstrapAdminToken: string;
  secureCookies: boolean;
  accountKitPrivateKey: string | KeyObject;
  accountKitPublicKey: string | KeyObject;
  realtime: WorkerRealtimeConfig;
}

function runtimeConfigError(message: string): Error {
  return new Error(`runtime_config_invalid:${message}`);
}

function isSecureOrigin(serverUrl: string): boolean {
  try {
    return new URL(serverUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

function parseRuntimeMode(input: string | undefined): RuntimeMode {
  const normalized = input?.trim().toLowerCase();
  if (normalized === 'development' || normalized === 'test' || normalized === 'production') {
    return normalized;
  }

  throw runtimeConfigError('runtime_mode_required');
}

const DEFAULT_REALTIME_CONNECT_TOKEN_TTL_SECONDS = 45;
const DEFAULT_REALTIME_AUTH_LEASE_SECONDS = 600;
const DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS = 25_000;
const MIN_REALTIME_SECRET_LENGTH = 24;
const DEFAULT_LOCAL_WS_WEB_ALLOWED_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'] as const;

function parseBooleanEnv(input: string | undefined, fallback = false): boolean {
  if (!input) {
    return fallback;
  }
  const normalized = input.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parsePositiveIntEnv(input: string | undefined, fallback: number): number {
  const parsed = Number(input?.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.trunc(parsed);
  return value > 0 ? value : fallback;
}

function deriveWsBaseUrl(serverUrl: string): string {
  try {
    const parsed = new URL(serverUrl);
    if (parsed.protocol === 'https:') {
      parsed.protocol = 'wss:';
    } else if (parsed.protocol === 'http:') {
      parsed.protocol = 'ws:';
    }
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/u, '');
  } catch {
    return 'ws://127.0.0.1:8787';
  }
}

function canonicalizeWebOrigin(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function dedupeOrigins(origins: string[]): string[] {
  const ordered = new Set<string>();
  for (const origin of origins) {
    ordered.add(origin);
  }
  return Array.from(ordered);
}

function parseAllowedWebOriginsCsv(input: string | undefined): {
  hasExplicitValue: boolean;
  origins: string[];
} {
  const trimmed = input?.trim() ?? '';
  if (!trimmed) {
    return {
      hasExplicitValue: false,
      origins: [],
    };
  }
  const origins: string[] = [];
  for (const rawValue of trimmed.split(',')) {
    const rawOrigin = rawValue.trim();
    if (!rawOrigin) {
      continue;
    }
    const normalized = canonicalizeWebOrigin(rawOrigin);
    if (!normalized) {
      throw runtimeConfigError(`realtime_ws_web_allowed_origins_invalid:${rawOrigin}`);
    }
    origins.push(normalized);
  }
  return {
    hasExplicitValue: true,
    origins: dedupeOrigins(origins),
  };
}

export function createWorkerRuntimeConfig(env: Partial<VaultLiteWorkerEnv>): WorkerRuntimeConfig {
  const generatedAccountKitKeys = generateAccountKitKeyPair();
  const runtimeMode = parseRuntimeMode(env.VAULTLITE_RUNTIME_MODE);
  const providedPrivateKey = env.VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY?.trim();
  const providedPublicKey = env.VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY?.trim();
  const serverUrl = env.VAULTLITE_SERVER_URL?.trim() || DEFAULT_LOCAL_API_ORIGIN;
  const deploymentFingerprint =
    env.VAULTLITE_DEPLOYMENT_FINGERPRINT?.trim() || DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT;
  const secureCookies = isSecureOrigin(serverUrl);
  const bootstrapAdminToken =
    env.VAULTLITE_BOOTSTRAP_ADMIN_TOKEN?.trim() || DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN;
  const realtimeEnabled = parseBooleanEnv(
    env.VAULTLITE_REALTIME_ENABLED,
    runtimeMode !== 'production',
  );
  const wsBaseUrl = env.VAULTLITE_REALTIME_WS_BASE_URL?.trim() || deriveWsBaseUrl(serverUrl);
  const connectTokenSecret =
    env.VAULTLITE_REALTIME_CONNECT_TOKEN_SECRET?.trim() || `${deploymentFingerprint}_realtime_secret_dev`;
  const authLeaseSeconds = parsePositiveIntEnv(
    env.VAULTLITE_REALTIME_AUTH_LEASE_SECONDS,
    DEFAULT_REALTIME_AUTH_LEASE_SECONDS,
  );
  const heartbeatIntervalMs = parsePositiveIntEnv(
    env.VAULTLITE_REALTIME_HEARTBEAT_INTERVAL_MS,
    DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS,
  );
  const parsedAllowedOrigins = parseAllowedWebOriginsCsv(env.VAULTLITE_WS_WEB_ALLOWED_ORIGINS);
  const serverOrigin = canonicalizeWebOrigin(serverUrl);
  const fallbackAllowedOrigins = runtimeMode === 'production'
    ? []
    : dedupeOrigins(
        [
          ...DEFAULT_LOCAL_WS_WEB_ALLOWED_ORIGINS,
          ...(serverOrigin ? [serverOrigin] : []),
        ],
      );
  const webAllowedOrigins = parsedAllowedOrigins.hasExplicitValue
    ? parsedAllowedOrigins.origins
    : fallbackAllowedOrigins;
  const realtimeFlags: WorkerRealtimeFlagsConfig = {
    realtime_ws_v1: parseBooleanEnv(env.VAULTLITE_REALTIME_FLAG_WS_V1, realtimeEnabled),
    realtime_delta_vault_v1: parseBooleanEnv(env.VAULTLITE_REALTIME_FLAG_DELTA_VAULT_V1, realtimeEnabled),
    realtime_delta_icons_v1: parseBooleanEnv(env.VAULTLITE_REALTIME_FLAG_DELTA_ICONS_V1, realtimeEnabled),
    realtime_delta_history_v1: parseBooleanEnv(env.VAULTLITE_REALTIME_FLAG_DELTA_HISTORY_V1, realtimeEnabled),
    realtime_delta_attachments_v1: parseBooleanEnv(
      env.VAULTLITE_REALTIME_FLAG_DELTA_ATTACHMENTS_V1,
      realtimeEnabled,
    ),
    realtime_apply_web_v1: parseBooleanEnv(env.VAULTLITE_REALTIME_FLAG_APPLY_WEB_V1, realtimeEnabled),
    realtime_apply_extension_v1: parseBooleanEnv(
      env.VAULTLITE_REALTIME_FLAG_APPLY_EXTENSION_V1,
      realtimeEnabled,
    ),
  };

  if (runtimeMode === 'production') {
    if (!secureCookies) {
      throw runtimeConfigError('production_requires_https_server_url');
    }
    if (
      bootstrapAdminToken.length < MIN_PRODUCTION_BOOTSTRAP_TOKEN_LENGTH ||
      bootstrapAdminToken === DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN
    ) {
      throw runtimeConfigError('bootstrap_token_invalid');
    }
    if (!providedPrivateKey || !providedPublicKey) {
      throw runtimeConfigError('account_kit_keypair_required');
    }
    if (realtimeEnabled && connectTokenSecret.length < MIN_REALTIME_SECRET_LENGTH) {
      throw runtimeConfigError('realtime_connect_token_secret_invalid');
    }
    if (realtimeEnabled && !parsedAllowedOrigins.hasExplicitValue) {
      throw runtimeConfigError('realtime_ws_web_allowed_origins_required');
    }
    if (realtimeEnabled && webAllowedOrigins.length === 0) {
      throw runtimeConfigError('realtime_ws_web_allowed_origins_invalid');
    }
  }

  return {
    runtimeMode,
    serverUrl,
    deploymentFingerprint,
    bootstrapAdminToken,
    secureCookies,
    accountKitPrivateKey: providedPrivateKey && providedPublicKey ? providedPrivateKey : generatedAccountKitKeys.privateKey,
    accountKitPublicKey: providedPrivateKey && providedPublicKey ? providedPublicKey : generatedAccountKitKeys.publicKey,
    realtime: {
      enabled: realtimeEnabled,
      wsBaseUrl,
      webAllowedOrigins,
      connectTokenSecret,
      connectTokenTtlSeconds: DEFAULT_REALTIME_CONNECT_TOKEN_TTL_SECONDS,
      authLeaseSeconds,
      heartbeatIntervalMs,
      flags: realtimeFlags,
    },
  };
}
