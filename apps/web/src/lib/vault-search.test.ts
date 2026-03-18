import { describe, expect, test } from 'vitest';

import type { VaultWorkspaceItem } from './vault-workspace';
import { buildVaultSearchIndex, queryVaultSearchIndex } from './vault-search';

describe('vault local search helpers', () => {
  test('indexes only approved login fields and excludes passwords', () => {
    const items: VaultWorkspaceItem[] = [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'GitHub',
          username: 'alice@example.com',
          password: 'SuperSecretPassword123',
          urls: ['https://github.com/login'],
          notes: 'Personal account',
          customFields: [{ label: 'Workspace', value: 'Main' }],
        },
      },
    ];

    const index = buildVaultSearchIndex(items);
    const entry = index.get('item_1');

    expect(entry).toBeDefined();
    expect(entry?.haystack).toContain('github');
    expect(entry?.haystack).toContain('alice@example.com');
    expect(entry?.haystack).toContain('github.com');
    expect(entry?.haystack).toContain('personal account');
    expect(entry?.haystack).toContain('workspace');
    expect(entry?.haystack).toContain('main');
    expect(entry?.haystack).not.toContain('supersecretpassword123');
  });

  test('indexes document title and content and applies case-insensitive AND query semantics', () => {
    const items: VaultWorkspaceItem[] = [
      {
        itemId: 'item_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Bank note',
          content: 'Contains routing and branch instructions',
          customFields: [
            { label: 'Branch', value: 'North' },
            { label: 'Environment', value: 'Prod' },
          ],
        },
      },
      {
        itemId: 'item_2',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Travel note',
          content: 'Contains hotel booking details',
          customFields: [],
        },
      },
    ];

    const index = buildVaultSearchIndex(items);

    expect(queryVaultSearchIndex(index, 'BANK routing')).toEqual(['item_1']);
    expect(queryVaultSearchIndex(index, 'branch north')).toEqual(['item_1']);
    expect(queryVaultSearchIndex(index, 'booking bank')).toEqual([]);
  });

  test('indexes card and secure note payload fields', () => {
    const items: VaultWorkspaceItem[] = [
      {
        itemId: 'item_card_1',
        itemType: 'card',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Corporate card',
          cardholderName: 'Alice Doe',
          brand: 'Visa',
          number: '4111111111111111',
          expiryMonth: '12',
          expiryYear: '2030',
          securityCode: '123',
          notes: 'Shared billing',
          customFields: [{ label: 'Cost center', value: 'fin-12' }],
        },
      },
      {
        itemId: 'item_note_1',
        itemType: 'secure_note',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Root access',
          content: 'Use emergency vault process',
          customFields: [{ label: 'Owner', value: 'SRE' }],
        },
      },
    ];

    const index = buildVaultSearchIndex(items);

    expect(queryVaultSearchIndex(index, 'visa fin-12')).toEqual(['item_card_1']);
    expect(queryVaultSearchIndex(index, 'root emergency sre')).toEqual(['item_note_1']);
  });
});
