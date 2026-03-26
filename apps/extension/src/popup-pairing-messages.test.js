import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const popupScriptPath = resolve(process.cwd(), 'popup.js');

describe('popup pairing completion messaging', () => {
  test('does not show success toast when trusted-device pairing completes', () => {
    const source = readFileSync(popupScriptPath, 'utf8');
    expect(source).not.toContain("setAlert('success', response.message || 'Extension connected. Unlock this device to continue.');");
  });

  test('binds simplified unlock context value from current extension state', () => {
    const source = readFileSync(popupScriptPath, 'utf8');
    expect(source).toContain("unlockAccountValue: byId('unlockAccountValue')");
    expect(source).toContain("unlockDeviceValue: byId('unlockDeviceValue')");
    expect(source).toContain("unlockRevealBtn: byId('unlockRevealBtn')");
    expect(source).toContain("elements.unlockAccountValue.textContent = currentState?.username ?? 'Unknown account';");
    expect(source).toContain("elements.unlockDeviceValue.textContent = `#${currentState?.deviceName ?? 'VaultLite Extension'}`;");
  });
});
