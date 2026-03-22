import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const popupScriptPath = resolve(process.cwd(), 'popup.js');

describe('popup pairing completion messaging', () => {
  test('does not show success toast when trusted-device pairing completes', () => {
    const source = readFileSync(popupScriptPath, 'utf8');
    expect(source).not.toContain("setAlert('success', response.message || 'Extension connected. Unlock this device to continue.');");
  });
});

