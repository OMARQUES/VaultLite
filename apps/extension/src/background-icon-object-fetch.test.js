import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const backgroundPath = resolve(process.cwd(), 'background.js');

describe('background icon object fetch hardening', () => {
  test('rejects non-image content types instead of coercing them to png', () => {
    const source = readFileSync(backgroundPath, 'utf8');
    expect(source).toContain("const contentTypeHeader = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();");
    expect(source).toContain("if (!contentTypeHeader.startsWith('image/')) {");
    expect(source).toContain('return null;');
    expect(source).not.toContain("const contentType = contentTypeHeader.startsWith('image/') ? contentTypeHeader : 'image/png';");
  });
});
