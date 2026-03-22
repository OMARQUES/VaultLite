import { describe, expect, test, vi } from 'vitest';

import {
  buildDetailViewModel,
  isCopyActionId,
  pulseCopyIcon,
} from '../popup-detail-actions.js';

describe('popup-detail-actions', () => {
  test('builds login detail model with fill primary action and url actions', () => {
    const model = buildDetailViewModel({
      itemType: 'login',
      title: 'Example',
      subtitle: 'user@example.com',
      firstUrl: 'https://example.com/login',
      urlHostSummary: 'example.com',
    });

    expect(model.primaryAction.label).toBe('Fill');
    expect(model.rows[0].label).toBe('Username');
    expect(model.rows[1].label).toBe('Password');
    expect(model.rows[2].label).toBe('URL');
    expect(model.rows[2].actions.some((action) => action.id === 'open_url')).toBe(true);
    expect(model.rows[2].actions.some((action) => action.id === 'copy_url')).toBe(true);
  });

  test('identifies copy actions', () => {
    expect(isCopyActionId('copy_username')).toBe(true);
    expect(isCopyActionId('copy_password')).toBe(true);
    expect(isCopyActionId('open_url')).toBe(false);
  });

  test('pulses copy icon class for feedback animation', () => {
    vi.useFakeTimers();
    const button = document.createElement('button');
    pulseCopyIcon(button);
    expect(button.classList.contains('is-copied')).toBe(true);
    vi.advanceTimersByTime(650);
    expect(button.classList.contains('is-copied')).toBe(false);
    vi.useRealTimers();
  });
});

