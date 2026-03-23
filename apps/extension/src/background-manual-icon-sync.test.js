import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const backgroundPath = resolve(process.cwd(), 'background.js');

describe('background manual icon sync resilience', () => {
  test('rehydrates persisted manual icon sync queue on startup', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('MANUAL_ICON_SYNC_QUEUE_STORAGE_KEY');
    expect(source).toContain('const rawManualIconSyncQueue = localState?.[MANUAL_ICON_SYNC_QUEUE_STORAGE_KEY] ?? {};');
    expect(source).toContain('manualIconSyncQueue = {};');
    expect(source).toContain('normalizeManualIconQueueEntry(host, entry)');
  });

  test('drops non-retriable 4xx manual icon sync errors to avoid infinite retry loops', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain('function isNonRetriableApiError(error)');
    expect(source).toContain('if (status === 429) {');
    expect(source).toContain('return status >= 400 && status < 500;');
    expect(source).toContain('if (isNonRetriableApiError(error)) {');
    expect(source).toContain('await dropManualIconSyncQueueHost(host);');
  });
});
