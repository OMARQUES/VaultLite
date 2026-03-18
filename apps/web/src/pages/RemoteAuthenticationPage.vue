<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import AppIcon from '../components/ui/AppIcon.vue';
import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import TextField from '../components/ui/TextField.vue';
import TextareaField from '../components/ui/TextareaField.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { toHumanErrorMessage } from '../lib/human-error';

const router = useRouter();
const sessionStore = useSessionStore();

const bootstrap = reactive({
  deviceName: 'Recovered Browser',
  password: '',
  accountKitJson: '',
});

const selectedFileName = ref('');
const manualFallbackOpen = ref(false);
const errorMessage = ref<string | null>(null);
const busyStep = ref<'bootstrap' | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isBusy = computed(() => busyStep.value !== null);
const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const bootstrapLabel = computed(() =>
  busyStep.value === 'bootstrap' ? 'Bootstrapping new device...' : 'Bootstrap new device',
);

const parsedAccountKit = computed(() => {
  if (!bootstrap.accountKitJson.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(bootstrap.accountKitJson) as {
      payload?: {
        username?: string;
        deploymentFingerprint?: string;
        version?: string;
      };
    };
    if (!parsed.payload) {
      return null;
    }

    return {
      username: parsed.payload.username ?? '',
      deploymentFingerprint: parsed.payload.deploymentFingerprint ?? '',
      version: parsed.payload.version ?? '',
    };
  } catch {
    return null;
  }
});

const uploadButtonLabel = computed(() =>
  selectedFileName.value ? 'Choose another file' : 'Choose Account Kit file',
);

const manualFallbackLabel = computed(() =>
  manualFallbackOpen.value ? 'Hide manual JSON' : 'Paste JSON manually instead',
);

function resetFileState() {
  selectedFileName.value = '';
  if (!manualFallbackOpen.value) {
    bootstrap.accountKitJson = '';
  }
}

async function setFileFromInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    resetFileState();
    return;
  }

  selectedFileName.value = file.name;
  bootstrap.accountKitJson = await file.text();
  manualFallbackOpen.value = false;
}

function toggleManualFallback() {
  manualFallbackOpen.value = !manualFallbackOpen.value;
  if (manualFallbackOpen.value) {
    selectedFileName.value = '';
  }
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

function parseBootstrapUsername(): string {
  try {
    const parsed = JSON.parse(bootstrap.accountKitJson) as {
      payload?: { username?: string };
    };
    if (!parsed.payload?.username) {
      throw new Error('Invalid Account Kit');
    }
    return parsed.payload.username;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Invalid Account Kit');
  }
}

async function bootstrapDevice() {
  errorMessage.value = null;
  busyStep.value = 'bootstrap';

  try {
    const username = parseBootstrapUsername();
    await sessionStore.bootstrapDevice({
      username,
      password: bootstrap.password,
      deviceName: bootstrap.deviceName,
      accountKitJson: bootstrap.accountKitJson,
    });
    await router.push('/unlock');
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyStep.value = null;
  }
}
</script>

<template>
  <section class="public-page public-page--auth">
    <div class="panel-card panel-card--compact auth-stack auth-card">
      <div class="page-header">
        <p class="eyebrow">DEVICE SETUP</p>
        <h1>Add a device</h1>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <form class="form-stack auth-mode auth-mode--add-device" @submit.prevent="bootstrapDevice">
        <TextField v-model="bootstrap.deviceName" label="New device name" autocomplete="off" required />
        <SecretField
          v-model="bootstrap.password"
          label="Master password"
          autocomplete="current-password"
          required
        />

        <div class="file-picker">
          <input
            ref="fileInputRef"
            class="sr-only"
            accept=".json,application/json"
            type="file"
            @change="setFileFromInput"
          />
          <span class="field__label">Account Kit file</span>
          <button
            class="button button--secondary file-picker__trigger"
            type="button"
            aria-label="Upload Account Kit file"
            :disabled="isBusy"
            @click="triggerFilePicker"
          >
            <AppIcon class="file-picker__trigger-icon" name="attachment" :size="18" />
            <span>{{ uploadButtonLabel }}</span>
          </button>
          <p class="file-picker__hint">Signed Account Kit (.json)</p>
          <p v-if="selectedFileName" class="file-picker__filename">{{ selectedFileName }}</p>
        </div>

        <button
          class="text-button file-picker__manual-toggle"
          data-testid="manual-json-toggle"
          type="button"
          :aria-expanded="manualFallbackOpen ? 'true' : 'false'"
          @click="toggleManualFallback"
        >
          {{ manualFallbackLabel }}
        </button>

        <TextareaField
          v-if="manualFallbackOpen"
          v-model="bootstrap.accountKitJson"
          label="Account Kit file"
          required
          :rows="8"
        />

        <dl v-if="parsedAccountKit" class="auth-kit-summary">
          <div class="auth-kit-summary__row">
            <dt>Username</dt>
            <dd>{{ parsedAccountKit.username || '—' }}</dd>
          </div>
          <div class="auth-kit-summary__row">
            <dt>Deployment fingerprint</dt>
            <dd>{{ parsedAccountKit.deploymentFingerprint || '—' }}</dd>
          </div>
          <div class="auth-kit-summary__row">
            <dt>Version</dt>
            <dd>{{ parsedAccountKit.version || '—' }}</dd>
          </div>
        </dl>

        <div class="form-actions">
          <PrimaryButton type="submit" :disabled="isBusy || !bootstrap.accountKitJson.trim()">
            {{ bootstrapLabel }}
          </PrimaryButton>
        </div>
      </form>
    </div>
  </section>
</template>
