<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import DialogModal from '../components/ui/DialogModal.vue';
import DangerButton from '../components/ui/DangerButton.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import IconButton from '../components/ui/IconButton.vue';
import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SearchField from '../components/ui/SearchField.vue';
import SecretField from '../components/ui/SecretField.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { deriveAuthProof } from '../lib/browser-crypto';
import { createVaultLiteAuthClient } from '../lib/auth-client';
import { toHumanErrorMessage } from '../lib/human-error';

type AdminSection = 'overview' | 'invites' | 'users' | 'audit';
type InviteStatusFilter = 'all' | 'active' | 'used' | 'expired' | 'revoked';
type UserLifecycleFilter = 'all' | 'active' | 'suspended' | 'deprovisioned';
type AuditResultFilter = 'all' | 'success_changed' | 'success_no_op' | 'conflict' | 'denied';
type InviteExpiryPreset = '1h' | '24h' | '7d' | 'custom';

interface InviteView {
  inviteId: string;
  tokenPreview: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  createdByUserId: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByUserId: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  createdAt: string;
}

interface UserView {
  userId: string;
  username: string;
  role: 'owner' | 'user';
  lifecycleState: 'active' | 'suspended' | 'deprovisioned';
  createdAt: string;
  trustedDevicesCount: number;
}

interface AuditView {
  eventId: string;
  eventType: string;
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  result: 'success_changed' | 'success_no_op' | 'conflict' | 'denied';
  reasonCode: string | null;
  requestId: string | null;
  createdAt: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

interface MutationDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
  running: boolean;
  run: (() => Promise<void>) | null;
}

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();
const authClient = createVaultLiteAuthClient();

const SECTION_OPTIONS: Array<{ label: string; value: AdminSection }> = [
  { label: 'Overview', value: 'overview' },
  { label: 'Invites', value: 'invites' },
  { label: 'Users', value: 'users' },
  { label: 'Audit', value: 'audit' },
];

const sectionTitleMap: Record<AdminSection, string> = {
  overview: 'Operational overview',
  invites: 'Invites',
  users: 'Users',
  audit: 'Audit activity',
};

const sectionSubtitleMap: Record<AdminSection, string> = {
  overview: 'Deployment snapshot and quick administrative actions.',
  invites: 'Issue and track single-use onboarding invites.',
  users: 'Manage lifecycle state of deployment users.',
  audit: 'Inspect administrative events and security outcomes.',
};

const inviteStatusOptions: Array<{ label: string; value: InviteStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Used', value: 'used' },
  { label: 'Expired', value: 'expired' },
  { label: 'Revoked', value: 'revoked' },
];

const userLifecycleOptions: Array<{ label: string; value: UserLifecycleFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Deprovisioned', value: 'deprovisioned' },
];

const auditResultOptions: Array<{ label: string; value: AuditResultFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Changed', value: 'success_changed' },
  { label: 'Already applied', value: 'success_no_op' },
  { label: 'Conflict', value: 'conflict' },
  { label: 'Denied', value: 'denied' },
];

const invites = ref<InviteView[]>([]);
const users = ref<UserView[]>([]);
const auditEvents = ref<AuditView[]>([]);

const sectionError = ref<string | null>(null);
const toastMessage = ref('');

const inviteSearchQuery = ref('');
const inviteStatusFilter = ref<InviteStatusFilter>('all');
const userSearchQuery = ref('');
const userLifecycleFilter = ref<UserLifecycleFilter>('all');
const auditSearchQuery = ref('');
const auditResultFilter = ref<AuditResultFilter>('all');
const auditTypeFilter = ref('all');

const loadingBySection = reactive<Record<AdminSection, boolean>>({
  overview: false,
  invites: false,
  users: false,
  audit: false,
});

const reauthModalOpen = ref(false);
const reauthPassword = ref('');
const reauthSubmitting = ref(false);
const reauthErrorMessage = ref<string | null>(null);
const reauthFieldRef = ref<InstanceType<typeof SecretField> | null>(null);
let pendingRecentReauth:
  | {
      resolve: () => void;
      reject: (error: Error) => void;
    }
  | null = null;

const mutationDialog = reactive<MutationDialogState>({
  open: false,
  title: '',
  description: '',
  confirmLabel: '',
  tone: 'primary',
  running: false,
  run: null,
});

const createInviteState = reactive({
  open: false,
  submitting: false,
  error: null as string | null,
  deliveredLink: null as string | null,
  expiryPreset: '24h' as InviteExpiryPreset,
  customExpiry: '',
  copiedAt: null as number | null,
});

const mobileFilterSheetOpen = ref(false);
const isMobileViewport = ref(false);
const isCompactDesktopViewport = ref(false);
let mobileQuery: MediaQueryList | null = null;
let compactDesktopQuery: MediaQueryList | null = null;
let mobileViewportListener: ((event: MediaQueryListEvent) => void) | null = null;
let compactDesktopViewportListener: ((event: MediaQueryListEvent) => void) | null = null;
let teardownActiveSectionWatcher: (() => void) | null = null;
let teardownReauthWatcher: (() => void) | null = null;
let teardownViewportWatcher: (() => void) | null = null;

function routeParamAsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveSection(path: string): AdminSection {
  if (path.startsWith('/admin/invites')) return 'invites';
  if (path.startsWith('/admin/users')) return 'users';
  if (path.startsWith('/admin/audit')) return 'audit';
  return 'overview';
}

function sectionPath(section: AdminSection): string {
  return section === 'overview' ? '/admin/overview' : `/admin/${section}`;
}

function detailPath(section: Exclude<AdminSection, 'overview'>, id: string): string {
  return `${sectionPath(section)}/${encodeURIComponent(id)}`;
}

function normalizeInviteLinkForCurrentApp(link: string): string {
  try {
    const parsed = new URL(link);
    const inviteToken = parsed.searchParams.get('invite');
    if (!inviteToken) return link;
    return `${window.location.origin}/onboarding?invite=${encodeURIComponent(inviteToken)}`;
  } catch {
    return link;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatRelative(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const diffMinutes = Math.round((Date.now() - parsed.getTime()) / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-diffDays, 'day');
}

function formatFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('recent_reauth_required')) return 'Recent reauthentication is required for this action.';
  if (message.includes('owner_self_protection')) return 'You cannot apply this lifecycle action to your own owner account.';
  if (message.includes('already_deprovisioned')) return 'This user is already deprovisioned.';
  if (message.includes('already_suspended')) return 'This user is already suspended.';
  if (message.includes('already_active')) return 'This user is already active.';
  if (message.includes('token_not_redelivered')) return 'This invite link is shown only once. Revoke and create a replacement if needed.';
  if (message.includes('initialization_pending')) return 'Deployment initialization is still in progress.';
  return toHumanErrorMessage(error);
}

function showToast(message: string) {
  toastMessage.value = message;
  window.setTimeout(() => {
    if (toastMessage.value === message) toastMessage.value = '';
  }, 2200);
}

function inviteStatusBadgeClass(status: InviteView['status']): string {
  return `admin-status-badge--${status}`;
}

function userLifecycleBadgeClass(state: UserView['lifecycleState']): string {
  return `admin-status-badge--${state}`;
}

function auditResultBadgeClass(result: AuditView['result']): string {
  return `admin-status-badge--${result}`;
}

function humanizeAuditResult(result: AuditView['result']): string {
  const map: Record<AuditView['result'], string> = {
    success_changed: 'Changed',
    success_no_op: 'Already applied',
    conflict: 'Conflict',
    denied: 'Denied',
  };
  return map[result];
}

function humanizeAuditEventType(eventType: string): string {
  const map: Record<string, string> = {
    bootstrap_initialize_owner: 'Owner initialized',
    bootstrap_checkpoint_complete: 'Bootstrap checkpoint completed',
    admin_invite_create: 'Invite created',
    admin_invite_revoke: 'Invite revoked',
    admin_user_suspend: 'User suspended',
    admin_user_reactivate: 'User reactivated',
    admin_user_deprovision: 'User deprovisioned',
  };
  return map[eventType] ?? eventType.replaceAll('_', ' ');
}

const activeSection = computed<AdminSection>(() => resolveSection(route.path));
const sectionTitle = computed(() => sectionTitleMap[activeSection.value]);
const sectionSubtitle = computed(() => sectionSubtitleMap[activeSection.value]);

const selectedInviteId = computed(() =>
  activeSection.value === 'invites' ? routeParamAsString(route.params.inviteId) : null,
);
const selectedUserId = computed(() =>
  activeSection.value === 'users' ? routeParamAsString(route.params.userId) : null,
);
const selectedAuditEventId = computed(() =>
  activeSection.value === 'audit' ? routeParamAsString(route.params.eventId) : null,
);

