import { describe, expect, test } from 'vitest';

import { shouldDisableControlWhileBusy } from '../popup-behavior.js';

describe('popup busy-state behavior', () => {
  test('keeps search input enabled while busy so typing does not lose focus', () => {
    expect(shouldDisableControlWhileBusy('searchInput', true)).toBe(false);
  });

  test('disables action buttons while busy', () => {
    expect(shouldDisableControlWhileBusy('linkPairBtn', true)).toBe(true);
    expect(shouldDisableControlWhileBusy('unlockBtn', true)).toBe(true);
  });

  test('never disables controls when not busy', () => {
    expect(shouldDisableControlWhileBusy('searchInput', false)).toBe(false);
    expect(shouldDisableControlWhileBusy('linkPairBtn', false)).toBe(false);
  });
});
