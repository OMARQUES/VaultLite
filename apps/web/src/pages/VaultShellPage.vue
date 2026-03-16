<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  type RouteLocationRaw,
  useRoute,
  useRouter,
} from 'vue-router';

import DangerZone from '../components/ui/DangerZone.vue';
import DangerButton from '../components/ui/DangerButton.vue';
import DialogModal from '../components/ui/DialogModal.vue';
import DropdownMenu from '../components/ui/DropdownMenu.vue';
import EmptySearchState from '../components/ui/EmptySearchState.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import IconButton from '../components/ui/IconButton.vue';
import InlineAlert from '../components/ui/InlineAlert.vue';
import KeyValueList from '../components/ui/KeyValueList.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SearchField from '../components/ui/SearchField.vue';
import SecretField from '../components/ui/SecretField.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import TextField from '../components/ui/TextField.vue';
import TextareaField from '../components/ui/TextareaField.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import { useSessionStore } from '../composables/useSessionStore';
import {
  loadVaultUiState,
  onVaultUiStateUpdated,
  saveVaultUiState,
  type VaultUiState,
} from '../lib/vault-ui-state';
import { createVaultLiteVaultClient } from '../lib/vault-client';
import {
  createVaultWorkspace,
  type DocumentVaultItemPayload,
  type LoginVaultItemPayload,
  type VaultWorkspaceItem,
} from '../lib/vault-workspace';

type VaultScope = 'all' | 'favorites' | 'trash';
type VaultTypeFilter = 'all' | 'login' | 'document';

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();
const workspace = createVaultWorkspace({
  sessionStore,
  vaultClient: createVaultLiteVaultClient(),
});

const searchInputRef = ref<InstanceType<typeof SearchField> | null>(null);
const searchQuery = ref('');
const errorMessage = ref<string | null>(null);
const toastMessage = ref('');
const busyAction = ref<null | 'load' | 'save' | 'trash' | 'delete-permanent'>(null);
const discardDialogOpen = ref(false);
const pendingNavigation = ref<string | null>(null);
const dirty = ref(false);
const activeEditorKey = ref<string | null>(null);
const loginDraftFolderId = ref('');
const documentDraftFolderId = ref('');
const uiState = ref<VaultUiState>(loadVaultUiState(sessionStore.state.username));

const loginDraft = reactive<LoginVaultItemPayload>({
  title: '',
  username: '',
  password: '',
  urls: [],
  notes: '',
});

const documentDraft = reactive<DocumentVaultItemPayload>({
  title: '',
  content: '',
});

const createOptions = [
  { label: 'New login', value: 'new-login' },
  { label: 'New document', value: 'new-document' },
] as const;

function normalizeScope(value: unknown): VaultScope {
  if (value === 'favorites' || value === 'trash') {
    return value;
  }

  return 'all';
}

function normalizeType(value: unknown): VaultTypeFilter {
  if (value === 'login' || value === 'document') {
    return value;
  }

  return 'all';
}

function normalizeFolder(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return 'all';
}

