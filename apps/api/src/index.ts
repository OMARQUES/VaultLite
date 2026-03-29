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
  attempts?: number;
  retry(input?: { delaySeconds?: number }): void;
  ack?(): void;
}

interface QueueBatchLike {
  messages: QueueMessageLike[];
}

type IconDiscoveryQueueBody = {
  domain: string;
  userId: string;
  sourceDeviceId: string | null;
  trigger: 'domains_item' | 'domains_batch' | 'internal_requeue';
  requestedAt: string;
};

type DedupedIconQueueMessage = {
  message: QueueMessageLike;
  body: IconDiscoveryQueueBody;
};

const ICON_DISCOVERY_QUEUE_CONCURRENCY = 5;
const ICON_DISCOVERY_RETRY_BASE_SECONDS = 5;
const ICON_DISCOVERY_RETRY_MAX_SECONDS = 300;

export function normalizeIconDiscoveryQueueBody(body: unknown): IconDiscoveryQueueBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const payload = body as Partial<IconDiscoveryQueueBody>;
  const domain = typeof payload.domain === 'string' ? payload.domain.trim().toLowerCase() : '';
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  if (!domain || !userId) {
    return null;
  }
  return {
    domain,
    userId,
    sourceDeviceId: typeof payload.sourceDeviceId === 'string' && payload.sourceDeviceId.length > 0
      ? payload.sourceDeviceId
      : null,
    trigger: payload.trigger === 'domains_item' || payload.trigger === 'domains_batch' || payload.trigger === 'internal_requeue'
      ? payload.trigger
      : 'internal_requeue',
    requestedAt: typeof payload.requestedAt === 'string' && payload.requestedAt.length > 0
      ? payload.requestedAt
      : new Date().toISOString(),
  };
}

export function dedupeIconDiscoveryQueueMessages(messages: QueueMessageLike[]): DedupedIconQueueMessage[] {
  const deduped = new Map<string, DedupedIconQueueMessage>();
  for (const message of messages) {
    const body = normalizeIconDiscoveryQueueBody(message?.body);
    if (!body) {
      continue;
    }
    const key = `${body.userId}::${body.domain}`;
    deduped.set(key, { message, body });
  }
  return Array.from(deduped.values());
}

export function shouldRetryIconDiscoveryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function resolveRetryAfterSeconds(response: Response): number | null {
  const retryAfterRaw = response.headers.get('retry-after');
  if (!retryAfterRaw) {
    return null;
  }
  const retryAfterSeconds = Number.parseInt(retryAfterRaw, 10);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return null;
  }
  return retryAfterSeconds;
}

export function nextRetryDelaySeconds(input: { attempt: number; retryAfterSeconds?: number | null }): number {
  if (Number.isFinite(input.retryAfterSeconds) && (input.retryAfterSeconds as number) > 0) {
    return Math.max(1, Math.min(Math.trunc(input.retryAfterSeconds as number), ICON_DISCOVERY_RETRY_MAX_SECONDS));
  }
  const safeAttempt = Math.max(1, Math.trunc(input.attempt || 1));
  const exponent = Math.min(safeAttempt - 1, 6);
  const computed = ICON_DISCOVERY_RETRY_BASE_SECONDS * 2 ** exponent;
  return Math.max(1, Math.min(computed, ICON_DISCOVERY_RETRY_MAX_SECONDS));
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
    const dedupedMessages = dedupeIconDiscoveryQueueMessages(batch?.messages ?? []);
    const workerCount = Math.max(1, Math.min(ICON_DISCOVERY_QUEUE_CONCURRENCY, dedupedMessages.length || 1));
    let cursor = 0;
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < dedupedMessages.length) {
        const currentIndex = cursor;
        cursor += 1;
        const current = dedupedMessages[currentIndex];
        if (!current) {
          continue;
        }
        const { message, body } = current;
        try {
          const response = await cachedApp.fetch(
            new Request('https://internal/internal/icons/discovery/process', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-vl-internal-token': token,
              },
              body: JSON.stringify(body),
            }),
          );
          if (!response.ok && shouldRetryIconDiscoveryStatus(response.status)) {
            message.retry({
              delaySeconds: nextRetryDelaySeconds({
                attempt: Math.max(1, Math.trunc(message.attempts ?? 1)),
                retryAfterSeconds: resolveRetryAfterSeconds(response),
              }),
            });
          }
        } catch {
          message.retry({
            delaySeconds: nextRetryDelaySeconds({
              attempt: Math.max(1, Math.trunc(message.attempts ?? 1)),
            }),
          });
        }
      }
    });
    await Promise.all(workers);
  },
};

export { createVaultLiteApi, createWorkerApp };
export { VaultLiteRealtimeHub };
