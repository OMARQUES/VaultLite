import { describe, expect, test } from 'vitest';

import { describeFillResult, shouldDisableControlWhileBusy } from '../popup-behavior.js';

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

  test('maps no_eligible_fields to disabled fill reason without alert banner', () => {
    expect(describeFillResult('no_eligible_fields')).toEqual({
      alert: null,
      disableFillReason: 'No supported fields found on this page.',
    });
  });

  test('maps filled result to success alert and no disable reason', () => {
    expect(describeFillResult('filled')).toEqual({
      alert: { level: 'success', message: 'Filled username and password.' },
      disableFillReason: null,
    });
  });
});
