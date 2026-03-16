<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SecretField from '../components/ui/SecretField.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import TextField from '../components/ui/TextField.vue';
import TextareaField from '../components/ui/TextareaField.vue';
import { useSessionStore } from '../composables/useSessionStore';

const router = useRouter();
const sessionStore = useSessionStore();

const trustedDevice = reactive({
  username: sessionStore.state.username ?? '',
  password: '',
});

const bootstrap = reactive({
  deviceName: 'Recovered Browser',
  password: '',
  accountKitJson: '',
});

const mode = ref<'trusted' | 'bootstrap'>('trusted');
const selectedFileName = ref('');
const manualFallbackOpen = ref(false);
const errorMessage = ref<string | null>(null);
const busyStep = ref<'remote' | 'bootstrap' | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isBusy = computed(() => busyStep.value !== null);
const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const remoteLabel = computed(() =>
  busyStep.value === 'remote' ? 'Authenticating trusted device...' : 'Authenticate trusted device',
);
const bootstrapLabel = computed(() =>
  busyStep.value === 'bootstrap' ? 'Bootstrapping new device...' : 'Bootstrap new device',
);
const modeOptions = [
  { label: 'Trusted device', value: 'trusted' },
  { label: 'Add device', value: 'bootstrap' },
] as const;

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

function openManualFallback() {
  manualFallbackOpen.value = true;
  selectedFileName.value = '';
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

function removeFile() {
  selectedFileName.value = '';
  bootstrap.accountKitJson = '';
}

async function remoteAuthenticate() {
  errorMessage.value = null;
  busyStep.value = 'remote';

  try {
    await sessionStore.remoteAuthenticate(trustedDevice);
    await router.push('/unlock');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyStep.value = null;
  }
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
    await sessionStore.bootstrapDevice({
      username: parseBootstrapUsername(),
      password: bootstrap.password,
      deviceName: bootstrap.deviceName,
      accountKitJson: bootstrap.accountKitJson,
    });
    await router.push('/unlock');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyStep.value = null;
  }
}
</script>

<template>
  <section class="public-page public-page--auth">
    <div class="panel-card panel-card--compact auth-stack auth-card">
      <div class="page-header">
        <p class="eyebrow">AUTH</p>
        <h1>Sign in or add a device</h1>
      </div>

      <SegmentedControl v-model="mode" :options="modeOptions" />

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <form v-if="mode === 'trusted'" class="form-stack auth-mode auth-mode--trusted" @submit.prevent="remoteAuthenticate">
        <div class="section-heading">
          <h2>Trusted device</h2>
        </div>
        <TextField v-model="trustedDevice.username" label="Username" autocomplete="username" required />
        <SecretField
          v-model="trustedDevice.password"
          label="Master password"
          autocomplete="current-password"
          required
        />
        <div class="form-actions">
          <PrimaryButton type="submit" :disabled="isBusy">
            {{ remoteLabel }}
          </PrimaryButton>
        </div>
      </form>

      <form v-else class="form-stack auth-mode auth-mode--add-device" @submit.prevent="bootstrapDevice">
        <div class="section-heading">
          <h2>Add device</h2>
        </div>

        <TextField v-model="bootstrap.deviceName" label="New device name" autocomplete="off" required />
        <SecretField
          v-model="bootstrap.password"
          label="Master password"
          autocomplete="current-password"
          required
        />

        <div v-if="!manualFallbackOpen" class="file-picker">
          <input
            ref="fileInputRef"
            class="sr-only"
            accept=".json,application/json"
            type="file"
            @change="setFileFromInput"
          />
          <label class="field">
            <span class="field__label">Account Kit file</span>
            <button class="button button--secondary auth-file-trigger" type="button" @click="triggerFilePicker">
              Replace file
            </button>
          </label>

          <div v-if="selectedFileName" class="file-picker__meta">
            <span>{{ selectedFileName }}</span>
            <div class="file-picker__actions">
              <SecondaryButton type="button" @click="triggerFilePicker">Replace file</SecondaryButton>
              <SecondaryButton type="button" @click="removeFile">Remove file</SecondaryButton>
            </div>
          </div>
        </div>

        <button class="text-button" data-testid="manual-json-toggle" type="button" @click="openManualFallback">
          Paste JSON manually instead
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
