import { describe, expect, test } from 'vitest';

import {
  createWorkerApp,
  dedupeIconDiscoveryQueueMessages,
  nextRetryDelaySeconds,
  normalizeIconDiscoveryQueueBody,
  shouldRetryIconDiscoveryStatus,
} from './index';

describe('icons discovery queue helpers', () => {
  test('normalizes and validates queue payload', () => {
    expect(
      normalizeIconDiscoveryQueueBody({
        domain: 'Example.COM',
        userId: ' user_1 ',
        trigger: 'domains_batch',
      }),
    ).toMatchObject({
      domain: 'example.com',
      userId: 'user_1',
      trigger: 'domains_batch',
    });
    expect(normalizeIconDiscoveryQueueBody({})).toBeNull();
    expect(normalizeIconDiscoveryQueueBody(null)).toBeNull();
  });

  test('dedupes by user + domain', () => {
    const deduped = dedupeIconDiscoveryQueueMessages([
      {
        body: { domain: 'example.com', userId: 'user_1', trigger: 'domains_item' },
        retry: () => undefined,
      },
      {
        body: { domain: 'EXAMPLE.COM', userId: 'user_1', trigger: 'domains_batch' },
        retry: () => undefined,
      },
      {
        body: { domain: 'example.com', userId: 'user_2', trigger: 'domains_batch' },
        retry: () => undefined,
      },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((entry) => `${entry.body.userId}:${entry.body.domain}`).sort()).toEqual([
      'user_1:example.com',
      'user_2:example.com',
    ]);
  });

  test('retries only transient status and computes bounded delay', () => {
    expect(shouldRetryIconDiscoveryStatus(429)).toBe(true);
    expect(shouldRetryIconDiscoveryStatus(503)).toBe(true);
    expect(shouldRetryIconDiscoveryStatus(400)).toBe(false);
    expect(shouldRetryIconDiscoveryStatus(404)).toBe(false);

    expect(nextRetryDelaySeconds({ attempt: 1 })).toBe(5);
    expect(nextRetryDelaySeconds({ attempt: 4 })).toBe(40);
    expect(nextRetryDelaySeconds({ attempt: 100 })).toBe(300);
    expect(nextRetryDelaySeconds({ attempt: 2, retryAfterSeconds: 17 })).toBe(17);
  });
});

describe('createWorkerApp', () => {
  test('rejects production runtime when distributed storage bindings are missing', async () => {
    await expect(
      createWorkerApp({
        VAULTLITE_RUNTIME_MODE: 'production',
        VAULTLITE_SERVER_URL: 'https://vaultlite.example.com',
        VAULTLITE_DEPLOYMENT_FINGERPRINT: 'prod_deployment_1',
        VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'very-strong-bootstrap-token-1234567890',
        VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY: 'private-key-material',
        VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY: 'public-key-material',
      }),
    ).rejects.toThrow('runtime_config_invalid');
  });
});
