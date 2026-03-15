<script setup lang="ts">
import { reactive } from 'vue';
import { useRouter } from 'vue-router';

import { useSessionStore } from '../composables/useSessionStore';

const sessionStore = useSessionStore();
const router = useRouter();
const unlock = reactive({
  username: sessionStore.state.username ?? '',
  password: '',
});

async function submit() {
  await sessionStore.localUnlock(unlock);
  await router.push('/vault');
}
</script>

<template>
  <section class="panel">
    <p class="eyebrow">local unlock</p>
    <h1>Unlock trusted local state</h1>
    <form class="stack" @submit.prevent="submit">
      <label>
        Username
        <input v-model="unlock.username" required autocomplete="username" />
      </label>
      <label>
        Master password
        <input v-model="unlock.password" type="password" required autocomplete="current-password" />
      </label>
      <button class="button primary" type="submit">Unlock</button>
    </form>
  </section>
</template>
