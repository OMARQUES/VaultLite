import {
  applyCloudflareMigrations,
  createCloudflareVaultLiteStorage,
  type D1DatabaseLike,
  type R2BucketLike,
} from '@vaultlite/cloudflare-storage';
import { CryptoIdGenerator, SystemClock } from '@vaultlite/runtime-abstractions';
import { createInMemoryVaultLiteStorage, type VaultLiteStorage } from '@vaultlite/storage-abstractions';

import { createVaultLiteApi } from './app';
import { VaultLiteRealtimeHub } from './realtime';
import { createWorkerRuntimeConfig, type VaultLiteWorkerEnv } from './runtime-config';

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

export interface VaultLiteWorkerBindings extends VaultLiteWorkerEnv {
  VAULTLITE_DB?: D1DatabaseLike;
  VAULTLITE_BLOBS?: R2BucketLike;
  VAULTLITE_REALTIME_HUB?: DurableObjectNamespaceLike;
  VAULTLITE_ICON_DISCOVERY_QUEUE?: {
    send(message: unknown): Promise<void>;
  };
}

interface QueueMessageLike {
  body: unknown;
  retry(): void;
}

interface QueueBatchLike {
  messages: QueueMessageLike[];
}

export async function createWorkerStorage(input: {
  env?: Partial<VaultLiteWorkerBindings>;
  runtimeMode: 'development' | 'test' | 'production';
}): Promise<VaultLiteStorage> {
  const env = input.env ?? {};
  if (env.VAULTLITE_DB && env.VAULTLITE_BLOBS) {
    await applyCloudflareMigrations(env.VAULTLITE_DB);
    return createCloudflareVaultLiteStorage({
      db: env.VAULTLITE_DB,
      bucket: env.VAULTLITE_BLOBS,
    });
  }

  if (input.runtimeMode === 'production') {
    throw new Error('runtime_config_invalid:production_requires_distributed_storage');
  }

  return createInMemoryVaultLiteStorage();
}

async function createWorkerApp(env: Partial<VaultLiteWorkerBindings> = {}) {
  const runtime = createWorkerRuntimeConfig(env);
  const storage = await createWorkerStorage({
    env,
    runtimeMode: runtime.runtimeMode,
  });

  return createVaultLiteApi({
    storage,
    clock: new SystemClock(),
    idGenerator: new CryptoIdGenerator(),
    runtimeMode: runtime.runtimeMode,
    deploymentFingerprint: runtime.deploymentFingerprint,
    serverUrl: runtime.serverUrl,
    iconsAssetBaseUrl: runtime.iconsAssetBaseUrl,
    bootstrapAdminToken: runtime.bootstrapAdminToken,
    secureCookies: runtime.secureCookies,
    accountKitPrivateKey: runtime.accountKitPrivateKey,
    accountKitPublicKey: runtime.accountKitPublicKey,
    iconBlobBucket: env.VAULTLITE_BLOBS,
    iconsDiscoveryQueue: env.VAULTLITE_ICON_DISCOVERY_QUEUE ?? null,
    iconsDiscoveryInternalToken: env.VAULTLITE_INTERNAL_QUEUE_TOKEN ?? '',
    realtime: {
      ...runtime.realtime,
      hubNamespace: env.VAULTLITE_REALTIME_HUB ?? null,
    },
  });
}

let cachedAppPromise: Promise<ReturnType<typeof createVaultLiteApi>> | null = null;
let cachedConfigSignature = '';

function getConfigSignature(env: Partial<VaultLiteWorkerBindings> = {}): string {
  return [
    env.VAULTLITE_RUNTIME_MODE ?? '',
    env.VAULTLITE_SERVER_URL ?? '',
    env.VAULTLITE_ICONS_ASSET_BASE_URL ?? '',
    env.VAULTLITE_DEPLOYMENT_FINGERPRINT ?? '',
    env.VAULTLITE_BOOTSTRAP_ADMIN_TOKEN ?? '',
    env.VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY ?? '',
    env.VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY ?? '',
    env.VAULTLITE_DB ? 'db' : 'no-db',
    env.VAULTLITE_BLOBS ? 'blobs' : 'no-blobs',
    env.VAULTLITE_ICON_DISCOVERY_QUEUE ? 'icons-queue' : 'no-icons-queue',
    env.VAULTLITE_REALTIME_HUB ? 'realtime-hub' : 'no-realtime-hub',
    env.VAULTLITE_WS_WEB_ALLOWED_ORIGINS ?? '',
    env.VAULTLITE_INTERNAL_QUEUE_TOKEN ?? '',
  ].join('|');
}

export default {
  async fetch(request: Request, env?: Partial<VaultLiteWorkerBindings>) {
    const nextSignature = getConfigSignature(env);
    if (!cachedAppPromise || nextSignature !== cachedConfigSignature) {
      cachedAppPromise = createWorkerApp(env);
      cachedConfigSignature = nextSignature;
    }

    const cachedApp = await cachedAppPromise;
    return cachedApp.fetch(request);
  },
  async queue(batch: QueueBatchLike, env?: Partial<VaultLiteWorkerBindings>) {
    const nextSignature = getConfigSignature(env);
    if (!cachedAppPromise || nextSignature !== cachedConfigSignature) {
      cachedAppPromise = createWorkerApp(env);
      cachedConfigSignature = nextSignature;
    }
    const cachedApp = await cachedAppPromise;
    const token = env?.VAULTLITE_INTERNAL_QUEUE_TOKEN?.trim() ?? '';
    if (!token) {
      for (const message of batch?.messages ?? []) {
        message.retry();
      }
      return;
    }
    await Promise.all(
      (batch?.messages ?? []).map(async (message) => {
        try {
          const response = await cachedApp.fetch(
            new Request('https://internal/internal/icons/discovery/process', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-vl-internal-token': token,
              },
              body: JSON.stringify(message.body ?? {}),
            }),
          );
          if (!response.ok && response.status >= 500) {
            message.retry();
          }
        } catch {
          message.retry();
        }
      }),
    );
  },
};

export { createVaultLiteApi, createWorkerApp };
export { VaultLiteRealtimeHub };
