<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import AppShell from './components/layout/AppShell.vue';
import PublicTopbar from './components/layout/PublicTopbar.vue';
import SidebarNav from './components/layout/SidebarNav.vue';
import { useSessionStore } from './composables/useSessionStore';
import { resolveNavigationTarget } from './router';

const sessionStore = useSessionStore();
const route = useRoute();
const router = useRouter();
const isAuthenticatedShell = computed(
  () => route.path.startsWith('/vault') || route.path === '/settings',
);

function handleActivity() {
  sessionStore.markActivity();
}

async function lockSession() {
  sessionStore.lock();
  await router.push(sessionStore.state.username ? '/unlock' : '/auth');
}

let autoLockInterval: number | undefined;

onMounted(() => {
  void (async () => {
    await router.isReady();
    await sessionStore.restoreSession();
    const redirect = resolveNavigationTarget({
      phase: sessionStore.state.phase,
      targetPath: route.path,
    });
    if (redirect && redirect !== route.path) {
      await router.replace(redirect);
    }
  })();
  window.addEventListener('pointerdown', handleActivity);
  window.addEventListener('keydown', handleActivity);
  autoLockInterval = window.setInterval(() => {
    sessionStore.enforceAutoLock();
  }, 15000);
});

onUnmounted(() => {
  if (autoLockInterval !== undefined) {
    window.clearInterval(autoLockInterval);
  }
  window.removeEventListener('pointerdown', handleActivity);
  window.removeEventListener('keydown', handleActivity);
});
</script>

<template>
  <main v-if="!isAuthenticatedShell" data-testid="public-shell" class="public-shell">
    <PublicTopbar />
    <div class="public-shell__content">
      <RouterView />
    </div>
  </main>

  <main v-else data-testid="vault-shell" class="authenticated-shell">
    <AppShell>
      <template #sidebar>
        <SidebarNav
          :username="sessionStore.state.username"
          :device-name="sessionStore.state.deviceName"
          :on-lock="lockSession"
        />
      </template>
      <RouterView />
    </AppShell>
  </main>
</template>
