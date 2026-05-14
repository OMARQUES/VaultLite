import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const backgroundPath = resolve(process.cwd(), 'background.js');

describe('background offline resilience guards', () => {
  test('classifies transient remote failures separately from terminal trust failures', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('function classifyExtensionRemoteFailure(error, fallbackCode = \'remote_failed\')');
    expect(source).toContain("transientCodes.has(described.code)");
    expect(source).toContain("terminalCodes.has(described.code)");
    expect(source).toContain("status === 408 || status === 429 || status >= 500");
    expect(source).toContain("message.includes('Failed to fetch')");
    expect(source).toContain("error?.name === 'AbortError'");
  });

  test('restore keeps ready unlocked state on transient remote failure', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('async function preserveReadyStateAfterTransientRemoteFailure(classified)');
    expect(source).toContain("state.phase === 'ready' && hasValidUnlockedContext()");
    expect(source).toContain("setPhase('ready', null)");
    expect(source).toContain("cacheWarmupState = 'sync_failed'");
    expect(source).toContain('void loadCredentialCacheFromLocalBestEffort();');
    expect(source).toContain('const preserved = await preserveReadyStateAfterTransientRemoteFailure(classified);');
  });

  test('restore falls back to local unlock when trusted device has transient session loss', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('function canAttemptLocalUnlockFromTrustedState(value)');
    expect(source).toContain('value.localUnlockEnvelope');
    expect(source).toContain('value.authSalt');
    expect(source).toContain('async function preserveLocalUnlockAfterTransientRemoteFailure(classified)');
    expect(source).toContain("setPhase('local_unlock_required', 'Server temporarily unavailable. Unlock this trusted device locally.')");
  });

  test('lock uses local unlock envelope instead of requiring remote auth when token is gone', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('if (canAttemptLocalUnlockFromTrustedState(trustedState)) {');
    expect(source).toContain("setPhase('local_unlock_required', null);");
    expect(source).not.toContain("if (trustedState && sessionToken) {\r\n    setPhase('local_unlock_required', null);\r\n  } else if (trustedState) {\r\n    setPhase('remote_authentication_required', 'Session expired. Authenticate again to continue.');");
  });

  test('snapshot auth failure does not clear unlocked context before recover is classified', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).not.toContain("await clearExtensionSessionToken();\r\n      clearSensitiveMemory();\r\n      await restoreSessionInternal(true);");
    expect(source).toContain('const preserved = await preserveReadyStateAfterTransientRemoteFailure(classified);');
  });

  test('credential actions wait for decrypted local cache before failing not found', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('async function ensureCredentialAvailableInCache(itemId)');
    expect(source).toContain('await loadCredentialCacheFromLocalBestEffort();');
    expect(source).toContain('await refreshCredentialCache({');
    expect(source).toContain('awaitCompletion: true');
    expect(source).toContain('const targetCredential = await ensureCredentialAvailableInCache(itemId);');
  });
});
