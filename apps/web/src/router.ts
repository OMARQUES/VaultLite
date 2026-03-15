import type { SessionState } from './lib/session-store';
import { createRouter, createWebHistory } from 'vue-router';

import HomePage from './pages/HomePage.vue';
import OnboardingPage from './pages/OnboardingPage.vue';
import RemoteAuthenticationPage from './pages/RemoteAuthenticationPage.vue';
import UnlockPage from './pages/UnlockPage.vue';
import VaultShellPage from './pages/VaultShellPage.vue';

export function resolveNavigationTarget(input: {
  phase: SessionState['phase'];
  targetPath: string;
}): string | undefined {
  if (input.targetPath === '/vault') {
    if (input.phase === 'onboarding_export_required') {
      return '/onboarding';
    }

    if (input.phase === 'ready') {
      return undefined;
    }

    if (input.phase === 'local_unlock_required') {
      return '/unlock';
    }

    return '/auth';
  }

  if (input.targetPath === '/unlock') {
    return input.phase === 'local_unlock_required' ? undefined : '/auth';
  }

  if (input.targetPath === '/auth') {
    if (input.phase === 'onboarding_export_required') {
      return '/onboarding';
    }

    return input.phase === 'ready' ? '/vault' : undefined;
  }

  if (input.targetPath === '/onboarding') {
    return input.phase === 'ready' ? '/vault' : undefined;
  }

  return undefined;
}

export function createVaultLiteRouter(sessionStore: { state: SessionState }) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/onboarding', component: OnboardingPage },
      { path: '/auth', component: RemoteAuthenticationPage },
      { path: '/unlock', component: UnlockPage },
      { path: '/vault', component: VaultShellPage },
    ],
  });

  router.beforeEach((to) => {
    return resolveNavigationTarget({
      phase: sessionStore.state.phase,
      targetPath: to.path,
    });
  });

  return router;
}
