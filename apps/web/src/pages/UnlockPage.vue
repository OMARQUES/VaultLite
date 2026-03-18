<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { toHumanErrorMessage } from '../lib/human-error';

const sessionStore = useSessionStore();
const router = useRouter();
const route = useRoute();
const password = ref('');
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);
const passwordFieldRef = ref<InstanceType<typeof SecretField> | null>(null);

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

const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError ?? routeReasonError.value);

onMounted(() => {
  passwordFieldRef.value?.focus();
});

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
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}

async function goToDeviceSetup() {
  await router.push('/auth');
}
</script>

<template>
  <section class="public-page public-page--unlock">
    <div class="panel-card panel-card--compact panel-card--narrow unlock-card">
      <div class="page-header">
        <p class="eyebrow">UNLOCK</p>
        <h1>Unlock this device</h1>
        <p class="page-subtitle">Enter your master password to unlock this trusted device.</p>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <form class="form-stack" @submit.prevent="submit">
        <div class="unlock-context">
          <div class="unlock-context__row">
            <span class="unlock-context__label">Account</span>
            <p class="unlock-context__value">{{ sessionStore.state.username ?? 'Unknown' }}</p>
          </div>
          <div class="unlock-context__row">
            <span class="unlock-context__label">Device</span>
            <p class="unlock-context__value">{{ sessionStore.state.deviceName ?? 'Unknown device' }}</p>
          </div>
        </div>
        <SecretField
          ref="passwordFieldRef"
          v-model="password"
          label="Master password"
          autocomplete="current-password"
          required
        />
        <div class="form-actions">
          <PrimaryButton type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Unlocking...' : 'Unlock' }}
          </PrimaryButton>
          <SecondaryButton
            v-if="routeReasonError && routeReasonError.includes('Add this device again')"
            type="button"
            @click="goToDeviceSetup"
          >
            Add this device again
          </SecondaryButton>
        </div>
      </form>
    </div>
  </section>
</template>
