<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import { useSessionStore } from '../composables/useSessionStore';

const sessionStore = useSessionStore();
const router = useRouter();
const password = ref('');
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);
const passwordFieldRef = ref<InstanceType<typeof SecretField> | null>(null);

const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);

onMounted(() => {
  passwordFieldRef.value?.focus();
});

async function submit() {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    await sessionStore.localUnlock({
      username: sessionStore.state.username ?? '',
      password: password.value,
    });
    await router.push('/vault');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="public-page public-page--unlock">
    <div class="panel-card panel-card--compact panel-card--narrow">
      <div class="page-header">
        <p class="eyebrow">UNLOCK</p>
        <h1>Unlock this device</h1>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <form class="form-stack" @submit.prevent="submit">
        <div class="static-field">
          <span class="field__label">Username</span>
          <div class="static-field__value">{{ sessionStore.state.username ?? 'Unknown' }}</div>
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
        </div>
      </form>
    </div>
  </section>
</template>