function normalizeSearch(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

const scope = computed<VaultScope>(() => normalizeScope(route.query.scope));
const typeFilter = computed<VaultTypeFilter>(() => normalizeType(route.query.type));
const folderFilter = computed(() => normalizeFolder(route.query.folder));
const searchFilter = computed(() => normalizeSearch(route.query.q));

function cloneUiState(state: VaultUiState): VaultUiState {
  return {
    favorites: [...state.favorites],
    trashed: [...state.trashed],
    folderAssignments: { ...state.folderAssignments },
    folders: state.folders.map((folder) => ({ ...folder })),
  };
}

function refreshUiState() {
  uiState.value = loadVaultUiState(sessionStore.state.username);
}

function commitUiState(updater: (draft: VaultUiState) => void) {
  const next = cloneUiState(uiState.value);
  updater(next);
  saveVaultUiState(sessionStore.state.username, next);
  uiState.value = next;
}

function isFavorite(itemId: string): boolean {
  return uiState.value.favorites.includes(itemId);
}

function isTrashed(itemId: string): boolean {
  return uiState.value.trashed.includes(itemId);
}

function folderFor(itemId: string): string | null {
  return uiState.value.folderAssignments[itemId] ?? null;
}

function folderName(folderId: string | null): string {
  if (!folderId) {
    return '—';
  }

  return uiState.value.folders.find((folder) => folder.id === folderId)?.name ?? '—';
}

const folders = computed(() => uiState.value.folders);

const allItems = computed(() => workspace.state.items);
const activeItems = computed(() => allItems.value.filter((item) => !isTrashed(item.itemId)));

function itemMatchesCurrentContext(item: VaultWorkspaceItem): boolean {
  if (scope.value === 'trash') {
    if (!isTrashed(item.itemId)) {
      return false;
    }
  } else {
    if (isTrashed(item.itemId)) {
      return false;
    }

    if (scope.value === 'favorites' && !isFavorite(item.itemId)) {
      return false;
    }
  }

  if (typeFilter.value !== 'all' && item.itemType !== typeFilter.value) {
    return false;
  }

  if (scope.value === 'all' && folderFilter.value !== 'all' && folderFor(item.itemId) !== folderFilter.value) {
    return false;
  }

  return true;
}

const filteredItems = computed(() => workspace.filteredItems.value.filter(itemMatchesCurrentContext));

const selectedItemId = computed(() => {
  const raw = route.params.itemId;
  return typeof raw === 'string' ? raw : null;
});

const selectedItem = computed(
  () => allItems.value.find((item) => item.itemId === selectedItemId.value) ?? null,
);

const selectedItemInContext = computed(() => {
  const current = selectedItem.value;
  if (!current) {
    return null;
  }

  return itemMatchesCurrentContext(current) ? current : null;
});

const isCreateLogin = computed(() => route.path === '/vault/new/login');
const isCreateDocument = computed(() => route.path === '/vault/new/document');
const isEditing = computed(() => route.path.endsWith('/edit'));
const isListRoute = computed(() => route.path === '/vault');
const isDetailRoute = computed(
  () =>
    !isEditing.value &&
    !isCreateLogin.value &&
    !isCreateDocument.value &&
    route.path.startsWith('/vault/item/'),
);
const surfaceError = computed(() => errorMessage.value ?? workspace.state.lastError);
const emptyVault = computed(() =>
  !workspace.state.isLoading &&
  scope.value === 'all' &&
  typeFilter.value === 'all' &&
  folderFilter.value === 'all' &&
  activeItems.value.length === 0,
);
const emptySearch = computed(
  () =>
    !workspace.state.isLoading &&
    !emptyVault.value &&
    filteredItems.value.length === 0 &&
    (searchQuery.value.trim().length > 0 ||
      scope.value !== 'all' ||
      typeFilter.value !== 'all' ||
      folderFilter.value !== 'all'),
);
const pageModeClass = computed(() => {
  if (isCreateLogin.value || isCreateDocument.value) return 'vault-page--create';
  if (isEditing.value) return 'vault-page--edit';
  if (isDetailRoute.value) return 'vault-page--detail';
  return 'vault-page--list';
});
const detailTitle = computed(() => {
  if (isCreateLogin.value) return 'New login';
  if (isCreateDocument.value) return 'New document';
  if (isEditing.value) return 'Edit item';
  return selectedItemInContext.value?.itemType === 'document' ? 'Document' : 'Login';
});
const detailMetaType = computed(() => {
  if (!selectedItemInContext.value) {
    return '';
  }

  if (scope.value === 'trash') {
    return 'Trash';
  }

  return selectedItemInContext.value.itemType === 'login' ? 'Login' : 'Document';
});
const isTrashContext = computed(() => scope.value === 'trash');
const maskKey = computed(() => `${route.fullPath}:${sessionStore.state.phase}`);

function normalizedVaultQuery(overrides: {
  scope?: VaultScope;
  type?: VaultTypeFilter;
  folder?: string;
  q?: string;
}) {
  const nextScope = overrides.scope ?? scope.value;
  const nextType = overrides.type ?? typeFilter.value;
  const nextFolder = nextScope === 'all' ? (overrides.folder ?? folderFilter.value) : 'all';
  const nextSearch = (overrides.q ?? searchFilter.value).trim();

  return {
    scope: nextScope,
    type: nextType,
    folder: nextFolder,
    q: nextSearch.length > 0 ? nextSearch : undefined,
  };
}

function vaultRoute(
  path: string,
  overrides: { scope?: VaultScope; type?: VaultTypeFilter; folder?: string; q?: string } = {},
) {
  return {
    path,
    query: normalizedVaultQuery(overrides),
  };
}

function blankLoginDraft(): LoginVaultItemPayload {
  return {
    title: '',
    username: '',
    password: '',
    urls: [],
    notes: '',
  };
}

function blankDocumentDraft(): DocumentVaultItemPayload {
  return {
    title: '',
    content: '',
  };
}

function assignLoginDraft(payload: LoginVaultItemPayload) {
  loginDraft.title = payload.title;
  loginDraft.username = payload.username;
  loginDraft.password = payload.password;
  loginDraft.urls = [...payload.urls];
  loginDraft.notes = payload.notes;
}

function assignDocumentDraft(payload: DocumentVaultItemPayload) {
  documentDraft.title = payload.title;
  documentDraft.content = payload.content;
}

function resolveDraftFolder(itemId: string | null): string {
  if (!itemId) {
    return folderFilter.value === 'all' ? '' : folderFilter.value;
  }

  return folderFor(itemId) ?? '';
}

function syncDraftFromRoute() {
  if (isCreateLogin.value) {
    const key = 'new-login';
    if (activeEditorKey.value !== key) {
      assignLoginDraft(blankLoginDraft());
      loginDraftFolderId.value = resolveDraftFolder(null);
      dirty.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  if (isCreateDocument.value) {
    const key = 'new-document';
    if (activeEditorKey.value !== key) {
      assignDocumentDraft(blankDocumentDraft());
      documentDraftFolderId.value = resolveDraftFolder(null);
      dirty.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  if (isEditing.value && selectedItem.value) {
    const key = `edit:${selectedItem.value.itemId}:${selectedItem.value.revision}`;
    if (activeEditorKey.value !== key) {
      if (selectedItem.value.itemType === 'login') {
        assignLoginDraft(selectedItem.value.payload);
        loginDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else {
        assignDocumentDraft(selectedItem.value.payload);
        documentDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      }
      dirty.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  activeEditorKey.value = null;
  dirty.value = false;
}

watch(
  () => [route.fullPath, selectedItem.value?.revision] as const,
  () => {
    syncDraftFromRoute();
  },
  { immediate: true },
);

watch(
  () => sessionStore.state.username,
  () => {
    refreshUiState();
  },
  { immediate: true },
);

watch(
  () => searchFilter.value,
  (value) => {
    if (searchQuery.value !== value) {
      searchQuery.value = value;
    }
    workspace.setSearchQuery(value);
  },
  { immediate: true },
);

let unsubscribeUiState: (() => void) | null = null;

function setDirty() {
  if (isCreateLogin.value || isCreateDocument.value || isEditing.value) {
    dirty.value = true;
  }
}

function clearFilters() {
  void navigateTo(vaultRoute('/vault', {
    scope: 'all',
    type: 'all',
    folder: 'all',
    q: '',
  }));
}

function setSearchQuery(value: string) {
  searchQuery.value = value;
  workspace.setSearchQuery(value);
  const target = {
    path: route.path,
    query: normalizedVaultQuery({ q: value }),
  };
  const current = router.resolve({
    path: route.path,
    query: route.query,
  }).fullPath;
  const next = router.resolve(target).fullPath;
  if (next !== current) {
    void router.replace(target);
  }
}

function showToast(message: string) {
  toastMessage.value = message;
  window.setTimeout(() => {
    if (toastMessage.value === message) {
      toastMessage.value = '';
    }
  }, 1400);
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    }
    showToast('Copied');
  } catch {
    showToast('Copied');
  }
}

function toggleFavorite(itemId: string) {
  commitUiState((draft) => {
    const exists = draft.favorites.includes(itemId);
    draft.favorites = exists
      ? draft.favorites.filter((current) => current !== itemId)
      : [...draft.favorites, itemId];
  });
}

function assignItemFolder(itemId: string, folderId: string | null) {
  commitUiState((draft) => {
    draft.folderAssignments[itemId] = folderId;
  });
}

function moveToTrash(itemId: string) {
  commitUiState((draft) => {
    if (!draft.trashed.includes(itemId)) {
      draft.trashed.push(itemId);
    }
  });
  showToast('Moved to Trash');
}

function restoreFromTrash(itemId: string) {
  commitUiState((draft) => {
    draft.trashed = draft.trashed.filter((current) => current !== itemId);
  });
}

function clearItemFromUiState(itemId: string) {
  commitUiState((draft) => {
    draft.trashed = draft.trashed.filter((current) => current !== itemId);
    draft.favorites = draft.favorites.filter((current) => current !== itemId);
    delete draft.folderAssignments[itemId];
  });
}

function openUrl(url: string | undefined) {
  if (!url) {
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function pendingEditorExitTarget(): RouteLocationRaw {
  if (isEditing.value && selectedItemId.value) {
    return vaultRoute(`/vault/item/${selectedItemId.value}`);
  }

  return vaultRoute('/vault');
}

function isEditorRoute(path: string) {
  return path === '/vault/new/login' || path === '/vault/new/document' || path.endsWith('/edit');
}

function queueDiscard(target: string) {
  pendingNavigation.value = target;
  discardDialogOpen.value = true;
}

async function navigateTo(target: RouteLocationRaw) {
  const targetPath = router.resolve(target).fullPath;

  if ((isCreateLogin.value || isCreateDocument.value || isEditing.value) && dirty.value) {
    queueDiscard(targetPath);
    return;
  }

  await router.push(target);
}

async function cancelEditor() {
  await navigateTo(pendingEditorExitTarget());
}

function closeDiscardDialog() {
  discardDialogOpen.value = false;
  pendingNavigation.value = null;
}

async function discardChanges() {
  const target = pendingNavigation.value ?? router.resolve(pendingEditorExitTarget()).fullPath;
  discardDialogOpen.value = false;
  pendingNavigation.value = null;
  dirty.value = false;
  await router.push(target);
}

function onDropdownSelect(value: string) {
  const safeScope: VaultScope = scope.value === 'trash' ? 'all' : scope.value;
  void navigateTo(
    vaultRoute(value === 'new-login' ? '/vault/new/login' : '/vault/new/document', {
      scope: safeScope,
    }),
  );
}

function metaLine(item: VaultWorkspaceItem) {
  if (scope.value === 'trash') {
    return item.itemType === 'login' ? 'Deleted login' : 'Deleted document';
  }

  if (item.itemType === 'login') {
    return item.payload.username || item.payload.urls[0] || 'Login';
  }

  const preview = item.payload.content.replace(/\s+/g, ' ').trim();
  if (preview.length === 0) {
    return 'Document';
  }

  return preview.length > 44 ? `${preview.slice(0, 44)}...` : preview;
}

function rowRoute(itemId: string) {
  return vaultRoute(`/vault/item/${itemId}`);
}

function itemMonogram(item: VaultWorkspaceItem): string {
  const title = item.payload.title.trim();
  if (title.length === 0) {
    return item.itemType === 'login' ? 'L' : 'D';
  }

  const [first, second] = title.split(/\s+/);
  if (second) {
    return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
  }

  return (first[0] ?? '•').toUpperCase();
}

async function saveCurrent() {
  errorMessage.value = null;
  busyAction.value = 'save';

  try {
    if (isCreateLogin.value) {
      await workspace.createLogin({
        ...loginDraft,
        urls: [...loginDraft.urls],
      });
      const createdItemId = workspace.state.items.at(-1)?.itemId;
      if (createdItemId) {
        assignItemFolder(createdItemId, loginDraftFolderId.value || null);
      }
      dirty.value = false;
      if (createdItemId) {
        await router.push(vaultRoute(`/vault/item/${createdItemId}`));
      } else {
        await router.push(vaultRoute('/vault'));
      }
      return;
    }

    if (isCreateDocument.value) {
      await workspace.createDocument({
        ...documentDraft,
      });
      const createdItemId = workspace.state.items.at(-1)?.itemId;
      if (createdItemId) {
        assignItemFolder(createdItemId, documentDraftFolderId.value || null);
      }
      dirty.value = false;
      if (createdItemId) {
        await router.push(vaultRoute(`/vault/item/${createdItemId}`));
      } else {
        await router.push(vaultRoute('/vault'));
      }
      return;
    }

    if (isEditing.value && selectedItem.value) {
      const nextItem: VaultWorkspaceItem =
        selectedItem.value.itemType === 'login'
          ? {
              ...selectedItem.value,
              payload: {
                ...loginDraft,
                urls: [...loginDraft.urls],
              },
            }
          : {
              ...selectedItem.value,
              payload: {
                ...documentDraft,
              },
            };
      await workspace.updateItem(nextItem);
      assignItemFolder(
        selectedItem.value.itemId,
        selectedItem.value.itemType === 'login'
          ? loginDraftFolderId.value || null
          : documentDraftFolderId.value || null,
      );
      dirty.value = false;
      await router.push(vaultRoute(`/vault/item/${selectedItem.value.itemId}`));
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyAction.value = null;
  }
}

async function moveCurrentToTrash() {
  if (!selectedItem.value) {
    return;
  }

  busyAction.value = 'trash';

  try {
    moveToTrash(selectedItem.value.itemId);
    dirty.value = false;
    await router.push(vaultRoute('/vault', { scope: 'trash' }));
  } finally {
    busyAction.value = null;
  }
}

async function restoreCurrentItem() {
  if (!selectedItemInContext.value) {
    return;
  }

  restoreFromTrash(selectedItemInContext.value.itemId);
  await router.push(
    vaultRoute(`/vault/item/${selectedItemInContext.value.itemId}`, {
      scope: 'all',
    }),
  );
}

async function restoreFromRow(itemId: string) {
  restoreFromTrash(itemId);

  if (selectedItemId.value === itemId) {
    await router.push(
      vaultRoute(`/vault/item/${itemId}`, {
        scope: 'all',
      }),
    );
  }
}

async function deleteCurrentPermanently() {
  if (!selectedItemInContext.value) {
    return;
  }

  busyAction.value = 'delete-permanent';

  try {
    await workspace.deleteItem(selectedItemInContext.value.itemId);
    clearItemFromUiState(selectedItemInContext.value.itemId);
    await router.push(vaultRoute('/vault', { scope: 'trash' }));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyAction.value = null;
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const isEditableTarget =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);

  const focusSearchShortcut =
    (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget) ||
    ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey));

  if (focusSearchShortcut) {
    event.preventDefault();
    searchInputRef.value?.focus();
    return;
  }

  if (event.key === 'Escape') {
    if (discardDialogOpen.value) {
      closeDiscardDialog();
      return;
    }

    if (isCreateLogin.value || isCreateDocument.value || isEditing.value) {
      event.preventDefault();
      void cancelEditor();
    }
  }
}

onBeforeRouteLeave((to) => {
  if ((isCreateLogin.value || isCreateDocument.value || isEditing.value) && dirty.value) {
    queueDiscard(to.fullPath);
    return false;
  }
  return undefined;
});

onBeforeRouteUpdate((to) => {
  if (
    (isCreateLogin.value || isCreateDocument.value || isEditing.value) &&
    dirty.value &&
    route.path !== to.path &&
    (isEditorRoute(route.path) || isEditorRoute(to.path) || to.path.startsWith('/vault'))
  ) {
    queueDiscard(to.fullPath);
    return false;
  }
  return undefined;
});

async function loadVault() {
  errorMessage.value = null;
  busyAction.value = 'load';
  try {
    await workspace.load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyAction.value = null;
  }
}

onMounted(async () => {
  unsubscribeUiState = onVaultUiStateUpdated((detail) => {
    if (detail.username === (sessionStore.state.username ?? null)) {
      refreshUiState();
    }
  });

  window.addEventListener('keydown', handleGlobalKeydown);
  await loadVault();
});

onBeforeUnmount(() => {
  unsubscribeUiState?.();
  unsubscribeUiState = null;
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <section class="vault-page" :class="pageModeClass">
    <section class="vault-list-pane">
      <div class="vault-pane-header">
        <h1>Vault</h1>
      </div>

      <div class="vault-list-toolbar">
        <SearchField
          ref="searchInputRef"
          v-model="searchQuery"
          test-id="vault-search-input"
          label="Search vault"
          placeholder="Search vault"
          @update:model-value="setSearchQuery"
        />
        <DropdownMenu label="New" :items="createOptions" @select="onDropdownSelect" />
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <EmptyState v-if="emptyVault" title="Your vault is empty" description="Create your first item">
        <template #actions>
          <PrimaryButton type="button" @click="navigateTo(vaultRoute('/vault/new/login'))">New login</PrimaryButton>
          <SecondaryButton type="button" @click="navigateTo(vaultRoute('/vault/new/document'))">
            New document
          </SecondaryButton>
        </template>
      </EmptyState>

      <EmptySearchState v-else-if="emptySearch" title="No results">
        <template #actions>
          <SecondaryButton type="button" @click="clearFilters">Reset filters</SecondaryButton>
        </template>
      </EmptySearchState>

      <div v-else class="vault-list">
        <article
          v-for="item in filteredItems"
          :key="item.itemId"
          class="vault-list-row"
          :class="{
            'is-active': item.itemId === selectedItemId,
            'is-trash-row': isTrashContext,
            'is-document-row': item.itemType === 'document',
          }"
        >
          <button class="vault-list-row__main" type="button" @click="navigateTo(rowRoute(item.itemId))">
            <span class="vault-list-row__avatar" aria-hidden="true">{{ itemMonogram(item) }}</span>
            <span class="vault-list-row__content">
              <span class="vault-list-row__title">{{ item.payload.title }}</span>
              <span class="vault-list-row__meta">{{ metaLine(item) }}</span>
            </span>
          </button>
          <IconButton
            v-if="!isTrashContext"
            class="vault-list-row__favorite"
            type="button"
            :label="isFavorite(item.itemId) ? 'Remove favorite' : 'Add favorite'"
            @click="toggleFavorite(item.itemId)"
          >
            {{ isFavorite(item.itemId) ? '★' : '☆' }}
          </IconButton>
          <SecondaryButton v-else type="button" @click="restoreFromRow(item.itemId)">Restore</SecondaryButton>
        </article>
      </div>
    </section>

    <section class="vault-detail-pane">
      <EmptyState v-if="isListRoute" title="Choose an item" />

      <section v-else-if="isCreateLogin || isCreateDocument || isEditing" class="detail-card detail-card--editor">
        <div class="detail-card__header">
          <h2>{{ detailTitle }}</h2>
        </div>

        <form class="form-stack" @submit.prevent="saveCurrent">
          <template v-if="isCreateLogin || (isEditing && selectedItem?.itemType === 'login')">
            <TextField v-model="loginDraft.title" label="Title" name="title" required @update:model-value="setDirty" />
            <TextField
              v-model="loginDraft.username"
              label="Username"
              autocomplete="username"
              required
              @update:model-value="setDirty"
            />
            <SecretField
              v-model="loginDraft.password"
              label="Password"
              autocomplete="current-password"
              required
              :mask-key="maskKey"
              @update:model-value="setDirty"
            />
            <TextField
              :model-value="loginDraft.urls[0] ?? ''"
              label="URL"
              @update:model-value="
                (value) => {
                  loginDraft.urls = value ? [value] : [];
                  setDirty();
                }
              "
            />
            <label class="field">
              <span class="field__label">Folder</span>
              <select
                v-model="loginDraftFolderId"
                class="field__select"
                @change="setDirty"
              >
                <option value="">No folder</option>
                <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                  {{ folder.name }}
                </option>
              </select>
            </label>
            <TextareaField v-model="loginDraft.notes" label="Notes" :rows="5" @update:model-value="setDirty" />
          </template>

          <template v-else>
            <TextField
              v-model="documentDraft.title"
              label="Title"
              name="title"
              required
              @update:model-value="setDirty"
            />
            <label class="field">
              <span class="field__label">Folder</span>
              <select
                v-model="documentDraftFolderId"
                class="field__select"
                @change="setDirty"
              >
                <option value="">No folder</option>
                <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                  {{ folder.name }}
                </option>
              </select>
            </label>
            <TextareaField
              v-model="documentDraft.content"
              label="Content"
              :rows="10"
              @update:model-value="setDirty"
            />
          </template>

          <div class="form-actions">
            <PrimaryButton type="submit" :disabled="busyAction === 'save'">
              {{ busyAction === 'save' ? 'Saving...' : 'Save' }}
            </PrimaryButton>
            <SecondaryButton type="button" @click="cancelEditor">Cancel</SecondaryButton>
          </div>
        </form>

        <DangerZone v-if="isEditing && selectedItem" title="DangerZone">
          <div class="form-actions">
            <DangerButton type="button" :disabled="busyAction === 'trash'" @click="moveCurrentToTrash">
              {{ busyAction === 'trash' ? 'Moving...' : 'Move to Trash' }}
            </DangerButton>
          </div>
        </DangerZone>
      </section>

      <article v-else-if="selectedItemInContext" class="detail-card">
        <div class="detail-card__header detail-card__header--split">
          <div class="detail-card__identity">
            <span class="detail-card__avatar" aria-hidden="true">{{ itemMonogram(selectedItemInContext) }}</span>
            <div>
              <p class="eyebrow">{{ detailMetaType }}</p>
              <h2>{{ selectedItemInContext.payload.title }}</h2>
            </div>
          </div>
          <div class="detail-actions">
            <IconButton
              v-if="!isTrashContext"
              data-testid="favorite-toggle-detail"
              type="button"
              :label="isFavorite(selectedItemInContext.itemId) ? 'Remove favorite' : 'Add favorite'"
              @click="toggleFavorite(selectedItemInContext.itemId)"
            >
              {{ isFavorite(selectedItemInContext.itemId) ? '★' : '☆' }}
            </IconButton>
            <template v-if="!isTrashContext">
              <SecondaryButton
                type="button"
                @click="navigateTo(vaultRoute(`/vault/item/${selectedItemInContext.itemId}/edit`))"
              >
                Edit
              </SecondaryButton>
              <SecondaryButton
                v-if="selectedItemInContext.itemType === 'login'"
                type="button"
                @click="copyText(selectedItemInContext.payload.username)"
              >
                Copy username
              </SecondaryButton>
              <SecondaryButton
                v-if="selectedItemInContext.itemType === 'login'"
                type="button"
                @click="copyText(selectedItemInContext.payload.password)"
              >
                Copy password
              </SecondaryButton>
              <SecondaryButton
                v-if="selectedItemInContext.itemType === 'login' && selectedItemInContext.payload.urls[0]"
                type="button"
                @click="openUrl(selectedItemInContext.payload.urls[0])"
              >
                Open URL
              </SecondaryButton>
            </template>
          </div>
        </div>

        <KeyValueList>
          <template v-if="selectedItemInContext.itemType === 'login'">
            <div class="key-value-row">
              <dt>Username</dt>
              <dd>{{ selectedItemInContext.payload.username }}</dd>
            </div>
            <div class="key-value-row">
              <dt>Password</dt>
              <dd>
                <SecretField
                  v-if="!isTrashContext"
                  :model-value="selectedItemInContext.payload.password"
                  label="Password"
                  readonly
                  allow-copy
                  :mask-key="maskKey"
                  @copied="showToast('Copied')"
                />
                <span v-else>••••••••</span>
              </dd>
            </div>
            <div class="key-value-row">
              <dt>URL</dt>
              <dd>{{ selectedItemInContext.payload.urls[0] ?? '—' }}</dd>
            </div>
            <div class="key-value-row">
              <dt>Notes</dt>
              <dd>{{ selectedItemInContext.payload.notes || '—' }}</dd>
            </div>
          </template>

          <template v-else>
            <div class="key-value-row">
              <dt>Content</dt>
              <dd>{{ selectedItemInContext.payload.content }}</dd>
            </div>
          </template>

          <div class="key-value-row">
            <dt>Folder</dt>
            <dd>{{ folderName(folderFor(selectedItemInContext.itemId)) }}</dd>
          </div>
          <div class="key-value-row key-value-row--meta">
            <dt>Updated</dt>
            <dd>{{ selectedItemInContext.updatedAt }}</dd>
          </div>
          <div class="key-value-row key-value-row--meta">
            <dt>Revision</dt>
            <dd>{{ selectedItemInContext.revision }}</dd>
          </div>
        </KeyValueList>

        <section v-if="isTrashContext" class="detail-trash-actions">
          <PrimaryButton type="button" @click="restoreCurrentItem">Restore</PrimaryButton>
          <DangerZone title="DangerZone">
            <div class="form-actions">
              <DangerButton
                type="button"
                :disabled="busyAction === 'delete-permanent'"
                @click="deleteCurrentPermanently"
              >
                {{ busyAction === 'delete-permanent' ? 'Deleting...' : 'Delete permanently' }}
              </DangerButton>
            </div>
          </DangerZone>
        </section>
      </article>

      <EmptyState v-else title="Choose an item" />
    </section>

    <DialogModal :open="discardDialogOpen" title="Discard changes?">
      <template #actions>
        <SecondaryButton type="button" @click="closeDiscardDialog">Keep editing</SecondaryButton>
        <DangerButton type="button" @click="discardChanges">Discard changes</DangerButton>
      </template>
    </DialogModal>

    <ToastMessage v-if="toastMessage" :message="toastMessage" />
  </section>
</template>
