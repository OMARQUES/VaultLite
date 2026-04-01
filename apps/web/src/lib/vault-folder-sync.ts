import type { VaultFoldersStateOutput } from '@vaultlite/contracts';

import type { VaultLiteAuthClient } from './auth-client';
import { loadVaultUiState, saveVaultUiState, type VaultUiState } from './vault-ui-state';

const FOLDER_MIGRATION_KEY_PREFIX = 'vaultlite:vault-folders-migrated:v1:';
const LEGACY_SYNTHETIC_FOLDERS = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'family', name: 'Family' },
] as const;

interface FolderSyncState {
  etag: string | null;
  inFlight: Promise<boolean> | null;
  pendingRevalidate: boolean;
  pendingForce: boolean;
}

const folderSyncStateByUser = new Map<string, FolderSyncState>();

function normalizeUsername(username: string | null | undefined): string | null {
  if (typeof username !== 'string') {
    return null;
  }
  const trimmed = username.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function syncStateFor(username: string | null | undefined): FolderSyncState | null {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return null;
  }
  const existing = folderSyncStateByUser.get(normalized);
  if (existing) {
    return existing;
  }
  const created: FolderSyncState = {
    etag: null,
    inFlight: null,
    pendingRevalidate: false,
    pendingForce: false,
  };
  folderSyncStateByUser.set(normalized, created);
  return created;
}

function migrationStorageKey(username: string | null | undefined): string | null {
  const normalized = normalizeUsername(username);
  return normalized ? `${FOLDER_MIGRATION_KEY_PREFIX}${normalized}` : null;
}

function hasCompletedMigration(username: string | null | undefined): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  const key = migrationStorageKey(username);
  return key ? window.localStorage.getItem(key) === 'done' : true;
}

function markMigrationComplete(username: string | null | undefined): void {
  if (typeof window === 'undefined') {
    return;
  }
  const key = migrationStorageKey(username);
  if (key) {
    window.localStorage.setItem(key, 'done');
  }
}

function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isLegacySyntheticFolder(folder: { id: string; name: string }): boolean {
  const normalizedName = normalizeFolderName(folder.name);
  return LEGACY_SYNTHETIC_FOLDERS.some(
    (entry) => entry.id === folder.id && normalizeFolderName(entry.name) === normalizedName,
  );
}

