import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from '../app-context';
import AdminConsolePage from './AdminConsolePage.vue';

const authClientMock = {
  listAdminInvites: vi.fn(),
  listAdminUsers: vi.fn(),
  listAdminAudit: vi.fn(),
  createAdminInvite: vi.fn(),
  revokeAdminInvite: vi.fn(),
  suspendAdminUser: vi.fn(),
  reactivateAdminUser: vi.fn(),
  deprovisionAdminUser: vi.fn(),
  requestRemoteAuthenticationChallenge: vi.fn(),
  recentReauth: vi.fn(),
};

vi.mock('../lib/auth-client', () => ({
  createVaultLiteAuthClient: () => authClientMock,
}));

function createSessionStore() {
  return {
    state: reactive({
      phase: 'ready' as const,
      bootstrapState: 'INITIALIZED' as const,
      username: 'omarques',
      userId: 'user_owner_1',
      role: 'owner' as const,
      deviceId: 'device_1',
      deviceName: 'Primary Browser',
      lifecycleState: 'active' as const,
      lastError: null as string | null,
      lastActivityAt: Date.now(),
      autoLockAfterMs: 5 * 60 * 1000,
    }),
    refreshBootstrapState: vi.fn(),
    restoreSession: vi.fn(),
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
    setAutoLockAfterMs: vi.fn(),
    lock: vi.fn(),
    markActivity: vi.fn(),
    enforceAutoLock: vi.fn(),
    getUnlockedVaultContext: vi.fn().mockReturnValue({
      username: 'omarques',
      accountKey: 'A'.repeat(43),
    }),
  };
}

function installMatchMediaStub() {
  let mobileViewport = false;
  let compactDesktopViewport = false;
  const api = {
    setMobile(value: boolean) {
      mobileViewport = value;
    },
    setCompactDesktop(value: boolean) {
      compactDesktopViewport = value;
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('(max-width: 760px)')
        ? mobileViewport
        : query.includes('(max-width: 1365px)')
          ? compactDesktopViewport
          : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
      addListener: () => undefined,
      removeListener: () => undefined,
    })),
  );
  return api;
}

async function mountAdminAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin', component: AdminConsolePage },
      { path: '/admin/overview', component: AdminConsolePage },
      { path: '/admin/invites', component: AdminConsolePage },
      { path: '/admin/invites/:inviteId', component: AdminConsolePage },
      { path: '/admin/users', component: AdminConsolePage },
      { path: '/admin/users/:userId', component: AdminConsolePage },
      { path: '/admin/audit', component: AdminConsolePage },
      { path: '/admin/audit/:eventId', component: AdminConsolePage },
      { path: '/vault', component: { template: '<div>vault</div>' } },
      { path: '/settings', component: { template: '<div>settings</div>' } },
    ],
  });

  await router.push(path);
  await router.isReady();

  const wrapper = mount(AdminConsolePage, {
    global: {
      plugins: [router],
      provide: {
        [sessionStoreKey as symbol]: createSessionStore(),
      },
    },
  });

  await flushPromises();
  return { wrapper, router };
}

