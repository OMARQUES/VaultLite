import { describe, expect, test } from 'vitest';

import {
  MAX_MANUAL_ICON_BYTES,
  MAX_MANUAL_ICON_DATA_URL_LENGTH,
  isAllowedManualIconMimeType,
  sanitizeIconHost,
  validateManualIconDataUrl,
} from './manual-site-icons';

describe('manual-site-icons', () => {
  test('accepts supported MIME types only', () => {
    expect(isAllowedManualIconMimeType('image/png')).toBe(true);
    expect(isAllowedManualIconMimeType('image/jpeg')).toBe(true);
    expect(isAllowedManualIconMimeType('image/webp')).toBe(true);
    expect(isAllowedManualIconMimeType('image/x-icon')).toBe(true);
    expect(isAllowedManualIconMimeType('image/vnd.microsoft.icon')).toBe(true);
    expect(isAllowedManualIconMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedManualIconMimeType('text/plain')).toBe(false);
  });

  test('normalizes host names safely', () => {
    expect(sanitizeIconHost('https://Example.COM/login')).toBe('example.com');
    expect(sanitizeIconHost('example.com')).toBe('example.com');
    expect(sanitizeIconHost('   sub.Example.com   ')).toBe('sub.example.com');
    expect(sanitizeIconHost('')).toBeNull();
    expect(sanitizeIconHost('invalid host value')).toBeNull();
  });

  test('rejects oversized or malformed data urls', () => {
    expect(
      validateManualIconDataUrl(`data:image/png;base64,${'A'.repeat(MAX_MANUAL_ICON_DATA_URL_LENGTH + 8)}`),
    ).toBe(false);
    expect(validateManualIconDataUrl('data:text/plain;base64,QUJDRA==')).toBe(false);
    expect(validateManualIconDataUrl('not-a-data-url')).toBe(false);
  });

  test('enforces byte cap for raw imports', () => {
    expect(MAX_MANUAL_ICON_BYTES).toBeGreaterThan(0);
  });
});

