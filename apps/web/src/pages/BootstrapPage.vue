<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import TextField from '../components/ui/TextField.vue';
import { useSessionStore } from '../composables/useSessionStore';
import {
  createLocalUnlockEnvelope,
  createOpaqueBundlePlaceholder,
  createRandomBase64Url,
  deriveAuthProof,
  generateAccountKey,
} from '../lib/browser-crypto';
import { createVaultLiteAuthClient } from '../lib/auth-client';
import { toHumanErrorMessage } from '../lib/human-error';
import { createTrustedLocalStateStore } from '../lib/trusted-local-state';

const router = useRouter();
const sessionStore = useSessionStore();
const authClient = createVaultLiteAuthClient();
const trustedLocalStateStore = createTrustedLocalStateStore();

const form = reactive({
  bootstrapToken: '',
  username: '',
  password: '',
  deviceName: 'Primary Browser',
});
const step = ref<1 | 2>(1);
const verificationToken = ref('');
const busy = ref(false);
const errorMessage = ref<string | null>(null);

async function verifyBootstrapAccess() {
  busy.value = true;
  errorMessage.value = null;
  try {
    const response = await authClient.bootstrapVerify({
      bootstrapToken: form.bootstrapToken,
    });
    verificationToken.value = response.verificationToken;
    step.value = 2;
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busy.value = false;
  }
}

async function initializeOwner() {
  busy.value = true;
  errorMessage.value = null;
  try {
    const metadata = await authClient.getRuntimeMetadata();
    const authSalt = createRandomBase64Url(16);
    const authVerifier = await deriveAuthProof(form.password, authSalt);
    const accountKey = generateAccountKey();
    const encryptedAccountBundle = createOpaqueBundlePlaceholder({
      username: form.username,
      serverUrl: metadata.serverUrl,
      deviceId: `bootstrap_${createRandomBase64Url(8)}`,
    });
    const accountKeyWrapped = createOpaqueBundlePlaceholder({
      username: form.username,
      serverUrl: metadata.serverUrl,
      deviceId: `wrapped_${createRandomBase64Url(8)}`,
    });

    const ownerSession = await authClient.bootstrapInitializeOwner({
      verificationToken: verificationToken.value,
      username: form.username,
      authSalt,
      authVerifier,
      encryptedAccountBundle,
      accountKeyWrapped,
      initialDeviceName: form.deviceName,
      initialDevicePlatform: 'web',
    });

    const localUnlockEnvelope = await createLocalUnlockEnvelope({
      password: form.password,
      authSalt,
      payload: {
        accountKey,
        encryptedAccountBundle,
        accountKeyWrapped,
      },
    });

    await trustedLocalStateStore.save({
      username: ownerSession.user.username,
      deviceId: ownerSession.device.deviceId,
      deviceName: ownerSession.device.deviceName,
      platform: 'web',
      authSalt,
      encryptedAccountBundle,
      accountKeyWrapped,
      localUnlockEnvelope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await sessionStore.restoreSession();
    await sessionStore.localUnlock({
      username: ownerSession.user.username,
      password: form.password,
    });
    form.password = '';
    await router.push('/bootstrap/checkpoint');
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="public-page public-page--onboarding">
    <div class="panel-card panel-card--form onboarding-card">
      <div class="onboarding-card__header">
        <div class="onboarding-card__meta">
          <p class="eyebrow">BOOTSTRAP</p>
          <p class="onboarding-card__step">Step {{ step }} of 2</p>
        </div>
        <h1 v-if="step === 1">Initialize deployment</h1>
        <h1 v-else>Create owner account</h1>
      </div>

      <InlineAlert v-if="errorMessage" tone="danger">{{ errorMessage }}</InlineAlert>

      <form v-if="step === 1" class="form-stack" @submit.prevent="verifyBootstrapAccess">
        <TextField
          v-model="form.bootstrapToken"
          label="Bootstrap token"
          autocomplete="off"
          required
        />
        <div class="form-actions">
          <PrimaryButton type="submit" :disabled="busy || form.bootstrapToken.trim().length === 0">
            {{ busy ? 'Verifying…' : 'Verify deployment access' }}
          </PrimaryButton>
        </div>
      </form>

      <form v-else class="form-stack" @submit.prevent="initializeOwner">
        <TextField v-model="form.username" label="Username" autocomplete="username" required />
        <SecretField
          v-model="form.password"
          label="Master password"
          autocomplete="new-password"
          required
        />
        <TextField v-model="form.deviceName" label="Device name" autocomplete="off" required />
        <p class="field-helper">Forgotten master passwords can’t be recovered.</p>
        <div class="form-actions">
          <PrimaryButton
            type="submit"
            :disabled="
              busy ||
              form.username.trim().length === 0 ||
              form.password.trim().length === 0 ||
              form.deviceName.trim().length === 0
            "
          >
            {{ busy ? 'Creating owner…' : 'Continue' }}
          </PrimaryButton>
        </div>
      </form>
    </div>
  </section>
</template>
