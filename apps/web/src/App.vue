<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import AppShell from './components/layout/AppShell.vue';
import PublicTopbar from './components/layout/PublicTopbar.vue';
import SidebarNav from './components/layout/SidebarNav.vue';
import SettingsPage from './pages/SettingsPage.vue';
import { useSessionStore } from './composables/useSessionStore';
import { VAULT_UNAUTHORIZED_EVENT, type VaultUnauthorizedEventDetail } from './lib/http-events';
import { resolveNavigationTarget } from './router';

const sessionStore = useSessionStore();
const route = useRoute();
const router = useRouter();
const settingsModalOpen = ref(false);
const handlingUnauthorized = ref(false);
const sessionRestoreResolved = ref(false);
const isAuthenticatedRoute = computed(
  () => route.path.startsWith('/vault') || route.path === '/settings' || route.path.startsWith('/admin'),
);
const isAuthenticatedShell = computed(
  () =>
    isAuthenticatedRoute.value &&
    sessionRestoreResolved.value &&
    sessionStore.state.phase === 'ready',
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

function currentRouteAllowsUnauthorizedRedirect(path: string): boolean {
  return !(
    path.startsWith('/auth') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/bootstrap') ||
    path === '/unlock'
  );
}

async function handleUnauthorizedEvent(event: Event) {
  const detail = (event as CustomEvent<VaultUnauthorizedEventDetail>).detail;
  if (!detail || !currentRouteAllowsUnauthorizedRedirect(route.path) || handlingUnauthorized.value) {
    return;
  }

  handlingUnauthorized.value = true;
  const reason = detail.code === 'account_suspended' ? 'account_suspended' : 'session_revoked';
  const message =
    reason === 'account_suspended'
      ? 'Your account is suspended. Ask the owner to reactivate access.'
      : 'Your trusted session is no longer valid. Add this device again to continue.';

  sessionStore.handleUnauthorized({
    reasonCode: detail.code,
    message,
  });
  settingsModalOpen.value = false;

  const destination =
    sessionStore.state.phase === 'local_unlock_required' && sessionStore.state.username
      ? `/unlock?reason=${encodeURIComponent(reason)}`
      : '/auth';

  try {
    await router.push(destination);
  } finally {
    handlingUnauthorized.value = false;
  }
}

let autoLockInterval: number | undefined;

onMounted(() => {
  void (async () => {
    try {
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
    } finally {
      sessionRestoreResolved.value = true;
    }
  })();
  window.addEventListener('pointerdown', handleActivity);
  window.addEventListener('keydown', handleActivity);
  window.addEventListener(VAULT_UNAUTHORIZED_EVENT, handleUnauthorizedEvent as EventListener);
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
  window.removeEventListener(VAULT_UNAUTHORIZED_EVENT, handleUnauthorizedEvent as EventListener);
});
</script>

<template>
  <main
    v-if="isAuthenticatedRoute && !isAuthenticatedShell"
    data-testid="auth-gate"
    class="public-shell"
  >
    <div class="public-shell__content">
      <section class="panel-card panel-card--compact panel-card--narrow">
        <p class="module-empty-hint">Checking your session…</p>
      </section>
    </div>
  </main>

  <main v-else-if="!isAuthenticatedShell" data-testid="public-shell" class="public-shell">
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
