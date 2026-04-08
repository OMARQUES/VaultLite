import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const popupPath = resolve(process.cwd(), 'popup.js');

describe('popup search responsiveness safeguards', () => {
  test('search input applies local filtering before debounced background refresh', () => {
    const source = readFileSync(popupPath, 'utf8');
    const handlerIndex = source.indexOf("elements.searchInput.addEventListener('input', () => {");
    const localFilterIndex = source.indexOf('applyLocalCredentialListForCurrentQuery();', handlerIndex);
    const remoteRefreshIndex = source.indexOf('scheduleSearchRefresh(120);', handlerIndex);

    expect(handlerIndex).toBeGreaterThanOrEqual(0);
    expect(localFilterIndex).toBeGreaterThan(handlerIndex);
    expect(remoteRefreshIndex).toBeGreaterThan(localFilterIndex);
    expect(source).toContain('function resolveLocalSearchBaseItems() {');
  });

  test('local search falls back to currently rendered items when scoped base snapshot is missing', () => {
    const source = readFileSync(popupPath, 'utf8');
    const resolverIndex = source.indexOf('function resolveLocalSearchBaseItems() {');
    const currentItemsIndex = source.indexOf(
      'if (Array.isArray(currentItems) && currentItems.length > 0) {',
      resolverIndex,
    );
    const lastReadyIndex = source.indexOf('if (Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0) {', resolverIndex);

    expect(resolverIndex).toBeGreaterThanOrEqual(0);
    expect(currentItemsIndex).toBeGreaterThan(resolverIndex);
    expect(lastReadyIndex).toBeGreaterThan(currentItemsIndex);
  });

  test('popup keeps visible list when warmup returns a transient empty remote list', () => {
    const source = readFileSync(popupPath, 'utf8');
    expect(source).toContain('shouldPreserveVisibleListDuringWarmup({');
    expect(source).toContain('maybeScheduleWarmupListRefresh(response.state ?? currentState, 0);');
    expect(source).toContain('maybeScheduleWarmupListRefresh(stateSnapshot, 0);');
  });

  test('popup snapshot requests do not pin a stale active page url by default', () => {
    const source = readFileSync(popupPath, 'utf8');
    const requestIndex = source.indexOf('async function requestPopupSnapshot(options = {}) {');
    const explicitPageUrlIndex = source.indexOf("pageUrl: typeof options.pageUrl === 'string' ? options.pageUrl : undefined,", requestIndex);
    const staleFallbackIndex = source.indexOf("pageUrl: typeof options.pageUrl === 'string' ? options.pageUrl : activePageUrl,", requestIndex);

    expect(requestIndex).toBeGreaterThanOrEqual(0);
    expect(explicitPageUrlIndex).toBeGreaterThan(requestIndex);
    expect(staleFallbackIndex).toBe(-1);
  });
});
