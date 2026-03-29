import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const backgroundPath = resolve(process.cwd(), 'background.js');

describe('background icons realtime and cache behavior', () => {
  test('does not drop local icons.manual.* realtime events', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain("if (isLocalRealtimeEventSource(eventEnvelope.sourceDeviceId)) {");
    expect(source).toContain("if (topic.startsWith('icons.manual.')) {");
    expect(source).toContain('includeManual: true');
  });

  test('uses cache mode by object class and dedupes concurrent blob fetches', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain("const iconObjectFetchInFlightByKey = new Map();");
    expect(source).toContain("return record?.objectClass === 'automatic_public' ? 'force-cache' : 'no-store';");
    expect(source).toContain("cacheMode: iconObjectFetchCacheModeForRecord(record)");
    expect(source).toContain('iconObjectFetchInFlightByKey.set(objectKey, nextPromise);');
  });

  test('does not use external favicon fallback in runtime projection', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).not.toContain('buildFaviconCandidates(');
  });
});