const selectedInvite = computed(() => invites.value.find((invite) => invite.inviteId === selectedInviteId.value) ?? null);
const selectedUser = computed(() => users.value.find((user) => user.userId === selectedUserId.value) ?? null);
const selectedAuditEvent = computed(
  () => auditEvents.value.find((event) => event.eventId === selectedAuditEventId.value) ?? null,
);

const hasDetailSelection = computed(() => {
  if (activeSection.value === 'invites') return selectedInvite.value !== null;
  if (activeSection.value === 'users') return selectedUser.value !== null;
  if (activeSection.value === 'audit') return selectedAuditEvent.value !== null;
  return false;
});

const showListPane = computed(() => {
  if (!isMobileViewport.value) return true;
  if (activeSection.value === 'overview') return true;
  return !hasDetailSelection.value;
});

const showDetailPane = computed(() => {
  if (activeSection.value === 'overview') return !isMobileViewport.value;
  if (!isMobileViewport.value) return true;
  return hasDetailSelection.value;
});

const mobileSectionModel = computed<AdminSection>({
  get: () => activeSection.value,
  set: (section) => {
    if (section === activeSection.value) return;
    void router.push(sectionPath(section));
  },
});

const filteredInvites = computed(() => {
  const search = inviteSearchQuery.value.trim().toLowerCase();
  return invites.value.filter((invite) => {
    if (inviteStatusFilter.value !== 'all' && invite.status !== inviteStatusFilter.value) {
      return false;
    }
    if (!search) return true;
    return (
      invite.tokenPreview.toLowerCase().includes(search) ||
      invite.createdByUserId.toLowerCase().includes(search) ||
      invite.inviteId.toLowerCase().includes(search)
    );
  });
});

const filteredUsers = computed(() => {
  const search = userSearchQuery.value.trim().toLowerCase();
  return users.value.filter((user) => {
    if (userLifecycleFilter.value !== 'all' && user.lifecycleState !== userLifecycleFilter.value) {
      return false;
    }
    if (!search) return true;
    return (
      user.username.toLowerCase().includes(search) ||
      user.role.toLowerCase().includes(search) ||
      user.userId.toLowerCase().includes(search)
    );
  });
});

const auditEventTypeOptions = computed<Array<{ label: string; value: string }>>(() => {
  const seen = new Set<string>();
  for (const event of auditEvents.value) {
    seen.add(event.eventType);
  }
  return [
    { label: 'All event types', value: 'all' },
    ...Array.from(seen.values()).map((eventType) => ({
      label: humanizeAuditEventType(eventType),
      value: eventType,
    })),
  ];
});

const filteredAuditEvents = computed(() => {
  const search = auditSearchQuery.value.trim().toLowerCase();
  return auditEvents.value.filter((event) => {
    if (auditResultFilter.value !== 'all' && event.result !== auditResultFilter.value) {
      return false;
    }
    if (auditTypeFilter.value !== 'all' && event.eventType !== auditTypeFilter.value) {
      return false;
    }
    if (!search) return true;
    return (
      event.eventType.toLowerCase().includes(search) ||
      event.actorUserId?.toLowerCase().includes(search) ||
      event.targetType.toLowerCase().includes(search) ||
      event.targetId?.toLowerCase().includes(search) ||
      event.reasonCode?.toLowerCase().includes(search) ||
      event.requestId?.toLowerCase().includes(search)
    );
  });
});

const inviteAuditSnippet = computed(() => {
  if (!selectedInvite.value) return [];
  return auditEvents.value.filter((event) => event.targetId === selectedInvite.value?.inviteId).slice(0, 6);
});

const userAuditSnippet = computed(() => {
  if (!selectedUser.value) return [];
  return auditEvents.value.filter((event) => event.targetId === selectedUser.value?.userId).slice(0, 8);
});

const overviewStats = computed(() => {
  const activeUsers = users.value.filter((user) => user.lifecycleState === 'active').length;
  const suspendedUsers = users.value.filter((user) => user.lifecycleState === 'suspended').length;
  const deprovisionedUsers = users.value.filter((user) => user.lifecycleState === 'deprovisioned').length;
  const activeInvites = invites.value.filter((invite) => invite.status === 'active').length;
  const exhaustedInvites = invites.value.filter(
    (invite) => invite.status === 'revoked' || invite.status === 'expired' || invite.status === 'used',
  ).length;
  const recentAdminActions = auditEvents.value.filter((event) => event.eventType.startsWith('admin_')).length;
  const pendingSecurityAttention = auditEvents.value.filter(
    (event) => event.result === 'conflict' || event.result === 'denied',
  ).length;
  return {
    activeUsers,
    suspendedUsers,
    deprovisionedUsers,
    activeInvites,
    exhaustedInvites,
    recentAdminActions,
    pendingSecurityAttention,
  };
});
const overviewMetricCards = computed<
  Array<{ key: string; label: string; value: number; hint: string }>
>(() => [
  {
    key: 'active-users',
    label: 'Active users',
    value: overviewStats.value.activeUsers,
    hint: 'Deployment users currently operational.',
  },
  {
    key: 'suspended-users',
    label: 'Suspended users',
    value: overviewStats.value.suspendedUsers,
    hint: 'Accounts blocked from remote authentication.',
  },
  {
    key: 'active-invites',
    label: 'Active invites',
    value: overviewStats.value.activeInvites,
    hint: 'Single-use links that are still valid.',
  },
  {
    key: 'closed-invites',
    label: 'Closed invites',
    value: overviewStats.value.exhaustedInvites,
    hint: 'Used, revoked, or expired invite lifecycle records.',
  },
  {
    key: 'recent-actions',
    label: 'Recent admin actions',
    value: overviewStats.value.recentAdminActions,
    hint: 'Administrative mutations captured in audit.',
  },
  {
    key: 'security-attention',
    label: 'Security attention',
    value: overviewStats.value.pendingSecurityAttention,
    hint: 'Denied or conflict outcomes in recent events.',
  },
]);

const overviewActivity = computed(() => auditEvents.value.slice(0, 10));
const securityAttentionEvents = computed(() =>
  auditEvents.value.filter((event) => event.result === 'conflict' || event.result === 'denied').slice(0, 8),
);
const latestAuditTimestamp = computed(() => auditEvents.value[0]?.createdAt ?? null);
const bootstrapCompletedEvent = computed(() =>
  auditEvents.value.find((event) => event.eventType === 'bootstrap_checkpoint_complete') ?? null,
);
const createInviteHasDelivery = computed(() => Boolean(createInviteState.deliveredLink));
const createInviteDialogTitle = computed(() =>
  createInviteHasDelivery.value ? 'Invite created' : 'Create invite',
);
const createInvitePrimaryLabel = computed(() => {
  if (createInviteState.submitting) return 'Creating...';
  return createInviteHasDelivery.value ? 'Done' : 'Create invite';
});
const createInviteSecondaryLabel = computed(() =>
  createInviteHasDelivery.value ? 'Create another invite' : 'Close',
);

const activeFilterSummary = computed(() => {
  if (activeSection.value === 'invites') {
    const segments: string[] = [];
    if (inviteStatusFilter.value !== 'all') {
      segments.push(`Status: ${inviteStatusFilter.value}`);
    }
    if (inviteSearchQuery.value.trim()) {
      segments.push(`Search: "${inviteSearchQuery.value.trim()}"`);
    }
    return segments;
  }
  if (activeSection.value === 'users') {
    const segments: string[] = [];
    if (userLifecycleFilter.value !== 'all') {
      segments.push(`State: ${userLifecycleFilter.value}`);
    }
    if (userSearchQuery.value.trim()) {
      segments.push(`Search: "${userSearchQuery.value.trim()}"`);
    }
    return segments;
  }
  if (activeSection.value === 'audit') {
    const segments: string[] = [];
    if (auditResultFilter.value !== 'all') {
      segments.push(`Result: ${humanizeAuditResult(auditResultFilter.value)}`);
    }
    if (auditTypeFilter.value !== 'all') {
      segments.push(`Event: ${humanizeAuditEventType(auditTypeFilter.value)}`);
    }
    if (auditSearchQuery.value.trim()) {
      segments.push(`Search: "${auditSearchQuery.value.trim()}"`);
    }
    return segments;
  }
  return [];
});

const selectedUserIsSelfOwner = computed(() => {
  if (!selectedUser.value) return false;
  return selectedUser.value.role === 'owner' && selectedUser.value.userId === sessionStore.state.userId;
});

