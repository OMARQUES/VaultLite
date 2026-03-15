import { describe, expect, test, vi } from 'vitest';

vi.mock('./browser-crypto', () => ({
  decryptVaultItemPayload: vi.fn(async ({ encryptedPayload }: { encryptedPayload: string }) => {
    if (encryptedPayload === 'encrypted_payload_v1') {
      return {
        title: 'Email',
        username: 'alice@example.com',
        password: 'super-secret',
        urls: ['https://mail.example.com'],
        notes: '',
      };
    }

    return {
      title: 'Secure note',
      content: 'hello',
    };
  }),
  encryptVaultItemPayload: vi.fn(async ({ itemType }: { itemType: 'login' | 'document' }) =>
    itemType === 'login' ? 'encrypted_login_payload' : 'encrypted_document_payload',
  ),
}));

import { createVaultWorkspace } from './vault-workspace';

function createDependencies() {
  return {
    sessionStore: {
      getUnlockedVaultContext: vi.fn().mockReturnValue({
        username: 'alice',
        accountKey: 'A'.repeat(43),
      }),
    },
    vaultClient: {
      listItems: vi.fn().mockResolvedValue({
        items: [],
      }),
      createItem: vi.fn().mockResolvedValue({
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        encryptedPayload: 'encrypted_payload_v1',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
      }),
      updateItem: vi.fn().mockResolvedValue({
        itemId: 'item_1',
        itemType: 'login',
        revision: 2,
        encryptedPayload: 'encrypted_payload_v2',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:05:00.000Z',
      }),
      deleteItem: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('createVaultWorkspace', () => {
  test('loads encrypted records and exposes decrypted items for the unlocked user', async () => {
    const dependencies = createDependencies();
    dependencies.vaultClient.listItems.mockResolvedValue({
      items: [
        {
          itemId: 'item_1',
          itemType: 'login',
          revision: 1,
          encryptedPayload: 'encrypted_payload_v1',
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:00:00.000Z',
        },
      ],
    });
    const workspace = createVaultWorkspace(dependencies as never);

    await workspace.load();

    expect(dependencies.vaultClient.listItems).toHaveBeenCalledTimes(1);
    expect(workspace.state.items).toEqual([
      expect.objectContaining({
        itemId: 'item_1',
        itemType: 'login',
      }),
    ]);
  });

  test('creates and updates login items using encrypted payloads and revision checks', async () => {
    const dependencies = createDependencies();
    const workspace = createVaultWorkspace(dependencies as never);

    await workspace.createLogin({
      title: 'Email',
      username: 'alice@example.com',
      password: 'super-secret',
      urls: ['https://mail.example.com'],
      notes: '',
    });

    expect(dependencies.vaultClient.createItem).toHaveBeenCalledWith({
      itemType: 'login',
      encryptedPayload: expect.any(String),
    });

    workspace.state.items = [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Email',
          username: 'alice@example.com',
          password: 'super-secret',
          urls: ['https://mail.example.com'],
          notes: '',
        },
      },
    ];

    await workspace.updateItem({
      itemId: 'item_1',
      itemType: 'login',
      revision: 1,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
      payload: {
        title: 'Email',
        username: 'alice@example.com',
        password: 'rotated-secret',
        urls: ['https://mail.example.com'],
        notes: '',
      },
    });

    expect(dependencies.vaultClient.updateItem).toHaveBeenCalledWith({
      itemId: 'item_1',
      itemType: 'login',
      encryptedPayload: expect.any(String),
      expectedRevision: 1,
    });
  });

  test('deletes items and surfaces revision conflicts as actionable errors', async () => {
    const dependencies = createDependencies();
    dependencies.vaultClient.updateItem.mockRejectedValue(
      new Error('Request failed with status 409 (revision_conflict)'),
    );
    const workspace = createVaultWorkspace(dependencies as never);

    workspace.state.items = [
      {
        itemId: 'item_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Secure note',
          content: 'hello',
        },
      },
    ];

    await expect(
      workspace.updateItem({
        itemId: 'item_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Secure note',
          content: 'updated',
        },
      }),
    ).rejects.toThrow('Request failed with status 409 (revision_conflict)');

    await workspace.deleteItem('item_1');
    expect(dependencies.vaultClient.deleteItem).toHaveBeenCalledWith('item_1');
    expect(workspace.state.items).toEqual([]);
  });

  test('builds and updates an in-memory search index for approved fields only', async () => {
    const dependencies = createDependencies();
    dependencies.vaultClient.listItems.mockResolvedValue({
      items: [
        {
          itemId: 'item_1',
          itemType: 'login',
          revision: 1,
          encryptedPayload: 'encrypted_payload_v1',
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:00:00.000Z',
        },
      ],
    });
    const workspace = createVaultWorkspace(dependencies as never);

    await workspace.load();
    workspace.setSearchQuery('alice');
    expect(workspace.filteredItems.value).toHaveLength(1);

    workspace.setSearchQuery('super-secret');
    expect(workspace.filteredItems.value).toHaveLength(0);

    await workspace.deleteItem('item_1');
    workspace.setSearchQuery('alice');
    expect(workspace.filteredItems.value).toEqual([]);
  });
});
