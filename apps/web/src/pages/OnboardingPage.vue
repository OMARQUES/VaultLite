<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import TextField from '../components/ui/TextField.vue';
import { useSessionStore } from '../composables/useSessionStore';
import type { TrustedLocalStateRecord } from '../lib/trusted-local-state';

const router = useRouter();
const sessionStore = useSessionStore();

const onboarding = reactive({
  inviteToken: '',
  username: '',
  password: '',
  deviceName: 'Primary Browser',
});

const accountKit = ref<TrustedLocalStateRecord['accountKit'] | null>(null);
const acknowledged = ref(false);
const errorMessage = ref<string | null>(null);
const busyStep = ref<'prepare' | 'finalize' | null>(null);

const isBusy = computed(() => busyStep.value !== null);
const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const prepareLabel = computed(() =>
  busyStep.value === 'prepare' ? 'Generating Account Kit...' : 'Generate Account Kit',
);
const finalizeLabel = computed(() =>
  busyStep.value === 'finalize' ? 'Finalizing account creation...' : 'Finalize account creation',
);

function formatOnboardingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('username_unavailable')) {
    return 'Username unavailable.';
  }

  return message;
}

function downloadAccountKit() {
  if (!accountKit.value) {
    return;
  }

  const blob = new Blob([JSON.stringify(accountKit.value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${accountKit.value.payload.username}-account-kit.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function prepare() {
  errorMessage.value = null;
  busyStep.value = 'prepare';

  try {
    accountKit.value = await sessionStore.prepareOnboarding(onboarding);
    acknowledged.value = false;
  } catch (error) {
    errorMessage.value = formatOnboardingError(error);
  } finally {
    busyStep.value = null;
  }
}

async function finalize() {
  errorMessage.value = null;
  busyStep.value = 'finalize';

  try {
    await sessionStore.finalizeOnboarding();
    await router.push('/vault');
  } catch (error) {
    accountKit.value = null;
    acknowledged.value = false;
    errorMessage.value = formatOnboardingError(error);
  } finally {
    busyStep.value = null;
  }
}
</script>

<template>
  <section class="public-page public-page--onboarding">
    <div class="panel-card panel-card--form">
      <div class="page-header">
        <p class="eyebrow">ONBOARDING</p>
        <h1>Create account and initial device</h1>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <div class="warning-banner">
        Forgotten master passwords are not recoverable.
      </div>

      <form v-if="!accountKit" class="form-stack" @submit.prevent="prepare">
        <TextField v-model="onboarding.inviteToken" label="Invite token" autocomplete="off" required />
        <TextField v-model="onboarding.username" label="Username" autocomplete="username" required />
        <SecretField
          v-model="onboarding.password"
          label="Master password"
          autocomplete="new-password"
          required
        />
        <TextField v-model="onboarding.deviceName" label="Device name" autocomplete="off" required />

        <div class="form-actions">
          <PrimaryButton type="submit" :disabled="isBusy">
            {{ prepareLabel }}
          </PrimaryButton>
        </div>
      </form>

      <section v-else class="form-stack">
        <h2>Account Kit ready</h2>
        <div class="form-actions form-actions--split">
          <PrimaryButton type="button" :disabled="isBusy" @click="downloadAccountKit">
            Download signed Account Kit
          </PrimaryButton>
        </div>
        <label class="checkbox-row">
          <input v-model="acknowledged" type="checkbox" />
          <span>I stored the Account Kit outside this browser session.</span>
        </label>
        <div class="form-actions">
          <PrimaryButton type="button" :disabled="!acknowledged || isBusy" @click="finalize">
            {{ finalizeLabel }}
          </PrimaryButton>
        </div>
      </section>
    </div>
  </section>
</template>
