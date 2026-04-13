import { describe, expect, test } from 'vitest';

import {
  canAttemptFill,
  filterProjectedItems,
  projectForPopup,
  resolveInlineAssistPrefetch,
  resolveInlineAssistQuery,
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

  test('returns ordered inline assist query results and only auto-opens strong matches', () => {
    const result = resolveInlineAssistQuery({
      pageUrl: 'https://www.linkedin.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: true,
      query: '',
      limit: 5,
      target: {
        contextGroupKey: 'group-1',
        frameScope: 'top',
        mode: 'full_login',
        fieldRole: 'username',
        formFingerprint: 'fm_login',
        fieldFingerprint: 'fm_username',
      },
      items: [
        {
          itemId: 'item_exact',
          itemType: 'login',
          title: 'LinkedIn Exact',
          subtitle: 'alice@example.com',
          urls: ['https://www.linkedin.com/login'],
        },
        {
          itemId: 'item_metadata',
          itemType: 'login',
          title: 'LinkedIn Confirmed',
          subtitle: 'alice+confirmed@example.com',
          urls: ['https://linkedin.com'],
        },
        {
          itemId: 'item_domain',
          itemType: 'login',
          title: 'LinkedIn Domain',
          subtitle: 'alice+domain@example.com',
          urls: ['https://linkedin.com'],
        },
      ],
      formMetadataRecords: [
        {
          itemId: 'item_metadata',
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

    expect(result).toMatchObject({
      status: 'ready',
      matchKind: 'metadata_confirmed',
      autoOpenEligible: true,
      primary: {
        itemId: 'item_metadata',
        matchKind: 'metadata_confirmed',
        fillMode: 'open-and-fill',
      },
    });
    expect(result.results.map((entry) => entry.itemId)).toEqual(['item_metadata', 'item_exact', 'item_domain']);
  });

  test('propagates favicon candidates into inline assist query results', () => {
    const result = resolveInlineAssistQuery({
      pageUrl: 'https://www.linkedin.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: true,
      query: '',
      limit: 5,
      target: {
        contextGroupKey: 'group-1',
        frameScope: 'top',
        mode: 'full_login',
        fieldRole: 'username',
        formFingerprint: 'fm_login',
        fieldFingerprint: 'fm_username',
      },
      items: [
        {
          itemId: 'item_exact',
          itemType: 'login',
          title: 'LinkedIn Exact',
          subtitle: 'alice@example.com',
          urls: ['https://www.linkedin.com/login'],
          faviconCandidates: ['data:image/png;base64,AAA'],
        },
      ],
      formMetadataRecords: [],
    });

    expect(result.primary).toMatchObject({
      itemId: 'item_exact',
      iconUrl: 'data:image/png;base64,AAA',
    });
    expect(result.results[0]).toMatchObject({
      itemId: 'item_exact',
      iconUrl: 'data:image/png;base64,AAA',
    });
  });

  test('returns only site-valid inline assist query results and ignores query filtering', () => {
    const result = resolveInlineAssistQuery({
      pageUrl: 'https://www.linkedin.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: false,
      query: 'secondary',
      limit: 5,
      target: {
        contextGroupKey: 'group-1',
        frameScope: 'top',
        mode: 'full_login',
        fieldRole: 'username',
        formFingerprint: 'fm_login',
        fieldFingerprint: 'fm_username',
      },
      items: [
        {
          itemId: 'item_primary',
          itemType: 'login',
          title: 'LinkedIn Primary',
          subtitle: 'alice@example.com',
          urls: ['https://www.linkedin.com/login'],
        },
        {
          itemId: 'item_secondary_exact',
          itemType: 'login',
          title: 'LinkedIn Secondary',
          subtitle: 'secondary@example.com',
          urls: ['https://www.linkedin.com/login'],
        },
        {
          itemId: 'item_secondary_domain',
          itemType: 'login',
          title: 'LinkedIn Secondary Archive',
          subtitle: 'secondary-archive@example.com',
          urls: ['https://linkedin.com'],
        },
      ],
      formMetadataRecords: [],
    });

    expect(result).toMatchObject({
      status: 'ready',
      matchKind: 'exact_origin',
      autoOpenEligible: true,
    });
    expect(result.results.map((entry) => entry.itemId)).toEqual([
      'item_primary',
      'item_secondary_exact',
      'item_secondary_domain',
    ]);
  });

  test('does not return unrelated vault credentials in inline assist query results', () => {
    const result = resolveInlineAssistQuery({
      pageUrl: 'https://www.linkedin.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: true,
      query: 'outlook',
      limit: 5,
      target: {
        contextGroupKey: 'group-1',
        frameScope: 'top',
        mode: 'full_login',
        fieldRole: 'username',
        formFingerprint: 'fm_login',
        fieldFingerprint: 'fm_username',
      },
      items: [
        {
          itemId: 'item_outlook',
          itemType: 'login',
          title: 'Outlook Account',
          subtitle: 'shared.outlook@example.com',
          urls: ['https://outlook.live.com'],
        },
      ],
      formMetadataRecords: [],
    });

    expect(result).toMatchObject({
      status: 'no_match',
      matchKind: 'none',
      autoOpenEligible: false,
      primary: null,
    });
    expect(result.results).toEqual([]);
  });

  test('does not auto-open medium confidence inline query results', () => {
    const result = resolveInlineAssistQuery({
      pageUrl: 'https://www.linkedin.com/login',
      isDevelopment: false,
      siteAutomationPermissionGranted: false,
      query: '',
      limit: 5,
      target: {
        contextGroupKey: 'group-1',
        frameScope: 'top',
        mode: 'full_login',
        fieldRole: 'password_current',
        formFingerprint: 'fm_login',
        fieldFingerprint: 'fm_password',
      },
      items: [
        {
          itemId: 'item_heuristic',
          itemType: 'login',
          title: 'LinkedIn Heuristic',
          subtitle: 'alice@example.com',
          urls: ['https://linkedin.com'],
        },
      ],
      formMetadataRecords: [
        {
          itemId: 'item_heuristic',
          ownerUserId: 'user_1',
          origin: 'https://www.linkedin.com',
          formFingerprint: 'fm_login',
          fieldFingerprint: 'fm_password',
          fieldRole: 'password_current',
          confidence: 'heuristic',
          selectorStatus: 'active',
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'ready',
      matchKind: 'domain_match',
      autoOpenEligible: false,
    });
  });
});
