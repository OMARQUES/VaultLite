<script setup lang="ts">
import { ref } from 'vue';

import DialogModal from '../ui/DialogModal.vue';
import InlineAlert from '../ui/InlineAlert.vue';
import PrimaryButton from '../ui/PrimaryButton.vue';
import SecondaryButton from '../ui/SecondaryButton.vue';
import SecretField from '../ui/SecretField.vue';
import {
  buildVaultJsonExportV1,
  loadDecryptedVaultDataset,
  serializeDeterministicJson,
} from '../../lib/data-portability';
import { toHumanErrorMessage } from '../../lib/human-error';
import type { SessionStore } from '../../lib/session-store';
import type { VaultLiteVaultClient } from '../../lib/vault-client';

const props = defineProps<{
  open: boolean;
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'exported'): void;
}>();

const includeTrash = ref(false);
const includeUiState = ref(true);
const prettyJson = ref(true);
const acknowledgedRisk = ref(false);
const currentPassword = ref('');
const busy = ref(false);
const errorMessage = ref<string | null>(null);

function resetState() {
  includeTrash.value = false;
  includeUiState.value = true;
  prettyJson.value = true;
  acknowledgedRisk.value = false;
  currentPassword.value = '';
  busy.value = false;
  errorMessage.value = null;
}

function closeModal() {
  if (busy.value) {
    return;
  }
  resetState();
  emit('close');
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function generateExport() {
  if (!acknowledgedRisk.value) {
    errorMessage.value = 'Acknowledge the plaintext export warning before continuing.';
    return;
  }
  if (!currentPassword.value) {
    errorMessage.value = 'Enter your current password to confirm this sensitive action.';
    return;
  }

  busy.value = true;
  errorMessage.value = null;
  try {
    await props.sessionStore.confirmRecentReauth({
      password: currentPassword.value,
    });
    const runtimeMetadata = await props.sessionStore.getRuntimeMetadata();
    const dataset = await loadDecryptedVaultDataset({
      sessionStore: props.sessionStore,
      vaultClient: props.vaultClient,
    });
    const exportPayload = buildVaultJsonExportV1({
      dataset,
      includeTombstones: includeTrash.value,
      includeUiState: includeUiState.value,
      source: {
        ...runtimeMetadata,
        username: props.sessionStore.state.username ?? 'unknown',
      },
    });
    const serialized = serializeDeterministicJson(exportPayload, prettyJson.value);
    const username = props.sessionStore.state.username ?? 'account';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(`vaultlite-export-${username}-${timestamp}.json`, serialized);
    emit('exported');
    busy.value = false;
    closeModal();
    return;
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    if (busy.value) {
      busy.value = false;
    }
  }
}
</script>

<template>
  <DialogModal modal-class="dialog-modal--export" :open="open" title="Export JSON (plaintext)">
    <div class="export-modal">
      <InlineAlert tone="warning">
        Contains decrypted secrets. Store securely.
      </InlineAlert>
      <label class="checkbox-row">
        <input v-model="includeTrash" type="checkbox">
        <span>Include Trash items</span>
      </label>
      <label class="checkbox-row">
        <input v-model="includeUiState" type="checkbox">
        <span>Include local organization (favorites/folders)</span>
      </label>
      <label class="checkbox-row">
        <input v-model="prettyJson" type="checkbox">
        <span>Pretty JSON</span>
      </label>
      <label class="checkbox-row">
        <input v-model="acknowledgedRisk" type="checkbox">
        <span>I understand this export is unencrypted.</span>
      </label>
      <SecretField
        v-model="currentPassword"
        label="Current password confirmation"
        autocomplete="current-password"
      />
      <InlineAlert v-if="errorMessage" tone="danger">
        {{ errorMessage }}
      </InlineAlert>
    </div>
    <template #actions>
      <SecondaryButton type="button" :disabled="busy" @click="closeModal">
        Cancel
      </SecondaryButton>
      <PrimaryButton type="button" :disabled="busy" @click="generateExport">
        {{ busy ? 'Generating...' : 'Download JSON export' }}
      </PrimaryButton>
    </template>
  </DialogModal>
</template>
