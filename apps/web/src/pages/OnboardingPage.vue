<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import TextField from '../components/ui/TextField.vue';
import { useSessionStore } from '../composables/useSessionStore';
import type { TrustedLocalStateRecord } from '../lib/trusted-local-state';

const router = useRouter();
const route = useRoute();
const sessionStore = useSessionStore();

function resolvePrefilledInviteToken() {
  const candidates = [route.query.inviteToken, route.query.invite_token, route.query.invite];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return '';
}

const prefilledInviteToken = resolvePrefilledInviteToken();
const editingPrefilledInvite = ref(false);

const onboarding = reactive({
  inviteToken: prefilledInviteToken,
  username: '',
  password: '',
  deviceName: 'Primary Browser',
});

const fieldErrors = reactive({
  inviteToken: '',
  username: '',
  password: '',
  deviceName: '',
});

const inviteTokenFieldRef = ref<InstanceType<typeof TextField> | null>(null);
const usernameFieldRef = ref<InstanceType<typeof TextField> | null>(null);
const passwordFieldRef = ref<InstanceType<typeof SecretField> | null>(null);
const deviceNameFieldRef = ref<InstanceType<typeof TextField> | null>(null);

const accountKit = ref<TrustedLocalStateRecord['accountKit'] | null>(null);
const currentStep = ref<1 | 2>(1);
const acknowledged = ref(false);
const downloadAttempted = ref(false);
const downloadHint = ref('');
const errorMessage = ref<string | null>(null);
const busyStep = ref<'prepare' | 'finalize' | null>(null);

const isBusy = computed(() => busyStep.value !== null);
const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const isStepOne = computed(() => currentStep.value === 1);
const showInviteAcceptedState = computed(
  () => prefilledInviteToken.length > 0 && !editingPrefilledInvite.value,
);
const stepTitle = computed(() =>
  isStepOne.value ? 'Create account and initial device' : 'Save your Account Kit',
);
const stepSubtitle = computed(() =>
  isStepOne.value
    ? 'Set your account password and name this first trusted device.'
    : "You'll need this signed file to set up a new device.",
);
const continueLabel = computed(() => (busyStep.value === 'prepare' ? 'Preparing account…' : 'Continue'));
const downloadLabel = computed(() =>
  downloadAttempted.value ? 'Download again' : 'Download signed Account Kit',
);
const finalizeLabel = computed(() =>
  busyStep.value === 'finalize' ? 'Finishing setup…' : 'Finish setup',
);
const finishDisabled = computed(
  () => !accountKit.value || !acknowledged.value || !downloadAttempted.value || isBusy.value,
);

function formatPrepareError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('username_unavailable')) {
    return 'This username is unavailable.';
  }
  if (message.includes('invite_token_invalid') || message.includes('invite_token_expired')) {
    return 'This invite token is invalid or expired.';
  }
  if (message.includes('invite') && (message.includes('invalid') || message.includes('expired'))) {
    return 'This invite token is invalid or expired.';
  }

  return 'Something went wrong while preparing your account. Try again.';
}

function formatFinalizeError(): string {
  return "We couldn't finish setup. Try again.";
}

function formatDownloadError(): string {
  return "We couldn't download the Account Kit. Try again.";
}

function validateRequiredField(input: string, message: string) {
  return input.trim().length > 0 ? '' : message;
}

function validateField(field: keyof typeof fieldErrors): boolean {
  if (field === 'inviteToken') {
    fieldErrors.inviteToken = validateRequiredField(onboarding.inviteToken, 'Enter your invite token.');
    return fieldErrors.inviteToken.length === 0;
  }
  if (field === 'username') {
    fieldErrors.username = validateRequiredField(onboarding.username, 'Enter a username.');
    return fieldErrors.username.length === 0;
  }
  if (field === 'password') {
    fieldErrors.password = validateRequiredField(onboarding.password, 'Enter a master password.');
    return fieldErrors.password.length === 0;
  }

  fieldErrors.deviceName = validateRequiredField(onboarding.deviceName, 'Enter a device name.');
  return fieldErrors.deviceName.length === 0;
}

function focusFirstInvalidField() {
  if (fieldErrors.inviteToken) {
    inviteTokenFieldRef.value?.focus();
    return;
  }
  if (fieldErrors.username) {
    usernameFieldRef.value?.focus();
    return;
  }
  if (fieldErrors.password) {
    passwordFieldRef.value?.focus();
    return;
  }
  if (fieldErrors.deviceName) {
    deviceNameFieldRef.value?.focus();
  }
}

async function useDifferentInviteToken() {
  editingPrefilledInvite.value = true;
  onboarding.inviteToken = '';
  fieldErrors.inviteToken = '';
  await nextTick();
  inviteTokenFieldRef.value?.focus();
}

function validateStepOne() {
  const inviteTokenValid = validateField('inviteToken');
  const usernameValid = validateField('username');
  const passwordValid = validateField('password');
  const deviceNameValid = validateField('deviceName');
  const isValid = inviteTokenValid && usernameValid && passwordValid && deviceNameValid;
  if (!isValid) {
    focusFirstInvalidField();
  }
  return isValid;
}

