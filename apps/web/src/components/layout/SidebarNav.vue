<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import DialogModal from '../ui/DialogModal.vue';
import AppIcon from '../ui/AppIcon.vue';
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
  role?: 'owner' | 'user' | null;
  deviceName: string | null;
  onLock?: () => void;
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
}>();

const route = useRoute();
const router = useRouter();
const isVaultRoute = computed(() => route.path.startsWith('/vault'));
const isSettingsRoute = computed(() => route.path.startsWith('/settings'));
const isAdminRoute = computed(() => route.path.startsWith('/admin'));
const showAdminLink = computed(() => props.role === 'owner');
const ownerSystemShortcut = computed<{
  to: string;
  label: 'Admin' | 'Vault';
  icon: 'all' | 'vault';
  isActive: boolean;
}>(() => {
  if (isAdminRoute.value) {
    return {
      to: '/vault',
      label: 'Vault',
      icon: 'vault',
      isActive: isVaultRoute.value,
    };
  }

  return {
    to: '/admin/overview',
    label: 'Admin',
    icon: 'all',
    isActive: isAdminRoute.value,
  };
});
const activeAdminSection = computed<'overview' | 'invites' | 'users' | 'audit'>(() => {
  if (!isAdminRoute.value) {
    return 'overview';
  }
  if (route.path.startsWith('/admin/invites')) {
    return 'invites';
  }
  if (route.path.startsWith('/admin/users')) {
    return 'users';
  }
  if (route.path.startsWith('/admin/audit')) {
    return 'audit';
  }
  return 'overview';
});
const activeScope = computed(() => {
  const raw = route.query.scope;
  if (raw === 'favorites' || raw === 'trash') {
    return raw;
  }
  return 'all';
});
const activeType = computed(() => {
  const raw = route.query.type;
  if (raw === 'login' || raw === 'document' || raw === 'card' || raw === 'secure_note') {
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
  type?: 'all' | 'login' | 'document' | 'card' | 'secure_note';
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

function toggleScopeSelection(scope: 'all' | 'favorites' | 'trash') {
  const nextScope = activeScope.value === scope ? 'all' : scope;
  void router.push(vaultRoute({ scope: nextScope }));
}

function toggleTypeSelection(type: 'all' | 'login' | 'document' | 'card' | 'secure_note') {
  const nextType = activeType.value === type ? 'all' : type;
  void router.push(vaultRoute({ type: nextType }));
}

function toggleFolderSelection(folderId: string) {
  const nextFolder = activeFolder.value === folderId ? 'all' : folderId;
  void router.push(vaultRoute({ folder: nextFolder }));
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

      <div v-if="isVaultRoute" class="sidebar-nav__vault">
        <section class="sidebar-nav__section">
          <p class="sidebar-nav__section-title">Scope</p>
          <nav class="sidebar-nav__section-links" aria-label="Vault scope">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeScope === 'all' }"
              :to="vaultRoute({ scope: 'all' })"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--all" name="all" :size="17" />
                <span>All items</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeScope === 'favorites' }"
              :to="vaultRoute({ scope: 'favorites' })"
              @click.capture.prevent="toggleScopeSelection('favorites')"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--favorites" name="favorites" :size="17" />
                <span>Favorites</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeScope === 'trash' }"
              :to="vaultRoute({ scope: 'trash' })"
              @click.capture.prevent="toggleScopeSelection('trash')"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--trash" name="trash" :size="17" />
                <span>Trash</span>
              </span>
            </RouterLink>
          </nav>
        </section>

        <section class="sidebar-nav__section">
          <p class="sidebar-nav__section-title">Types</p>
          <nav class="sidebar-nav__section-links" aria-label="Vault types">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeType === 'login' }"
              :to="vaultRoute({ type: 'login' })"
              @click.capture.prevent="toggleTypeSelection('login')"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--login" name="login" :size="17" />
                <span>Login</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeType === 'document' }"
              :to="vaultRoute({ type: 'document' })"
              @click.capture.prevent="toggleTypeSelection('document')"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--document" name="document" :size="17" />
                <span>Documents</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeType === 'card' }"
              :to="vaultRoute({ type: 'card' })"
              @click.capture.prevent="toggleTypeSelection('card')"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--card" name="card" :size="17" />
                <span>Cards</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeType === 'secure_note' }"
              :to="vaultRoute({ type: 'secure_note' })"
              @click.capture.prevent="toggleTypeSelection('secure_note')"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon
                  class="sidebar-nav__icon sidebar-nav__icon--secure-note"
                  name="secure_note"
                  :size="17"
                />
                <span>Secure Notes</span>
              </span>
            </RouterLink>
          </nav>
        </section>

        <section class="sidebar-nav__section">
          <div class="sidebar-nav__section-header">
            <p class="sidebar-nav__section-title">Folders</p>
            <button
              class="button button--quiet sidebar-nav__new-folder"
              type="button"
              aria-label="New folder"
              @click="openFolderDialog"
            >
              <AppIcon class="sidebar-nav__icon sidebar-nav__icon--plus" name="plus" :size="16" />
            </button>
          </div>
          <nav class="sidebar-nav__section-links" aria-label="Vault folders">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeFolder === 'all' }"
              :to="vaultRoute({ folder: 'all' })"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--folder" name="folder" :size="17" />
                <span>All folders</span>
              </span>
            </RouterLink>
            <RouterLink
              v-for="folder in folders"
              :key="folder.id"
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeFolder === folder.id }"
              :to="vaultRoute({ folder: folder.id })"
              @click.capture.prevent="toggleFolderSelection(folder.id)"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--folder" name="folder" :size="17" />
                <span>{{ folder.name }}</span>
              </span>
            </RouterLink>
          </nav>
        </section>
      </div>
      <div v-else-if="isAdminRoute && showAdminLink" class="sidebar-nav__vault sidebar-nav__admin">
        <section class="sidebar-nav__section">
          <p class="sidebar-nav__section-title">Admin</p>
          <nav class="sidebar-nav__section-links" aria-label="Admin sections">
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeAdminSection === 'overview' }"
              to="/admin/overview"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--all" name="all" :size="17" />
                <span>Overview</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeAdminSection === 'invites' }"
              to="/admin/invites"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--plus" name="plus" :size="17" />
                <span>Invites</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeAdminSection === 'users' }"
              to="/admin/users"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--settings" name="user" :size="17" />
                <span>Users</span>
              </span>
            </RouterLink>
            <RouterLink
              class="sidebar-nav__link sidebar-nav__link--compact"
              :class="{ 'is-active': activeAdminSection === 'audit' }"
              to="/admin/audit"
            >
              <span class="sidebar-nav__link-main">
                <AppIcon class="sidebar-nav__icon sidebar-nav__icon--document" name="document" :size="17" />
                <span>Audit</span>
              </span>
            </RouterLink>
          </nav>
        </section>
      </div>
    </div>

    <div class="sidebar-nav__footer">
      <p class="sidebar-nav__section-title">System</p>
      <RouterLink
        v-if="showAdminLink"
        class="sidebar-nav__link sidebar-nav__link--compact sidebar-nav__link--footer"
        :class="{ 'is-active': ownerSystemShortcut.isActive }"
        :to="ownerSystemShortcut.to"
      >
        <span class="sidebar-nav__link-main">
          <AppIcon class="sidebar-nav__icon sidebar-nav__icon--all" :name="ownerSystemShortcut.icon" :size="17" />
          <span>{{ ownerSystemShortcut.label }}</span>
        </span>
      </RouterLink>
      <button
        class="sidebar-nav__link sidebar-nav__link--compact sidebar-nav__link--footer"
        :class="{ 'is-active': props.settingsOpen || isSettingsRoute }"
        type="button"
        @click="props.onOpenSettings?.()"
      >
        <span class="sidebar-nav__link-main">
          <AppIcon class="sidebar-nav__icon sidebar-nav__icon--settings" name="settings" :size="17" />
          <span>Settings</span>
        </span>
      </button>
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
        <span class="sidebar-nav__link-main">
          <AppIcon class="sidebar-nav__icon sidebar-nav__icon--lock" name="lock" :size="17" />
          <span>Lock now</span>
        </span>
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
