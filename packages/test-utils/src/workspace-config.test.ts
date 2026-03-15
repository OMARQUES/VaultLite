import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

function readRootText(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

function readRootJson<T>(path: string): T {
  return JSON.parse(readRootText(path)) as T;
}

describe('workspace local development configuration', () => {
  test('declares local development scripts at the workspace root', () => {
    const packageJson = readRootJson<{
      scripts?: Record<string, string>;
    }>('package.json');

    expect(packageJson.scripts).toMatchObject({
      'dev:api': expect.any(String),
      'dev:web': expect.any(String),
      'local:invite': expect.any(String),
      'smoke:local-flow': expect.any(String),
    });
  });

  test('commits a wrangler.toml for local worker development', () => {
    const wranglerConfig = readRootText('wrangler.toml');

    expect(wranglerConfig).toContain('main = "./apps/api/src/index.ts"');
    expect(wranglerConfig).toContain('compatibility_date = "2026-03-15"');
    expect(wranglerConfig).toContain('[dev]');
    expect(wranglerConfig).toContain('port = 8787');
    expect(wranglerConfig).toContain('compatibility_flags = ["nodejs_compat"]');
  });
});
