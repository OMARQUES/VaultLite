import { beforeEach, describe, expect, test, vi } from 'vitest';

import { hydrateVaultFoldersFromServer } from './vault-folder-sync';
import { loadVaultUiState } from './vault-ui-state';
import type { VaultLiteAuthClient } from './auth-client';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('vault-folder-sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('reruns folder hydration once when another revalidation arrives during an in-flight sync', async () => {
    const firstResponseDeferred = createDeferred<
      | {
          status: 'ok';
          etag: string | null;
          payload: {
            folders: Array<{ folderId: string; name: string }>;
            assignments: Array<{ itemId: string; folderId: string }>;
          };
        }
      | {
          status: 'not_modified';
          etag: string | null;
        }
    >();
    const listVaultFoldersState = vi
      .fn()
      .mockImplementationOnce(async () => firstResponseDeferred.promise)
      .mockResolvedValueOnce({
        status: 'ok',
        etag: 'etag-2',
        payload: {
          folders: [{ folderId: 'folder_sigfarm', name: 'Sigfarm' }],
          assignments: [{ itemId: 'item_1', folderId: 'folder_sigfarm' }],
        },
      });

    const authClient = {
      listVaultFoldersState,
      upsertVaultFolder: vi.fn(),
      assignVaultFolder: vi.fn(),
    } as unknown as VaultLiteAuthClient;

    const firstHydration = hydrateVaultFoldersFromServer('alice', authClient, { force: true });
    const secondHydration = hydrateVaultFoldersFromServer('alice', authClient, { force: true });

    firstResponseDeferred.resolve({
      status: 'ok',
      etag: 'etag-1',
      payload: {
        folders: [{ folderId: 'folder_sigfarm', name: 'Sigfarm' }],
        assignments: [],
      },
    });

    await Promise.all([firstHydration, secondHydration]);

    expect(listVaultFoldersState).toHaveBeenCalledTimes(2);
    expect(loadVaultUiState('alice').folderAssignments).toEqual({
      item_1: 'folder_sigfarm',
    });
  });
});
