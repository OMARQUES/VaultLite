import { describe, expect, test } from 'vitest';

import {
  buildPersistedPopupUiState,
  buildCredentialMonogram,
  filterPopupItemsLocally,
  parsePersistedPopupUiState,
  resolveRowQuickAction,
  resolvePopupPhase,
  hasSameItemOrder,
  hasSameRenderableRows,
  shouldRenderVaultSkeleton,
  shouldPreserveVisibleListDuringWarmup,
  toNavigableUrl,
  selectItemIdAfterRefresh,
  toggleSelectedItem,
  shouldUseExpandedLayout,
} from '../popup-view-model.js';
import { buildFaviconCandidates } from '../favicon-candidates.js';

describe('popup view model helpers', () => {
  test('keeps selected item when still present after refresh', () => {
    const items = [{ itemId: 'a' }, { itemId: 'b' }];
    expect(selectItemIdAfterRefresh('b', items)).toBe('b');
  });

  test('clears selection when previous selection disappears', () => {
    const items = [{ itemId: 'a' }, { itemId: 'b' }];
    expect(selectItemIdAfterRefresh('z', items)).toBe('a');
  });

  test('keeps list collapsed while no item has been selected yet', () => {
    const items = [{ itemId: 'a' }, { itemId: 'b' }];
    expect(selectItemIdAfterRefresh(null, items)).toBeNull();
  });

  test('returns null when no items are available', () => {
    expect(selectItemIdAfterRefresh('a', [])).toBeNull();
    expect(selectItemIdAfterRefresh(null, [])).toBeNull();
  });

  test('generates stable monogram for credential title', () => {
    expect(buildCredentialMonogram('Real Debrid')).toBe('RD');
    expect(buildCredentialMonogram('amazon')).toBe('AM');
    expect(buildCredentialMonogram('')).toBe('VL');
  });

  test('uses expanded layout only when an item is selected', () => {
    expect(shouldUseExpandedLayout(null)).toBe(false);
    expect(shouldUseExpandedLayout('item_1')).toBe(true);
  });

  test('toggles selected item id when clicking the same row again', () => {
    expect(toggleSelectedItem(null, 'item_1')).toBe('item_1');
    expect(toggleSelectedItem('item_1', 'item_1')).toBeNull();
    expect(toggleSelectedItem('item_1', 'item_2')).toBe('item_2');
  });

  test('detects stable item order for list scroll preservation', () => {
    expect(
      hasSameItemOrder(
        [
          { itemId: 'a' },
          { itemId: 'b' },
        ],
        [
          { itemId: 'a' },
          { itemId: 'b' },
        ],
      ),
    ).toBe(true);
    expect(
      hasSameItemOrder(
        [
          { itemId: 'a' },
          { itemId: 'b' },
        ],
        [
          { itemId: 'b' },
          { itemId: 'a' },
        ],
      ),
    ).toBe(false);
  });

  test('detects renderable row stability while allowing favicon-only updates', () => {
    const base = [
      {
        itemId: 'a',
        itemType: 'login',
        title: 'Amazon',
        subtitle: 'user@example.com',
        urlHostSummary: 'amazon.com',
        firstUrl: 'https://amazon.com',
        matchFlags: { exactOrigin: true, domainScore: 4 },
        faviconCandidates: ['data:image/png;base64,AAA'],
      },
    ];
    const same = [
      {
        itemId: 'a',
        itemType: 'login',
        title: 'Amazon',
        subtitle: 'user@example.com',
        urlHostSummary: 'amazon.com',
        firstUrl: 'https://amazon.com',
        matchFlags: { exactOrigin: true, domainScore: 4 },
        faviconCandidates: ['data:image/png;base64,AAA'],
      },
    ];
    const changedFavicon = [
      {
        ...same[0],
        faviconCandidates: ['data:image/png;base64,BBB'],
      },
    ];

    expect(hasSameRenderableRows(base, same, { pageEligible: true, fillDisabledReason: null })).toBe(true);
    expect(hasSameRenderableRows(base, changedFavicon, { pageEligible: true, fillDisabledReason: null })).toBe(true);
  });

  test('renders skeleton only when loading/warmup needs first paint', () => {
    expect(
      shouldRenderVaultSkeleton({
        vaultLoading: true,
        warmupState: 'running',
        hasReadySnapshot: false,
        suppressSkeleton: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderVaultSkeleton({
        vaultLoading: false,
        warmupState: 'running',
        hasReadySnapshot: true,
        suppressSkeleton: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderVaultSkeleton({
        vaultLoading: false,
        warmupState: 'running',
        hasReadySnapshot: false,
        suppressSkeleton: true,
      }),
    ).toBe(false);
  });

  test('prefers quick fill action for suggested login on eligible page', () => {
    const action = resolveRowQuickAction({
      item: {
        itemType: 'login',
        firstUrl: 'https://kabum.com.br',
        matchFlags: { exactOrigin: true, domainScore: 5 },
      },
      pageEligible: true,
      siteAutomationPermissionGranted: true,
      fillDisabledReason: null,
    });
    expect(action).toEqual({
      type: 'fill',
      disabled: false,
      tooltip: 'Fill credentials on this page',
    });
  });

  test('falls back to open-url quick action for non-suggested login', () => {
    const action = resolveRowQuickAction({
      item: {
        itemType: 'login',
        firstUrl: 'https://amazon.com.br',
        matchFlags: { exactOrigin: false, domainScore: 0 },
      },
      pageEligible: true,
      siteAutomationPermissionGranted: false,
      fillDisabledReason: null,
    });
    expect(action).toEqual({
      type: 'open-url',
      disabled: false,
      tooltip: 'Open site URL',
    });
  });

  test('uses open-and-fill action for login outside current site when automation permission is granted', () => {
    const action = resolveRowQuickAction({
      item: {
        itemType: 'login',
        firstUrl: 'https://amazon.com.br',
        matchFlags: { exactOrigin: false, domainScore: 0 },
      },
      pageEligible: true,
      siteAutomationPermissionGranted: true,
      fillDisabledReason: null,
    });
    expect(action).toEqual({
      type: 'open-and-fill',
      disabled: false,
      tooltip: 'Open site and fill credentials',
    });
  });

  test('prefers background-recommended fill action over stale match flags', () => {
    const action = resolveRowQuickAction({
      item: {
        itemType: 'login',
        firstUrl: 'https://amazon.com.br',
        matchFlags: { exactOrigin: false, domainScore: 0 },
        rowAction: 'fill',
      },
      pageEligible: false,
      siteAutomationPermissionGranted: true,
      fillDisabledReason: null,
    });
    expect(action).toEqual({
      type: 'fill',
      disabled: false,
      tooltip: 'Fill credentials on this page',
    });
  });

  test('builds favicon candidates for valid login urls', () => {
    const candidates = buildFaviconCandidates('https://portal.example.com/login');
    expect(candidates).toEqual([
      'https://portal.example.com/favicon.ico',
      'https://portal.example.com/favicon.png',
      'https://portal.example.com/apple-touch-icon.png',
      'https://portal.example.com/apple-touch-icon-precomposed.png',
      'https://www.google.com/s2/favicons?domain=portal.example.com&sz=64',
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    ]);
  });

  test('returns empty favicon candidates for invalid url', () => {
    expect(buildFaviconCandidates('not a url')).toEqual([]);
    expect(buildFaviconCandidates('')).toEqual([]);
  });

  test('normalizes url for navigation preserving explicit protocol', () => {
    expect(toNavigableUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(toNavigableUrl('example.com/login')).toBe('https://example.com/login');
    expect(toNavigableUrl('')).toBeNull();
  });

  test('resolves anonymous state to unlock when trusted state exists', () => {
    expect(resolvePopupPhase({ phase: 'anonymous', hasTrustedState: true })).toBe('local_unlock_required');
  });

  test('keeps reconnecting phase explicit for popup state machine', () => {
    expect(resolvePopupPhase({ phase: 'reconnecting_background', hasTrustedState: true })).toBe(
      'reconnecting_background',
    );
  });

  test('resolves unknown state to pairing when trusted state does not exist', () => {
    expect(resolvePopupPhase({ phase: 'unknown', hasTrustedState: false })).toBe('pairing_required');
  });

  test('parses persisted popup ui state safely', () => {
    expect(parsePersistedPopupUiState({
      selectedItemId: 'item_9',
      searchQuery: 'deleted',
      typeFilter: 'trash',
      suggestedOnly: false,
      detailPanelMode: 'edit',
      detailTargetItemId: 'item_9',
      detailFolderId: 'folder_finance',
      detailDraftUpdatedAt: Date.now(),
      detailDraft: {
        itemType: 'login',
        title: 'Bank',
        username: 'user@example.com',
        password: 'secret',
        urls: ['https://bank.example.com'],
        notes: 'Important',
        customFields: [{ label: 'Branch', value: 'Main' }],
      },
    })).toEqual({
      selectedItemId: 'item_9',
      searchQuery: 'deleted',
      typeFilter: 'trash',
      suggestedOnly: false,
      sortMode: 'default',
      detailPanelMode: 'edit',
      detailTargetItemId: 'item_9',
      detailFolderId: 'folder_finance',
      detailDraft: {
        itemType: 'login',
        title: 'Bank',
        username: 'user@example.com',
        password: 'secret',
        urls: ['https://bank.example.com'],
        notes: 'Important',
        customFields: [{ label: 'Branch', value: 'Main' }],
      },
    });
    expect(parsePersistedPopupUiState({
      selectedItemId: 'item_1',
      searchQuery: 'amazon',
      typeFilter: 'card',
      suggestedOnly: true,
    })).toEqual({
      selectedItemId: 'item_1',
      searchQuery: 'amazon',
      typeFilter: 'card',
      suggestedOnly: true,
      sortMode: 'default',
      detailPanelMode: 'view',
      detailTargetItemId: null,
      detailFolderId: '',
      detailDraft: null,
    });
    expect(parsePersistedPopupUiState({})).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
      detailPanelMode: 'view',
      detailTargetItemId: null,
      detailFolderId: '',
      detailDraft: null,
    });
    expect(parsePersistedPopupUiState(null)).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
      detailPanelMode: 'view',
      detailTargetItemId: null,
      detailFolderId: '',
      detailDraft: null,
    });
  });

  test('builds persisted popup ui state payload', () => {
    expect(buildPersistedPopupUiState({
      selectedItemId: 'item_2',
      searchQuery: 'bank',
      typeFilter: 'document',
      suggestedOnly: true,
      detailPanelMode: 'create',
      detailTargetItemId: null,
      detailFolderId: 'folder_docs',
      detailDraft: {
        itemType: 'document',
        title: 'Passport',
        content: 'Draft content',
        customFields: [{ label: 'Country', value: 'BR' }],
      },
    })).toMatchObject({
      selectedItemId: 'item_2',
      searchQuery: 'bank',
      typeFilter: 'document',
      suggestedOnly: true,
      sortMode: 'default',
      detailPanelMode: 'create',
      detailTargetItemId: null,
      detailFolderId: 'folder_docs',
      detailDraft: {
        itemType: 'document',
        title: 'Passport',
        content: 'Draft content',
        customFields: [{ label: 'Country', value: 'BR' }],
      },
    });
    expect(buildPersistedPopupUiState({
      selectedItemId: 'item_2',
      searchQuery: 'bank',
      typeFilter: 'document',
      suggestedOnly: true,
      detailPanelMode: 'create',
      detailTargetItemId: null,
      detailFolderId: 'folder_docs',
      detailDraft: {
        itemType: 'document',
        title: 'Passport',
        content: 'Draft content',
        customFields: [{ label: 'Country', value: 'BR' }],
      },
    }).detailDraftUpdatedAt).toEqual(expect.any(Number));
    expect(buildPersistedPopupUiState({ selectedItemId: '', searchQuery: '' })).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
      detailPanelMode: 'view',
      detailTargetItemId: null,
      detailFolderId: '',
      detailDraft: null,
    });
  });

  test('drops expired persisted detail drafts', () => {
    expect(parsePersistedPopupUiState({
      detailPanelMode: 'create',
      detailDraftUpdatedAt: Date.now() - 31 * 60 * 1000,
      detailDraft: {
        itemType: 'login',
        title: 'Expired',
        username: 'user',
        password: 'secret',
        urls: [],
        notes: '',
        customFields: [],
      },
    })).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
      detailPanelMode: 'view',
      detailTargetItemId: null,
      detailFolderId: '',
      detailDraft: null,
    });
  });

  test('filters popup items locally for search, suggestion, and type scope', () => {
    const items = [
      {
        itemId: 'a',
        itemType: 'login',
        title: 'Amazon',
        subtitle: 'user@example.com',
        searchText: 'marketplace',
        username: 'user@example.com',
        urls: ['https://amazon.com'],
        matchFlags: { exactOrigin: false, domainScore: 0 },
        isDeleted: false,
      },
      {
        itemId: 'b',
        itemType: 'login',
        title: 'GitHub',
        subtitle: 'dev@example.com',
        searchText: 'code hosting',
        username: 'dev@example.com',
        urls: ['https://github.com/login'],
        matchFlags: { exactOrigin: true, domainScore: 5 },
        isDeleted: false,
      },
      {
        itemId: 'c',
        itemType: 'card',
        title: 'Nubank',
        subtitle: '•••• 4242',
        searchText: 'credit card',
        urls: [],
        matchFlags: { exactOrigin: false, domainScore: 0 },
        isDeleted: false,
      },
    ];

    expect(
      filterPopupItemsLocally({
        items,
        query: 'git',
        typeFilter: 'all',
        suggestedOnly: false,
      }).map((item) => item.itemId),
    ).toEqual(['b']);

    expect(
      filterPopupItemsLocally({
        items,
        query: '',
        typeFilter: 'all',
        suggestedOnly: true,
      }).map((item) => item.itemId),
    ).toEqual(['b']);

    expect(
      filterPopupItemsLocally({
        items,
        query: '',
        typeFilter: 'card',
        suggestedOnly: false,
      }).map((item) => item.itemId),
    ).toEqual(['c']);
  });

  test('keeps only deleted items for trash scope local filtering', () => {
    const items = [
      {
        itemId: 'live',
        itemType: 'login',
        title: 'Live',
        subtitle: 'user@example.com',
        searchText: 'live',
        urls: ['https://example.com'],
        matchFlags: { exactOrigin: false, domainScore: 0 },
        isDeleted: false,
      },
      {
        itemId: 'deleted',
        itemType: 'login',
        title: 'Deleted bank',
        subtitle: 'archived',
        searchText: 'archived bank',
        urls: ['https://bank.example.com'],
        matchFlags: { exactOrigin: false, domainScore: 0 },
        isDeleted: true,
      },
    ];

    expect(
      filterPopupItemsLocally({
        items,
        query: 'bank',
        typeFilter: 'trash',
        suggestedOnly: false,
      }).map((item) => item.itemId),
    ).toEqual(['deleted']);
  });

  test('preserves visible list when warmup is still running and remote list is temporarily empty', () => {
    expect(
      shouldPreserveVisibleListDuringWarmup({
        cacheWarmupState: 'syncing',
        incomingItems: [],
        visibleItems: [{ itemId: 'a' }],
      }),
    ).toBe(true);
  });

  test('does not preserve visible list when warmup is done or remote already has items', () => {
    expect(
      shouldPreserveVisibleListDuringWarmup({
        cacheWarmupState: 'completed',
        incomingItems: [],
        visibleItems: [{ itemId: 'a' }],
      }),
    ).toBe(false);

    expect(
      shouldPreserveVisibleListDuringWarmup({
        cacheWarmupState: 'syncing',
        incomingItems: [{ itemId: 'remote' }],
        visibleItems: [{ itemId: 'a' }],
      }),
    ).toBe(false);
  });
});
