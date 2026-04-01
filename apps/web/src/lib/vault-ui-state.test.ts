import { beforeEach, describe, expect, test } from 'vitest';

import { addVaultFolder, loadVaultUiState, saveVaultUiState } from './vault-ui-state';

describe('vault-ui-state folders', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('does not inject synthetic default folders when local state is empty', () => {
    const state = loadVaultUiState('alice');

    expect(state.folders).toEqual([]);
    expect(state.folderAssignments).toEqual({});
  });

  test('preserves stored folder records without adding local defaults', () => {
    saveVaultUiState('alice', {
      favorites: [],
      folderAssignments: {},
      folders: [{ id: 'personal', name: 'Personal' }],
    });

    const state = loadVaultUiState('alice');

    expect(state.folders).toEqual([{ id: 'personal', name: 'Personal' }]);
  });

  test('adds a folder only when explicitly requested', () => {
    const next = addVaultFolder('alice', 'Finance');

    expect(next.folders).toEqual([{ id: expect.stringMatching(/^finance-/), name: 'Finance' }]);
  });
});