function downloadAccountKit() {
  if (!accountKit.value) {
    return;
  }

  errorMessage.value = null;
  downloadHint.value = '';

  try {
    const blob = new Blob([JSON.stringify(accountKit.value, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${accountKit.value.payload.username}-account-kit.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    downloadAttempted.value = true;
    downloadHint.value = 'Download started. Save it outside this browser.';
  } catch {
    errorMessage.value = formatDownloadError();
  }
}

function goBackToStepOne() {
  errorMessage.value = null;
  currentStep.value = 1;
}

async function prepare() {
  if (!validateStepOne()) {
    return;
  }

  errorMessage.value = null;
  downloadHint.value = '';
  busyStep.value = 'prepare';

  try {
    accountKit.value = await sessionStore.prepareOnboarding(onboarding);
    currentStep.value = 2;
    acknowledged.value = false;
    downloadAttempted.value = false;
  } catch (error) {
    errorMessage.value = formatPrepareError(error);
  } finally {
    busyStep.value = null;
  }
}

async function finalize() {
  if (!accountKit.value || finishDisabled.value) {
    return;
  }

  errorMessage.value = null;
  busyStep.value = 'finalize';

  try {
    await sessionStore.finalizeOnboarding();
    await router.push('/vault');
  } catch (error) {
    errorMessage.value = formatFinalizeError();
  } finally {
    busyStep.value = null;
  }
}
</script>

<template>
  <section class="public-page public-page--onboarding">
    <div class="panel-card panel-card--form onboarding-card">
      <div class="onboarding-card__header">
        <div class="onboarding-card__meta">
          <p class="eyebrow">ONBOARDING</p>
          <p class="onboarding-card__step">Step {{ isStepOne ? 1 : 2 }} of 2</p>
        </div>
        <h1>{{ stepTitle }}</h1>
        <p class="page-subtitle onboarding-card__subtitle">
          {{ stepSubtitle }}
        </p>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <form v-if="isStepOne" class="form-stack onboarding-step onboarding-step--create" @submit.prevent="prepare">
        <div v-if="showInviteAcceptedState" class="invite-token-context">
          <span class="field__label">Invite token</span>
          <p class="invite-token-context__status">Invite accepted</p>
          <button class="text-button invite-token-context__action" type="button" @click="useDifferentInviteToken">
            Use different token
          </button>
        </div>
        <div v-else class="onboarding-field">
          <TextField
            ref="inviteTokenFieldRef"
            v-model="onboarding.inviteToken"
            label="Invite token"
            autocomplete="off"
            required
            @blur="validateField('inviteToken')"
          />
          <p v-if="fieldErrors.inviteToken" class="field-error">{{ fieldErrors.inviteToken }}</p>
        </div>

        <div class="onboarding-field">
          <TextField
            ref="usernameFieldRef"
            v-model="onboarding.username"
            label="Username"
            autocomplete="username"
            required
            @blur="validateField('username')"
          />
          <p v-if="fieldErrors.username" class="field-error">{{ fieldErrors.username }}</p>
        </div>

        <div class="warning-banner onboarding-warning">
          Forgotten master passwords can't be recovered.
        </div>

        <div class="onboarding-field">
          <SecretField
            ref="passwordFieldRef"
            v-model="onboarding.password"
            label="Master password"
            autocomplete="new-password"
            required
            @blur="validateField('password')"
          />
          <p class="field-helper">Used to unlock your vault on trusted devices. It can't be recovered.</p>
          <p v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password }}</p>
        </div>

        <div class="onboarding-field">
          <TextField
            ref="deviceNameFieldRef"
            v-model="onboarding.deviceName"
            label="Device name"
            autocomplete="off"
            required
            @blur="validateField('deviceName')"
          />
          <p v-if="fieldErrors.deviceName" class="field-error">{{ fieldErrors.deviceName }}</p>
        </div>

        <div class="form-actions onboarding-step__actions">
          <PrimaryButton
            type="submit"
            :disabled="
              isBusy ||
              onboarding.inviteToken.trim().length === 0 ||
              onboarding.username.trim().length === 0 ||
              onboarding.password.trim().length === 0 ||
              onboarding.deviceName.trim().length === 0
            "
          >
            {{ continueLabel }}
          </PrimaryButton>
        </div>
      </form>

      <section v-else class="form-stack onboarding-step onboarding-step--account-kit">
        <article class="account-kit-card">
          <header class="account-kit-card__header">
            <h2>Account Kit ready</h2>
            <span class="account-kit-card__badge">Signed and verified</span>
          </header>
          <p class="account-kit-card__description">
            Store this outside the browser. You'll need it to set up a new device.
          </p>
          <dl class="account-kit-card__meta">
            <div class="account-kit-card__meta-row">
              <dt>Issued for</dt>
              <dd>{{ accountKit?.payload.username }}</dd>
            </div>
            <div class="account-kit-card__meta-row">
              <dt>Device</dt>
              <dd>{{ onboarding.deviceName }}</dd>
            </div>
            <div class="account-kit-card__meta-row account-kit-card__meta-row--fingerprint">
              <dt>Deployment fingerprint</dt>
              <dd>{{ accountKit?.payload.deploymentFingerprint }}</dd>
            </div>
          </dl>
        </article>

        <div class="form-actions onboarding-step__actions onboarding-step__download-action">
          <PrimaryButton type="button" :disabled="isBusy || !accountKit" @click="downloadAccountKit">
            {{ downloadLabel }}
          </PrimaryButton>
        </div>
        <p v-if="downloadHint" class="onboarding-step__hint">{{ downloadHint }}</p>
        <label class="checkbox-row">
          <input v-model="acknowledged" type="checkbox" />
          <span>I saved the Account Kit outside this browser.</span>
        </label>
        <div class="form-actions onboarding-step__actions onboarding-step__final-actions">
          <SecondaryButton type="button" :disabled="isBusy" @click="goBackToStepOne">Back</SecondaryButton>
          <PrimaryButton type="button" :disabled="finishDisabled" @click="finalize">
            {{ finalizeLabel }}
          </PrimaryButton>
        </div>
      </section>
    </div>
  </section>
</template>
