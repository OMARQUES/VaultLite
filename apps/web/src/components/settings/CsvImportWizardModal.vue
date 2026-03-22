<script setup lang="ts">
import { computed, ref } from 'vue';

import DialogModal from '../ui/DialogModal.vue';
import InlineAlert from '../ui/InlineAlert.vue';
import PrimaryButton from '../ui/PrimaryButton.vue';
import SecondaryButton from '../ui/SecondaryButton.vue';
import ImportPreviewTable from './ImportPreviewTable.vue';
import ImportResultSummary from './ImportResultSummary.vue';
import {
  executeVaultImport,
  getVaultImportLimits,
  parseVaultImportFile,
  type VaultImportExecutionResult,
  type VaultImportPreview,
} from '../../lib/vault-import';
import { triggerJsonDownload } from '../../lib/browser-download';
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
}>();

const steps = ['Upload', 'Validate', 'Preview', 'Import'] as const;
const activeStep = ref<(typeof steps)[number]>('Upload');
const selectedFile = ref<File | null>(null);
const backupPassphrase = ref('');
const preview = ref<VaultImportPreview | null>(null);
const importResult = ref<VaultImportExecutionResult | null>(null);
const parseBusy = ref(false);
const importBusy = ref(false);
const errorMessage = ref<string | null>(null);
const progress = ref({
  processed: 0,
  total: 0,
  created: 0,
  skipped: 0,
  failed: 0,
  attachmentsCreated: 0,
  attachmentsFailed: 0,
});

const limits = getVaultImportLimits();

const canClose = computed(() => !importBusy.value);
const uploadSummary = computed(() => {
  if (!selectedFile.value) {
    return 'No file selected yet.';
  }
  const sizeKb = (selectedFile.value.size / 1024).toFixed(1);
  return `${selectedFile.value.name} · ${sizeKb} KB`;
});
function resetState() {
  activeStep.value = 'Upload';
  selectedFile.value = null;
  backupPassphrase.value = '';
  preview.value = null;
  importResult.value = null;
  parseBusy.value = false;
  importBusy.value = false;
  errorMessage.value = null;
  progress.value = {
    processed: 0,
    total: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    attachmentsCreated: 0,
    attachmentsFailed: 0,
  };
}

function humanizeImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('unsupported_csv_format')) {
    return 'This import format is not supported yet.';
  }
  if (raw.includes('unsupported_import_format')) {
    return 'This file format is not supported for import.';
  }
  if (raw.includes('unsupported_export_version')) {
    return 'This VaultLite export version is not supported in this build.';
  }
  if (raw.includes('unsupported_backup_version')) {
    return 'This encrypted backup version is not supported in this build.';
  }
  if (raw.includes('backup_passphrase_required')) {
    return 'Enter the backup passphrase to import this encrypted backup package.';
  }
  if (raw.includes('backup_decrypt_failed')) {
    return 'We could not decrypt this backup package. Check the passphrase and try again.';
  }
  if (raw.includes('backup_payload_integrity_mismatch')) {
    return 'This backup package failed integrity validation and cannot be imported.';
  }
  if (raw.includes('import_file_size_exceeded')) {
    return 'This file is too large for import.';
  }
  if (raw.includes('csv_too_many_rows')) {
    return 'This file has too many rows. Split it and try again.';
  }
  if (raw.includes('import_item_limit_exceeded')) {
    return 'This file has too many importable items for one run.';
  }
  if (raw.includes('encrypted_export_not_supported')) {
    return 'Encrypted exports are not supported in this import flow yet.';
  }
  if (raw.includes('zip_slip_detected')) {
    return 'This archive has an unsafe path and cannot be imported.';
  }
  if (raw.includes('import_memory_budget_exceeded')) {
    return 'This archive is too heavy to process safely in-browser.';
  }
  if (raw.includes('archive_uncompressed_limit_exceeded')) {
    return 'This archive expands beyond the safe import size.';
  }
  if (raw.includes('zip_entry_limit_exceeded')) {
    return 'This archive has too many files to import safely.';
  }
  if (raw.includes('csv_missing_rows')) {
    return 'This file has no importable rows.';
  }
  return toHumanErrorMessage(error);
}

