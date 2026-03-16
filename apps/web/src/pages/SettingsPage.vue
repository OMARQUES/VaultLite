<script setup lang="ts">
import { computed, ref } from 'vue';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import { useSessionStore } from '../composables/useSessionStore';

const sessionStore = useSessionStore();
const errorMessage = ref<string | null>(null);
const toastMessage = ref('');
const busyStep = ref<'reissue' | null>(null);
const hasPasswordRotationFlow = false;

const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const reissueLabel = computed(() =>
  busyStep.value === 'reissue' ? 'Reissuing Account Kit...' : 'Reissue Account Kit',
);

function showToast(message: string) {
  toastMessage.value = message;
  window.setTimeout(() => {
    if (toastMessage.value === message) {
      toastMessage.value = '';
    }
  }, 1800);
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function lockNow() {
  sessionStore.lock();
}

async function reissueAccountKit() {
  errorMessage.value = null;
  busyStep.value = 'reissue';

  try {
    const accountKit = await sessionStore.reissueAccountKit();
    downloadJson(`${accountKit.payload.username}-account-kit.json`, accountKit);
    showToast('Account Kit reissued');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyStep.value = null;
  }
}
</script>

<template>
  <section class="settings-page settings-page--security">
    <div class="settings-page__header">
      <h1>Security</h1>
    </div>

    <InlineAlert v-if="surfaceError" tone="danger">
      {{ surfaceError }}
    </InlineAlert>

    <div class="settings-stack">
      <section class="panel-card panel-card--compact settings-section">
        <h2>Session</h2>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" @click="lockNow">Lock now</SecondaryButton>
        </div>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Account Kit</h2>
        <div class="warning-banner warning-banner--subtle">
          Store exported kits outside the browser.
        </div>
        <div class="form-actions settings-section__actions">
          <PrimaryButton type="button" :disabled="busyStep === 'reissue'" @click="reissueAccountKit">
            {{ reissueLabel }}
          </PrimaryButton>
        </div>
      </section>

      <section v-if="hasPasswordRotationFlow" class="panel-card panel-card--compact settings-section">
        <h2>Password</h2>
      </section>
    </div>

    <ToastMessage v-if="toastMessage" :message="toastMessage" />
  </section>
</template>
