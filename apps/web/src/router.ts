import type { SessionState } from './lib/session-store';
import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router';

import AdminConsolePage from './pages/AdminConsolePage.vue';
import BootstrapCheckpointPage from './pages/BootstrapCheckpointPage.vue';
import BootstrapPage from './pages/BootstrapPage.vue';
import BootstrapSuccessPage from './pages/BootstrapSuccessPage.vue';
import HomePage from './pages/HomePage.vue';
import OnboardingPage from './pages/OnboardingPage.vue';
import RemoteAuthenticationPage from './pages/RemoteAuthenticationPage.vue';
import SettingsShellPage from './pages/SettingsShellPage.vue';
import UnlockPage from './pages/UnlockPage.vue';
import VaultShellPage from './pages/VaultShellPage.vue';

function isVaultRoute(path: string) {
  return path === '/vault' || path.startsWith('/vault/');
}

function isSettingsRoute(path: string) {
  return path === '/settings' || path.startsWith('/settings/');
}

function isAuthenticatedRoute(path: string) {
  return isVaultRoute(path) || isSettingsRoute(path) || path.startsWith('/admin');
}

function sanitizeNextPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  return value;
}

function unlockRedirect(nextPath: string): string {
  return `/unlock?next=${encodeURIComponent(nextPath)}`;
}

function authRedirect(nextPath: string): string {
  return `/auth?next=${encodeURIComponent(nextPath)}`;
}

export function resolveNavigationTarget(input: {
  phase: SessionState['phase'];
  bootstrapState: SessionState['bootstrapState'];
  role: SessionState['role'];
  targetPath: string;
  targetFullPath?: string;
  nextParam?: string | null;
}): RouteLocationRaw | undefined {
  const currentTarget = sanitizeNextPath(input.targetFullPath ?? input.targetPath) ?? input.targetPath;

  if (input.bootstrapState === 'UNINITIALIZED_PUBLIC_OPEN') {
    return input.targetPath === '/bootstrap' ? undefined : '/bootstrap';
  }

  if (input.bootstrapState === 'OWNER_CREATED_CHECKPOINT_PENDING') {
    const ownerSession = input.role === 'owner' && (input.phase === 'local_unlock_required' || input.phase === 'ready');

    if (!ownerSession) {
      if (input.targetPath === '/auth') {
        return undefined;
      }
      if (input.targetPath === '/onboarding') {
        return '/auth?reason=initialization_pending';
      }
      return '/auth?next=/bootstrap/checkpoint';
    }

    if (input.targetPath === '/bootstrap/checkpoint') {
      return undefined;
    }
    return '/bootstrap/checkpoint';
  }

  if (!input.bootstrapState || input.bootstrapState !== 'INITIALIZED') {
    return undefined;
  }

  if (input.targetPath === '/') {
    if (input.phase === 'local_unlock_required') {
      return '/unlock';
    }

    if (input.phase === 'ready') {
      return '/vault';
    }

    return undefined;
  }

  if (isAuthenticatedRoute(input.targetPath)) {
    if (input.phase === 'ready') {
      if (input.targetPath.startsWith('/admin') && input.role !== 'owner') {
        return '/vault?reason=forbidden_admin';
      }
      return undefined;
    }

    if (input.phase === 'local_unlock_required') {
      return unlockRedirect(currentTarget);
    }

    return authRedirect(currentTarget);
  }

  if (input.targetPath === '/bootstrap' || input.targetPath === '/bootstrap/checkpoint' || input.targetPath === '/bootstrap/success') {
    if (input.phase === 'ready') {
      return '/vault';
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

    if (input.phase === 'local_unlock_required') {
      const next = sanitizeNextPath(input.nextParam);
      return unlockRedirect(next ?? '/vault');
    }

    if (input.phase === 'ready') {
      const next = sanitizeNextPath(input.nextParam);
      return next ?? '/vault';
    }

    return undefined;
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
      { path: '/bootstrap', component: BootstrapPage },
      { path: '/bootstrap/checkpoint', component: BootstrapCheckpointPage },
      { path: '/bootstrap/success', component: BootstrapSuccessPage },
      { path: '/onboarding', component: OnboardingPage },
      { path: '/auth', component: RemoteAuthenticationPage },
      { path: '/unlock', component: UnlockPage },
      { path: '/vault', component: VaultShellPage },
      { path: '/vault/new/login', component: VaultShellPage },
      { path: '/vault/new/document', component: VaultShellPage },
      { path: '/vault/new/card', component: VaultShellPage },
      { path: '/vault/new/secure-note', component: VaultShellPage },
      { path: '/vault/item/:itemId', component: VaultShellPage },
      { path: '/vault/item/:itemId/edit', component: VaultShellPage },
      { path: '/settings', component: SettingsShellPage },
      {
        path: '/settings/:section(overview|security|devices|extension|data|advanced)',
        component: SettingsShellPage,
      },
      { path: '/admin', component: AdminConsolePage },
      { path: '/admin/overview', component: AdminConsolePage },
      { path: '/admin/invites', component: AdminConsolePage },
      { path: '/admin/invites/:inviteId', component: AdminConsolePage },
      { path: '/admin/users', component: AdminConsolePage },
      { path: '/admin/users/:userId', component: AdminConsolePage },
      { path: '/admin/audit', component: AdminConsolePage },
      { path: '/admin/audit/:eventId', component: AdminConsolePage },
    ],
  });

  router.beforeEach((to) => {
    const queryNext = Array.isArray(to.query.next)
      ? to.query.next.find((entry) => typeof entry === 'string') ?? null
      : typeof to.query.next === 'string'
        ? to.query.next
        : null;

    const redirect = resolveNavigationTarget({
      phase: sessionStore.state.phase,
      bootstrapState: sessionStore.state.bootstrapState,
      role: sessionStore.state.role,
      targetPath: to.path,
      targetFullPath: to.fullPath,
      nextParam: queryNext,
    });
    return redirect;
  });

  return router;
}
