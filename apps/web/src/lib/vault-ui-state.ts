export interface VaultFolder {
  id: string;
  name: string;
}

export interface VaultUiState {
  favorites: string[];
  trashed: string[];
  folderAssignments: Record<string, string | null>;
  folders: VaultFolder[];
}

const DEFAULT_FOLDERS: VaultFolder[] = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'family', name: 'Family' },
];

const STORAGE_KEY_PREFIX = 'vaultlite:vault-ui:';
const UPDATE_EVENT = 'vaultlite:vault-ui-updated';

function getStorageKey(username: string | null | undefined): string {
  return `${STORAGE_KEY_PREFIX}${username ?? 'anonymous'}`;
}

function defaultState(): VaultUiState {
  return {
    favorites: [],
    trashed: [],
    folderAssignments: {},
    folders: DEFAULT_FOLDERS.map((folder) => ({ ...folder })),
  };
}

function normalize(input: Partial<VaultUiState> | null | undefined): VaultUiState {
  const state = input ?? {};
  const folders = Array.isArray(state.folders)
    ? state.folders
        .filter(
          (folder): folder is VaultFolder =>
            !!folder &&
            typeof folder.id === 'string' &&
            folder.id.length > 0 &&
            typeof folder.name === 'string' &&
            folder.name.length > 0,
        )
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
        }))
    : [];

  const mergedFolders = folders.length > 0 ? folders : DEFAULT_FOLDERS;

  return {
    favorites: Array.isArray(state.favorites) ? [...new Set(state.favorites)] : [],
    trashed: Array.isArray(state.trashed) ? [...new Set(state.trashed)] : [],
    folderAssignments:
      state.folderAssignments && typeof state.folderAssignments === 'object'
        ? Object.fromEntries(
            Object.entries(state.folderAssignments).map(([itemId, folderId]) => [
              itemId,
              typeof folderId === 'string' && folderId.length > 0 ? folderId : null,
            ]),
          )
        : {},
    folders: [...mergedFolders],
  };
}

export function loadVaultUiState(username: string | null | undefined): VaultUiState {
  if (typeof window === 'undefined') {
    return defaultState();
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(username));
    if (!raw) {
      return defaultState();
    }

    return normalize(JSON.parse(raw) as Partial<VaultUiState>);
  } catch {
    return defaultState();
  }
}

export function saveVaultUiState(username: string | null | undefined, state: VaultUiState): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalize(state);

  window.localStorage.setItem(getStorageKey(username), JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, {
      detail: {
        username: username ?? null,
      },
    }),
  );
}

export function addVaultFolder(
  username: string | null | undefined,
  folderName: string,
): VaultUiState {
  const trimmedName = folderName.trim();
  if (trimmedName.length < 1) {
    return loadVaultUiState(username);
  }

  const current = loadVaultUiState(username);
  const idBase = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const id = `${idBase || 'folder'}-${Math.random().toString(36).slice(2, 7)}`;
  const next = {
    ...current,
    folders: [...current.folders, { id, name: trimmedName }],
  };
  saveVaultUiState(username, next);
  return next;
}

export function onVaultUiStateUpdated(
  callback: (detail: { username: string | null }) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const detail =
      event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? (event.detail as { username: string | null })
        : { username: null };
    callback(detail);
  };

  window.addEventListener(UPDATE_EVENT, listener);
  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
  };
}
