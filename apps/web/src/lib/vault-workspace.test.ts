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
        customFields: [],
      };
    }

    if (encryptedPayload === 'encrypted_card_payload_v1') {
      return {
        title: 'Corporate card',
        cardholderName: 'Alice',
        brand: 'Visa',
        number: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '2030',
        securityCode: '123',
        notes: '',
        customFields: [],
      };
    }

    if (encryptedPayload === 'encrypted_secure_note_payload_v1') {
      return {
        title: 'Incident note',
        content: 'Escalation contacts',
        customFields: [],
      };
    }

    return {
      title: 'Secure note',
      content: 'hello',
      customFields: [],
    };
  }),
  encryptVaultItemPayload: vi.fn(async ({ itemType }: { itemType: 'login' | 'document' | 'card' | 'secure_note' }) => {
    if (itemType === 'login') return 'encrypted_login_payload';
    if (itemType === 'card') return 'encrypted_card_payload';
    if (itemType === 'secure_note') return 'encrypted_secure_note_payload';
    return 'encrypted_document_payload';
  }),
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
      customFields: [],
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
          customFields: [],
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
        customFields: [],
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
          customFields: [],
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
          customFields: [],
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

  test('creates card and secure note items', async () => {
    const dependencies = createDependencies();
    const workspace = createVaultWorkspace(dependencies as never);

    dependencies.vaultClient.createItem
      .mockResolvedValueOnce({
        itemId: 'item_card_1',
        itemType: 'card',
        revision: 1,
        encryptedPayload: 'encrypted_card_payload_v1',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
      })
      .mockResolvedValueOnce({
        itemId: 'item_note_1',
        itemType: 'secure_note',
        revision: 1,
        encryptedPayload: 'encrypted_secure_note_payload_v1',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
      });

    await workspace.createCard({
      title: 'Corporate card',
      cardholderName: 'Alice',
      brand: 'Visa',
      number: '4111111111111111',
      expiryMonth: '12',
      expiryYear: '2030',
      securityCode: '123',
      notes: '',
      customFields: [],
    });

    await workspace.createSecureNote({
      title: 'Incident note',
      content: 'Escalation contacts',
      customFields: [],
    });

    expect(dependencies.vaultClient.createItem).toHaveBeenNthCalledWith(1, {
      itemType: 'card',
      encryptedPayload: expect.any(String),
    });
    expect(dependencies.vaultClient.createItem).toHaveBeenNthCalledWith(2, {
      itemType: 'secure_note',
      encryptedPayload: expect.any(String),
    });
    expect(workspace.state.items).toHaveLength(2);
    expect(workspace.state.items[0]?.itemType).toBe('card');
    expect(workspace.state.items[1]?.itemType).toBe('secure_note');
  });
});
