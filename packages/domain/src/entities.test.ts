import { describe, expect, it } from 'vitest';

import {
  VAULT_ITEM_TYPES,
  type VaultItemPayloadByType,
  type VaultItemRecord,
  type VaultItemTombstoneRecord,
} from './entities';

describe('domain vault entities', () => {
  it('exposes canonical vault item types', () => {
    expect(VAULT_ITEM_TYPES).toEqual(['login', 'document', 'card', 'secure_note']);
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

  it('keeps payload types distinct across login, document, card and secure note', () => {
    const loginPayload: VaultItemPayloadByType['login'] = {
      title: 'Email',
      username: 'alice@example.com',
      password: 'secret',
      urls: ['https://mail.example.com'],
      notes: '',
      customFields: [],
    };
    const documentPayload: VaultItemPayloadByType['document'] = {
      title: 'Secure note',
      content: 'hello',
      customFields: [],
    };
    const cardPayload: VaultItemPayloadByType['card'] = {
      title: 'Main card',
      cardholderName: 'Alice',
      brand: 'Visa',
      number: '4111111111111111',
      expiryMonth: '12',
      expiryYear: '2030',
      securityCode: '123',
      notes: '',
      customFields: [],
    };
    const secureNotePayload: VaultItemPayloadByType['secure_note'] = {
      title: 'Infra',
      content: 'server notes',
      customFields: [],
    };

    expect(loginPayload.urls).toEqual(['https://mail.example.com']);
    expect(documentPayload.content).toBe('hello');
    expect(cardPayload.brand).toBe('Visa');
    expect(secureNotePayload.content).toBe('server notes');
  });

  it('supports tombstone records for deleted vault items', () => {
    const tombstone: VaultItemTombstoneRecord = {
      itemId: 'item_1',
      ownerUserId: 'user_1',
      itemType: 'login',
      revision: 3,
      encryptedPayload: 'encrypted_payload_v2',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:05:00.000Z',
      deletedAt: '2026-03-15T12:10:00.000Z',
    };

    expect(tombstone.revision).toBe(3);
    expect(tombstone.deletedAt).toBe('2026-03-15T12:10:00.000Z');
  });
});
