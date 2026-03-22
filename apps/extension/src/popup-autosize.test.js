import { describe, expect, test } from 'vitest';

import { measurePopupHeight, resolveMinHeight } from '../popup-autosize.js';

describe('popup autosize helpers', () => {
  test('returns minimum heights by layout', () => {
    expect(resolveMinHeight('pairing', false)).toBe(340);
    expect(resolveMinHeight('pairing', true)).toBe(470);
    expect(resolveMinHeight('unlock', false)).toBe(252);
    expect(resolveMinHeight('ready', false)).toBe(520);
  });

  test('clamps to measured height when inside bounds', () => {
    const shell = { scrollHeight: 410 };
    const height = measurePopupHeight({
      shell,
      layoutMode: 'pairing',
      linkRequestOpen: false,
      maxHeight: 600,
    });
    expect(height).toBe(410);
  });

  test('uses header + content measurements when shell height is constrained', () => {
    const shell = { scrollHeight: 590 };
    const header = { offsetHeight: 92 };
    const content = { scrollHeight: 278 };
    const height = measurePopupHeight({
      shell,
      header,
      content,
      layoutMode: 'unlock',
      linkRequestOpen: false,
      maxHeight: 600,
    });
    expect(height).toBe(372);
  });

  test('clamps to layout minimum when measured height is too small', () => {
    const shell = { scrollHeight: 120 };
    const height = measurePopupHeight({
      shell,
      layoutMode: 'unlock',
      linkRequestOpen: false,
      maxHeight: 600,
    });
    expect(height).toBe(252);
  });

  test('clamps to max popup height when measured height exceeds ceiling', () => {
    const shell = { scrollHeight: 920 };
    const height = measurePopupHeight({
      shell,
      layoutMode: 'ready',
      linkRequestOpen: false,
      maxHeight: 600,
    });
    expect(height).toBe(600);
  });
});
