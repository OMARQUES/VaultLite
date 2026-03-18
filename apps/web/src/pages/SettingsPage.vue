<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { toHumanErrorMessage } from '../lib/human-error';

const sessionStore = useSessionStore();
const router = useRouter();
const errorMessage = ref<string | null>(null);
const toastMessage = ref('');
const busyStep = ref<'reissue' | null>(null);
const lastReissuedAt = ref<string | null>(null);
const hasPasswordRotationFlow = false;
const autoLockOptions = [
  { label: '1 minute', value: 60 * 1000 },
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '10 minutes', value: 10 * 60 * 1000 },
  { label: '15 minutes', value: 15 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
] as const;
const selectedAutoLockAfterMs = ref(String(sessionStore.state.autoLockAfterMs));

const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const reissueLabel = computed(() =>
  busyStep.value === 'reissue' ? 'Reissuing Account Kit...' : 'Reissue Account Kit',
);
const lastReissuedLabel = computed(() => {
  if (!lastReissuedAt.value) return 'No reissue performed in this session.';
  const parsed = new Date(lastReissuedAt.value);
  if (Number.isNaN(parsed.getTime())) return lastReissuedAt.value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
});

watch(
  () => sessionStore.state.autoLockAfterMs,
  (nextValue) => {
    selectedAutoLockAfterMs.value = String(nextValue);
  },
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

async function lockNow() {
  sessionStore.lock();
  await router.push('/unlock');
}

function updateAutoLockSetting() {
  const parsedValue = Number.parseInt(selectedAutoLockAfterMs.value, 10);
  if (!Number.isFinite(parsedValue)) {
    return;
  }

  sessionStore.setAutoLockAfterMs(parsedValue);
  showToast('Lock timeout updated');
}

async function reissueAccountKit() {
  errorMessage.value = null;
  busyStep.value = 'reissue';

  try {
    const accountKit = await sessionStore.reissueAccountKit();
    downloadJson(`${accountKit.payload.username}-account-kit.json`, accountKit);
    lastReissuedAt.value = new Date().toISOString();
    showToast('Account Kit reissued');
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
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
        <dl class="settings-meta">
          <div>
            <dt>Account</dt>
            <dd>{{ sessionStore.state.username ?? 'Unknown' }}</dd>
          </div>
          <div>
            <dt>Device</dt>
            <dd>{{ sessionStore.state.deviceName ?? 'Unknown' }}</dd>
          </div>
        </dl>
        <label class="field">
          <span class="field__label">Auto-lock after</span>
          <select
            v-model="selectedAutoLockAfterMs"
            class="field__select"
            aria-label="Auto-lock after"
            @change="updateAutoLockSetting"
          >
            <option
              v-for="option in autoLockOptions"
              :key="option.value"
              :value="String(option.value)"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" @click="lockNow">Lock now</SecondaryButton>
        </div>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Account Kit</h2>
        <div class="warning-banner warning-banner--subtle">
          Store exported kits outside the browser. Reissuing creates a new signed export for this account.
        </div>
        <p class="module-empty-hint">Last reissued: {{ lastReissuedLabel }}</p>
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
