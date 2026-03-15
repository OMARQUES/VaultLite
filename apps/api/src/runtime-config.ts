import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import type { KeyObject } from 'node:crypto';

export const DEFAULT_LOCAL_API_ORIGIN = 'http://127.0.0.1:8787';
export const DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT = 'development_deployment';
export const DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN = 'development-bootstrap-admin-token';

export interface VaultLiteWorkerEnv {
  VAULTLITE_SERVER_URL?: string;
  VAULTLITE_DEPLOYMENT_FINGERPRINT?: string;
  VAULTLITE_BOOTSTRAP_ADMIN_TOKEN?: string;
  VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY?: string;
  VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY?: string;
}

export interface WorkerRuntimeConfig {
  serverUrl: string;
  deploymentFingerprint: string;
  bootstrapAdminToken: string;
  secureCookies: boolean;
  accountKitPrivateKey: string | KeyObject;
  accountKitPublicKey: string | KeyObject;
}

function isSecureOrigin(serverUrl: string): boolean {
  try {
    return new URL(serverUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createWorkerRuntimeConfig(env: Partial<VaultLiteWorkerEnv>): WorkerRuntimeConfig {
  const generatedAccountKitKeys = generateAccountKitKeyPair();
  const providedPrivateKey = env.VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY?.trim();
  const providedPublicKey = env.VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY?.trim();
  const serverUrl = env.VAULTLITE_SERVER_URL?.trim() || DEFAULT_LOCAL_API_ORIGIN;

  return {
    serverUrl,
    deploymentFingerprint:
      env.VAULTLITE_DEPLOYMENT_FINGERPRINT?.trim() || DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT,
    bootstrapAdminToken:
      env.VAULTLITE_BOOTSTRAP_ADMIN_TOKEN?.trim() || DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN,
    secureCookies: isSecureOrigin(serverUrl),
    accountKitPrivateKey: providedPrivateKey && providedPublicKey ? providedPrivateKey : generatedAccountKitKeys.privateKey,
    accountKitPublicKey: providedPrivateKey && providedPublicKey ? providedPublicKey : generatedAccountKitKeys.publicKey,
  };
}
