import {
  applyCloudflareMigrations,
  createCloudflareVaultLiteStorage,
  type D1DatabaseLike,
  type R2BucketLike,
} from '@vaultlite/cloudflare-storage';
import { CryptoIdGenerator, SystemClock } from '@vaultlite/runtime-abstractions';
import { createInMemoryVaultLiteStorage, type VaultLiteStorage } from '@vaultlite/storage-abstractions';

import { createVaultLiteApi } from './app';
import { createWorkerRuntimeConfig, type VaultLiteWorkerEnv } from './runtime-config';

export interface VaultLiteWorkerBindings extends VaultLiteWorkerEnv {
  VAULTLITE_DB?: D1DatabaseLike;
  VAULTLITE_BLOBS?: R2BucketLike;
}

export async function createWorkerStorage(env: Partial<VaultLiteWorkerBindings> = {}): Promise<VaultLiteStorage> {
  if (env.VAULTLITE_DB && env.VAULTLITE_BLOBS) {
    await applyCloudflareMigrations(env.VAULTLITE_DB);
    return createCloudflareVaultLiteStorage({
      db: env.VAULTLITE_DB,
      bucket: env.VAULTLITE_BLOBS,
    });
  }

  return createInMemoryVaultLiteStorage();
}

async function createWorkerApp(env: Partial<VaultLiteWorkerBindings> = {}) {
  const runtime = createWorkerRuntimeConfig(env);
  const storage = await createWorkerStorage(env);

  return createVaultLiteApi({
    storage,
    clock: new SystemClock(),
    idGenerator: new CryptoIdGenerator(),
    deploymentFingerprint: runtime.deploymentFingerprint,
    serverUrl: runtime.serverUrl,
    bootstrapAdminToken: runtime.bootstrapAdminToken,
    secureCookies: runtime.secureCookies,
    accountKitPrivateKey: runtime.accountKitPrivateKey,
    accountKitPublicKey: runtime.accountKitPublicKey,
  });
}

let cachedAppPromise = createWorkerApp();
let cachedConfigSignature = '';

function getConfigSignature(env: Partial<VaultLiteWorkerBindings> = {}): string {
  return [
    env.VAULTLITE_SERVER_URL ?? '',
    env.VAULTLITE_DEPLOYMENT_FINGERPRINT ?? '',
    env.VAULTLITE_BOOTSTRAP_ADMIN_TOKEN ?? '',
    env.VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY ?? '',
    env.VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY ?? '',
    env.VAULTLITE_DB ? 'db' : 'no-db',
    env.VAULTLITE_BLOBS ? 'blobs' : 'no-blobs',
  ].join('|');
}

export default {
  async fetch(request: Request, env?: Partial<VaultLiteWorkerBindings>) {
    const nextSignature = getConfigSignature(env);
    if (nextSignature !== cachedConfigSignature) {
      cachedAppPromise = createWorkerApp(env);
      cachedConfigSignature = nextSignature;
    }

    const cachedApp = await cachedAppPromise;
    return cachedApp.fetch(request);
  },
};

export { createVaultLiteApi, createWorkerApp };