describe('AdminConsolePage', () => {
  let viewport: { setMobile: (value: boolean) => void; setCompactDesktop: (value: boolean) => void };

  beforeEach(() => {
    viewport = installMatchMediaStub();
    authClientMock.listAdminInvites.mockResolvedValue({ invites: [] });
    authClientMock.listAdminUsers.mockResolvedValue({ users: [] });
    authClientMock.listAdminAudit.mockResolvedValue({ events: [] });
    authClientMock.createAdminInvite.mockResolvedValue({
      inviteId: 'invite_1',
      inviteLink: 'http://127.0.0.1:8787/onboarding?invite=invite_token_123456',
      expiresAt: '2026-03-19T12:00:00.000Z',
    });
    authClientMock.suspendAdminUser.mockResolvedValue({
      ok: true,
      result: 'success_changed',
      reasonCode: null,
      user: {
        userId: 'user_2',
        username: 'omarques2',
        role: 'user',
        lifecycleState: 'suspended',
        createdAt: '2026-03-18T12:00:00.000Z',
        trustedDevicesCount: 1,
      },
    });
    authClientMock.reactivateAdminUser.mockResolvedValue({
      ok: true,
      result: 'success_changed',
      reasonCode: null,
      user: {
        userId: 'user_2',
        username: 'omarques2',
        role: 'user',
        lifecycleState: 'active',
        createdAt: '2026-03-18T12:00:00.000Z',
        trustedDevicesCount: 1,
      },
    });
    authClientMock.deprovisionAdminUser.mockResolvedValue({
      ok: true,
      result: 'success_changed',
      reasonCode: null,
      user: {
        userId: 'user_2',
        username: 'omarques2',
        role: 'user',
        lifecycleState: 'deprovisioned',
        createdAt: '2026-03-18T12:00:00.000Z',
        trustedDevicesCount: 0,
      },
    });
    authClientMock.requestRemoteAuthenticationChallenge.mockResolvedValue({
      authSalt: 'salt',
    });
    authClientMock.recentReauth.mockResolvedValue({
      validUntil: '2026-03-19T12:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('shows invite policy guidance in invites empty state', async () => {
    const { wrapper } = await mountAdminAt('/admin/invites');

    expect(wrapper.text()).toContain('No invites found');
    expect(wrapper.text()).toContain('Single-use');
    expect(wrapper.text()).toContain('shown only once');
  });

  test('switches create invite dialog to post-creation state with Done action', async () => {
    const { wrapper } = await mountAdminAt('/admin/invites');

    const openButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('New invite'));
    expect(openButton).toBeDefined();
    await openButton!.trigger('click');
    await flushPromises();

    const createButton = wrapper.get('[data-testid="admin-create-invite-submit"]');
    await createButton.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Invite created');
    expect(wrapper.text()).toContain('This link is shown only once');
    expect(wrapper.find('[data-testid="admin-create-invite-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-create-invite-new"]').exists()).toBe(true);
  });

  test('renders human-readable result labels in audit rows', async () => {
    authClientMock.listAdminAudit.mockResolvedValueOnce({
      events: [
        {
          eventId: 'event_1',
          eventType: 'admin_invite_create',
          actorUserId: 'omarques',
          targetType: 'invite',
          targetId: 'invite_1',
          result: 'success_no_op',
          reasonCode: 'already_applied',
          requestId: 'req_1',
          createdAt: '2026-03-18T12:00:00.000Z',
          ipHash: 'ip_hash',
          userAgentHash: 'ua_hash',
        },
      ],
    });

    const { wrapper } = await mountAdminAt('/admin/audit');
    await flushPromises();

    expect(wrapper.text()).toContain('Already applied');
    expect(wrapper.text()).not.toContain('success_no_op');
  });

  test('does not expose suspend/deprovision as available actions for self owner', async () => {
    authClientMock.listAdminUsers.mockResolvedValueOnce({
      users: [
        {
          userId: 'user_owner_1',
          username: 'omarques',
          role: 'owner',
          lifecycleState: 'active',
          createdAt: '2026-03-18T12:00:00.000Z',
          trustedDevicesCount: 1,
        },
      ],
    });

    const { wrapper } = await mountAdminAt('/admin/users/user_owner_1');
    await flushPromises();

    const actionButtons = wrapper.findAll('.admin-detail-card--user .button');
    const actionLabels = actionButtons.map((button) => button.text());

    expect(actionLabels).not.toContain('Suspend');
    expect(actionLabels).not.toContain('Deprovision');
    expect(wrapper.text()).toContain("Owner self-protection is active for this account.");
  });

  test('shows mobile shortcut to return to vault from admin list surface', async () => {
    viewport.setMobile(true);
    const { wrapper, router } = await mountAdminAt('/admin/invites');
    await flushPromises();

    const vaultShortcut = wrapper.get('[data-testid="admin-mobile-open-vault"]');
    await vaultShortcut.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/vault');
  });

  test('applies compact desktop class for tighter responsive admin layout', async () => {
    viewport.setCompactDesktop(true);
    const { wrapper } = await mountAdminAt('/admin/audit');
    await flushPromises();

    expect(wrapper.find('.admin-page.admin-page--compact-desktop').exists()).toBe(true);
  });

  test('closes suspend confirmation dialog after successful mutation', async () => {
    authClientMock.listAdminUsers.mockResolvedValue({
      users: [
        {
          userId: 'user_2',
          username: 'omarques2',
          role: 'user',
          lifecycleState: 'active',
          createdAt: '2026-03-18T12:00:00.000Z',
          trustedDevicesCount: 1,
        },
      ],
    });

    const { wrapper } = await mountAdminAt('/admin/users/user_2');
    await flushPromises();

    const suspendButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Suspend');
    expect(suspendButton).toBeDefined();
    await suspendButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Suspend omarques2?');
    const confirmSuspendButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Suspend user');
    expect(confirmSuspendButton).toBeDefined();
    await confirmSuspendButton!.trigger('click');
    await flushPromises();

    expect(authClientMock.suspendAdminUser).toHaveBeenCalledWith('user_2');
    expect(wrapper.text()).not.toContain('Suspend omarques2?');
  });
});
