<script setup lang="ts">
import type { DeviceSummary } from '@vaultlite/contracts';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import DangerButton from '../components/ui/DangerButton.vue';
import DataPortabilitySection from '../components/settings/DataPortabilitySection.vue';
import DialogModal from '../components/ui/DialogModal.vue';
import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { toHumanErrorMessage } from '../lib/human-error';

const sessionStore = useSessionStore();
const router = useRouter();
const errorMessage = ref<string | null>(null);
const toastMessage = ref('');
const busyStep = ref<'reissue' | 'devices' | 'revoke' | 'rotate' | null>(null);
const lastReissuedAt = ref<string | null>(null);
const devices = ref<DeviceSummary[]>([]);
const lastDevicesRefreshAt = ref<string | null>(null);
const revokeDialogOpen = ref(false);
const revokeTargetDevice = ref<DeviceSummary | null>(null);
const revokePassword = ref('');
const revokeErrorMessage = ref<string | null>(null);
const rotateCurrentPassword = ref('');
const rotateNextPassword = ref('');
const rotateConfirmPassword = ref('');
const rotateErrorMessage = ref<string | null>(null);
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
  return formatDateTime(lastReissuedAt.value);
});
const devicesBusy = computed(() => busyStep.value === 'devices');
const revokeBusy = computed(() => busyStep.value === 'revoke');
const rotateBusy = computed(() => busyStep.value === 'rotate');
const hasPasswordRotationFlow = computed(() => sessionStore.state.phase === 'ready');
const rotateSubmitDisabled = computed(() => {
  if (rotateBusy.value) {
    return true;
  }
  if (!rotateCurrentPassword.value || !rotateNextPassword.value || !rotateConfirmPassword.value) {
    return true;
  }
  if (rotateNextPassword.value !== rotateConfirmPassword.value) {
    return true;
  }
  if (rotateCurrentPassword.value === rotateNextPassword.value) {
    return true;
  }
  return false;
});
const devicesRefreshLabel = computed(() => {
  if (!lastDevicesRefreshAt.value) {
    return 'Device list has not been refreshed yet.';
  }
  return `Last refreshed: ${formatDateTime(lastDevicesRefreshAt.value)}`;
});
const rotationHint = computed(() => {
  if (rotateNextPassword.value.length > 0 && rotateNextPassword.value.length < 8) {
    return 'Use at least 8 characters for the new password.';
  }
  if (rotateCurrentPassword.value && rotateCurrentPassword.value === rotateNextPassword.value) {
    return 'New password must be different from the current password.';
  }
  if (rotateConfirmPassword.value && rotateConfirmPassword.value !== rotateNextPassword.value) {
    return 'New password confirmation does not match.';
  }
  return null;
});

watch(
  () => sessionStore.state.autoLockAfterMs,
  (nextValue) => {
    selectedAutoLockAfterMs.value = String(nextValue);
  },
);

onMounted(() => {
  void refreshDevices();
});

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

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

