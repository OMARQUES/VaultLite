import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backgroundPath = resolve(process.cwd(), 'background.js');

describe('open and fill flow wiring', () => {
  test('background exposes persisted one-shot open-and-fill flow', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain("const STORAGE_PENDING_OPEN_FILL_JOBS_KEY = 'vaultlite.pending_open_fill_jobs.v1';");
    expect(source).toContain("case 'vaultlite.open_and_fill_credential':");
    expect(source).toContain("case 'vaultlite.dispatch_login_row_action':");
    expect(source).toContain('async function openAndFillCredentialInternal(');
    expect(source).toContain('async function dispatchLoginRowActionInternal(');
    expect(source).toContain('chrome.tabs.onUpdated.addListener(');
    expect(source).toContain('chrome.tabs.onActivated.addListener(');
    expect(source).toContain('chrome.tabs.onRemoved.addListener(');
    expect(source).toContain('async function fillCredentialInTabInternal(');
    expect(source).toContain('lastAttemptAt');
  });
});
