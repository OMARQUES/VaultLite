<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { createVaultLiteAuthClient } from '../lib/auth-client';
import { triggerJsonDownload } from '../lib/browser-download';
import { toHumanErrorMessage } from '../lib/human-error';

const router = useRouter();
const sessionStore = useSessionStore();
const authClient = createVaultLiteAuthClient();

const accountKit = ref<Awaited<ReturnType<typeof sessionStore.reissueAccountKit>> | null>(null);
const acknowledged = ref(false);
const downloadAttempted = ref(false);
const busy = ref(false);
const preparingAccountKit = ref(false);
const errorMessage = ref<string | null>(null);
const hint = ref('');

const finishDisabled = computed(
  () =>
    !acknowledged.value ||
    !downloadAttempted.value ||
    busy.value ||
    preparingAccountKit.value ||
    !accountKit.value,
);

const downloadLabel = computed(() => {
  if (preparingAccountKit.value) {
    return 'Preparing Account Kit...';
  }
  if (!accountKit.value) {
    return 'Prepare Account Kit';
  }
  return downloadAttempted.value ? 'Download again' : 'Download signed Account Kit';
});

async function loadAccountKit() {
  if (preparingAccountKit.value || accountKit.value || sessionStore.state.phase !== 'ready') {
    return;
  }

  errorMessage.value = null;
  preparingAccountKit.value = true;
  try {
    accountKit.value = await sessionStore.reissueAccountKit();
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    preparingAccountKit.value = false;
  }
}

async function downloadAccountKit() {
  if (!accountKit.value) {
    await loadAccountKit();
  }

  if (!accountKit.value) {
    errorMessage.value = 'Unable to prepare Account Kit for download. Unlock and try again.';
    return;
  }

  errorMessage.value = null;
  busy.value = true;
  try {
    const response = await authClient.bootstrapCheckpointDownload({
      payload: accountKit.value.payload,
      signature: accountKit.value.signature,
    });
    triggerJsonDownload({
      filename: `${response.accountKit.payload.username}-account-kit.json`,
      value: {
        payload: response.accountKit.payload,
        signature: response.accountKit.signature,
      },
    });
    downloadAttempted.value = true;
    hint.value = 'Download started. Save it outside this browser.';
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busy.value = false;
  }
}

async function finishInitialization() {
  if (finishDisabled.value) {
    return;
  }

  errorMessage.value = null;
  busy.value = true;
  try {
    await authClient.bootstrapCheckpointComplete({
      confirmSavedOutsideBrowser: true,
    });
    await sessionStore.refreshBootstrapState();
    await router.push('/bootstrap/success');
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busy.value = false;
  }
}

watch(
  () => sessionStore.state.phase,
  (phase) => {
    if (phase === 'ready') {
      void loadAccountKit();
    }
  },
);

onMounted(async () => {
  if (sessionStore.state.phase === 'local_unlock_required') {
    await router.replace('/unlock?next=/bootstrap/checkpoint');
    return;
  }

  if (sessionStore.state.phase !== 'ready') {
    errorMessage.value = 'Unlock your owner session before finishing initialization.';
    return;
  }

  await loadAccountKit();
});
</script>

<template>
  <section class="public-page public-page--onboarding">
    <div class="panel-card panel-card--form onboarding-card">
      <div class="onboarding-card__header">
        <div class="onboarding-card__meta">
          <p class="eyebrow">BOOTSTRAP</p>
          <p class="onboarding-card__step">Step 2 of 2</p>
        </div>
        <h1>Save your Account Kit</h1>
        <p class="page-subtitle onboarding-card__subtitle">
          Store this signed file outside the browser before finishing initialization.
        </p>
      </div>

      <InlineAlert v-if="errorMessage" tone="danger">{{ errorMessage }}</InlineAlert>

      <article v-if="accountKit" class="account-kit-card">
        <header class="account-kit-card__header">
          <h2>Account Kit ready</h2>
          <span class="account-kit-card__badge">Signed and verified</span>
        </header>
        <p class="account-kit-card__description">
          Issued for {{ accountKit.payload.username }} on {{ accountKit.payload.deploymentFingerprint }}.
        </p>
      </article>

      <div class="form-actions onboarding-step__actions onboarding-step__download-action">
        <PrimaryButton
          type="button"
          :disabled="busy || preparingAccountKit"
          @click="downloadAccountKit"
        >
          {{ downloadLabel }}
        </PrimaryButton>
      </div>
      <p v-if="hint" class="onboarding-step__hint">{{ hint }}</p>
      <label class="checkbox-row">
        <input v-model="acknowledged" type="checkbox" />
        <span>I saved the Account Kit outside this browser.</span>
      </label>
      <div class="form-actions onboarding-step__actions onboarding-step__final-actions">
        <PrimaryButton type="button" :disabled="finishDisabled" @click="finishInitialization">
          {{ busy ? 'Finishing…' : 'Finish setup' }}
        </PrimaryButton>
      </div>
    </div>
  </section>
</template>