async function refreshDevices() {
  errorMessage.value = null;
  busyStep.value = 'devices';
  try {
    const response = await sessionStore.listDevices();
    devices.value = response.devices;
    lastDevicesRefreshAt.value = new Date().toISOString();
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyStep.value = null;
  }
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

function openRevokeDialog(device: DeviceSummary) {
  revokeTargetDevice.value = device;
  revokePassword.value = '';
  revokeErrorMessage.value = null;
  revokeDialogOpen.value = true;
}

function closeRevokeDialog() {
  revokeDialogOpen.value = false;
  revokeTargetDevice.value = null;
  revokePassword.value = '';
  revokeErrorMessage.value = null;
}

async function confirmRevokeDevice() {
  if (!revokeTargetDevice.value) {
    return;
  }
  if (!revokePassword.value) {
    revokeErrorMessage.value = 'Enter your current password to confirm this action.';
    return;
  }

  revokeErrorMessage.value = null;
  errorMessage.value = null;
  busyStep.value = 'revoke';
  try {
    await sessionStore.confirmRecentReauth({
      password: revokePassword.value,
    });
    const response = await sessionStore.revokeDevice(revokeTargetDevice.value.deviceId);
    if (response.result === 'success_changed') {
      showToast('Device revoked');
    } else {
      showToast('No changes were needed');
    }
    closeRevokeDialog();
    await refreshDevices();
  } catch (error) {
    const message = toHumanErrorMessage(error);
    revokeErrorMessage.value = message;
    errorMessage.value = message;
  } finally {
    busyStep.value = null;
  }
}

async function rotatePassword() {
  if (rotateSubmitDisabled.value) {
    if (rotationHint.value) {
      rotateErrorMessage.value = rotationHint.value;
      errorMessage.value = rotationHint.value;
    }
    return;
  }

  rotateErrorMessage.value = null;
  errorMessage.value = null;
  busyStep.value = 'rotate';

  try {
    await sessionStore.rotatePassword({
      currentPassword: rotateCurrentPassword.value,
      nextPassword: rotateNextPassword.value,
    });
    rotateCurrentPassword.value = '';
    rotateNextPassword.value = '';
    rotateConfirmPassword.value = '';
    rotateErrorMessage.value = null;
    showToast('Password rotated successfully');
  } catch (error) {
    const message = toHumanErrorMessage(error);
    rotateErrorMessage.value = message;
    errorMessage.value = message;
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
        <h2>Trusted devices</h2>
        <p class="module-empty-hint">{{ devicesRefreshLabel }}</p>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" :disabled="devicesBusy" @click="refreshDevices">
            {{ devicesBusy ? 'Refreshing...' : 'Refresh devices' }}
          </SecondaryButton>
        </div>
        <ul v-if="devices.length > 0" class="settings-device-list">
          <li v-for="device in devices" :key="device.deviceId" class="settings-device-row">
            <div class="settings-device-row__content">
              <p class="settings-device-row__title">
                {{ device.deviceName }}
                <span v-if="device.isCurrentDevice" class="settings-device-badge">Current device</span>
                <span
                  v-if="device.deviceState === 'revoked'"
                  class="settings-device-badge settings-device-badge--revoked"
                >
                  Revoked
                </span>
              </p>
              <p class="settings-device-row__meta">
                {{ device.platform }} · Created {{ formatDateTime(device.createdAt) }}
              </p>
              <p class="settings-device-row__meta">
                Última autenticação registrada: {{ formatDateTime(device.lastAuthenticatedAt) }}
              </p>
            </div>
            <div class="settings-device-row__actions">
              <DangerButton
                v-if="device.deviceState === 'active' && !device.isCurrentDevice"
                type="button"
                :disabled="revokeBusy"
                @click="openRevokeDialog(device)"
              >
                Revoke
              </DangerButton>
              <SecondaryButton
                v-else-if="device.isCurrentDevice"
                type="button"
                :disabled="true"
              >
                In use
              </SecondaryButton>
              <SecondaryButton
                v-else
                type="button"
                :disabled="true"
              >
                Revoked
              </SecondaryButton>
            </div>
          </li>
        </ul>
        <p v-else class="module-empty-hint">No trusted devices found for this account.</p>
      </section>

      <section v-if="hasPasswordRotationFlow" class="panel-card panel-card--compact settings-section">
        <h2>Password rotation</h2>
        <p class="module-empty-hint">
          Rotating password revokes older sessions and keeps trusted devices active.
        </p>
        <form class="form-stack" @submit.prevent="rotatePassword">
          <SecretField
            v-model="rotateCurrentPassword"
            label="Current password"
            autocomplete="current-password"
          />
          <SecretField
            v-model="rotateNextPassword"
            label="New password"
            autocomplete="new-password"
          />
          <SecretField
            v-model="rotateConfirmPassword"
            label="Confirm new password"
            autocomplete="new-password"
          />
          <InlineAlert v-if="rotationHint" tone="warning">
            {{ rotationHint }}
          </InlineAlert>
          <InlineAlert v-if="rotateErrorMessage" tone="danger">
            {{ rotateErrorMessage }}
          </InlineAlert>
          <div class="form-actions settings-section__actions">
            <PrimaryButton type="submit" :disabled="rotateSubmitDisabled">
              {{ rotateBusy ? 'Rotating...' : 'Rotate password' }}
            </PrimaryButton>
          </div>
        </form>
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

      <DataPortabilitySection
        :session-store="sessionStore"
        @notify="showToast"
      />
    </div>

    <DialogModal
      :open="revokeDialogOpen"
      :title="revokeTargetDevice ? `Revoke ${revokeTargetDevice.deviceName}?` : 'Revoke device'"
    >
      <p>
        Revoking a trusted device blocks new authentications for that device. Existing in-flight requests may
        finish, but all new authenticated requests after commit will be denied.
      </p>
      <SecretField
        v-model="revokePassword"
        label="Current password"
        autocomplete="current-password"
      />
      <InlineAlert v-if="revokeErrorMessage" tone="danger">
        {{ revokeErrorMessage }}
      </InlineAlert>
      <template #actions>
        <SecondaryButton type="button" :disabled="revokeBusy" @click="closeRevokeDialog">
          Cancel
        </SecondaryButton>
        <DangerButton type="button" :disabled="revokeBusy" @click="confirmRevokeDevice">
          {{ revokeBusy ? 'Revoking...' : 'Revoke device' }}
        </DangerButton>
      </template>
    </DialogModal>

    <ToastMessage v-if="toastMessage" :message="toastMessage" />
  </section>
</template>
