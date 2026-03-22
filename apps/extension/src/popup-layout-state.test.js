import { describe, expect, test } from 'vitest';

import {
  resolveLayoutMode,
  shouldShowHeaderSearch,
  shouldShowLockIcon,
  shouldUseExpandedPopup,
} from '../popup-layout-state.js';

describe('popup-layout-state', () => {
  test('maps runtime phase to layout mode', () => {
    expect(resolveLayoutMode('pairing_required')).toBe('pairing');
    expect(resolveLayoutMode('remote_authentication_required')).toBe('pairing');
    expect(resolveLayoutMode('local_unlock_required')).toBe('unlock');
    expect(resolveLayoutMode('ready')).toBe('ready');
  });

  test('shows header search only in ready mode', () => {
    expect(shouldShowHeaderSearch('pairing')).toBe(false);
    expect(shouldShowHeaderSearch('unlock')).toBe(false);
    expect(shouldShowHeaderSearch('ready')).toBe(true);
  });

  test('shows lock icon only in ready mode', () => {
    expect(shouldShowLockIcon('pairing')).toBe(false);
    expect(shouldShowLockIcon('unlock')).toBe(false);
    expect(shouldShowLockIcon('ready')).toBe(true);
  });

  test('expands popup only when ready has selected item', () => {
    expect(shouldUseExpandedPopup('pairing', null)).toBe(false);
    expect(shouldUseExpandedPopup('unlock', 'item_1')).toBe(false);
    expect(shouldUseExpandedPopup('ready', null)).toBe(false);
    expect(shouldUseExpandedPopup('ready', 'item_1')).toBe(true);
  });
});

