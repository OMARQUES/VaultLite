import { describe, expect, test } from 'vitest';

import { canAttemptFill, filterProjectedItems, projectForPopup } from './background-controller';

describe('background-controller helpers', () => {
  test('projects multi-type items and prioritizes exact-origin logins', () => {
    const projected = projectForPopup({
      pageUrl: 'https://app.example.com/login',
      isDevelopment: false,
      items: [
        {
          itemId: 'item_b',
          itemType: 'login',
          title: 'B',
          username: 'b@example.com',
          password: 'b',
          urls: ['https://example.com/login'],
        },
        {
          itemId: 'item_a',
          itemType: 'login',
          title: 'A',
          username: 'a@example.com',
          password: 'a',
          urls: ['https://app.example.com/login'],
        },
        {
          itemId: 'item_card',
          itemType: 'card',
          title: 'Business Visa',
          cardholderName: 'Alice',
          number: '4111111111111111',
          securityCode: '123',
          expiryMonth: 12,
          expiryYear: 2030,
          notes: 'Corporate',
        },
        {
          itemId: 'item_note',
          itemType: 'secure_note',
          title: 'WiFi Password',
          content: 'Secret',
        },
      ],
    });

    expect(projected[0]?.itemId).toBe('item_a');
    expect(projected[0]?.matchFlags.exactOrigin).toBe(true);
    expect(projected.map((entry) => entry.itemType)).toContain('card');
    expect(projected.map((entry) => entry.itemType)).toContain('secure_note');
  });

  test('applies type filter and suggested filter against a unified list', () => {
    const projected = projectForPopup({
      pageUrl: 'https://app.example.com/login',
      isDevelopment: false,
      items: [
        {
          itemId: 'item_login',
          itemType: 'login',
          title: 'Login',
          username: 'alice@example.com',
          password: 'a',
          urls: ['https://app.example.com/login'],
        },
        {
          itemId: 'item_doc',
          itemType: 'document',
          title: 'Passport',
          content: 'Document body',
        },
      ],
    });

    expect(
      filterProjectedItems({
        items: projected,
        query: '',
        typeFilter: 'login',
        suggestedOnly: false,
      }).map((entry) => entry.itemId),
    ).toEqual(['item_login']);

    expect(
      filterProjectedItems({
        items: projected,
        query: '',
        typeFilter: 'all',
        suggestedOnly: true,
      }).map((entry) => entry.itemId),
    ).toEqual(['item_login']);
  });

  test('blocks fill when site is not eligible or credential does not match origin', () => {
    expect(
      canAttemptFill({
        pageUrl: 'chrome://settings',
        credentialUrls: ['https://app.example.com/login'],
        isDevelopment: false,
        topLevel: true,
      }),
    ).toBe('manual_fill_unavailable');

    expect(
      canAttemptFill({
        pageUrl: 'https://evil.example.com',
        credentialUrls: ['https://app.example.com/login'],
        isDevelopment: false,
        topLevel: true,
      }),
    ).toBe('credential_not_allowed_for_site');
  });
});
