<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import AppShell from './components/layout/AppShell.vue';
import PublicTopbar from './components/layout/PublicTopbar.vue';
import SidebarNav from './components/layout/SidebarNav.vue';
import { useSessionStore } from './composables/useSessionStore';
import { VAULT_UNAUTHORIZED_EVENT, type VaultUnauthorizedEventDetail } from './lib/http-events';
import { toHumanErrorMessage } from './lib/human-error';
import { resolveNavigationTarget } from './router';

const sessionStore = useSessionStore();
const route = useRoute();
const router = useRouter();
const handlingUnauthorized = ref(false);
const sessionRestoreResolved = ref(false);
const phaseRedirectInFlight = ref(false);
const isAuthenticatedRoute = computed(
  () => route.path.startsWith('/vault') || route.path.startsWith('/settings') || route.path.startsWith('/admin'),
);
const isAuthenticatedShell = computed(
  () =>
    isAuthenticatedRoute.value &&
    sessionRestoreResolved.value &&
    sessionStore.state.phase === 'ready',
);

async function maybeRedirectForSessionPhase() {
  if (!sessionRestoreResolved.value || handlingUnauthorized.value || phaseRedirectInFlight.value) {
    return;
  }

  const redirect = resolveNavigationTarget({
    phase: sessionStore.state.phase,
    bootstrapState: sessionStore.state.bootstrapState,
    role: sessionStore.state.role,
    targetPath: route.fullPath,
  });

  if (!redirect || redirect === route.fullPath || redirect === route.path) {
    if (isAuthenticatedRoute.value && sessionStore.state.phase !== 'ready') {
      const fallback =
        sessionStore.state.phase === 'local_unlock_required'
          ? `/unlock?next=${encodeURIComponent(route.fullPath)}`
          : `/auth?next=${encodeURIComponent(route.fullPath)}`;
      if (fallback !== route.fullPath && fallback !== route.path) {
        phaseRedirectInFlight.value = true;
        try {
          await router.replace(fallback);
        } finally {
          phaseRedirectInFlight.value = false;
        }
      }
    }
    return;
  }

  phaseRedirectInFlight.value = true;
  try {
    await router.replace(redirect);
  } finally {
    phaseRedirectInFlight.value = false;
  }
}

function handleActivity() {
  sessionStore.markActivity();
}

async function lockSession() {
  sessionStore.lock();
  await router.push(sessionStore.state.username ? '/unlock' : '/auth');
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
    } catch (error) {
      sessionStore.handleUnauthorized({
        reasonCode: 'session_restore_failed',
        message: toHumanErrorMessage(error),
      });
    } finally {
      sessionRestoreResolved.value = true;
      await maybeRedirectForSessionPhase();
    }
  })();
  window.addEventListener('pointerdown', handleActivity);
  window.addEventListener('keydown', handleActivity);
  window.addEventListener(VAULT_UNAUTHORIZED_EVENT, handleUnauthorizedEvent as EventListener);
  autoLockInterval = window.setInterval(() => {
    sessionStore.enforceAutoLock();
  }, 15000);
});

watch(
  () => [
    sessionRestoreResolved.value,
    sessionStore.state.phase,
    sessionStore.state.bootstrapState,
    sessionStore.state.role,
    route.fullPath,
  ],
  () => {
    void maybeRedirectForSessionPhase();
  },
  { flush: 'post' },
);

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
        />
      </template>
      <RouterView />
    </AppShell>
  </main>
</template>
