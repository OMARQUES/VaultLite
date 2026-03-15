<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { useSessionStore } from '../composables/useSessionStore';
import { createVaultLiteVaultClient } from '../lib/vault-client';
import {
  createVaultWorkspace,
  type DocumentVaultItemPayload,
  type LoginVaultItemPayload,
  type VaultWorkspaceItem,
} from '../lib/vault-workspace';

const sessionStore = useSessionStore();
const workspace = createVaultWorkspace({
  sessionStore,
  vaultClient: createVaultLiteVaultClient(),
});

const reissuedAccountKit = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const searchQuery = ref('');
const activeComposer = ref<'none' | 'login' | 'document'>('none');
const editingItemId = ref<string | null>(null);
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
const editLoginDraft = reactive<LoginVaultItemPayload>({
  title: '',
  username: '',
  password: '',
  urls: [],
  notes: '',
});
const editDocumentDraft = reactive<DocumentVaultItemPayload>({
  title: '',
  content: '',
});

const allItems = computed(() => workspace.state.items);
const items = computed(() => workspace.filteredItems.value);
const canShowEmptyState = computed(
  () => !workspace.state.isLoading && allItems.value.length === 0,
);
const canShowNoSearchResults = computed(
  () =>
    !workspace.state.isLoading &&
    allItems.value.length > 0 &&
    items.value.length === 0 &&
    searchQuery.value.trim().length > 0,
);

function urlsAsText(urls: string[]): string {
  return urls.join('\n');
}

