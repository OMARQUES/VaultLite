<script setup lang="ts">
import { ref } from 'vue';

import type { SessionStore } from '../../lib/session-store';
import { createVaultLiteVaultClient } from '../../lib/vault-client';
import DataPortabilityCard from './DataPortabilityCard.vue';
import CsvImportWizardModal from './CsvImportWizardModal.vue';
import EncryptedBackupModal from './EncryptedBackupModal.vue';
import JsonExportModal from './JsonExportModal.vue';

defineProps<{
  sessionStore: SessionStore;
}>();

const emit = defineEmits<{
  (event: 'notify', message: string): void;
}>();

const vaultClient = createVaultLiteVaultClient();
const importModalOpen = ref(false);
const exportModalOpen = ref(false);
const backupModalOpen = ref(false);
</script>

<template>
  <section class="panel-card panel-card--compact settings-section">
    <h2>Data portability</h2>
    <p class="module-empty-hint">
      Import vault data from CSV/JSON/ZIP/1PUX, generate plaintext exports, and create encrypted backups.
    </p>

    <div class="data-portability-grid">
      <DataPortabilityCard
        title="Import vault data"
        description="Supported formats: VaultLite CSV, Bitwarden CSV/JSON/ZIP, and 1Password 1PUX."
        cta-label="Import vault file"
        @action="importModalOpen = true"
      />
      <DataPortabilityCard
        title="JSON export (plaintext)"
        description="Generate deterministic versioned JSON for portability."
        cta-label="Export JSON"
        @action="exportModalOpen = true"
      />
      <DataPortabilityCard
        title="Encrypted backup package"
        description="Create vaultlite.backup.v1 using Argon2id + AES-256-GCM."
        cta-label="Create encrypted backup"
        @action="backupModalOpen = true"
      />
    </div>
  </section>

  <CsvImportWizardModal
    :open="importModalOpen"
    :session-store="sessionStore"
    :vault-client="vaultClient"
    @close="importModalOpen = false"
  />
  <JsonExportModal
    :open="exportModalOpen"
    :session-store="sessionStore"
    :vault-client="vaultClient"
    @close="exportModalOpen = false"
    @exported="emit('notify', 'JSON export downloaded')"
  />
  <EncryptedBackupModal
    :open="backupModalOpen"
    :session-store="sessionStore"
    :vault-client="vaultClient"
    @close="backupModalOpen = false"
    @created="emit('notify', 'Encrypted backup package ready')"
  />
</template>
