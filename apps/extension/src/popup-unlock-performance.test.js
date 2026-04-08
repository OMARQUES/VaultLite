import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const popupPath = resolve(process.cwd(), 'popup.js');
const backgroundPath = resolve(process.cwd(), 'background.js');

describe('unlock responsiveness safeguards', () => {
  test('popup uses non-blocking auxiliary refreshes after unlock and selected-item hydration', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain('revalidate: true, awaitCompletion: false');
    expect(source).toContain('refreshSelectedItemHistory({ force: false, silent: true, awaitCompletion: false })');
    expect(source).toContain('refreshDetailAttachments({');
    expect(source).toContain('awaitCompletion: false');
  });

  test('popup hydrates from local snapshot and schedules reconcile separately after unlock', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain("type: 'vaultlite.get_popup_snapshot'");
    expect(source).toContain("type: 'vaultlite.schedule_popup_reconcile'");
    expect(source).toContain('schedulePopupReconcileAfterFirstPaint([');
    expect(source).not.toContain('await refreshStateAndMaybeList({\r\n      showLoading: false,');
  });

  test('background serves cached folders, attachments, and history before requiring remote readiness', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('const hasFolderCache =');
    expect(source).toContain('const readyError = await ensureReadyState({ allowOffline: true });');
    expect(source).toContain('const cached = cachedItemAttachments(itemId);');
    expect(source).toContain('if (!force && vaultItemHistoryCacheByItemId.has(itemId)) {');
    expect(source).toContain('allowOffline: true');
  });

  test('background exposes popup snapshot and queues reconcile without coupling to runtime init', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('async function getPopupSnapshotInternal(');
    expect(source).toContain('async function getPopupSnapshotForUnlockInternal(');
    expect(source).toContain('async function schedulePopupReconcileInternal(');
    expect(source).toContain('queuePopupReconcile(');
    expect(source).not.toContain("void restoreSessionInternal(false).catch(() => {});");
    expect(source).toContain('popupSnapshot = await getPopupSnapshotForUnlockInternal({');
  });

  test('unlock fast-path does not await full local vault cache hydration', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).not.toContain('await Promise.all([\r\n      loadSessionListProjectionCacheBestEffort(),\r\n      loadCredentialCacheFromLocalBestEffort(),');
    expect(source).toContain('popupSnapshot = await getPopupSnapshotForUnlockInternal({');
    expect(source).toContain('scheduleLocalUnlockEnvelopeMaintenance(password);');
    expect(source).not.toContain('LOCAL_UNLOCK_KDF_PROFILE');
  });

  test('unlock success is not rolled back when popup snapshot hydration fails', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('let popupSnapshot = null;');
    expect(source).toContain('popupSnapshot = await getPopupSnapshotForUnlockInternal({');
    expect(source).toContain('if (!popupSnapshot?.ok) {');
    expect(source).toContain('return ok({ state: snapshotForUi() });');
    expect(source).toContain('} catch {');
    expect(source).toContain('popupSnapshot = null;');
  });

  test('unlock success is not rolled back when unlocked context persistence fails', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('await persistUnlockedContext().catch((error) => {');
    expect(source).toContain("console.warn('[vaultlite][unlock] failed to persist unlocked context', error);");
    expect(source).not.toContain('setLastUnlockedLockRevision(state.lockRevision);\r\n    await persistUnlockedContext();');
  });

  test('background maps local unlock runtime failures to actionable messages', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain("case 'unsupported_local_unlock_version':");
    expect(source).toContain("case 'trusted_state_invalid_auth_salt':");
    expect(source).toContain("case 'argon2_memory_budget_exceeded':");
    expect(source).toContain("case 'argon2_runtime_unavailable':");
  });

  test('background preserves raw error messages and logs command failures before generic fallback', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('function extractErrorMessage(error) {');
    expect(source).toContain('const rawMessage = extractErrorMessage(error);');
    expect(source).toContain("message: mappedMessage ?? rawMessage ?? 'Operation failed. Try again.',");
    expect(source).toContain("console.error('[vaultlite][background] command failed', error);");
  });

  test('runtime init while already unlocked avoids awaiting full local vault cache hydration', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).not.toContain("await Promise.all([\r\n      loadSessionListProjectionCacheBestEffort(),\r\n      loadCredentialCacheFromLocalBestEffort(),\r\n      loadFolderStateCacheBestEffort(),\r\n    ]);");
    expect(source).toContain('await Promise.all([');
    expect(source).toContain('loadSessionListProjectionCacheBestEffort(),');
    expect(source).toContain('loadFolderStateCacheBestEffort(),');
  });

  test('popup prefers persisted ready snapshot for immediate first paint after unlock', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain('const fallbackUnlockItems =');
    expect(source).toContain('const unlockItems =');
    expect(source).toContain('fallbackUnlockItems;');
  });

  test('popup only reuses persisted snapshots when trusted identity and server origin are known', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain('if (!hasExpectedTrustedSignature) {');
    expect(source).toContain('const expectedServerOrigin =');
    expect(source).toContain('payloadServerOrigin !== expectedServerOrigin');
    expect(source).toContain('serverOrigin: typeof snapshot.serverOrigin === \'string\' ? snapshot.serverOrigin : null,');
  });

  test('background clears popup snapshots when trusted state is reset', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('POPUP_LAST_STATE_STORAGE_KEY');
    expect(source).toContain('POPUP_LAST_READY_LIST_STORAGE_KEY');
    expect(source).toContain('await sessionStorage.remove([');
    expect(source).toContain('POPUP_LAST_STATE_STORAGE_KEY,');
    expect(source).toContain('POPUP_LAST_READY_LIST_STORAGE_KEY,');
  });

  test('fill is guarded per item instead of going through the popup busy wrapper', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain('let pendingFillItemId = null;');
    expect(source).toContain('if (pendingFillItemId === itemId) {');
    expect(source).toContain('pendingFillItemId = itemId;');
    expect(source).toContain('pendingFillItemId = null;');
  });

  test('popup does not reinterpret pairing_required as local unlock just because trusted state exists', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).not.toContain(
      "if (phase === 'pairing_required' && state?.hasTrustedState === true && !state?.lastError) {",
    );
    expect(source).not.toContain(
      "const normalizedPhase = phase === 'pairing_required' && hasTrustedState ? 'local_unlock_required' : phase;",
    );
    expect(source).not.toContain(
      "fallbackPhase === 'pairing_required' && state?.hasTrustedState === true",
    );
  });

  test('popup alert banner renders non-empty messages instead of hiding all failures', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain('const normalizedMessage =');
    expect(source).toContain('elements.statusAlert.hidden = normalizedMessage.length === 0;');
    expect(source).toContain("elements.statusAlert.className = `alert alert--${normalizedKind}`;");
    expect(source).toContain('elements.statusAlert.textContent = normalizedMessage;');
  });
});
