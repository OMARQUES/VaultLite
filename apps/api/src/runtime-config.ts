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
}

export interface WorkerRuntimeConfig {
  runtimeMode: RuntimeMode;
  serverUrl: string;
  deploymentFingerprint: string;
  bootstrapAdminToken: string;
  secureCookies: boolean;
  accountKitPrivateKey: string | KeyObject;
  accountKitPublicKey: string | KeyObject;
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
  }

  return {
    runtimeMode,
    serverUrl,
    deploymentFingerprint,
    bootstrapAdminToken,
    secureCookies,
    accountKitPrivateKey: providedPrivateKey && providedPublicKey ? providedPrivateKey : generatedAccountKitKeys.privateKey,
    accountKitPublicKey: providedPrivateKey && providedPublicKey ? providedPublicKey : generatedAccountKitKeys.publicKey,
  };
}