const hasActiveSectionFilters = computed(() => activeFilterSummary.value.length > 0);
const showSuspendAction = computed(
  () => selectedUser.value !== null && !selectedUserIsSelfOwner.value && selectedUser.value.lifecycleState === 'active',
);
const showReactivateAction = computed(
  () => selectedUser.value !== null && selectedUser.value.lifecycleState === 'suspended',
);
const showDeprovisionAction = computed(
  () =>
    selectedUser.value !== null &&
    !selectedUserIsSelfOwner.value &&
    selectedUser.value.lifecycleState !== 'deprovisioned',
);
const userActionAvailabilityMessage = computed(() => {
  if (!selectedUser.value) return '';
  if (selectedUserIsSelfOwner.value) {
    return "Owner self-protection is active for this account.";
  }
  if (selectedUser.value.lifecycleState === 'deprovisioned') {
    return 'This account is already deprovisioned.';
  }
  if (selectedUser.value.lifecycleState === 'active') {
    return 'Suspend or deprovision are available for this account.';
  }
  return 'Reactivate or deprovision are available for this account.';
});

const createInviteSubmitDisabled = computed(
  () =>
    createInviteState.submitting ||
    createInviteHasDelivery.value ||
    (createInviteState.expiryPreset === 'custom' && createInviteState.customExpiry.trim().length === 0),
);

const reauthConfirmDisabled = computed(
  () => reauthSubmitting.value || reauthPassword.value.trim().length === 0,
);

const skeletonRows = computed(() => Array.from({ length: 6 }, (_, index) => `skeleton-${index}`));
const canRevokeSelectedInvite = computed(
  () => selectedInvite.value !== null && selectedInvite.value.status === 'active',
);
const canCreateReplacementInvite = computed(
  () => selectedInvite.value !== null && selectedInvite.value.status !== 'active',
);
const selectedUserLastActivity = computed(() => {
  if (!selectedUser.value) return null;
  const userId = selectedUser.value.userId;
  return (
    auditEvents.value.find(
      (event) => event.actorUserId === userId || (event.targetType === 'user' && event.targetId === userId),
    )?.createdAt ?? null
  );
});

function syncViewport() {
  isMobileViewport.value = mobileQuery?.matches ?? false;
  isCompactDesktopViewport.value = compactDesktopQuery?.matches ?? false;
  if (!isMobileViewport.value) {
    mobileFilterSheetOpen.value = false;
  }
}

async function loadInvites() {
  loadingBySection.invites = true;
  try {
    const response = await authClient.listAdminInvites();
    invites.value = Array.isArray(response.invites) ? response.invites : [];
  } finally {
    loadingBySection.invites = false;
  }
}

async function loadUsers() {
  loadingBySection.users = true;
  try {
    const response = await authClient.listAdminUsers();
    users.value = Array.isArray(response.users) ? response.users : [];
  } finally {
    loadingBySection.users = false;
  }
}

async function loadAudit() {
  loadingBySection.audit = true;
  try {
    const response = await authClient.listAdminAudit(250);
    auditEvents.value = Array.isArray(response.events) ? response.events : [];
  } finally {
    loadingBySection.audit = false;
  }
}

async function refreshSection(section: AdminSection) {
  sectionError.value = null;
  try {
    if (section === 'overview') {
      loadingBySection.overview = true;
      await Promise.all([loadInvites(), loadUsers(), loadAudit()]);
      return;
    }
    if (section === 'invites') {
      await Promise.all([loadInvites(), loadAudit()]);
      ensureDesktopSelection(section);
      return;
    }
    if (section === 'users') {
      await Promise.all([loadUsers(), loadAudit()]);
      ensureDesktopSelection(section);
      return;
    }
    await loadAudit();
    ensureDesktopSelection(section);
  } catch (error) {
    sectionError.value = formatFriendlyError(error);
  } finally {
    loadingBySection.overview = false;
  }
}

function ensureDesktopSelection(section: AdminSection) {
  if (isMobileViewport.value || section === 'overview') {
    return;
  }
  if (section === 'invites' && !selectedInviteId.value && invites.value[0]) {
    void router.replace(detailPath('invites', invites.value[0].inviteId));
    return;
  }
  if (section === 'users' && !selectedUserId.value && users.value[0]) {
    void router.replace(detailPath('users', users.value[0].userId));
    return;
  }
  if (section === 'audit' && !selectedAuditEventId.value && auditEvents.value[0]) {
    void router.replace(detailPath('audit', auditEvents.value[0].eventId));
  }
}

function navigateToSection(section: AdminSection) {
  void router.push(sectionPath(section));
}

function openFiltersSheet() {
  mobileFilterSheetOpen.value = true;
}

function closeFiltersSheet() {
  mobileFilterSheetOpen.value = false;
}

function closeMobileDetail() {
  void router.push(sectionPath(activeSection.value));
}

function openVaultWorkspace() {
  void router.push('/vault');
}

function openSettings() {
  void router.push('/settings');
}

function clearCurrentSectionFilters() {
  if (activeSection.value === 'invites') {
    inviteStatusFilter.value = 'all';
    inviteSearchQuery.value = '';
    return;
  }
  if (activeSection.value === 'users') {
    userLifecycleFilter.value = 'all';
    userSearchQuery.value = '';
    return;
  }
  if (activeSection.value === 'audit') {
    auditResultFilter.value = 'all';
    auditTypeFilter.value = 'all';
    auditSearchQuery.value = '';
  }
}

function openCreateInvite() {
  createInviteState.open = true;
  createInviteState.submitting = false;
  createInviteState.error = null;
  createInviteState.deliveredLink = null;
  createInviteState.expiryPreset = '24h';
  createInviteState.customExpiry = '';
  createInviteState.copiedAt = null;
}

function closeCreateInvite() {
  createInviteState.open = false;
  createInviteState.submitting = false;
  createInviteState.error = null;
  createInviteState.deliveredLink = null;
  createInviteState.copiedAt = null;
}

function resetCreateInviteFormForAnother() {
  createInviteState.submitting = false;
  createInviteState.error = null;
  createInviteState.deliveredLink = null;
  createInviteState.expiryPreset = '24h';
  createInviteState.customExpiry = '';
  createInviteState.copiedAt = null;
}

function handleMobileCreateInviteBackdropClose(event: MouseEvent) {
  if (event.target !== event.currentTarget) {
    return;
  }
  closeCreateInvite();
}

function resolvePresetExpiryIso(preset: Exclude<InviteExpiryPreset, 'custom'>): string {
  const now = Date.now();
  const plusMs =
    preset === '1h' ? 60 * 60 * 1000 : preset === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(now + plusMs).toISOString();
}

function resolveCreateInviteExpiresAtIso(): string {
  if (createInviteState.expiryPreset !== 'custom') {
    return resolvePresetExpiryIso(createInviteState.expiryPreset);
  }
  const parsed = new Date(createInviteState.customExpiry);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Enter a valid custom expiration date and time.');
  }
  return parsed.toISOString();
}

async function copyDeliveredInviteLink() {
  if (!createInviteState.deliveredLink) return;
  try {
    await navigator.clipboard.writeText(createInviteState.deliveredLink);
    createInviteState.copiedAt = Date.now();
    showToast('Invite link copied');
  } catch {
    sectionError.value = 'Unable to copy the invite link from this browser session.';
  }
}

async function copyValue(value: string | null, successMessage: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch {
    sectionError.value = 'Unable to copy from this browser session.';
  }
}

async function ensureRecentReauthWithPassword(password: string) {
  const username = sessionStore.state.username;
  if (!username) throw new Error('Unauthorized');
  const challenge = await authClient.requestRemoteAuthenticationChallenge(username);
  const authProof = await deriveAuthProof(password, challenge.authSalt);
  await authClient.recentReauth({ authProof });
}

function closeReauthModal() {
  reauthModalOpen.value = false;
  reauthSubmitting.value = false;
  reauthPassword.value = '';
  reauthErrorMessage.value = null;
}

function requestRecentReauthFromModal() {
  if (pendingRecentReauth) {
    return Promise.reject(new Error('recent_reauth_already_pending'));
  }
  reauthModalOpen.value = true;
  reauthPassword.value = '';
  reauthErrorMessage.value = null;
  return new Promise<void>((resolve, reject) => {
    pendingRecentReauth = { resolve, reject };
  });
}

function cancelRecentReauth() {
  if (!pendingRecentReauth) {
    closeReauthModal();
    return;
  }
  pendingRecentReauth.reject(new Error('Action cancelled'));
  pendingRecentReauth = null;
  closeReauthModal();
}

