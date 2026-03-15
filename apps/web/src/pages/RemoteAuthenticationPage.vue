<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useSessionStore } from '../composables/useSessionStore';

const router = useRouter();
const sessionStore = useSessionStore();
const errorMessage = ref('');
const authentication = reactive({
  username: '',
  password: '',
  deviceName: 'Recovered Browser',
  accountKitJson: '',
});

async function remoteAuthenticate() {
  errorMessage.value = '';
  try {
    await sessionStore.remoteAuthenticate(authentication);
    await router.push('/unlock');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function bootstrapDevice() {
  errorMessage.value = '';
  try {
    await sessionStore.bootstrapDevice(authentication);
    await router.push('/unlock');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <section class="panel">
    <p class="eyebrow">remote authentication</p>
    <h1>Refresh server session</h1>
    <form class="stack" @submit.prevent="remoteAuthenticate">
      <label>
        Username
        <input v-model="authentication.username" required autocomplete="username" />
      </label>
      <label>
        Master password
        <input
          v-model="authentication.password"
          type="password"
          required
          autocomplete="current-password"
        />
      </label>
      <button class="button primary" type="submit">Authenticate trusted device</button>
    </form>
    <div class="divider"></div>
    <form class="stack" @submit.prevent="bootstrapDevice">
      <label>
        New device name
        <input v-model="authentication.deviceName" required autocomplete="off" />
      </label>
      <label>
        Account Kit JSON
        <textarea v-model="authentication.accountKitJson" class="account-kit" required></textarea>
      </label>
      <button class="button" type="submit">Bootstrap new device</button>
    </form>
    <p class="warning">
      This flow never performs local unlock. It only refreshes or creates server session state.
    </p>
    <p v-if="errorMessage || sessionStore.state.lastError" class="error-banner">
      {{ errorMessage || sessionStore.state.lastError }}
    </p>
  </section>
</template>