function nextFolderIdFromName(name: string): string {
  const idBase = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${idBase || 'folder'}-${Math.random().toString(36).slice(2, 7)}`;
}

function applyRemoteFolderSnapshot(
  username: string | null | undefined,
  payload: VaultFoldersStateOutput,
): VaultUiState {
  const current = loadVaultUiState(username);
  const next: VaultUiState = {
    favorites: [...current.favorites],
    folders: payload.folders.map((folder) => ({
      id: folder.folderId,
      name: folder.name,
    })),
    folderAssignments: Object.fromEntries(
      payload.assignments.map((assignment) => [assignment.itemId, assignment.folderId]),
    ),
  };
  saveVaultUiState(username, next);
  return next;
}

function localStateHasFolderData(state: VaultUiState): boolean {
  if (Object.keys(state.folderAssignments).length > 0) {
    return true;
  }
  return state.folders.some((folder) => !isLegacySyntheticFolder(folder));
}

async function mergeLocalMirrorIntoServer(
  username: string | null | undefined,
  authClient: VaultLiteAuthClient,
  remotePayload: VaultFoldersStateOutput,
): Promise<boolean> {
  if (hasCompletedMigration(username)) {
    return false;
  }
  const localState = loadVaultUiState(username);
  if (!localStateHasFolderData(localState)) {
    markMigrationComplete(username);
    return false;
  }

  const folderIdByNormalizedName = new Map<string, string>();
  for (const folder of remotePayload.folders) {
    folderIdByNormalizedName.set(normalizeFolderName(folder.name), folder.folderId);
  }
  const mappedFolderIds = new Map<string, string>();
  const referencedLocalFolderIds = new Set(
    Object.values(localState.folderAssignments).filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  let mutated = false;

  for (const folder of localState.folders) {
    const trimmedName = folder.name.trim();
    if (!trimmedName) {
      continue;
    }
    if (isLegacySyntheticFolder(folder) && !referencedLocalFolderIds.has(folder.id)) {
      continue;
    }
    const normalizedName = normalizeFolderName(trimmedName);
    const existingFolderId = folderIdByNormalizedName.get(normalizedName);
    if (existingFolderId) {
      mappedFolderIds.set(folder.id, existingFolderId);
      continue;
    }
    const targetFolderId = folder.id || nextFolderIdFromName(trimmedName);
    await authClient.upsertVaultFolder({
      folderId: targetFolderId,
      name: trimmedName,
    });
    folderIdByNormalizedName.set(normalizedName, targetFolderId);
    mappedFolderIds.set(folder.id, targetFolderId);
    mutated = true;
  }

  const remoteAssignments = new Map<string, string>();
  for (const assignment of remotePayload.assignments) {
    remoteAssignments.set(assignment.itemId, assignment.folderId);
  }

  for (const [itemId, localFolderId] of Object.entries(localState.folderAssignments)) {
    if (typeof localFolderId !== 'string' || localFolderId.length === 0) {
      continue;
    }
    if (remoteAssignments.has(itemId)) {
      continue;
    }
    const mappedFolderId = mappedFolderIds.get(localFolderId) ?? localFolderId;
    await authClient.assignVaultFolder({
      itemId,
      folderId: mappedFolderId,
    });
    mutated = true;
  }

  markMigrationComplete(username);
  return mutated;
}

export async function hydrateVaultFoldersFromServer(
  username: string | null | undefined,
  authClient: VaultLiteAuthClient,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const syncState = syncStateFor(username);
  if (!syncState) {
    return false;
  }
  if (syncState.inFlight) {
    syncState.pendingRevalidate = true;
    syncState.pendingForce = syncState.pendingForce || options.force === true;
    return syncState.inFlight;
  }

  syncState.inFlight = (async () => {
    let changed = false;
    let nextForce = options.force === true;

    while (true) {
      syncState.pendingRevalidate = false;
      syncState.pendingForce = false;

      let response = await authClient.listVaultFoldersState({
        etag: nextForce ? undefined : syncState.etag ?? undefined,
      });
      if (response.status === 'not_modified') {
        if (response.etag) {
          syncState.etag = response.etag;
        }
      } else {
        syncState.etag = response.etag ?? null;
        let payload = response.payload;
        const merged = await mergeLocalMirrorIntoServer(username, authClient, payload);
        if (merged) {
          response = await authClient.listVaultFoldersState();
          if (response.status === 'ok') {
            syncState.etag = response.etag ?? null;
            payload = response.payload;
          }
        }

        applyRemoteFolderSnapshot(username, payload);
        changed = true;
      }

      if (!syncState.pendingRevalidate) {
        return changed;
      }
      nextForce = syncState.pendingForce;
    }
  })().finally(() => {
    syncState.inFlight = null;
    syncState.pendingRevalidate = false;
    syncState.pendingForce = false;
  });

  return syncState.inFlight;
}

export async function createVaultFolderOnServer(
  username: string | null | undefined,
  authClient: VaultLiteAuthClient,
  folderName: string,
): Promise<{ folderId: string; name: string } | null> {
  const trimmedName = folderName.trim();
  if (!trimmedName) {
    return null;
  }
  const folderId = nextFolderIdFromName(trimmedName);
  await authClient.upsertVaultFolder({
    folderId,
    name: trimmedName,
  });
  const syncState = syncStateFor(username);
  if (syncState) {
    syncState.etag = null;
  }
  await hydrateVaultFoldersFromServer(username, authClient, { force: true });
  return {
    folderId,
    name: trimmedName,
  };
}

export async function assignVaultFolderOnServer(
  username: string | null | undefined,
  authClient: VaultLiteAuthClient,
  itemId: string,
  folderId: string | null,
): Promise<void> {
  await authClient.assignVaultFolder({
    itemId,
    folderId,
  });

  const current = loadVaultUiState(username);
  const next: VaultUiState = {
    favorites: [...current.favorites],
    folders: [...current.folders],
    folderAssignments: {
      ...current.folderAssignments,
    },
  };
  if (folderId) {
    next.folderAssignments[itemId] = folderId;
  } else {
    delete next.folderAssignments[itemId];
  }
  saveVaultUiState(username, next);
  const syncState = syncStateFor(username);
  if (syncState) {
    syncState.etag = null;
  }
}
