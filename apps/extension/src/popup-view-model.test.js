import { describe, expect, test } from 'vitest';

import {
  buildFaviconCandidates,
  buildPersistedPopupUiState,
  buildCredentialMonogram,
  parsePersistedPopupUiState,
  resolvePopupPhase,
  toNavigableUrl,
  selectItemIdAfterRefresh,
  shouldUseExpandedLayout,
} from '../popup-view-model.js';

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

  test('builds favicon candidates for valid login urls', () => {
    const candidates = buildFaviconCandidates('https://portal.example.com/login');
    expect(candidates).toEqual([
      'https://portal.example.com/favicon.ico',
      'https://portal.example.com/apple-touch-icon.png',
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
    });
    expect(parsePersistedPopupUiState({})).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
    });
    expect(parsePersistedPopupUiState(null)).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
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
    });
    expect(buildPersistedPopupUiState({ selectedItemId: '', searchQuery: '' })).toEqual({
      selectedItemId: null,
      searchQuery: '',
      typeFilter: 'all',
      suggestedOnly: false,
    });
  });
});
