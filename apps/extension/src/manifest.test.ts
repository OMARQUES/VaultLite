import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

describe('extension manifest', () => {
  test('pins minimum_chrome_version to 116 for service-worker websocket support', () => {
    const manifestPath = resolve(process.cwd(), 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      minimum_chrome_version?: string;
    };
    expect(manifest.minimum_chrome_version).toBe('116');
  });
});
