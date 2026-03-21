import { describe, expect, test } from 'vitest';

import {
  MAX_MANUAL_ICON_BYTES,
  MAX_MANUAL_ICON_DATA_URL_LENGTH,
  isAllowedManualIconMimeType,
  sanitizeIconHost,
  validateManualIconDataUrl,
} from '../manual-icons.js';

describe('manual-icons', () => {
  test('allows expected raster MIME types only', () => {
    expect(isAllowedManualIconMimeType('image/png')).toBe(true);
    expect(isAllowedManualIconMimeType('image/jpeg')).toBe(true);
    expect(isAllowedManualIconMimeType('image/webp')).toBe(true);
    expect(isAllowedManualIconMimeType('image/x-icon')).toBe(true);
    expect(isAllowedManualIconMimeType('image/vnd.microsoft.icon')).toBe(true);
    expect(isAllowedManualIconMimeType('image/svg+xml')).toBe(false);
  });

  test('normalizes icon host values', () => {
    expect(sanitizeIconHost('https://Example.com/login')).toBe('example.com');
    expect(sanitizeIconHost('example.com')).toBe('example.com');
    expect(sanitizeIconHost('')).toBeNull();
  });

  test('rejects malformed data urls', () => {
    expect(validateManualIconDataUrl('data:text/plain;base64,QUJDRA==')).toBe(false);
    expect(
      validateManualIconDataUrl(`data:image/png;base64,${'A'.repeat(MAX_MANUAL_ICON_DATA_URL_LENGTH + 10)}`),
    ).toBe(false);
  });

  test('keeps byte cap positive', () => {
    expect(MAX_MANUAL_ICON_BYTES).toBeGreaterThan(0);
  });
});

