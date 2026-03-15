<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

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
const exportedAccountKit = ref<TrustedLocalStateRecord['accountKit'] | null>(null);
const exportAcknowledged = ref(false);
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);

const exportedAccountKitJson = computed(() =>
  exportedAccountKit.value ? JSON.stringify(exportedAccountKit.value, null, 2) : '',
);

function formatOnboardingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('username_unavailable')) {
    return 'Username already exists for this deployment. Pick a different username before generating Account Kit.';
  }

  return message;
}

async function prepare() {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    exportedAccountKit.value = await sessionStore.prepareOnboarding(onboarding);
    exportAcknowledged.value = false;
  } catch (error) {
    errorMessage.value = formatOnboardingError(error);
  } finally {
    isSubmitting.value = false;
  }
}

async function finalize() {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    await sessionStore.finalizeOnboarding();
    await router.push('/vault');
  } catch (error) {
    exportedAccountKit.value = null;
    exportAcknowledged.value = false;
    errorMessage.value = formatOnboardingError(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <p class="eyebrow">Onboarding</p>
    <h1>Create account and initial device</h1>
    <form v-if="!exportedAccountKit" class="stack" @submit.prevent="prepare">
      <label>
        Invite token
        <input v-model="onboarding.inviteToken" required autocomplete="off" />
      </label>
      <label>
        Username
        <input v-model="onboarding.username" required autocomplete="username" />
      </label>
      <label>
        Master password
        <input
          v-model="onboarding.password"
          type="password"
          required
          autocomplete="new-password"
        />
      </label>
      <label>
        Device name
        <input v-model="onboarding.deviceName" required autocomplete="off" />
      </label>
      <button class="button primary" type="submit" :disabled="isSubmitting">
        Generate Account Kit
      </button>
    </form>

    <div v-else class="stack">
      <p>
        Export the signed Account Kit before finalizing onboarding. The deployment metadata below is
        canonical and comes from the API runtime.
      </p>
      <dl class="summary">
        <div>
          <dt>Server URL</dt>
          <dd>{{ exportedAccountKit.payload.serverUrl }}</dd>
        </div>
        <div>
          <dt>Deployment fingerprint</dt>
          <dd>{{ exportedAccountKit.payload.deploymentFingerprint }}</dd>
        </div>
      </dl>
      <textarea class="account-kit" :value="exportedAccountKitJson" readonly />
      <label class="checkbox-row">
        <input v-model="exportAcknowledged" type="checkbox" />
        <span>I exported the Account Kit and understand there is no master password recovery.</span>
      </label>
      <button
        class="button primary"
        type="button"
        :disabled="!exportAcknowledged || isSubmitting"
        @click="finalize"
      >
        Finalize onboarding
      </button>
    </div>

    <p class="warning">
      Forgotten master passwords are not recoverable. Account Kit export must be stored outside this
      browser session before onboarding is finalized.
    </p>
    <p v-if="errorMessage || sessionStore.state.lastError" class="error-banner">
      {{ errorMessage ?? sessionStore.state.lastError }}
    </p>
  </section>
</template>
