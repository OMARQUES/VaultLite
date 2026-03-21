<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import SettingsPage from './SettingsPage.vue';

type SettingsSection = 'overview' | 'security' | 'devices' | 'extension' | 'data' | 'advanced';

const route = useRoute();

const activeSection = computed<SettingsSection>(() => {
  const rawSection = route.params.section;
  if (rawSection === 'security' || rawSection === 'devices' || rawSection === 'extension' || rawSection === 'data' || rawSection === 'advanced') {
    return rawSection;
  }
  return 'overview';
});

const subtitle = computed(() => {
  switch (activeSection.value) {
    case 'security':
      return 'Manage session security, password rotation, and account recovery kit.';
    case 'devices':
      return 'Review trusted devices and revoke access when needed.';
    case 'extension':
      return 'Pair, monitor, and troubleshoot the browser extension.';
    case 'data':
      return 'Import data and generate plaintext exports or encrypted backups.';
    case 'advanced':
      return 'Technical diagnostics and advanced connection settings.';
    case 'overview':
    default:
      return 'Manage security, devices, extension pairing, and data portability.';
  }
});
</script>

<template>
  <section class="settings-shell-page">
    <header class="settings-shell-page__header">
      <h1>Settings</h1>
      <p class="page-subtitle">{{ subtitle }}</p>
    </header>

    <div class="settings-shell-page__layout">
      <div class="settings-shell-page__content">
        <SettingsPage :section="activeSection" />
      </div>
    </div>
  </section>
</template>
