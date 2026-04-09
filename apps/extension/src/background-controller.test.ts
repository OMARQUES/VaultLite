import { describe, expect, test } from 'vitest';

import {
  canAttemptFill,
  filterProjectedItems,
  projectForPopup,
  resolveInlineAssistPrefetch,
} from './background-controller';

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

  test('prefers metadata-confirmed inline candidate over weaker domain-only matches', () => {
    const result = resolveInlineAssistPrefetch({
      pageUrl: 'https://www.linkedin.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: true,
      targets: [
        {
          contextGroupKey: 'group-1',
          frameScope: 'top',
          mode: 'full_login',
          fieldRole: 'username',
          formFingerprint: 'fm_login',
          fieldFingerprint: 'fm_username',
        },
      ],
      items: [
        {
          itemId: 'item_exact',
          itemType: 'login',
          title: 'LinkedIn Primary',
          subtitle: 'alice@example.com',
          urls: ['https://www.linkedin.com/login'],
        },
        {
          itemId: 'item_domain_only',
          itemType: 'login',
          title: 'LinkedIn Secondary',
          subtitle: 'other@example.com',
          urls: ['https://linkedin.com'],
        },
      ],
      formMetadataRecords: [
        {
          itemId: 'item_domain_only',
          ownerUserId: 'user_1',
          origin: 'https://www.linkedin.com',
          formFingerprint: 'fm_login',
          fieldFingerprint: 'fm_username',
          fieldRole: 'username',
          confidence: 'submitted_confirmed',
          selectorStatus: 'active',
        },
      ],
    });

    expect(result['group-1']).toMatchObject({
      status: 'ready',
      bestItemId: 'item_domain_only',
      matchKind: 'metadata_confirmed',
      fillMode: 'open-and-fill',
      candidateCount: 2,
    });
  });

  test('returns no_match when no inline candidates are relevant for the page', () => {
    const result = resolveInlineAssistPrefetch({
      pageUrl: 'https://shop.example.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: true,
      targets: [
        {
          contextGroupKey: 'group-1',
          frameScope: 'top',
          mode: 'full_login',
          fieldRole: 'password_current',
          formFingerprint: 'fm_login',
          fieldFingerprint: 'fm_password',
        },
      ],
      items: [
        {
          itemId: 'item_other',
          itemType: 'login',
          title: 'Unrelated',
          subtitle: 'alice@example.com',
          urls: ['https://portal.other.example.com'],
        },
      ],
      formMetadataRecords: [],
    });

    expect(result['group-1']).toMatchObject({
      status: 'no_match',
      bestItemId: null,
      matchKind: 'none',
      candidateCount: 0,
      fillMode: null,
    });
  });
});