function normalizeUrls(raw: string): string[] {
  return raw
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

function updateCreateLoginUrls(event: Event) {
  loginDraft.urls = normalizeUrls((event.target as HTMLTextAreaElement).value);
}

function updateEditLoginUrls(event: Event) {
  editLoginDraft.urls = normalizeUrls((event.target as HTMLTextAreaElement).value);
}

function resetLoginDraft() {
  loginDraft.title = '';
  loginDraft.username = '';
  loginDraft.password = '';
  loginDraft.urls = [];
  loginDraft.notes = '';
}

function resetDocumentDraft() {
  documentDraft.title = '';
  documentDraft.content = '';
}

async function loadVault() {
  errorMessage.value = null;
  try {
    await workspace.load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function lockVault() {
  sessionStore.lock();
}

async function reissueAccountKit() {
  errorMessage.value = null;
  try {
    const accountKit = await sessionStore.reissueAccountKit();
    reissuedAccountKit.value = JSON.stringify(accountKit, null, 2);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function createLogin() {
  errorMessage.value = null;
  try {
    await workspace.createLogin({
      ...loginDraft,
      urls: [...loginDraft.urls],
    });
    resetLoginDraft();
    activeComposer.value = 'none';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function createDocument() {
  errorMessage.value = null;
  try {
    await workspace.createDocument({
      ...documentDraft,
    });
    resetDocumentDraft();
    activeComposer.value = 'none';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function startEditing(item: VaultWorkspaceItem) {
  editingItemId.value = item.itemId;
  if (item.itemType === 'login') {
    editLoginDraft.title = item.payload.title;
    editLoginDraft.username = item.payload.username;
    editLoginDraft.password = item.payload.password;
    editLoginDraft.urls = [...item.payload.urls];
    editLoginDraft.notes = item.payload.notes;
    return;
  }

  editDocumentDraft.title = item.payload.title;
  editDocumentDraft.content = item.payload.content;
}

function cancelEditing() {
  editingItemId.value = null;
}

function updateSearchQuery(event: Event) {
  searchQuery.value = (event.target as HTMLInputElement).value;
  workspace.setSearchQuery(searchQuery.value);
}

async function saveEditing(item: VaultWorkspaceItem) {
  errorMessage.value = null;
  try {
    if (item.itemType === 'login') {
      await workspace.updateItem({
        ...item,
        payload: {
          ...editLoginDraft,
          urls: [...editLoginDraft.urls],
        },
      });
    } else {
      await workspace.updateItem({
        ...item,
        payload: { ...editDocumentDraft },
      });
    }
    editingItemId.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function deleteItem(itemId: string) {
  if (!window.confirm('Delete this vault item permanently?')) {
    return;
  }

  errorMessage.value = null;
  try {
    await workspace.deleteItem(itemId);
    if (editingItemId.value === itemId) {
      editingItemId.value = null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

onMounted(async () => {
  await loadVault();
});
</script>

<template>
  <section class="panel stack">
    <div class="header-row">
      <div>
        <p class="eyebrow">Vault workspace</p>
        <h1>Encrypted items</h1>
      </div>
      <div class="actions">
        <button class="button" type="button" @click="lockVault">Lock now</button>
        <button class="button" type="button" @click="loadVault">Refresh</button>
        <button class="button primary" type="button" @click="reissueAccountKit">
          Reissue Account Kit
        </button>
      </div>
    </div>

    <dl class="summary">
      <div>
        <dt>Phase</dt>
        <dd>{{ sessionStore.state.phase }}</dd>
      </div>
      <div>
        <dt>Username</dt>
        <dd>{{ sessionStore.state.username ?? 'unknown' }}</dd>
      </div>
      <div>
        <dt>Device</dt>
        <dd>{{ sessionStore.state.deviceName ?? 'unknown' }}</dd>
      </div>
    </dl>

    <label class="search-field">
      Search vault
      <input
        data-testid="vault-search-input"
        :value="searchQuery"
        placeholder="Search titles, usernames, URLs, notes, and document content"
        @input="updateSearchQuery"
      />
    </label>

    <div class="composer-actions">
      <button class="button primary" type="button" @click="activeComposer = 'login'">New login</button>
      <button class="button primary" type="button" @click="activeComposer = 'document'">
        New document
      </button>
    </div>

    <form v-if="activeComposer === 'login'" class="editor stack" @submit.prevent="createLogin">
      <h2>Create login</h2>
      <label>
        Title
        <input v-model="loginDraft.title" required />
      </label>
      <label>
        Username
        <input v-model="loginDraft.username" required />
      </label>
      <label>
        Password
        <input v-model="loginDraft.password" required type="password" />
      </label>
      <label>
        URLs
        <textarea
          :value="urlsAsText(loginDraft.urls)"
          @input="updateCreateLoginUrls"
        />
      </label>
      <label>
        Notes
        <textarea v-model="loginDraft.notes" />
      </label>
      <div class="actions">
        <button class="button primary" type="submit">Save login</button>
        <button class="button" type="button" @click="activeComposer = 'none'">Cancel</button>
      </div>
    </form>

    <form
      v-if="activeComposer === 'document'"
      class="editor stack"
      @submit.prevent="createDocument"
    >
      <h2>Create document</h2>
      <label>
        Title
        <input v-model="documentDraft.title" required />
      </label>
      <label>
        Content
        <textarea v-model="documentDraft.content" required />
      </label>
      <div class="actions">
        <button class="button primary" type="submit">Save document</button>
        <button class="button" type="button" @click="activeComposer = 'none'">Cancel</button>
      </div>
    </form>

    <p v-if="workspace.state.isLoading" class="muted">Loading encrypted items…</p>
    <p v-else-if="canShowEmptyState" class="muted">
      No items yet. Create a login or a document to validate the vault CRUD flow.
    </p>
    <p v-else-if="canShowNoSearchResults" class="muted">
      No vault items match the current search query.
    </p>

    <article v-for="item in items" :key="item.itemId" class="vault-item">
      <template v-if="editingItemId !== item.itemId">
        <div class="vault-item__header">
          <div>
            <p class="eyebrow">{{ item.itemType }}</p>
            <h2>{{ item.payload.title }}</h2>
          </div>
          <div class="actions">
            <button class="button" type="button" @click="startEditing(item)">Edit</button>
            <button class="button danger" type="button" @click="deleteItem(item.itemId)">Delete</button>
          </div>
        </div>
        <dl class="summary">
          <div>
            <dt>Revision</dt>
            <dd>{{ item.revision }}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{{ item.updatedAt }}</dd>
          </div>
        </dl>
        <template v-if="item.itemType === 'login'">
          <p><strong>Username:</strong> {{ item.payload.username }}</p>
          <p><strong>URLs:</strong> {{ item.payload.urls.join(', ') || 'none' }}</p>
          <p><strong>Notes:</strong> {{ item.payload.notes || 'none' }}</p>
        </template>
        <template v-else>
          <p class="document-content">{{ item.payload.content }}</p>
        </template>
      </template>

      <form v-else class="editor stack" @submit.prevent="saveEditing(item)">
        <template v-if="item.itemType === 'login'">
          <h2>Edit login</h2>
          <label>
            Title
            <input v-model="editLoginDraft.title" required />
          </label>
          <label>
            Username
            <input v-model="editLoginDraft.username" required />
          </label>
          <label>
            Password
            <input v-model="editLoginDraft.password" required type="password" />
          </label>
          <label>
            URLs
            <textarea
              :value="urlsAsText(editLoginDraft.urls)"
              @input="updateEditLoginUrls"
            />
          </label>
          <label>
            Notes
            <textarea v-model="editLoginDraft.notes" />
          </label>
        </template>
        <template v-else>
          <h2>Edit document</h2>
          <label>
            Title
            <input v-model="editDocumentDraft.title" required />
          </label>
          <label>
            Content
            <textarea v-model="editDocumentDraft.content" required />
          </label>
        </template>
        <div class="actions">
          <button class="button primary" type="submit">Save changes</button>
          <button class="button" type="button" @click="cancelEditing">Cancel</button>
        </div>
      </form>
    </article>

    <textarea
      v-if="reissuedAccountKit"
      class="account-kit"
      :value="reissuedAccountKit"
      readonly
    />
    <p v-if="errorMessage || workspace.state.lastError" class="error-banner">
      {{ errorMessage ?? workspace.state.lastError }}
    </p>
  </section>
</template>
