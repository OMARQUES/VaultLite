<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { createVaultLiteAuthClient } from '../lib/auth-client';
import { createTrustedLocalStateStore, type TrustedLocalStateRecord } from '../lib/trusted-local-state';

const router = useRouter();
const sessionStore = useSessionStore();
const authClient = createVaultLiteAuthClient();
const trustedLocalStateStore = createTrustedLocalStateStore();

const accountKit = ref<TrustedLocalStateRecord['accountKit'] | null>(null);
const acknowledged = ref(false);
const downloadAttempted = ref(false);
const busy = ref(false);
const errorMessage = ref<string | null>(null);
const hint = ref('');

const finishDisabled = computed(() => !acknowledged.value || !downloadAttempted.value || busy.value);

async function loadAccountKit() {
  const username = sessionStore.state.username;
  const record = username
    ? await trustedLocalStateStore.load(username)
    : await trustedLocalStateStore.loadFirst();
  accountKit.value = record?.accountKit ?? null;
}

function triggerJsonDownload(payload: object, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadAccountKit() {
  if (!accountKit.value) {
    return;
  }

  errorMessage.value = null;
  busy.value = true;
  try {
    const response = await authClient.bootstrapCheckpointDownload({
      payload: accountKit.value.payload,
      signature: accountKit.value.signature,
    });
    triggerJsonDownload(
      {
        payload: response.accountKit.payload,
        signature: response.accountKit.signature,
      },
      `${response.accountKit.payload.username}-account-kit.json`,
    );
    downloadAttempted.value = true;
    hint.value = 'Download started. Save it outside this browser.';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
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
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadAccountKit();
  if (!accountKit.value) {
    errorMessage.value = 'Account Kit context is unavailable for checkpoint completion.';
  }
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
        <PrimaryButton type="button" :disabled="busy || !accountKit" @click="downloadAccountKit">
          {{ downloadAttempted ? 'Download again' : 'Download signed Account Kit' }}
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