async function confirmRecentReauth() {
  if (!pendingRecentReauth) {
    closeReauthModal();
    return;
  }
  reauthSubmitting.value = true;
  reauthErrorMessage.value = null;
  try {
    await ensureRecentReauthWithPassword(reauthPassword.value);
    pendingRecentReauth.resolve();
    pendingRecentReauth = null;
    closeReauthModal();
  } catch (error) {
    reauthErrorMessage.value = formatFriendlyError(error);
    reauthSubmitting.value = false;
  }
}

async function runOwnerMutation(task: () => Promise<void>) {
  try {
    await task();
    return;
  } catch (error) {
    const message = formatFriendlyError(error);
    if (!message.includes('Recent reauthentication is required')) {
      throw error;
    }
  }
  await requestRecentReauthFromModal();
  await task();
}

function openMutationDialog(input: {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
  run: () => Promise<void>;
}) {
  mutationDialog.open = true;
  mutationDialog.running = false;
  mutationDialog.title = input.title;
  mutationDialog.description = input.description;
  mutationDialog.confirmLabel = input.confirmLabel;
  mutationDialog.tone = input.tone;
  mutationDialog.run = input.run;
}

function closeMutationDialog() {
  if (mutationDialog.running) return;
  mutationDialog.open = false;
  mutationDialog.running = false;
  mutationDialog.title = '';
  mutationDialog.description = '';
  mutationDialog.confirmLabel = '';
  mutationDialog.tone = 'primary';
  mutationDialog.run = null;
}

async function confirmMutationDialog() {
  if (!mutationDialog.run) {
    closeMutationDialog();
    return;
  }
  mutationDialog.running = true;
  sectionError.value = null;
  try {
    await mutationDialog.run();
    showToast('Action completed');
    mutationDialog.running = false;
    closeMutationDialog();
  } catch (error) {
    sectionError.value = formatFriendlyError(error);
    mutationDialog.running = false;
  }
}

async function submitCreateInvite() {
  if (createInviteHasDelivery.value) {
    closeCreateInvite();
    return;
  }
  createInviteState.submitting = true;
  createInviteState.error = null;
  try {
    const expiresAt = resolveCreateInviteExpiresAtIso();
    await runOwnerMutation(async () => {
      const response = await authClient.createAdminInvite({ expiresAt });
      createInviteState.deliveredLink = response.inviteLink
        ? normalizeInviteLinkForCurrentApp(response.inviteLink)
        : null;
    });
    await Promise.all([loadInvites(), loadAudit()]);
    showToast('Invite created');
  } catch (error) {
    createInviteState.error = formatFriendlyError(error);
  } finally {
    createInviteState.submitting = false;
  }
}

function openInviteDetail(inviteId: string) {
  void router.push(detailPath('invites', inviteId));
}

function openUserDetail(userId: string) {
  void router.push(detailPath('users', userId));
}

function openAuditDetail(eventId: string) {
  void router.push(detailPath('audit', eventId));
}

function promptRevokeInvite(invite: InviteView) {
  openMutationDialog({
    title: 'Revoke invite',
    description: `Revoke ${invite.tokenPreview}. This invite will no longer be usable for onboarding.`,
    confirmLabel: 'Revoke invite',
    tone: 'danger',
    run: async () => {
      await runOwnerMutation(async () => {
        await authClient.revokeAdminInvite(invite.inviteId);
      });
      await Promise.all([loadInvites(), loadAudit()]);
    },
  });
}

function promptUserMutation(action: 'suspend' | 'reactivate' | 'deprovision', user: UserView) {
  if (action === 'suspend') {
    openMutationDialog({
      title: `Suspend ${user.username}?`,
      description:
        'Suspending blocks new remote authentication attempts and revokes active sessions according to lifecycle policy.',
      confirmLabel: 'Suspend user',
      tone: 'danger',
      run: async () => {
        await runOwnerMutation(async () => {
          await authClient.suspendAdminUser(user.userId);
        });
        await Promise.all([loadUsers(), loadAudit()]);
      },
    });
    return;
  }
  if (action === 'reactivate') {
    openMutationDialog({
      title: `Reactivate ${user.username}?`,
      description: 'Reactivating restores operational access and permits new remote authentication.',
      confirmLabel: 'Reactivate user',
      tone: 'primary',
      run: async () => {
        await runOwnerMutation(async () => {
          await authClient.reactivateAdminUser(user.userId);
        });
        await Promise.all([loadUsers(), loadAudit()]);
      },
    });
    return;
  }
  openMutationDialog({
    title: `Deprovision ${user.username}?`,
    description:
      'Deprovisioning is irreversible in V1 and transitions trusted devices to non-active state immediately.',
    confirmLabel: 'Deprovision user',
    tone: 'danger',
    run: async () => {
      await runOwnerMutation(async () => {
        await authClient.deprovisionAdminUser(user.userId);
      });
      await Promise.all([loadUsers(), loadAudit()]);
    },
  });
}

function filterSimilarAuditEvents(event: AuditView) {
  auditResultFilter.value = event.result;
  auditTypeFilter.value = event.eventType;
  auditSearchQuery.value = '';
  if (activeSection.value !== 'audit') {
    void router.push('/admin/audit');
  }
}

function viewRelatedTarget(event: AuditView) {
  if (event.targetType === 'invite' && event.targetId) {
    void router.push(detailPath('invites', event.targetId));
    return;
  }
  if (event.targetType === 'user' && event.targetId) {
    void router.push(detailPath('users', event.targetId));
  }
}

function copyRequestId(requestId: string | null) {
  void copyValue(requestId, 'Request ID copied');
}

function closeSectionError() {
  sectionError.value = null;
}

onMounted(async () => {
  if (route.path === '/admin') {
    await router.replace('/admin/overview');
  }
  if (typeof window.matchMedia === 'function') {
    mobileQuery = window.matchMedia('(max-width: 760px)');
    compactDesktopQuery = window.matchMedia('(max-width: 1365px)');
    syncViewport();
    mobileViewportListener = () => {
      syncViewport();
    };
    compactDesktopViewportListener = () => {
      syncViewport();
    };
    mobileQuery.addEventListener('change', mobileViewportListener);
    compactDesktopQuery.addEventListener('change', compactDesktopViewportListener);
  } else {
    isMobileViewport.value = false;
    isCompactDesktopViewport.value = false;
  }

  teardownActiveSectionWatcher = watch(
    () => activeSection.value,
    async (section) => {
      mobileFilterSheetOpen.value = false;
      await refreshSection(section);
    },
    { immediate: true },
  );

  teardownReauthWatcher = watch(reauthModalOpen, (open) => {
    if (!open) return;
    queueMicrotask(() => {
      reauthFieldRef.value?.focus();
    });
  });

  teardownViewportWatcher = watch(
    () => isMobileViewport.value,
    (mobile) => {
      if (!mobile) {
        ensureDesktopSelection(activeSection.value);
      }
    },
  );
});

onBeforeUnmount(() => {
  if (mobileQuery && mobileViewportListener) {
    mobileQuery.removeEventListener('change', mobileViewportListener);
  }
  if (compactDesktopQuery && compactDesktopViewportListener) {
    compactDesktopQuery.removeEventListener('change', compactDesktopViewportListener);
  }
  mobileViewportListener = null;
  compactDesktopViewportListener = null;
  mobileQuery = null;
  compactDesktopQuery = null;
  teardownActiveSectionWatcher?.();
  teardownActiveSectionWatcher = null;
  teardownReauthWatcher?.();
  teardownReauthWatcher = null;
  teardownViewportWatcher?.();
  teardownViewportWatcher = null;
  if (pendingRecentReauth) {
    pendingRecentReauth.reject(new Error('Action cancelled'));
    pendingRecentReauth = null;
  }
});
</script>