async function validateSelectedFile() {
  if (!selectedFile.value) {
    errorMessage.value = 'Choose an import file to continue.';
    return;
  }
  parseBusy.value = true;
  errorMessage.value = null;
  preview.value = null;
  importResult.value = null;

  try {
    preview.value = await parseVaultImportFile({
      file: selectedFile.value,
      sessionStore: props.sessionStore,
      vaultClient: props.vaultClient,
      backupPassphrase: backupPassphrase.value,
    });
    activeStep.value = 'Validate';
  } catch (error) {
    errorMessage.value = humanizeImportError(error);
  } finally {
    parseBusy.value = false;
  }
}

async function startImport() {
  if (!preview.value) {
    errorMessage.value = 'Validate the file before importing.';
    return;
  }
  importBusy.value = true;
  errorMessage.value = null;
  progress.value = {
    processed: 0,
    total: preview.value.validRows,
    created: 0,
    skipped: 0,
    failed: 0,
    attachmentsCreated: 0,
    attachmentsFailed: 0,
  };
  activeStep.value = 'Import';

  try {
    importResult.value = await executeVaultImport({
      sessionStore: props.sessionStore,
      vaultClient: props.vaultClient,
      preview: preview.value,
      onProgress(current) {
        progress.value = current;
      },
    });
    void discoverImportedSiteIcons(preview.value);
  } catch (error) {
    errorMessage.value = humanizeImportError(error);
  } finally {
    importBusy.value = false;
  }
}

