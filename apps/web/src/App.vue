<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import AppShell from './components/layout/AppShell.vue';
import PublicTopbar from './components/layout/PublicTopbar.vue';
import SidebarNav from './components/layout/SidebarNav.vue';
import SettingsPage from './pages/SettingsPage.vue';
import { useSessionStore } from './composables/useSessionStore';
import { resolveNavigationTarget } from './router';

const sessionStore = useSessionStore();
const route = useRoute();
const router = useRouter();
const settingsModalOpen = ref(false);
const isAuthenticatedShell = computed(
  () => route.path.startsWith('/vault') || route.path === '/settings' || route.path.startsWith('/admin'),
);

function handleActivity() {
  sessionStore.markActivity();
}

async function lockSession() {
  sessionStore.lock();
  settingsModalOpen.value = false;
  await router.push(sessionStore.state.username ? '/unlock' : '/auth');
}

function openSettingsModal() {
  settingsModalOpen.value = true;
}

function closeSettingsModal() {
  settingsModalOpen.value = false;
}

let autoLockInterval: number | undefined;

onMounted(() => {
  void (async () => {
    await router.isReady();
    await sessionStore.restoreSession();
    const redirect = resolveNavigationTarget({
      phase: sessionStore.state.phase,
      bootstrapState: sessionStore.state.bootstrapState,
      role: sessionStore.state.role,
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
          :role="sessionStore.state.role"
          :device-name="sessionStore.state.deviceName"
          :on-lock="lockSession"
          :on-open-settings="openSettingsModal"
          :settings-open="settingsModalOpen"
        />
      </template>
      <RouterView />
    </AppShell>
    <div
      v-if="settingsModalOpen"
      class="settings-modal-backdrop"
      role="presentation"
      @click.self="closeSettingsModal"
    >
      <section class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <button class="settings-modal__close" type="button" aria-label="Close settings" @click="closeSettingsModal">
          ×
        </button>
        <SettingsPage />
      </section>
    </div>
  </main>
</template>