<template>
  <section
    class="admin-page"
    :class="[
      `admin-page--${activeSection}`,
      {
        'admin-page--mobile': isMobileViewport,
        'admin-page--detail-open': hasDetailSelection,
        'admin-page--compact-desktop': isCompactDesktopViewport && !isMobileViewport,
      },
    ]"
  >
    <section v-if="showListPane" class="admin-list-pane">
      <header class="admin-pane-header">
        <div class="page-header">
          <p class="eyebrow">Admin</p>
          <h1>{{ sectionTitle }}</h1>
          <p class="page-subtitle">{{ sectionSubtitle }}</p>
        </div>
        <div class="admin-pane-header__actions">
          <IconButton
            v-if="isMobileViewport"
            label="Open vault"
            data-testid="admin-mobile-open-vault"
            @click="openVaultWorkspace"
          >
            <AppIcon name="vault" :size="20" />
          </IconButton>
          <IconButton
            v-if="isMobileViewport && activeSection !== 'overview'"
            label="Open filters"
            :class="{ 'admin-filter-button--active': hasActiveSectionFilters }"
            @click="openFiltersSheet"
          >
            <AppIcon name="filter" :size="20" />
            <span v-if="hasActiveSectionFilters" class="admin-filter-button__dot" aria-hidden="true" />
          </IconButton>
          <button
            v-if="activeSection === 'audit'"
            class="text-button admin-export-placeholder"
            type="button"
            aria-disabled="true"
            data-testid="admin-audit-export-button"
          >
            Export logs (coming soon)
          </button>
          <PrimaryButton v-if="activeSection === 'invites'" type="button" @click="openCreateInvite">
            <AppIcon name="plus" :size="18" />
            <span>New invite</span>
          </PrimaryButton>
        </div>
      </header>

      <div v-if="isMobileViewport" class="admin-mobile-section-switcher">
        <SegmentedControl v-model="mobileSectionModel" :options="SECTION_OPTIONS" />
      </div>

      <InlineAlert v-if="sectionError" tone="danger">
        <div class="admin-inline-alert">
          <span>{{ sectionError }}</span>
          <button class="text-button" type="button" @click="closeSectionError">Dismiss</button>
        </div>
      </InlineAlert>

      <div v-if="activeFilterSummary.length > 0" class="admin-active-summary">
        <span
          v-for="segment in activeFilterSummary"
          :key="segment"
          class="admin-active-summary__chip"
        >
          {{ segment }}
        </span>
        <button class="text-button" type="button" @click="clearCurrentSectionFilters">Clear</button>
      </div>

      <!-- SECTION CONTENT -->
      <template v-if="activeSection === 'overview'">
        <div class="admin-overview-metrics">
          <article
            v-for="metric in overviewMetricCards"
            :key="metric.key"
            class="admin-metric-card"
          >
            <p class="admin-metric-card__label">{{ metric.label }}</p>
            <p class="admin-metric-card__value">{{ metric.value }}</p>
            <p class="admin-metric-card__hint">{{ metric.hint }}</p>
          </article>
        </div>

        <section class="admin-section-card">
          <header class="admin-section-card__header">
            <h2>Recent administrative activity</h2>
            <SecondaryButton type="button" @click="navigateToSection('audit')">
              Open audit
            </SecondaryButton>
          </header>
          <ul v-if="overviewActivity.length > 0" class="admin-activity-list">
            <li v-for="event in overviewActivity" :key="event.eventId" class="admin-activity-row">
              <button class="admin-activity-row__button" type="button" @click="openAuditDetail(event.eventId)">
                <p class="admin-activity-row__title">{{ humanizeAuditEventType(event.eventType) }}</p>
                <p class="admin-activity-row__meta">
                  {{ event.actorUserId ?? 'system' }} · {{ formatRelative(event.createdAt) }}
                </p>
                <span class="admin-status-badge" :class="auditResultBadgeClass(event.result)">
                  {{ humanizeAuditResult(event.result) }}
                </span>
              </button>
            </li>
          </ul>
          <EmptyState
            v-else
            title="No activity yet"
            description="Administrative actions will appear here once invites and user operations start."
          />
        </section>

        <section v-if="isMobileViewport" class="admin-section-card">
          <header class="admin-section-card__header">
            <h2>Quick actions</h2>
          </header>
          <div class="admin-quick-actions">
            <PrimaryButton type="button" @click="openCreateInvite">
              <AppIcon name="plus" :size="18" />
              <span>Create invite</span>
            </PrimaryButton>
            <SecondaryButton type="button" @click="navigateToSection('users')">Review users</SecondaryButton>
            <SecondaryButton type="button" @click="navigateToSection('audit')">Open audit log</SecondaryButton>
          </div>
        </section>
      </template>
      <template v-else-if="activeSection === 'invites'">
        <div class="admin-toolbar">
          <SearchField
            v-model="inviteSearchQuery"
            label="Search invites"
            placeholder="Search invites"
            test-id="admin-invites-search"
          />
          <SegmentedControl v-model="inviteStatusFilter" :options="inviteStatusOptions" />
        </div>

        <div v-if="loadingBySection.invites" class="admin-list-skeleton">
          <article v-for="entry in skeletonRows" :key="entry" class="admin-skeleton-row" />
        </div>
        <ul v-else-if="filteredInvites.length > 0" class="admin-record-list">
          <li
            v-for="invite in filteredInvites"
            :key="invite.inviteId"
            class="admin-record-row"
            :class="{ 'is-active': selectedInviteId === invite.inviteId }"
          >
            <button
              class="admin-record-row__main"
              type="button"
              @click="openInviteDetail(invite.inviteId)"
            >
              <div class="admin-record-row__title-line">
                <p class="admin-record-row__title">{{ invite.tokenPreview }}</p>
                <span class="admin-status-badge" :class="inviteStatusBadgeClass(invite.status)">
                  {{ invite.status }}
                </span>
              </div>
              <p class="admin-record-row__meta">
                Expires {{ formatDateTime(invite.expiresAt) }}
              </p>
              <p class="admin-record-row__meta">
                Created by {{ invite.createdByUserId }} · {{ formatRelative(invite.createdAt) }}
              </p>
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No invites found"
          description="Create a single-use invite to onboard another user. Single-use links are shown only once after creation."
        >
          <template #actions>
            <PrimaryButton type="button" @click="openCreateInvite">
              <AppIcon name="plus" :size="18" />
              <span>Create invite</span>
            </PrimaryButton>
          </template>
        </EmptyState>
      </template>
      <template v-else-if="activeSection === 'users'">
        <div class="admin-toolbar">
          <SearchField
            v-model="userSearchQuery"
            label="Search users"
            placeholder="Search users"
            test-id="admin-users-search"
          />
          <SegmentedControl v-model="userLifecycleFilter" :options="userLifecycleOptions" />
        </div>

        <div v-if="loadingBySection.users" class="admin-list-skeleton">
          <article v-for="entry in skeletonRows" :key="entry" class="admin-skeleton-row" />
        </div>
        <ul v-else-if="filteredUsers.length > 0" class="admin-record-list">
          <li
            v-for="user in filteredUsers"
            :key="user.userId"
            class="admin-record-row"
            :class="{ 'is-active': selectedUserId === user.userId }"
          >
            <button class="admin-record-row__main" type="button" @click="openUserDetail(user.userId)">
              <div class="admin-record-row__title-line">
                <p class="admin-record-row__title">{{ user.username }}</p>
                <div class="admin-record-row__badges">
                  <span class="admin-role-badge" :class="`admin-role-badge--${user.role}`">{{ user.role }}</span>
                  <span class="admin-status-badge" :class="userLifecycleBadgeClass(user.lifecycleState)">
                    {{ user.lifecycleState }}
                  </span>
                </div>
              </div>
              <p class="admin-record-row__meta">
                Trusted devices: {{ user.trustedDevicesCount }} · Created {{ formatDateTime(user.createdAt) }}
              </p>
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No users found"
          description="Users appear here after onboarding via invite."
        >
          <template #actions>
            <PrimaryButton type="button" @click="openCreateInvite">
              <AppIcon name="plus" :size="18" />
              <span>Create first invite</span>
            </PrimaryButton>
          </template>
        </EmptyState>
      </template>
      <template v-else>
        <div class="admin-toolbar admin-toolbar--audit">
          <SearchField
            v-model="auditSearchQuery"
            label="Search audit events"
            placeholder="Search actor, target, request id, reason"
            test-id="admin-audit-search"
          />
          <SegmentedControl v-model="auditResultFilter" :options="auditResultOptions" />
          <label class="field admin-audit-type-filter">
            <span class="field__label">Event type</span>
            <select v-model="auditTypeFilter" class="field__select">
              <option v-for="option in auditEventTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="loadingBySection.audit" class="admin-list-skeleton">
          <article v-for="entry in skeletonRows" :key="entry" class="admin-skeleton-row" />
        </div>
        <ul v-else-if="filteredAuditEvents.length > 0" class="admin-record-list">
          <li
            v-for="event in filteredAuditEvents"
            :key="event.eventId"
            class="admin-record-row"
            :class="{ 'is-active': selectedAuditEventId === event.eventId }"
          >
            <button class="admin-record-row__main" type="button" @click="openAuditDetail(event.eventId)">
              <div class="admin-record-row__title-line">
                <p class="admin-record-row__title">{{ humanizeAuditEventType(event.eventType) }}</p>
                <span class="admin-status-badge" :class="auditResultBadgeClass(event.result)">
                  {{ humanizeAuditResult(event.result) }}
                </span>
              </div>
              <p class="admin-record-row__meta">
                {{ event.actorUserId ?? 'system' }} · {{ formatRelative(event.createdAt) }}
              </p>
              <p class="admin-record-row__meta">
                {{ event.targetType }}<span v-if="event.targetId">: {{ event.targetId }}</span>
              </p>
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No events found"
          description="Try clearing filters or broadening your search."
        >
          <template #actions>
            <SecondaryButton type="button" @click="clearCurrentSectionFilters">Clear filters</SecondaryButton>
          </template>
        </EmptyState>
      </template>
    </section>

    <aside v-if="showDetailPane" class="admin-detail-pane">
      <header v-if="isMobileViewport && activeSection !== 'overview'" class="admin-mobile-detail-header">
        <div class="admin-mobile-detail-header__start">
          <IconButton label="Back to list" @click="closeMobileDetail">
            <AppIcon name="chevron_left" :size="20" />
          </IconButton>
          <p class="admin-mobile-detail-header__title">{{ sectionTitle }}</p>
        </div>
        <IconButton
          label="Open vault"
          data-testid="admin-mobile-detail-open-vault"
          @click="openVaultWorkspace"
        >
          <AppIcon name="vault" :size="20" />
        </IconButton>
      </header>

      <!-- DETAIL CONTENT -->
      <template v-if="activeSection === 'overview'">
        <section class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>Deployment context</h2>
          </header>
          <dl class="admin-detail-meta">
            <div>
              <dt>Bootstrap state</dt>
              <dd>{{ sessionStore.state.bootstrapState ?? 'unknown' }}</dd>
            </div>
            <div>
              <dt>Owner account</dt>
              <dd>{{ sessionStore.state.username ?? 'unknown' }}</dd>
            </div>
            <div>
              <dt>Initialized at</dt>
              <dd>{{ formatDateTime(bootstrapCompletedEvent?.createdAt ?? null) }}</dd>
            </div>
            <div>
              <dt>Last admin action</dt>
              <dd>{{ formatDateTime(latestAuditTimestamp) }}</dd>
            </div>
          </dl>
        </section>

        <section class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>Quick actions</h2>
          </header>
          <div class="admin-quick-actions">
            <PrimaryButton type="button" @click="openCreateInvite">
              <AppIcon name="plus" :size="18" />
              <span>Create invite</span>
            </PrimaryButton>
            <SecondaryButton type="button" @click="navigateToSection('users')">Review users</SecondaryButton>
            <SecondaryButton type="button" @click="navigateToSection('audit')">Open audit log</SecondaryButton>
            <SecondaryButton type="button" @click="openVaultWorkspace">Open vault</SecondaryButton>
            <SecondaryButton type="button" @click="openSettings">Settings</SecondaryButton>
          </div>
        </section>

        <section class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>Security posture</h2>
          </header>
          <ul class="admin-guidance-list">
            <li>Mutations require owner role, CSRF, valid session, and recent reauthentication.</li>
            <li>Invites are single-use and token links are shown only once.</li>
            <li>Owner self-suspend and self-deprovision actions remain blocked.</li>
          </ul>
        </section>

        <section class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>Pending security attention</h2>
          </header>
          <ul v-if="securityAttentionEvents.length > 0" class="admin-activity-list">
            <li v-for="event in securityAttentionEvents" :key="`attention-${event.eventId}`" class="admin-activity-row">
              <button class="admin-activity-row__button" type="button" @click="openAuditDetail(event.eventId)">
                <p class="admin-activity-row__title">{{ humanizeAuditEventType(event.eventType) }}</p>
                <p class="admin-activity-row__meta">
                  {{ event.reasonCode ?? humanizeAuditResult(event.result) }} · {{ formatRelative(event.createdAt) }}
                </p>
              </button>
            </li>
          </ul>
          <div v-else class="admin-neutral-state">
            <AppIcon name="lock" :size="18" />
            <p class="module-empty-hint">No denied or conflict events in the recent window.</p>
          </div>
        </section>
      </template>
      <template v-else-if="activeSection === 'invites'">
        <template v-if="selectedInvite">
          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <div class="admin-detail-card__identity">
                <p class="admin-detail-card__title admin-detail-card__title--token" :title="selectedInvite.tokenPreview">
                  {{ selectedInvite.tokenPreview }}
                </p>
                <span class="admin-status-badge" :class="inviteStatusBadgeClass(selectedInvite.status)">
                  {{ selectedInvite.status }}
                </span>
              </div>
              <div class="admin-detail-card__actions">
                <DangerButton
                  v-if="canRevokeSelectedInvite"
                  type="button"
                  @click="promptRevokeInvite(selectedInvite)"
                >
                  Revoke invite
                </DangerButton>
                <SecondaryButton
                  v-if="canCreateReplacementInvite"
                  type="button"
                  @click="openCreateInvite"
                >
                  Create replacement invite
                </SecondaryButton>
              </div>
            </header>

            <dl class="admin-detail-meta">
              <div>
                <dt>Created by</dt>
                <dd>{{ selectedInvite.createdByUserId }}</dd>
              </div>
              <div>
                <dt>Created at</dt>
                <dd>{{ formatDateTime(selectedInvite.createdAt) }}</dd>
              </div>
              <div>
                <dt>Expires at</dt>
                <dd>{{ formatDateTime(selectedInvite.expiresAt) }}</dd>
              </div>
              <div>
                <dt>Consumed at</dt>
                <dd>{{ formatDateTime(selectedInvite.consumedAt) }}</dd>
              </div>
              <div>
                <dt>Revoked at</dt>
                <dd>{{ formatDateTime(selectedInvite.revokedAt) }}</dd>
              </div>
              <div>
                <dt>Invite ID</dt>
                <dd class="admin-detail-meta__value-with-action">
                  <span class="admin-detail-meta__mono">{{ selectedInvite.inviteId }}</span>
                  <IconButton
                    label="Copy invite id"
                    @click="copyValue(selectedInvite.inviteId, 'Invite ID copied')"
                  >
                    <AppIcon name="copy" :size="16" />
                  </IconButton>
                </dd>
              </div>
            </dl>
          </section>

          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <h2>Operational guidance</h2>
            </header>
            <p class="page-subtitle">
              <span v-if="selectedInvite.status === 'active'">Share this invite link securely. The full token is not re-delivered after creation.</span>
              <span v-else>If access is still needed, create a replacement invite.</span>
            </p>
          </section>

          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <h2>Related audit events</h2>
            </header>
            <ul v-if="inviteAuditSnippet.length > 0" class="admin-activity-list">
              <li v-for="event in inviteAuditSnippet" :key="`invite-event-${event.eventId}`" class="admin-activity-row">
                <button class="admin-activity-row__button" type="button" @click="openAuditDetail(event.eventId)">
                  <p class="admin-activity-row__title">{{ humanizeAuditEventType(event.eventType) }}</p>
                  <p class="admin-activity-row__meta">
                    {{ humanizeAuditResult(event.result) }} · {{ formatRelative(event.createdAt) }}
                  </p>
                </button>
              </li>
            </ul>
            <div v-else class="admin-empty-with-action">
              <p class="module-empty-hint">No invite-specific audit events yet.</p>
              <SecondaryButton type="button" @click="navigateToSection('audit')">View full audit</SecondaryButton>
            </div>
          </section>
        </template>
        <section v-else-if="filteredInvites.length === 0" class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>Invite policy</h2>
          </header>
          <ul class="admin-guidance-list">
            <li>Invites are single-use and role is fixed to user.</li>
            <li>Invite links are shown only once immediately after creation.</li>
            <li>If a link is lost, revoke and create a replacement invite.</li>
          </ul>
          <div class="admin-quick-actions">
            <PrimaryButton type="button" @click="openCreateInvite">
              <AppIcon name="plus" :size="18" />
              <span>Create invite</span>
            </PrimaryButton>
          </div>
        </section>
        <EmptyState
          v-else
          title="Select an invite"
          description="Choose an invite to review status, metadata, and related activity. Invites are single-use and links are shown once."
        />
      </template>
      <template v-else-if="activeSection === 'users'">
        <template v-if="selectedUser">
          <section class="admin-detail-card admin-detail-card--user">
            <header class="admin-detail-card__header">
              <div class="admin-detail-card__identity">
                <p class="admin-detail-card__title">{{ selectedUser.username }}</p>
                <div class="admin-record-row__badges">
                  <span class="admin-role-badge" :class="`admin-role-badge--${selectedUser.role}`">
                    {{ selectedUser.role }}
                  </span>
                  <span class="admin-status-badge" :class="userLifecycleBadgeClass(selectedUser.lifecycleState)">
                    {{ selectedUser.lifecycleState }}
                  </span>
                </div>
              </div>
            </header>

            <div v-if="selectedUserIsSelfOwner" class="admin-guardrail-alert">
              <InlineAlert tone="warning">
                You can't suspend or deprovision your own owner account.
              </InlineAlert>
            </div>
            <p class="module-empty-hint">{{ userActionAvailabilityMessage }}</p>
            <div
              v-if="showSuspendAction || showReactivateAction || showDeprovisionAction"
              class="admin-detail-card__actions admin-detail-card__actions--users"
            >
              <PrimaryButton
                v-if="showSuspendAction"
                type="button"
                @click="promptUserMutation('suspend', selectedUser)"
              >
                Suspend
              </PrimaryButton>
              <SecondaryButton
                v-if="showReactivateAction"
                type="button"
                @click="promptUserMutation('reactivate', selectedUser)"
              >
                Reactivate
              </SecondaryButton>
              <DangerButton
                v-if="showDeprovisionAction"
                type="button"
                @click="promptUserMutation('deprovision', selectedUser)"
              >
                Deprovision
              </DangerButton>
            </div>

            <dl class="admin-detail-meta">
              <div>
                <dt>Created at</dt>
                <dd>{{ formatDateTime(selectedUser.createdAt) }}</dd>
              </div>
              <div>
                <dt>Trusted devices</dt>
                <dd>{{ selectedUser.trustedDevicesCount }}</dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>{{ formatDateTime(selectedUserLastActivity) }}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd class="admin-detail-meta__value-with-action">
                  <span class="admin-detail-meta__mono">{{ selectedUser.userId }}</span>
                  <IconButton
                    label="Copy user id"
                    @click="copyValue(selectedUser.userId, 'User ID copied')"
                  >
                    <AppIcon name="copy" :size="16" />
                  </IconButton>
                </dd>
              </div>
            </dl>
          </section>

          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <h2>Lifecycle impact</h2>
            </header>
            <ul class="admin-guidance-list">
              <li>Suspend blocks new remote authentications and enforces active-session policy.</li>
              <li>Reactivate restores operational access.</li>
              <li>Deprovision is irreversible in V1 and transitions trusted devices immediately.</li>
            </ul>
          </section>

          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <h2>Related audit events</h2>
            </header>
            <ul v-if="userAuditSnippet.length > 0" class="admin-activity-list">
              <li v-for="event in userAuditSnippet" :key="`user-event-${event.eventId}`" class="admin-activity-row">
                <button class="admin-activity-row__button" type="button" @click="openAuditDetail(event.eventId)">
                  <p class="admin-activity-row__title">{{ humanizeAuditEventType(event.eventType) }}</p>
                  <p class="admin-activity-row__meta">
                    {{ humanizeAuditResult(event.result) }} · {{ formatRelative(event.createdAt) }}
                  </p>
                </button>
              </li>
            </ul>
            <div v-else class="admin-empty-with-action">
              <p class="module-empty-hint">No user lifecycle events yet.</p>
              <SecondaryButton type="button" @click="navigateToSection('audit')">View full audit</SecondaryButton>
            </div>
          </section>
        </template>
        <section v-else-if="filteredUsers.length === 0" class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>No invited users yet</h2>
          </header>
          <p class="page-subtitle">
            New users appear here after onboarding with a valid invite.
          </p>
          <div class="admin-quick-actions">
            <PrimaryButton type="button" @click="openCreateInvite">
              <AppIcon name="plus" :size="18" />
              <span>Create first invite</span>
            </PrimaryButton>
          </div>
        </section>
        <EmptyState
          v-else
          title="Select a user"
          description="Choose a user to inspect lifecycle state and available actions."
        />
      </template>
      <template v-else>
        <template v-if="selectedAuditEvent">
          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <div class="admin-detail-card__identity">
                <p class="admin-detail-card__title">{{ humanizeAuditEventType(selectedAuditEvent.eventType) }}</p>
                <span class="admin-status-badge" :class="auditResultBadgeClass(selectedAuditEvent.result)">
                  {{ humanizeAuditResult(selectedAuditEvent.result) }}
                </span>
              </div>
              <div class="admin-detail-card__actions">
                <SecondaryButton
                  type="button"
                  :disabled="!selectedAuditEvent.requestId"
                  @click="copyRequestId(selectedAuditEvent.requestId)"
                >
                  Copy request ID
                </SecondaryButton>
              </div>
            </header>

            <dl class="admin-detail-meta">
              <div>
                <dt>Actor</dt>
                <dd>{{ selectedAuditEvent.actorUserId ?? 'system' }}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{{ formatDateTime(selectedAuditEvent.createdAt) }}</dd>
              </div>
              <div>
                <dt>Event type</dt>
                <dd>{{ selectedAuditEvent.eventType }}</dd>
              </div>
              <div>
                <dt>Reason code</dt>
                <dd>{{ selectedAuditEvent.reasonCode ?? '—' }}</dd>
              </div>
              <div>
                <dt>Request ID</dt>
                <dd class="admin-detail-meta__value-with-action">
                  <span class="admin-detail-meta__mono">{{ selectedAuditEvent.requestId ?? '—' }}</span>
                  <IconButton
                    label="Copy request id"
                    :disabled="!selectedAuditEvent.requestId"
                    @click="copyRequestId(selectedAuditEvent.requestId)"
                  >
                    <AppIcon name="copy" :size="16" />
                  </IconButton>
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd class="admin-detail-meta__value-with-action">
                  <span class="admin-detail-meta__mono">
                    {{ selectedAuditEvent.targetType }}
                    <template v-if="selectedAuditEvent.targetId">: {{ selectedAuditEvent.targetId }}</template>
                  </span>
                  <IconButton
                    label="Copy target"
                    :disabled="!selectedAuditEvent.targetId"
                    @click="copyValue(selectedAuditEvent.targetId, 'Target copied')"
                  >
                    <AppIcon name="copy" :size="16" />
                  </IconButton>
                </dd>
              </div>
              <div>
                <dt>IP hash</dt>
                <dd class="admin-detail-meta__value-with-action">
                  <span class="admin-detail-meta__mono">{{ selectedAuditEvent.ipHash ?? '—' }}</span>
                  <IconButton
                    label="Copy ip hash"
                    :disabled="!selectedAuditEvent.ipHash"
                    @click="copyValue(selectedAuditEvent.ipHash, 'IP hash copied')"
                  >
                    <AppIcon name="copy" :size="16" />
                  </IconButton>
                </dd>
              </div>
              <div>
                <dt>User agent hash</dt>
                <dd class="admin-detail-meta__value-with-action">
                  <span class="admin-detail-meta__mono">{{ selectedAuditEvent.userAgentHash ?? '—' }}</span>
                  <IconButton
                    label="Copy user agent hash"
                    :disabled="!selectedAuditEvent.userAgentHash"
                    @click="copyValue(selectedAuditEvent.userAgentHash, 'User agent hash copied')"
                  >
                    <AppIcon name="copy" :size="16" />
                  </IconButton>
                </dd>
              </div>
            </dl>
          </section>

          <section class="admin-detail-card">
            <header class="admin-detail-card__header">
              <h2>Actions</h2>
            </header>
            <div class="admin-quick-actions">
              <SecondaryButton type="button" @click="filterSimilarAuditEvents(selectedAuditEvent)">
                Filter similar events
              </SecondaryButton>
              <SecondaryButton
                type="button"
                :disabled="!selectedAuditEvent.targetId"
                @click="viewRelatedTarget(selectedAuditEvent)"
              >
                View related target
              </SecondaryButton>
            </div>
          </section>
        </template>
        <section v-else-if="filteredAuditEvents.length === 0" class="admin-detail-card">
          <header class="admin-detail-card__header">
            <h2>No events for current filters</h2>
          </header>
          <p class="page-subtitle">
            Adjust filters to inspect operational history.
          </p>
          <div class="admin-quick-actions">
            <SecondaryButton type="button" @click="clearCurrentSectionFilters">Clear filters</SecondaryButton>
          </div>
        </section>
        <EmptyState
          v-else
          title="Select an event"
          description="Choose an audit row to inspect request identifiers and reason codes."
        />
      </template>
    </aside>
  </section>

  <!-- DIALOGS -->
  <DialogModal :open="mutationDialog.open" :title="mutationDialog.title">
    <p class="page-subtitle">{{ mutationDialog.description }}</p>
    <template #actions>
      <SecondaryButton type="button" :disabled="mutationDialog.running" @click="closeMutationDialog">
        Cancel
      </SecondaryButton>
      <DangerButton
        v-if="mutationDialog.tone === 'danger'"
        type="button"
        :disabled="mutationDialog.running"
        @click="confirmMutationDialog"
      >
        {{ mutationDialog.confirmLabel }}
      </DangerButton>
      <PrimaryButton
        v-else
        type="button"
        :disabled="mutationDialog.running"
        @click="confirmMutationDialog"
      >
        {{ mutationDialog.confirmLabel }}
      </PrimaryButton>
    </template>
  </DialogModal>

  <DialogModal :open="reauthModalOpen" title="Confirm your master password">
    <div class="form-stack">
      <p class="page-subtitle">
        Enter your master password to continue this administrative action.
      </p>
      <SecretField
        ref="reauthFieldRef"
        v-model="reauthPassword"
        label="Master password"
        autocomplete="current-password"
        :show-copy="false"
      />
      <InlineAlert v-if="reauthErrorMessage" tone="danger">
        {{ reauthErrorMessage }}
      </InlineAlert>
    </div>
    <template #actions>
      <SecondaryButton type="button" :disabled="reauthSubmitting" @click="cancelRecentReauth">
        Cancel
      </SecondaryButton>
      <PrimaryButton type="button" :disabled="reauthConfirmDisabled" @click="confirmRecentReauth">
        Confirm
      </PrimaryButton>
    </template>
  </DialogModal>

  <DialogModal :open="createInviteState.open && !isMobileViewport" :title="createInviteDialogTitle">
    <div class="form-stack">
      <template v-if="!createInviteHasDelivery">
        <p class="page-subtitle">
          Create a single-use invite for onboarding.
        </p>
        <section class="admin-policy-card">
          <p><strong>Single-use</strong> invite link</p>
          <p>Role is fixed to <strong>user</strong></p>
          <p>Link is shown only once after creation</p>
        </section>
        <label class="field">
          <span class="field__label">Expiration preset</span>
          <select v-model="createInviteState.expiryPreset" class="field__select">
            <option value="1h">1 hour</option>
            <option value="24h">24 hours (default)</option>
            <option value="7d">7 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <p class="module-empty-hint">Default expiration is 24 hours.</p>
        <label v-if="createInviteState.expiryPreset === 'custom'" class="field">
          <span class="field__label">Custom expiration</span>
          <input v-model="createInviteState.customExpiry" type="datetime-local" />
        </label>
      </template>
      <InlineAlert v-if="createInviteState.error" tone="danger">
        {{ createInviteState.error }}
      </InlineAlert>
      <section v-if="createInviteState.deliveredLink" class="admin-invite-delivery">
        <header class="admin-invite-delivery__header">
          <h2>Invite link ready</h2>
          <SecondaryButton type="button" @click="copyDeliveredInviteLink">
            {{ createInviteState.copiedAt ? 'Copied' : 'Copy' }}
          </SecondaryButton>
        </header>
        <p class="admin-invite-delivery__link" data-testid="admin-invite-delivery-link">
          {{ createInviteState.deliveredLink }}
        </p>
        <p class="module-empty-hint">
          This link is shown only once. If it is lost, revoke this invite and create a new one.
        </p>
      </section>
    </div>
    <template #actions>
      <SecondaryButton
        v-if="createInviteHasDelivery"
        type="button"
        data-testid="admin-create-invite-new"
        @click="resetCreateInviteFormForAnother"
      >
        {{ createInviteSecondaryLabel }}
      </SecondaryButton>
      <SecondaryButton
        v-else
        type="button"
        :disabled="createInviteState.submitting"
        @click="closeCreateInvite"
      >
        {{ createInviteSecondaryLabel }}
      </SecondaryButton>
      <PrimaryButton
        v-if="!createInviteHasDelivery"
        type="button"
        :disabled="createInviteSubmitDisabled"
        data-testid="admin-create-invite-submit"
        @click="submitCreateInvite"
      >
        {{ createInvitePrimaryLabel }}
      </PrimaryButton>
      <PrimaryButton
        v-if="createInviteHasDelivery"
        type="button"
        data-testid="admin-create-invite-done"
        @click="closeCreateInvite"
      >
        Done
      </PrimaryButton>
    </template>
  </DialogModal>

  <!-- MOBILE SHEETS -->
  <div
    v-if="isMobileViewport && createInviteState.open"
    class="mobile-sheet-backdrop"
    role="presentation"
    @click="handleMobileCreateInviteBackdropClose"
  >
    <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="Create invite">
      <header class="mobile-sheet__header">
        <h2>{{ createInviteDialogTitle }}</h2>
        <SecondaryButton type="button" @click="closeCreateInvite">Close</SecondaryButton>
      </header>
      <div v-if="!createInviteHasDelivery" class="mobile-sheet__section">
        <section class="admin-policy-card">
          <p><strong>Single-use</strong> invite link</p>
          <p>Role is fixed to <strong>user</strong></p>
          <p>Link is shown only once after creation</p>
        </section>
        <label class="field">
          <span class="field__label">Expiration preset</span>
          <select v-model="createInviteState.expiryPreset" class="field__select">
            <option value="1h">1 hour</option>
            <option value="24h">24 hours (default)</option>
            <option value="7d">7 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label v-if="createInviteState.expiryPreset === 'custom'" class="field">
          <span class="field__label">Custom expiration</span>
          <input v-model="createInviteState.customExpiry" type="datetime-local" />
        </label>
        <InlineAlert v-if="createInviteState.error" tone="danger">
          {{ createInviteState.error }}
        </InlineAlert>
      </div>
      <div v-if="createInviteState.deliveredLink" class="mobile-sheet__section">
        <p class="field__label">Invite link</p>
        <p class="admin-invite-delivery__link">{{ createInviteState.deliveredLink }}</p>
        <div class="mobile-sheet__options">
          <SecondaryButton type="button" @click="copyDeliveredInviteLink">
            {{ createInviteState.copiedAt ? 'Copied' : 'Copy link' }}
          </SecondaryButton>
          <SecondaryButton type="button" @click="resetCreateInviteFormForAnother">Create another</SecondaryButton>
        </div>
        <p class="module-empty-hint">
          This link is shown only once. Revoke and create a new invite if needed.
        </p>
      </div>
      <footer class="mobile-sheet__footer">
        <PrimaryButton
          type="button"
          :disabled="createInviteHasDelivery ? false : createInviteSubmitDisabled"
          @click="submitCreateInvite"
        >
          {{ createInvitePrimaryLabel }}
        </PrimaryButton>
      </footer>
    </section>
  </div>

  <div
    v-if="mobileFilterSheetOpen"
    class="mobile-sheet-backdrop"
    role="presentation"
    @click.self="closeFiltersSheet"
  >
    <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="Filters">
      <header class="mobile-sheet__header">
        <h2>Filters</h2>
        <SecondaryButton type="button" @click="closeFiltersSheet">Done</SecondaryButton>
      </header>

      <div v-if="activeSection === 'invites'" class="mobile-sheet__section">
        <p class="mobile-sheet__section-title">Invite status</p>
        <SegmentedControl v-model="inviteStatusFilter" :options="inviteStatusOptions" />
      </div>

      <div v-if="activeSection === 'users'" class="mobile-sheet__section">
        <p class="mobile-sheet__section-title">Lifecycle</p>
        <SegmentedControl v-model="userLifecycleFilter" :options="userLifecycleOptions" />
      </div>

      <div v-if="activeSection === 'audit'" class="mobile-sheet__section">
        <p class="mobile-sheet__section-title">Result</p>
        <SegmentedControl v-model="auditResultFilter" :options="auditResultOptions" />
      </div>

      <div v-if="activeSection === 'audit'" class="mobile-sheet__section">
        <p class="mobile-sheet__section-title">Event type</p>
        <label class="field">
          <span class="field__label">Type</span>
          <select v-model="auditTypeFilter" class="field__select">
            <option v-for="option in auditEventTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <footer class="mobile-sheet__footer">
        <SecondaryButton type="button" @click="clearCurrentSectionFilters">Clear all</SecondaryButton>
      </footer>
    </section>
  </div>

  <ToastMessage v-if="toastMessage" :message="toastMessage" />
</template>
