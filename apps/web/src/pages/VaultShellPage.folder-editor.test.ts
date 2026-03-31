import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const vaultShellPagePath = resolve(process.cwd(), 'src/pages/VaultShellPage.vue');

describe('vault folder editor affordance', () => {
  test('renders inline create-folder action next to editor folder dropdown and dialog', () => {
    const source = readFileSync(vaultShellPagePath, 'utf8');

    expect(source).toContain('editor-folder-row');
    expect(source).toContain('label="Create folder from editor"');
    expect(source).toContain('title="New folder"');
    expect(source).toContain('v-model="editorFolderName"');
  });
});
