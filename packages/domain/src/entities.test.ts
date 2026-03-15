import { describe, expect, it } from 'vitest';

import {
  VAULT_ITEM_TYPES,
  type VaultItemPayloadByType,
  type VaultItemRecord,
  type VaultItemTombstoneRecord,
} from './entities';

describe('domain vault entities', () => {
  it('exposes canonical vault item types', () => {
    expect(VAULT_ITEM_TYPES).toEqual(['login', 'document']);
  });

  it('supports revisioned encrypted item records', () => {
    const record: VaultItemRecord = {
      itemId: 'item_1',
      ownerUserId: 'user_1',
      itemType: 'login',
      revision: 2,
      encryptedPayload: 'encrypted_payload_v2',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:05:00.000Z',
    };

    expect(record.revision).toBe(2);
    expect(record.encryptedPayload).toBe('encrypted_payload_v2');
  });

  it('keeps login and document payload types distinct', () => {
    const loginPayload: VaultItemPayloadByType['login'] = {
      title: 'Email',
      username: 'alice@example.com',
      password: 'secret',
      urls: ['https://mail.example.com'],
      notes: '',
    };
    const documentPayload: VaultItemPayloadByType['document'] = {
      title: 'Secure note',
      content: 'hello',
    };

    expect(loginPayload.urls).toEqual(['https://mail.example.com']);
    expect(documentPayload.content).toBe('hello');
  });

  it('supports tombstone records for deleted vault items', () => {
    const tombstone: VaultItemTombstoneRecord = {
      itemId: 'item_1',
      ownerUserId: 'user_1',
      itemType: 'login',
      revision: 3,
      deletedAt: '2026-03-15T12:10:00.000Z',
    };

    expect(tombstone.revision).toBe(3);
    expect(tombstone.deletedAt).toBe('2026-03-15T12:10:00.000Z');
  });
});
