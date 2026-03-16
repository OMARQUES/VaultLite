<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import DialogModal from '../ui/DialogModal.vue';
import PrimaryButton from '../ui/PrimaryButton.vue';
import SecondaryButton from '../ui/SecondaryButton.vue';
import TextField from '../ui/TextField.vue';
import {
  addVaultFolder,
  loadVaultUiState,
  onVaultUiStateUpdated,
  type VaultFolder,
} from '../../lib/vault-ui-state';

const props = defineProps<{
  username: string | null;
  deviceName: string | null;
  onLock?: () => void;
}>();

const route = useRoute();
const isVaultRoute = computed(() => route.path.startsWith('/vault'));
const isSettingsRoute = computed(() => route.path.startsWith('/settings'));
const activeScope = computed(() => {
  const raw = route.query.scope;
  if (raw === 'favorites' || raw === 'trash') {
    return raw;
  }
  return 'all';
});
const activeType = computed(() => {
  const raw = route.query.type;
  if (raw === 'login' || raw === 'document') {
    return raw;
  }
  return 'all';
});
const activeFolder = computed(() => {
  const raw = route.query.folder;
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  return 'all';
});
const activeSearch = computed(() => {
  const raw = route.query.q;
  if (typeof raw === 'string') {
    return raw;
  }
  return '';
});
const folders = ref<VaultFolder[]>([]);
const folderDialogOpen = ref(false);
const folderName = ref('');
const folderNameFieldRef = ref<InstanceType<typeof TextField> | null>(null);

function refreshFolders() {
  folders.value = loadVaultUiState(props.username).folders;
}

function vaultRoute(queryOverrides: {
  scope?: 'all' | 'favorites' | 'trash';
  type?: 'all' | 'login' | 'document';
  folder?: string;
  q?: string;
}) {
  const nextScope = queryOverrides.scope ?? activeScope.value;
  const nextType = queryOverrides.type ?? activeType.value;
  const nextFolder = nextScope === 'all' ? (queryOverrides.folder ?? activeFolder.value) : 'all';
  const nextSearch = (queryOverrides.q ?? activeSearch.value).trim();

  return {
    path: '/vault',
    query: {
      scope: nextScope,
      type: nextType,
      folder: nextFolder,
      q: nextSearch.length > 0 ? nextSearch : undefined,
    },
  };
}

function createFolder() {
  const trimmed = folderName.value.trim();
  if (!trimmed) {
    return;
  }

  addVaultFolder(props.username, trimmed);
  refreshFolders();
  folderDialogOpen.value = false;
  folderName.value = '';
}

function openFolderDialog() {
  folderDialogOpen.value = true;
  folderName.value = '';
  queueMicrotask(() => {
    folderNameFieldRef.value?.focus();
  });
}

function closeFolderDialog() {
  folderDialogOpen.value = false;
  folderName.value = '';
}

function handleFolderDialogKeydown(event: KeyboardEvent) {
  if (!folderDialogOpen.value) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeFolderDialog();
    return;
  }

  if (event.key === 'Enter' && folderName.value.trim().length > 0) {
    event.preventDefault();
    createFolder();
  }
}

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  refreshFolders();
  unsubscribe = onVaultUiStateUpdated((detail) => {
    if (detail.username === (props.username ?? null)) {
      refreshFolders();
    }
  });
  window.addEventListener('keydown', handleFolderDialogKeydown);
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
  window.removeEventListener('keydown', handleFolderDialogKeydown);
});

watch(
  () => props.username,
  () => {
    refreshFolders();
  },
);
</script>

<template>
  <aside class="sidebar-nav" aria-label="Application navigation">
    <div class="sidebar-nav__top">
      <div class="sidebar-nav__header">
        <RouterLink class="brand" to="/vault">VaultLite</RouterLink>
      </div>

      <nav class="sidebar-nav__links" aria-label="Primary">
        <RouterLink class="sidebar-nav__link" :class="{ 'is-active': isVaultRoute }" to="/vault">
          Vault
        </RouterLink>
        <RouterLink class="sidebar-nav__link" :class="{ 'is-active': isSettingsRoute }" to="/settings">
          Settings
        </RouterLink>
      </nav>

      <div v-if="isVaultRoute" class="sidebar-nav__vault">
        <section class="sidebar-nav__section">
          <nav class="sidebar-nav__section-links" aria-label="Vault scope">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeScope === 'all' }"
              :to="vaultRoute({ scope: 'all' })"
            >
              All
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeScope === 'favorites' }"
              :to="vaultRoute({ scope: 'favorites' })"
            >
              Favorites
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeScope === 'trash' }"
              :to="vaultRoute({ scope: 'trash' })"
            >
              Trash
            </RouterLink>
          </nav>
        </section>

        <section class="sidebar-nav__section">
          <nav class="sidebar-nav__section-links" aria-label="Vault types">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeType === 'login' }"
              :to="vaultRoute({ type: 'login' })"
            >
              Login
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeType === 'document' }"
              :to="vaultRoute({ type: 'document' })"
            >
              Documents
            </RouterLink>
          </nav>
        </section>

        <section class="sidebar-nav__section">
          <div class="sidebar-nav__section-header">
            <p class="sidebar-nav__section-title">Folders</p>
            <button class="button button--quiet sidebar-nav__new-folder" type="button" @click="openFolderDialog">
              New folder
            </button>
          </div>
          <nav class="sidebar-nav__section-links" aria-label="Vault folders">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeFolder === 'all' }"
              :to="vaultRoute({ folder: 'all' })"
            >
              All
            </RouterLink>
            <RouterLink
              v-for="folder in folders"
              :key="folder.id"
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeFolder === folder.id }"
              :to="vaultRoute({ folder: folder.id })"
            >
              {{ folder.name }}
            </RouterLink>
          </nav>
        </section>
      </div>
    </div>

    <div class="sidebar-nav__footer">
      <dl class="sidebar-nav__meta">
        <div>
          <dt>User</dt>
          <dd>{{ props.username ?? 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Device</dt>
          <dd>{{ props.deviceName ?? 'Unknown' }}</dd>
        </div>
      </dl>
      <button class="button button--secondary button--quiet sidebar-nav__lock" type="button" @click="props.onLock?.()">
        Lock now
      </button>
    </div>

    <DialogModal :open="folderDialogOpen" title="New folder">
      <TextField ref="folderNameFieldRef" v-model="folderName" label="Folder name" autocomplete="off" />
      <template #actions>
        <SecondaryButton type="button" @click="closeFolderDialog">Cancel</SecondaryButton>
        <PrimaryButton type="button" :disabled="!folderName.trim()" @click="createFolder">Create folder</PrimaryButton>
      </template>
    </DialogModal>
  </aside>
</template>