function downloadImportReport() {
  if (!importResult.value) {
    return;
  }
  triggerJsonDownload({
    filename: `vaultlite-import-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    value: importResult.value.report,
  });
}

function closeModal() {
  if (!canClose.value) {
    return;
  }
  resetState();
  emit('close');
}

function onFileChanged(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  backupPassphrase.value = '';
  preview.value = null;
  importResult.value = null;
  activeStep.value = 'Upload';
  errorMessage.value = null;
}

function moveToPreview() {
  if (!preview.value) {
    return;
  }
  activeStep.value = 'Preview';
}

function normalizeImportHost(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
    const hostname = parsed.hostname.trim().toLowerCase().replace(/\.$/u, '');
    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

function importHostsFromPreview(value: VaultImportPreview): string[] {
  const hosts = new Set<string>();
  for (const candidate of value.candidates) {
    if (candidate.itemType !== 'login' || !Array.isArray(candidate.urls)) {
      continue;
    }
    for (const rawUrl of candidate.urls) {
      const host = normalizeImportHost(rawUrl);
      if (host) {
        hosts.add(host);
      }
    }
  }
  return Array.from(hosts).slice(0, 200);
}

async function discoverImportedSiteIcons(previewValue: VaultImportPreview) {
  const hosts = importHostsFromPreview(previewValue);
  if (hosts.length === 0) {
    return;
  }
  try {
    await props.sessionStore.discoverSiteIcons({
      domains: hosts,
      forceRefresh: false,
    });
  } catch {
    // Best-effort enrichment: import UX must not depend on icon discovery.
  }
}
</script>

<template>
  <DialogModal modal-class="dialog-modal--import" :open="open" title="Import vault data">
    <div class="import-wizard" aria-live="polite">
      <ol class="import-wizard__steps">
        <li v-for="step in steps" :key="step" :class="{ 'is-active': activeStep === step }">
          {{ step }}
        </li>
      </ol>

      <InlineAlert v-if="errorMessage" tone="danger">
        {{ errorMessage }}
      </InlineAlert>

      <section v-if="activeStep === 'Upload'" class="import-wizard__section">
        <label class="import-upload-dropzone">
          <input
            class="sr-only"
            type="file"
            accept=".csv,.json,.zip,.1pux,.vlbk,.vlbk.json,text/csv,application/json,application/zip"
            @change="onFileChanged"
          >
          <strong>Select import file</strong>
          <span>{{ uploadSummary }}</span>
          <small>
            Max file size: {{ Math.round(limits.maxImportFileBytes / 1024 / 1024) }} MB · Max items:
            {{ limits.maxImportItems }}
          </small>
        </label>
        <label class="field">
          <span>Backup passphrase (encrypted backup only)</span>
          <input
            v-model="backupPassphrase"
            class="field__input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="Enter passphrase only when importing vaultlite.backup.v1"
          >
        </label>
        <div class="import-wizard__actions">
          <SecondaryButton type="button" @click="closeModal">Cancel</SecondaryButton>
          <PrimaryButton type="button" :disabled="parseBusy || !selectedFile" @click="validateSelectedFile">
            {{ parseBusy ? 'Validating...' : 'Validate file' }}
          </PrimaryButton>
        </div>
      </section>

      <section v-else-if="activeStep === 'Validate'" class="import-wizard__section">
        <dl class="import-validate-summary">
          <div>
            <dt>Total</dt>
            <dd>{{ preview?.totalRows ?? 0 }}</dd>
          </div>
          <div>
            <dt>Valid</dt>
            <dd>{{ preview?.validRows ?? 0 }}</dd>
          </div>
          <div>
            <dt>Duplicates</dt>
            <dd>{{ preview?.duplicateRows ?? 0 }}</dd>
          </div>
          <div>
            <dt>Invalid</dt>
            <dd>{{ preview?.invalidRows ?? 0 }}</dd>
          </div>
          <div>
            <dt>Unsupported</dt>
            <dd>{{ preview?.unsupportedRows ?? 0 }}</dd>
          </div>
          <div>
            <dt>Needs review</dt>
            <dd>{{ preview?.reviewRequiredRows ?? 0 }}</dd>
          </div>
          <div>
            <dt>Attachments</dt>
            <dd>{{ preview?.attachmentCount ?? 0 }}</dd>
          </div>
        </dl>
        <p v-if="(preview?.validRows ?? 0) === 0" class="module-empty-hint">
          No valid rows found in this file.
        </p>
        <div class="import-wizard__actions">
          <SecondaryButton type="button" @click="activeStep = 'Upload'">Back</SecondaryButton>
          <PrimaryButton
            type="button"
            :disabled="(preview?.validRows ?? 0) === 0"
            @click="moveToPreview"
          >
            Review preview
          </PrimaryButton>
        </div>
      </section>

      <section v-else-if="activeStep === 'Preview'" class="import-wizard__section">
        <ImportPreviewTable
          v-if="preview"
          :rows="preview.rows"
        />
        <div class="import-wizard__actions">
          <SecondaryButton type="button" @click="activeStep = 'Validate'">Back</SecondaryButton>
          <PrimaryButton type="button" :disabled="importBusy" @click="startImport">
            Start import
          </PrimaryButton>
        </div>
      </section>

      <section v-else class="import-wizard__section">
        <div class="import-progress">
          <p>
            Processing {{ progress.processed }} / {{ progress.total }} valid rows
          </p>
          <progress
            :max="Math.max(progress.total, 1)"
            :value="progress.processed"
          />
          <p class="module-empty-hint">
            Attachments: {{ progress.attachmentsCreated }} created · {{ progress.attachmentsFailed }} failed
          </p>
        </div>
        <ImportResultSummary
          v-if="importResult"
          :created="importResult.created"
          :skipped="importResult.skipped"
          :failed="importResult.failed"
          :attachments-created="importResult.attachmentsCreated"
          :attachments-failed="importResult.attachmentsFailed"
          @download-report="downloadImportReport"
        />
        <div class="import-wizard__actions">
          <SecondaryButton type="button" :disabled="importBusy" @click="closeModal">
            Done
          </SecondaryButton>
          <PrimaryButton type="button" :disabled="importBusy" @click="resetState">
            Import another file
          </PrimaryButton>
        </div>
      </section>
    </div>
  </DialogModal>
</template>
