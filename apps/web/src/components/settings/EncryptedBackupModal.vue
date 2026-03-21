<script setup lang="ts">
import { computed, ref } from 'vue';

import DialogModal from '../ui/DialogModal.vue';
import InlineAlert from '../ui/InlineAlert.vue';
import PrimaryButton from '../ui/PrimaryButton.vue';
import SecondaryButton from '../ui/SecondaryButton.vue';
import SecretField from '../ui/SecretField.vue';
import {
  buildVaultJsonExportV1,
  collectBackupAttachmentEntries,
  createEncryptedBackupPackageV1,
  loadDecryptedVaultDataset,
  serializeDeterministicJson,
} from '../../lib/data-portability';
import { triggerJsonDownload } from '../../lib/browser-download';
import { toHumanErrorMessage } from '../../lib/human-error';
import type { SessionStore } from '../../lib/session-store';
import type { VaultLiteVaultClient } from '../../lib/vault-client';

type BackupPhase = 'configure' | 'encrypting' | 'ready';

const props = defineProps<{
  open: boolean;
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'created'): void;
}>();

const currentPassword = ref('');
const passphrase = ref('');
const confirmPassphrase = ref('');
const includeUiState = ref(true);
const includeAttachments = ref(true);
const phase = ref<BackupPhase>('configure');
const phaseLabel = ref('prepare');
const errorMessage = ref<string | null>(null);
const createdAt = ref<string | null>(null);
const backupJson = ref('');

const passphraseStrength = computed(() => {
  const value = passphrase.value;
  if (!value) return '—';
  if (value.length < 12) return 'Low';
  if (value.length < 18) return 'Medium';
  return 'High';
});

const configureDisabled = computed(() => {
  if (!currentPassword.value || !passphrase.value || !confirmPassphrase.value) {
    return true;
  }
  if (passphrase.value.length < 12) {
    return true;
  }
  return passphrase.value !== confirmPassphrase.value;
});

function resetState() {
  currentPassword.value = '';
  passphrase.value = '';
  confirmPassphrase.value = '';
  includeUiState.value = true;
  includeAttachments.value = true;
  phase.value = 'configure';
  phaseLabel.value = 'prepare';
  errorMessage.value = null;
  createdAt.value = null;
  backupJson.value = '';
}

function closeModal() {
  if (phase.value === 'encrypting') {
    return;
  }
  resetState();
  emit('close');
}

function downloadBackup() {
  if (!backupJson.value) {
    return;
  }
  const username = props.sessionStore.state.username ?? 'account';
  const timestamp = (createdAt.value ?? new Date().toISOString()).replace(/[:.]/g, '-');
  triggerJsonDownload({
    filename: `vaultlite-backup-${username}-${timestamp}.vlbk.json`,
    value: backupJson.value,
  });
}

async function createBackup() {
  if (configureDisabled.value) {
    errorMessage.value = 'Review passphrase fields and try again.';
    return;
  }

  phase.value = 'encrypting';
  errorMessage.value = null;
  backupJson.value = '';

  try {
    phaseLabel.value = 'confirming';
    await props.sessionStore.confirmRecentReauth({
      password: currentPassword.value,
    });
    phaseLabel.value = 'loading data';
    const runtimeMetadata = await props.sessionStore.getRuntimeMetadata();
    const dataset = await loadDecryptedVaultDataset({
      sessionStore: props.sessionStore,
      vaultClient: props.vaultClient,
    });
    const exportPayload = buildVaultJsonExportV1({
      dataset,
      includeTombstones: true,
      includeUiState: includeUiState.value,
      source: {
        ...runtimeMetadata,
        username: props.sessionStore.state.username ?? 'unknown',
      },
    });
    phaseLabel.value = 'collecting attachments';
    const attachments = includeAttachments.value
      ? await collectBackupAttachmentEntries({
          dataset,
          vaultClient: props.vaultClient,
        })
      : [];
    phaseLabel.value = 'deriving key';
    const backupPackage = await createEncryptedBackupPackageV1({
      passphrase: passphrase.value,
      exportPayload,
      source: exportPayload.source,
      attachments,
      manifest: {
        itemCount: exportPayload.vault.counts.items,
        tombstoneCount: exportPayload.vault.counts.tombstones,
        uiStateIncluded: exportPayload.uiState !== null,
        attachmentMode: attachments.length > 0 ? 'inline_encrypted_blobs' : 'none',
        attachmentCount: attachments.length,
        attachmentBytes: attachments.reduce((total, attachment) => total + attachment.size, 0),
      },
    });
    phaseLabel.value = 'finalizing';
    backupJson.value = serializeDeterministicJson(backupPackage, true);
    createdAt.value = backupPackage.createdAt;
    phase.value = 'ready';
    emit('created');
  } catch (error) {
    phase.value = 'configure';
    errorMessage.value = toHumanErrorMessage(error);
  }
}
</script>

<template>
  <DialogModal modal-class="dialog-modal--backup" :open="open" title="Create encrypted backup">
    <div v-if="phase === 'configure'" class="backup-modal">
      <p class="module-empty-hint">
        Package format: <code>vaultlite.backup.v1</code>. Keep this passphrase safe.
      </p>
      <SecretField
        v-model="currentPassword"
        label="Current password confirmation"
        autocomplete="current-password"
      />
      <SecretField
        v-model="passphrase"
        label="Backup passphrase"
        autocomplete="new-password"
      />
      <SecretField
        v-model="confirmPassphrase"
        label="Confirm backup passphrase"
        autocomplete="new-password"
      />
      <p class="module-empty-hint">Passphrase strength: {{ passphraseStrength }}</p>
      <label class="checkbox-row">
        <input v-model="includeUiState" type="checkbox">
        <span>Include local organization data</span>
      </label>
      <label class="checkbox-row">
        <input v-model="includeAttachments" type="checkbox">
        <span>Include attached encrypted blobs</span>
      </label>
      <InlineAlert v-if="errorMessage" tone="danger">
        {{ errorMessage }}
      </InlineAlert>
    </div>

    <div v-else-if="phase === 'encrypting'" class="backup-modal">
      <p>Preparing encrypted backup...</p>
      <progress max="100" />
      <p class="module-empty-hint">Current phase: {{ phaseLabel }}</p>
    </div>

    <div v-else class="backup-modal">
      <InlineAlert tone="warning">
        Backup generated. Store this file and passphrase in safe locations.
      </InlineAlert>
      <p class="module-empty-hint">
        Created at: {{ createdAt }}
      </p>
      <p class="module-empty-hint">Package fingerprint: {{ backupJson.slice(0, 32) }}...</p>
    </div>

    <template #actions>
      <SecondaryButton type="button" :disabled="phase === 'encrypting'" @click="closeModal">
        {{ phase === 'ready' ? 'Done' : 'Cancel' }}
      </SecondaryButton>
      <PrimaryButton
        v-if="phase === 'configure'"
        type="button"
        :disabled="configureDisabled"
        @click="createBackup"
      >
        Create encrypted backup
      </PrimaryButton>
      <PrimaryButton
        v-else-if="phase === 'ready'"
        type="button"
        @click="downloadBackup"
      >
        Download encrypted backup
      </PrimaryButton>
    </template>
  </DialogModal>
</template>
