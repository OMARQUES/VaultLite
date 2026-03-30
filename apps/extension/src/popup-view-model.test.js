import { describe, expect, test } from 'vitest';

import {
  buildPersistedPopupUiState,
  buildCredentialMonogram,
  parsePersistedPopupUiState,
  resolveRowQuickAction,
  resolvePopupPhase,
  hasSameItemOrder,
  hasSameRenderableRows,
  shouldRenderVaultSkeleton,
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
      fillDisabledReason: null,
    });
    expect(action).toEqual({
      type: 'open-url',
      disabled: false,
      tooltip: 'Open site URL',
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
    });
    expect(parsePersistedPopupUiState({})).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
    });
    expect(parsePersistedPopupUiState(null)).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
    });
  });

  test('builds persisted popup ui state payload', () => {
    expect(buildPersistedPopupUiState({
      selectedItemId: 'item_2',
      searchQuery: 'bank',
      typeFilter: 'document',
      suggestedOnly: true,
    })).toEqual({
      selectedItemId: 'item_2',
      searchQuery: 'bank',
      typeFilter: 'document',
      suggestedOnly: true,
      sortMode: 'default',
    });
    expect(buildPersistedPopupUiState({ selectedItemId: '', searchQuery: '' })).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
      sortMode: 'default',
    });
  });
});
