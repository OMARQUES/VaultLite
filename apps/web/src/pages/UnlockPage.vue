<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { toHumanErrorMessage, toPasswordRetryMessage } from '../lib/human-error';

const sessionStore = useSessionStore();
const router = useRouter();
const route = useRoute();
const password = ref('');
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);
const passwordVisible = ref(false);
const passwordFieldRef = ref<HTMLInputElement | null>(null);
const passwordShellRef = ref<HTMLElement | null>(null);
const shouldRefocusAfterPointerBlur = ref(false);

const routeReasonError = computed(() => {
  const rawReason = route.query.reason;
  const reason = Array.isArray(rawReason) ? rawReason[0] : rawReason;
  if (reason === 'account_suspended') {
    return 'Your account is suspended. Ask the owner to reactivate access.';
  }
  if (reason === 'session_revoked') {
    return 'This trusted session was revoked. Add this device again to continue.';
  }
  return null;
});

const rawSurfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError ?? routeReasonError.value);
const passwordFieldError = computed(() => toPasswordRetryMessage(rawSurfaceError.value));
const surfaceError = computed(() => (passwordFieldError.value ? null : rawSurfaceError.value));

onMounted(() => {
  focusPasswordField();
  document.addEventListener('pointerdown', handleGlobalPointerDown, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown, true);
});

function focusPasswordField() {
  const input = passwordFieldRef.value;
  if (!input) {
    return;
  }
  input.focus({ preventScroll: true });
  const valueLength = input.value.length;
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(valueLength, valueLength);
  }
}

function handleGlobalPointerDown(event: PointerEvent) {
  const input = passwordFieldRef.value;
  const shell = passwordShellRef.value;
  if (!input || !shell || isSubmitting.value) {
    shouldRefocusAfterPointerBlur.value = false;
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    shouldRefocusAfterPointerBlur.value = false;
    return;
  }
  shouldRefocusAfterPointerBlur.value =
    document.activeElement === input && !shell.contains(target);
}

function handlePasswordBlur() {
  if (!shouldRefocusAfterPointerBlur.value || isSubmitting.value) {
    return;
  }
  shouldRefocusAfterPointerBlur.value = false;
  requestAnimationFrame(() => {
    focusPasswordField();
  });
}

function readSafeNextPath(): string | null {
  const rawNext = route.query.next;
  const next = Array.isArray(rawNext) ? rawNext[0] : rawNext;
  if (typeof next !== 'string') {
    return null;
  }
  if (!next.startsWith('/') || next.startsWith('//')) {
    return null;
  }
  return next;
}

async function submit() {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    await sessionStore.localUnlock({
      username: sessionStore.state.username ?? '',
      password: password.value,
    });
    const next = readSafeNextPath();
    await router.push(next ?? '/vault');
  } catch (error) {
    const rawErrorMessage = error instanceof Error ? error.message : String(error);
    const humanMessage = toHumanErrorMessage(error);
    errorMessage.value =
      toPasswordRetryMessage(rawErrorMessage) ??
      toPasswordRetryMessage(humanMessage) ??
      humanMessage;
  } finally {
    isSubmitting.value = false;
  }
}

function togglePasswordVisibility() {
  passwordVisible.value = !passwordVisible.value;
  focusPasswordField();
}

async function goToDeviceSetup() {
  await router.push('/auth');
}
</script>

<template>
  <section class="public-page public-page--unlock">
    <div class="unlock-simplified-shell">
      <h1 class="unlock-simplified-logo">VaultLite</h1>
      <div class="unlock-simplified-account-row">
        <span class="material-symbols-rounded unlock-simplified-account-icon" aria-hidden="true">
          account_circle
        </span>
        <p class="unlock-simplified-account">{{ sessionStore.state.username ?? 'Unknown' }}</p>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger" class="unlock-simplified-alert">
        {{ surfaceError }}
      </InlineAlert>

      <form class="unlock-simplified-form" @submit.prevent="submit">
        <label ref="passwordShellRef" class="unlock-simplified-password-shell">
          <input
            ref="passwordFieldRef"
            v-model="password"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="Enter your password"
            :disabled="isSubmitting"
            required
            @blur="handlePasswordBlur"
          />
          <button
            type="button"
            class="unlock-simplified-password-action"
            :aria-label="passwordVisible ? 'Hide password' : 'Show password'"
            :aria-pressed="passwordVisible ? 'true' : 'false'"
            :disabled="isSubmitting"
            @click="togglePasswordVisibility"
          >
            <span class="material-symbols-rounded" aria-hidden="true">
              {{ passwordVisible ? 'visibility_off' : 'visibility' }}
            </span>
          </button>
          <div class="unlock-simplified-password-divider" aria-hidden="true"></div>
          <button
            type="submit"
            class="unlock-simplified-password-submit"
            aria-label="Unlock"
            :disabled="isSubmitting"
          >
            <span class="material-symbols-rounded" aria-hidden="true">
              {{ isSubmitting ? 'progress_activity' : 'arrow_forward' }}
            </span>
          </button>
        </label>
        <p v-if="passwordFieldError" class="field-error unlock-simplified-error">{{ passwordFieldError }}</p>
        <div
          v-if="routeReasonError && routeReasonError.includes('Add this device again')"
          class="unlock-simplified-actions"
        >
          <SecondaryButton type="button" @click="goToDeviceSetup">
            Add this device again
          </SecondaryButton>
        </div>
      </form>

      <p v-if="sessionStore.state.deviceName" class="unlock-simplified-device">
        #{{ sessionStore.state.deviceName }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.unlock-simplified-password-submit .material-symbols-rounded {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.unlock-simplified-password-submit:disabled .material-symbols-rounded {
  animation: unlockSpin 1s linear infinite;
}

@keyframes unlockSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
