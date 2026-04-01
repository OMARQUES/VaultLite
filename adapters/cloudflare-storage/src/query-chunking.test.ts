import { describe, expect, test } from 'vitest';

import {
  createCloudflareVaultLiteStorage,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type R2BucketLike,
} from './index';

function createMockDbWithVariableLimit(limit: number): {
  db: D1DatabaseLike;
  binds: Array<{ query: string; values: unknown[] }>;
} {
  const binds: Array<{ query: string; values: unknown[] }> = [];
  const db: D1DatabaseLike = {
    prepare(query: string): D1PreparedStatementLike {
      let boundValues: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          if (values.length > limit) {
            throw new Error('too many SQL variables');
          }
          boundValues = values;
          return this;
        },
        async first<T>(): Promise<T | null> {
          binds.push({ query, values: boundValues });
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          binds.push({ query, values: boundValues });
          return { results: [] };
        },
        async run(): Promise<unknown> {
          binds.push({ query, values: boundValues });
          return { meta: { changes: 0 } };
        },
      };
    },
    async exec(): Promise<unknown> {
      return undefined;
    },
  };
  return { db, binds };
}

function createNoopBucket(): R2BucketLike {
  return {
    async put() {
      return undefined;
    },
    async get() {
      return null;
    },
    async delete() {
      return undefined;
    },
  };
}

describe('cloudflare storage domain query chunking', () => {
  test('chunks user_icon_state domain lookups to stay under D1 variable limits', async () => {
    const { db, binds } = createMockDbWithVariableLimit(100);
    const storage = createCloudflareVaultLiteStorage({
      db,
      bucket: createNoopBucket(),
    });
    const domains = Array.from({ length: 260 }, (_, index) => `portal-${index}.example.com`);

    await expect(storage.userIconState.listByUserIdAndDomains('user_1', domains)).resolves.toEqual([]);

    const iconStateQueries = binds.filter(({ query }) => query.includes('FROM user_icon_state'));
    expect(iconStateQueries.length).toBe(3);
    for (const entry of iconStateQueries) {
      expect(entry.values.length).toBeLessThanOrEqual(91);
    }
  });

  test('chunks manual icon domain lookups to stay under D1 variable limits', async () => {
    const { db, binds } = createMockDbWithVariableLimit(100);
    const storage = createCloudflareVaultLiteStorage({
      db,
      bucket: createNoopBucket(),
    });
    const domains = Array.from({ length: 260 }, (_, index) => `manual-${index}.example.com`);

    await expect(storage.manualSiteIconOverrides.listByUserIdAndDomains('user_1', domains)).resolves.toEqual([]);

    const manualQueries = binds.filter(({ query }) => query.includes('FROM manual_site_icon_overrides'));
    expect(manualQueries.length).toBe(3);
    for (const entry of manualQueries) {
      expect(entry.values.length).toBeLessThanOrEqual(91);
    }
  });

  test('chunks shared form metadata origin lookups to stay under D1 variable limits', async () => {
    const { db, binds } = createMockDbWithVariableLimit(100);
    const storage = createCloudflareVaultLiteStorage({
      db,
      bucket: createNoopBucket(),
    });
    const origins = Array.from({ length: 260 }, (_, index) => `https://portal-${index}.example.com`);

    await expect(storage.vaultFormMetadata.listByOrigins({ origins, limitPerOrigin: 20 })).resolves.toEqual([]);

    const metadataQueries = binds.filter(({ query }) => query.includes('FROM vault_form_metadata'));
    expect(metadataQueries.length).toBe(3);
    for (const entry of metadataQueries) {
      expect(entry.values.length).toBeLessThanOrEqual(90);
    }
  });
});
