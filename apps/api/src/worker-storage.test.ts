import { describe, expect, test } from 'vitest';

import { createWorkerStorage } from './index';

describe('createWorkerStorage', () => {
  test('uses cloudflare bindings when local D1 and R2 bindings are available', async () => {
    const preparedSql: string[] = [];
    const fakeDb = {
      prepare(query: string) {
        preparedSql.push(query);
        return {
          bind() {
            return this;
          },
          first() {
            throw new Error('Not used in worker storage test');
          },
          all() {
            throw new Error('Not used in worker storage test');
          },
          async run() {
            return undefined;
          },
        };
      },
      async exec() {
        throw new Error('exec should not be used in worker storage test');
      },
    };
    const fakeBucket = {
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

    const storage = await createWorkerStorage({
      VAULTLITE_DB: fakeDb,
      VAULTLITE_BLOBS: fakeBucket,
    });

    expect(preparedSql.length).toBeGreaterThan(0);
    expect(storage).toHaveProperty('invites');
    expect(storage).toHaveProperty('users');
    expect(storage).toHaveProperty('attachmentBlobs');
  });

  test('falls back to in-memory storage when local bindings are absent', async () => {
    const storage = await createWorkerStorage({});

    expect(storage).toHaveProperty('invites');
    expect(storage).toHaveProperty('users');
    expect(storage).toHaveProperty('attachmentBlobs');
  });
});
