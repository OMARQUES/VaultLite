<script setup lang="ts">
import type { DeviceSummary } from '@vaultlite/contracts';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useRoute, useRouter } from 'vue-router';

import DangerButton from '../components/ui/DangerButton.vue';
import DataPortabilitySection from '../components/settings/DataPortabilitySection.vue';
import DialogModal from '../components/ui/DialogModal.vue';
import InlineAlert from '../components/ui/InlineAlert.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import SecretField from '../components/ui/SecretField.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import { useSessionStore } from '../composables/useSessionStore';
import { triggerJsonDownload } from '../lib/browser-download';
import { toHumanErrorMessage } from '../lib/human-error';
import {
  importManualSiteIconFromFile,
  importManualSiteIconFromUrl,
  listManualSiteIcons,
  sanitizeIconHost,
} from '../lib/manual-site-icons';

const sessionStore = useSessionStore();
const router = useRouter();
const route = useRoute();
const props = withDefaults(
  defineProps<{
    section?: 'overview' | 'security' | 'devices' | 'extension' | 'data' | 'advanced';
  }>(),
  {
    section: 'overview',
  },
);
const errorMessage = ref<string | null>(null);
const toastMessage = ref('');
const busyStep = ref<'reissue' | 'devices' | 'revoke' | 'rotate' | null>(null);
const lastReissuedAt = ref<string | null>(null);
const devices = ref<DeviceSummary[]>([]);
const lastDevicesRefreshAt = ref<string | null>(null);
const revokeDialogOpen = ref(false);
const revokeTargetDevice = ref<DeviceSummary | null>(null);
const revokePassword = ref('');
const revokeErrorMessage = ref<string | null>(null);
const rotateCurrentPassword = ref('');
const rotateNextPassword = ref('');
const rotateConfirmPassword = ref('');
const rotateErrorMessage = ref<string | null>(null);
const extensionLinkRequests = ref<
  Array<{
    requestId: string;
    status: 'pending' | 'approved' | 'rejected' | 'consumed' | 'expired';
    shortCode: string;
    fingerprintPhrase: string;
    deviceNameHint: string | null;
    createdAt: string;
    expiresAt: string;
    approvedAt: string | null;
  }>
>([]);
const extensionLinkErrorMessage = ref<string | null>(null);
const extensionLinkBusyRequestId = ref<string | null>(null);
const extensionLinkBusyAction = ref<'approve' | 'reject' | 'refresh' | null>(null);
const extensionLinkModalOpen = ref(false);
const extensionLinkModalRequest = ref<{
  requestId: string;
  shortCode: string;
  fingerprintPhrase: string;
  deviceNameHint: string | null;
  createdAt: string;
  expiresAt: string;
} | null>(null);
const extensionLinkModalAction = ref<'approve' | 'reject'>('approve');
const extensionLinkModalPassword = ref('');
const extensionLinkModalRequiresPassword = ref(false);
const extensionLinkModalErrorMessage = ref<string | null>(null);
const extensionLinkAutoOpenedRequestCode = ref<string | null>(null);
let extensionLinkAutoRefreshTimer: number | null = null;
let extensionLinkAutoRefreshBackoffMs = 10_000;
const EXTENSION_LINK_AUTO_REFRESH_MIN_MS = 10_000;
const EXTENSION_LINK_AUTO_REFRESH_MAX_MS = 60_000;
const runtimeMetadata = ref<{
  serverUrl: string;
  deploymentFingerprint: string;
} | null>(null);
const securityTab = ref<'session' | 'password' | 'account_kit'>('session');
const iconHostInput = ref('');
const iconUrlInput = ref('');
const iconFileInput = ref<HTMLInputElement | null>(null);
const manualIcons = ref<Array<{ host: string; dataUrl: string; updatedAt: string; source: 'url' | 'file' }>>([]);
const iconBusy = ref(false);
const iconErrorMessage = ref<string | null>(null);
let legacyManualIconsMigrated = false;
const bridgePendingRequests = new Map<
  string,
  {
    timeoutId: number;
    resolve: (value: { ok: true }) => void;
    reject: (error: Error & { code?: string }) => void;
  }
>();
const autoLockOptions = [
  { label: '1 minute', value: 60 * 1000 },
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '10 minutes', value: 10 * 60 * 1000 },
  { label: '15 minutes', value: 15 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
] as const;
const selectedAutoLockAfterMs = ref(String(sessionStore.state.autoLockAfterMs));

const BRIDGE_REQUEST_TYPE = 'vaultlite.bridge.request';
const BRIDGE_RESPONSE_TYPE = 'vaultlite.bridge.response';
const BRIDGE_PROTOCOL_VERSION = 1;
const BRIDGE_WEB_SOURCE = 'vaultlite-webapp';
const BRIDGE_EXTENSION_SOURCE = 'vaultlite-extension-bridge';
const BRIDGE_REQUEST_TIMEOUT_MS = 8_000;

const surfaceError = computed(() => errorMessage.value ?? sessionStore.state.lastError);
const reissueLabel = computed(() =>
  busyStep.value === 'reissue' ? 'Reissuing Account Kit...' : 'Reissue Account Kit',
);
const extensionDevices = computed(() =>
  devices.value.filter((device) => String(device.platform).toLowerCase() === 'extension'),
);
const activeDevicesCount = computed(() =>
  devices.value.filter((device) => device.deviceState === 'active').length,
);
const showOverviewSection = computed(() => props.section === 'overview');
const showSecuritySection = computed(() => props.section === 'security');
const showDevicesSection = computed(() => props.section === 'devices');
const showExtensionSection = computed(() => props.section === 'extension');
const showDataSection = computed(() => props.section === 'data');
const showAdvancedSection = computed(() => props.section === 'advanced');
const showSecuritySession = computed(() => securityTab.value === 'session');
const showSecurityPassword = computed(() => securityTab.value === 'password');
const showSecurityAccountKit = computed(() => securityTab.value === 'account_kit');
const lastReissuedLabel = computed(() => {
  if (!lastReissuedAt.value) return 'No reissue performed in this session.';
  return formatDateTime(lastReissuedAt.value);
});
const devicesBusy = computed(() => busyStep.value === 'devices');
const revokeBusy = computed(() => busyStep.value === 'revoke');
const rotateBusy = computed(() => busyStep.value === 'rotate');
const extensionLinkBusy = computed(() => extensionLinkBusyAction.value !== null);
const extensionLinkModalBusy = computed(
  () =>
    extensionLinkBusyAction.value === 'approve' || extensionLinkBusyAction.value === 'reject',
);
const targetRequestCode = computed(() => {
  const raw = typeof route.query.requestCode === 'string' ? route.query.requestCode.trim().toUpperCase() : '';
  if (!/^[A-Z2-7]{8}$/u.test(raw)) {
    return null;
  }
  return raw;
});
const manualIconHostFromQuery = computed(() => {
  const raw =
    typeof route.query.manualIconHost === 'string' ? route.query.manualIconHost.trim() : '';
  return raw ? sanitizeIconHost(raw) : null;
});
const pendingExtensionLinkRequests = computed(() => {
  const pending = extensionLinkRequests.value.filter((entry) => entry.status === 'pending');
  const targetCode = targetRequestCode.value;
  if (!targetCode) {
    return pending;
  }
  return [...pending].sort((left, right) => {
    const leftScore = left.shortCode === targetCode ? 0 : 1;
    const rightScore = right.shortCode === targetCode ? 0 : 1;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
});
const hasPendingTargetRequest = computed(() => {
  const targetCode = targetRequestCode.value;
  if (!targetCode) {
    return false;
  }
  return pendingExtensionLinkRequests.value.some((entry) => entry.shortCode === targetCode);
});
const rotateSubmitDisabled = computed(() => {
  if (rotateBusy.value) {
    return true;
  }
  if (!rotateCurrentPassword.value || !rotateNextPassword.value || !rotateConfirmPassword.value) {
    return true;
  }
  if (rotateNextPassword.value !== rotateConfirmPassword.value) {
    return true;
  }
  if (rotateCurrentPassword.value === rotateNextPassword.value) {
    return true;
  }
  return false;
});
const devicesRefreshLabel = computed(() => {
  if (!lastDevicesRefreshAt.value) {
    return 'Device list has not been refreshed yet.';
  }
  return `Last refreshed: ${formatDateTime(lastDevicesRefreshAt.value)}`;
});
const rotationHint = computed(() => {
  if (rotateNextPassword.value.length > 0 && rotateNextPassword.value.length < 8) {
    return 'Use at least 8 characters for the new password.';
  }
  if (rotateCurrentPassword.value && rotateCurrentPassword.value === rotateNextPassword.value) {
    return 'New password must be different from the current password.';
  }
  if (rotateConfirmPassword.value && rotateConfirmPassword.value !== rotateNextPassword.value) {
    return 'New password confirmation does not match.';
  }
  return null;
});

function clearExtensionLinkAutoRefreshTimer() {
  if (extensionLinkAutoRefreshTimer !== null) {
    window.clearTimeout(extensionLinkAutoRefreshTimer);
    extensionLinkAutoRefreshTimer = null;
  }
}

function scheduleExtensionLinkAutoRefresh(delayMs = extensionLinkAutoRefreshBackoffMs) {
  clearExtensionLinkAutoRefreshTimer();
  extensionLinkAutoRefreshTimer = window.setTimeout(() => {
    if (extensionLinkBusy.value) {
      scheduleExtensionLinkAutoRefresh();
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      scheduleExtensionLinkAutoRefresh();
      return;
    }
    void refreshExtensionLinkRequests();
  }, Math.max(2_000, delayMs));
}

function startExtensionLinkAutoRefresh() {
  extensionLinkAutoRefreshBackoffMs = EXTENSION_LINK_AUTO_REFRESH_MIN_MS;
  scheduleExtensionLinkAutoRefresh(1_000);
}

function handleSettingsVisibilityChange() {
  if (!showExtensionSection.value) {
    return;
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    extensionLinkAutoRefreshBackoffMs = EXTENSION_LINK_AUTO_REFRESH_MIN_MS;
    scheduleExtensionLinkAutoRefresh(500);
  }
}

watch(
  () => sessionStore.state.autoLockAfterMs,
  (nextValue) => {
    selectedAutoLockAfterMs.value = String(nextValue);
  },
);

onMounted(() => {
  window.addEventListener('message', handleBridgeResponseEvent as EventListener);
  document.addEventListener('visibilitychange', handleSettingsVisibilityChange);
  void refreshDevices();
  void refreshRuntimeMetadata();
  void sessionStore.refreshSessionPolicy().catch(() => undefined);
  void refreshExtensionLinkRequests();
  void refreshManualIcons();
  if (showExtensionSection.value) {
    startExtensionLinkAutoRefresh();
  }
  if (showAdvancedSection.value && manualIconHostFromQuery.value) {
    iconHostInput.value = manualIconHostFromQuery.value;
  }
});

onUnmounted(() => {
  window.removeEventListener('message', handleBridgeResponseEvent as EventListener);
  document.removeEventListener('visibilitychange', handleSettingsVisibilityChange);
  clearBridgePendingRequests();
  clearExtensionLinkAutoRefreshTimer();
});

watch(
  () => route.query.requestCode,
  () => {
    extensionLinkAutoOpenedRequestCode.value = null;
    if (showExtensionSection.value) {
      void refreshExtensionLinkRequests();
    }
  },
);

watch(
  () => route.query.manualIconHost,
  () => {
    if (!showAdvancedSection.value) {
      return;
    }
    if (manualIconHostFromQuery.value) {
      iconHostInput.value = manualIconHostFromQuery.value;
    }
  },
);

watch(
  () => props.section,
  (nextSection) => {
    if (nextSection !== 'security') {
      if (nextSection === 'extension') {
        startExtensionLinkAutoRefresh();
        return;
      }
      if (nextSection === 'advanced' && manualIconHostFromQuery.value) {
        iconHostInput.value = manualIconHostFromQuery.value;
      }
      clearExtensionLinkAutoRefreshTimer();
      return;
    }
    clearExtensionLinkAutoRefreshTimer();
    securityTab.value = 'session';
  },
);

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function showToast(message: string) {
  toastMessage.value = message;
  window.setTimeout(() => {
    if (toastMessage.value === message) {
      toastMessage.value = '';
    }
  }, 1800);
}

function isRecentReauthRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('recent_reauth_required');
}

function nextBridgeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bridge_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function clearBridgePendingRequests() {
  for (const [, pending] of bridgePendingRequests) {
    window.clearTimeout(pending.timeoutId);
  }
  bridgePendingRequests.clear();
}

function parseBridgeResponsePayload(
  payload: unknown,
): { requestId: string; ok: boolean; code?: string; message?: string } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.type !== BRIDGE_RESPONSE_TYPE || record.version !== BRIDGE_PROTOCOL_VERSION) {
    return null;
  }
  if (record.source !== BRIDGE_EXTENSION_SOURCE) {
    return null;
  }
  if (typeof record.requestId !== 'string' || record.requestId.length < 8 || record.requestId.length > 128) {
    return null;
  }
  if (typeof record.ok !== 'boolean') {
    return null;
  }
  if (record.code != null && typeof record.code !== 'string') {
    return null;
  }
  if (record.message != null && typeof record.message !== 'string') {
    return null;
  }
  return {
    requestId: record.requestId,
    ok: record.ok,
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

function handleBridgeResponseEvent(rawEvent: Event) {
  const event = rawEvent as MessageEvent;
  if (event.source !== window) {
    return;
  }
  if (event.origin !== window.location.origin) {
    return;
  }

  const parsed = parseBridgeResponsePayload(event.data);
  if (!parsed) {
    return;
  }

  const pending = bridgePendingRequests.get(parsed.requestId);
  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeoutId);
  bridgePendingRequests.delete(parsed.requestId);
  if (parsed.ok) {
    pending.resolve({ ok: true });
    return;
  }

  const error = new Error(parsed.message ?? 'Extension auto connect failed.') as Error & { code?: string };
  error.code = parsed.code ?? 'bridge_failed';
  pending.reject(error);
}

function postBridgeRequest(
  input:
    | {
        action: 'link.poll';
        requestId: string;
      }
    | {
        action: 'popup.open';
      },
) {
  const requestId = nextBridgeRequestId();
  const targetOrigin = window.location.origin;

  const responsePromise = new Promise<{ ok: true }>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      bridgePendingRequests.delete(requestId);
      const timeoutError = new Error('Automatic extension bridge timed out.') as Error & { code?: string };
      timeoutError.code = 'background_timeout';
      reject(timeoutError);
    }, BRIDGE_REQUEST_TIMEOUT_MS);
    bridgePendingRequests.set(requestId, {
      timeoutId,
      resolve,
      reject,
    });
  });

  window.postMessage(
    {
      type: BRIDGE_REQUEST_TYPE,
      version: BRIDGE_PROTOCOL_VERSION,
      source: BRIDGE_WEB_SOURCE,
      requestId,
      action: input.action,
      payload:
        input.action === 'link.poll'
          ? {
              requestId: input.requestId,
            }
          : {},
    },
    targetOrigin,
  );

  return responsePromise;
}

function postBridgeLinkPollRequest(input: { requestId: string }) {
  return postBridgeRequest({
    action: 'link.poll',
    requestId: input.requestId,
  });
}

function postBridgeOpenPopupRequest() {
  return postBridgeRequest({
    action: 'popup.open',
  });
}

async function refreshRuntimeMetadata() {
  try {
    runtimeMetadata.value = await sessionStore.getRuntimeMetadata();
  } catch {
    runtimeMetadata.value = null;
  }
}

function downloadJson(filename: string, value: unknown) {
  triggerJsonDownload({
    filename,
    value,
  });
}

async function lockNow() {
  sessionStore.lock();
  await router.push('/unlock');
}

async function updateAutoLockSetting() {
  const parsedValue = Number.parseInt(selectedAutoLockAfterMs.value, 10);
  if (!Number.isFinite(parsedValue)) {
    return;
  }

  try {
    await sessionStore.updateSessionPolicy({
      unlockIdleTimeoutMs: parsedValue,
    });
    showToast('Lock timeout updated');
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
    selectedAutoLockAfterMs.value = String(sessionStore.state.autoLockAfterMs);
  }
}

async function refreshDevices() {
  errorMessage.value = null;
  busyStep.value = 'devices';
  try {
    const response = await sessionStore.listDevices();
    devices.value = response.devices;
    lastDevicesRefreshAt.value = new Date().toISOString();
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyStep.value = null;
  }
}

async function refreshExtensionLinkRequests() {
  extensionLinkErrorMessage.value = null;
  extensionLinkBusyAction.value = 'refresh';
  extensionLinkBusyRequestId.value = null;
  try {
    const response = await sessionStore.listExtensionLinkPending();
    extensionLinkRequests.value = response.requests;
    const targetCode = targetRequestCode.value;
    if (targetCode && !extensionLinkModalOpen.value && extensionLinkAutoOpenedRequestCode.value !== targetCode) {
      const targetRequest =
        response.requests.find((entry) => entry.status === 'pending' && entry.shortCode === targetCode) ?? null;
      if (targetRequest) {
        openExtensionLinkDecisionModal(targetRequest.requestId, 'approve');
        extensionLinkAutoOpenedRequestCode.value = targetCode;
      }
    }
    if (
      extensionLinkModalOpen.value &&
      extensionLinkModalRequest.value &&
      !response.requests.some(
        (entry) =>
          entry.requestId === extensionLinkModalRequest.value?.requestId && entry.status === 'pending',
      )
    ) {
      closeExtensionLinkDecisionModal();
    }
    extensionLinkAutoRefreshBackoffMs = EXTENSION_LINK_AUTO_REFRESH_MIN_MS;
  } catch (error) {
    extensionLinkErrorMessage.value = toHumanErrorMessage(error);
    extensionLinkAutoRefreshBackoffMs = Math.min(
      EXTENSION_LINK_AUTO_REFRESH_MAX_MS,
      Math.max(EXTENSION_LINK_AUTO_REFRESH_MIN_MS, extensionLinkAutoRefreshBackoffMs * 2),
    );
  } finally {
    extensionLinkBusyAction.value = null;
    extensionLinkBusyRequestId.value = null;
    if (showExtensionSection.value) {
      scheduleExtensionLinkAutoRefresh();
    }
  }
}

function openExtensionLinkDecisionModal(requestId: string, action: 'approve' | 'reject') {
  const request = pendingExtensionLinkRequests.value.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    extensionLinkErrorMessage.value = 'The selected request is no longer pending. Refresh and try again.';
    return;
  }
  extensionLinkModalRequest.value = request;
  extensionLinkModalAction.value = action;
  extensionLinkModalOpen.value = true;
  extensionLinkModalPassword.value = '';
  extensionLinkModalRequiresPassword.value = false;
  extensionLinkModalErrorMessage.value = null;
}

function closeExtensionLinkDecisionModal() {
  extensionLinkModalOpen.value = false;
  extensionLinkModalRequest.value = null;
  extensionLinkModalAction.value = 'approve';
  extensionLinkModalPassword.value = '';
  extensionLinkModalRequiresPassword.value = false;
  extensionLinkModalErrorMessage.value = null;
}

async function executeExtensionLinkAction(
  action: 'approve' | 'reject',
  requestId: string,
): Promise<void> {
  if (action === 'approve') {
    await sessionStore.approveExtensionLink({
      requestId,
    });
    try {
      await postBridgeLinkPollRequest({ requestId });
      await postBridgeOpenPopupRequest();
    } catch {
      // Best-effort acceleration: extension popup/manual polling remains fallback.
    }
    showToast('Connection request approved');
    await Promise.all([refreshExtensionLinkRequests(), refreshDevices()]);
    return;
  }

  await sessionStore.rejectExtensionLink({
    requestId,
    rejectionReasonCode: 'user_rejected',
  });
  showToast('Connection request rejected');
  await refreshExtensionLinkRequests();
}

async function confirmExtensionLinkDecision() {
  const request = extensionLinkModalRequest.value;
  if (!request) {
    return;
  }

  extensionLinkErrorMessage.value = null;
  extensionLinkModalErrorMessage.value = null;
  extensionLinkBusyAction.value = extensionLinkModalAction.value;
  extensionLinkBusyRequestId.value = request.requestId;
  try {
    if (extensionLinkModalRequiresPassword.value) {
      if (!extensionLinkModalPassword.value) {
        extensionLinkModalErrorMessage.value = 'Enter your current password to continue.';
        return;
      }
      await sessionStore.confirmRecentReauth({
        password: extensionLinkModalPassword.value,
      });
      extensionLinkModalPassword.value = '';
      extensionLinkModalRequiresPassword.value = false;
    }

    await executeExtensionLinkAction(extensionLinkModalAction.value, request.requestId);
    closeExtensionLinkDecisionModal();
  } catch (error) {
    if (isRecentReauthRequiredError(error)) {
      extensionLinkModalRequiresPassword.value = true;
      extensionLinkModalErrorMessage.value = 'Confirm your current password to continue.';
      return;
    }
    const message = toHumanErrorMessage(error);
    extensionLinkModalErrorMessage.value = message;
    extensionLinkErrorMessage.value = message;
  } finally {
    extensionLinkBusyAction.value = null;
    extensionLinkBusyRequestId.value = null;
  }
}

async function reissueAccountKit() {
  errorMessage.value = null;
  busyStep.value = 'reissue';

  try {
    const accountKit = await sessionStore.reissueAccountKit();
    downloadJson(`${accountKit.payload.username}-account-kit.json`, accountKit);
    lastReissuedAt.value = new Date().toISOString();
    showToast('Account Kit reissued');
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyStep.value = null;
  }
}

function openRevokeDialog(device: DeviceSummary) {
  revokeTargetDevice.value = device;
  revokePassword.value = '';
  revokeErrorMessage.value = null;
  revokeDialogOpen.value = true;
}

function closeRevokeDialog() {
  revokeDialogOpen.value = false;
  revokeTargetDevice.value = null;
  revokePassword.value = '';
  revokeErrorMessage.value = null;
}

async function migrateLegacyManualIconsToServerIfNeeded() {
  if (legacyManualIconsMigrated) {
    return;
  }
  legacyManualIconsMigrated = true;
  const legacyMap = listManualSiteIcons(sessionStore.state.username);
  const entries = Object.entries(legacyMap);
  if (entries.length === 0) {
    return;
  }
  for (const [host, record] of entries) {
    const safeHost = sanitizeIconHost(host);
    if (!safeHost || typeof record?.dataUrl !== 'string') {
      continue;
    }
    try {
      await sessionStore.upsertManualSiteIcon({
        domain: safeHost,
        dataUrl: record.dataUrl,
        source: record.source === 'file' ? 'file' : 'url',
      });
    } catch {
      // Best-effort migration; local fallback remains available.
    }
  }
}

async function refreshManualIcons() {
  try {
    await migrateLegacyManualIconsToServerIfNeeded();
    const response = await sessionStore.listManualSiteIcons();
    if (response.status === 'not_modified') {
      return;
    }
    manualIcons.value = response.payload.icons
      .map((entry) => ({
        host: entry.domain,
        dataUrl: entry.dataUrl,
        source: entry.source,
        updatedAt: entry.updatedAt,
      }))
      .sort((left, right) => left.host.localeCompare(right.host));
  } catch {
    const map = listManualSiteIcons(sessionStore.state.username);
    manualIcons.value = Object.entries(map)
      .map(([host, record]) => ({
        host,
        dataUrl: record.dataUrl,
        source: record.source,
        updatedAt: record.updatedAt,
      }))
      .sort((left, right) => left.host.localeCompare(right.host));
  }
}

function manualIconErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'icon_host_invalid':
      return 'Host is invalid. Use a domain like example.com.';
    case 'icon_mime_not_allowed':
      return 'Icon format is not allowed. Use PNG, JPG, WEBP, or ICO.';
    case 'icon_size_limit_exceeded':
      return 'Icon is too large. Maximum is 1MB.';
    case 'icon_image_decode_failed':
      return 'Could not decode image content.';
    case 'icon_fetch_failed':
      return 'Could not fetch icon URL.';
    case 'icon_source_not_allowed':
      return 'Only HTTP/HTTPS icon URLs are allowed.';
    case 'icon_data_invalid':
      return 'Icon data is invalid after normalization.';
    default:
      return toHumanErrorMessage(error);
  }
}

async function importManualIconFromUrlAction() {
  const safeHost = sanitizeIconHost(iconHostInput.value);
  if (!safeHost) {
    iconErrorMessage.value = 'Host is invalid. Use a domain like example.com.';
    return;
  }
  if (!iconUrlInput.value.trim()) {
    iconErrorMessage.value = 'Enter an icon URL.';
    return;
  }

  iconErrorMessage.value = null;
  iconBusy.value = true;
  try {
    const dataUrl = await importManualSiteIconFromUrl(iconUrlInput.value.trim());
    await sessionStore.upsertManualSiteIcon({
      domain: safeHost,
      dataUrl,
      source: 'url',
    });
    iconUrlInput.value = '';
    await refreshManualIcons();
    showToast(`Icon saved for ${safeHost}`);
  } catch (error) {
    iconErrorMessage.value = manualIconErrorMessage(error);
  } finally {
    iconBusy.value = false;
  }
}

async function importManualIconFromFileAction() {
  const safeHost = sanitizeIconHost(iconHostInput.value);
  if (!safeHost) {
    iconErrorMessage.value = 'Host is invalid. Use a domain like example.com.';
    return;
  }
  const file = iconFileInput.value?.files?.[0] ?? null;
  if (!file) {
    iconErrorMessage.value = 'Select an icon file first.';
    return;
  }

  iconErrorMessage.value = null;
  iconBusy.value = true;
  try {
    const dataUrl = await importManualSiteIconFromFile(file);
    await sessionStore.upsertManualSiteIcon({
      domain: safeHost,
      dataUrl,
      source: 'file',
    });
    if (iconFileInput.value) {
      iconFileInput.value.value = '';
    }
    await refreshManualIcons();
    showToast(`Icon saved for ${safeHost}`);
  } catch (error) {
    iconErrorMessage.value = manualIconErrorMessage(error);
  } finally {
    iconBusy.value = false;
  }
}

async function removeManualIconAction(host: string) {
  await sessionStore.removeManualSiteIcon({ domain: host });
  await refreshManualIcons();
  showToast(`Icon removed for ${host}`);
}

async function confirmRevokeDevice() {
  if (!revokeTargetDevice.value) {
    return;
  }
  if (!revokePassword.value) {
    revokeErrorMessage.value = 'Enter your current password to confirm this action.';
    return;
  }

  revokeErrorMessage.value = null;
  errorMessage.value = null;
  busyStep.value = 'revoke';
  try {
    await sessionStore.confirmRecentReauth({
      password: revokePassword.value,
    });
    const response = await sessionStore.revokeDevice(revokeTargetDevice.value.deviceId);
    if (response.result === 'success_changed') {
      showToast('Device revoked');
    } else {
      showToast('No changes were needed');
    }
    closeRevokeDialog();
    await refreshDevices();
  } catch (error) {
    const message = toHumanErrorMessage(error);
    revokeErrorMessage.value = message;
    errorMessage.value = message;
  } finally {
    busyStep.value = null;
  }
}

async function rotatePassword() {
  if (rotateSubmitDisabled.value) {
    if (rotationHint.value) {
      rotateErrorMessage.value = rotationHint.value;
      errorMessage.value = rotationHint.value;
    }
    return;
  }

  rotateErrorMessage.value = null;
  errorMessage.value = null;
  busyStep.value = 'rotate';

  try {
    await sessionStore.rotatePassword({
      currentPassword: rotateCurrentPassword.value,
      nextPassword: rotateNextPassword.value,
    });
    rotateCurrentPassword.value = '';
    rotateNextPassword.value = '';
    rotateConfirmPassword.value = '';
    rotateErrorMessage.value = null;
    showToast('Password rotated successfully');
  } catch (error) {
    const message = toHumanErrorMessage(error);
    rotateErrorMessage.value = message;
    errorMessage.value = message;
  } finally {
    busyStep.value = null;
  }
}
</script>

<template>
  <section class="settings-page" :class="`settings-page--${props.section}`">
    <div class="settings-page__header">
      <h1 v-if="showOverviewSection">Overview</h1>
      <h1 v-else-if="showSecuritySection">Security</h1>
      <h1 v-else-if="showDevicesSection">Devices</h1>
      <h1 v-else-if="showExtensionSection">Browser extension</h1>
      <h1 v-else-if="showDataSection">Import & Export</h1>
      <h1 v-else>Advanced</h1>
    </div>

    <InlineAlert v-if="surfaceError" tone="danger">
      {{ surfaceError }}
    </InlineAlert>

    <div v-if="showOverviewSection" class="settings-stack">
      <section class="panel-card panel-card--compact settings-section settings-overview-grid">
        <article class="settings-overview-card">
          <h2>Current session</h2>
          <p class="module-empty-hint">Account: {{ sessionStore.state.username ?? 'Unknown' }}</p>
          <p class="module-empty-hint">Device: {{ sessionStore.state.deviceName ?? 'Unknown' }}</p>
          <p class="module-empty-hint">
            Auto-lock: {{
              autoLockOptions.find((option) => option.value === sessionStore.state.autoLockAfterMs)?.label ?? 'Custom'
            }}
          </p>
          <div class="form-actions settings-section__actions">
            <SecondaryButton type="button" @click="lockNow">Lock now</SecondaryButton>
          </div>
        </article>

        <article class="settings-overview-card">
          <h2>Trusted devices</h2>
          <p class="module-empty-hint">Active devices: {{ activeDevicesCount }}</p>
          <p class="module-empty-hint">Total tracked: {{ devices.length }}</p>
          <div class="form-actions settings-section__actions">
            <RouterLink class="button button--secondary" to="/settings/devices">Manage devices</RouterLink>
          </div>
        </article>

        <article class="settings-overview-card">
          <h2>Browser extension</h2>
          <p class="module-empty-hint">
            {{ extensionDevices.length > 0 ? `${extensionDevices.length} extension device(s) linked` : 'No browser extension connected yet.' }}
          </p>
          <p class="module-empty-hint">
            Connection mode: Linked Trusted Surface (recommended)
          </p>
          <div class="form-actions settings-section__actions">
            <RouterLink class="button button--secondary" to="/settings/extension">Manage extension</RouterLink>
          </div>
        </article>

        <article class="settings-overview-card">
          <h2>Password status</h2>
          <p class="module-empty-hint">Rotate password periodically to reduce risk.</p>
          <div class="form-actions settings-section__actions">
            <RouterLink class="button button--secondary" to="/settings/security">Rotate password</RouterLink>
          </div>
        </article>

        <article class="settings-overview-card">
          <h2>Account Kit</h2>
          <p class="module-empty-hint">Last reissued: {{ lastReissuedLabel }}</p>
          <div class="form-actions settings-section__actions">
            <PrimaryButton type="button" :disabled="busyStep === 'reissue'" @click="reissueAccountKit">
              {{ reissueLabel }}
            </PrimaryButton>
          </div>
        </article>

        <article class="settings-overview-card">
          <h2>Backup & export</h2>
          <p class="module-empty-hint">Manage imports, plaintext exports, and encrypted backups.</p>
          <div class="form-actions settings-section__actions">
            <RouterLink class="button button--secondary" to="/settings/data">Open data portability</RouterLink>
          </div>
        </article>
      </section>
    </div>

    <div v-else-if="showSecuritySection" class="settings-stack">
      <section class="panel-card panel-card--compact settings-section settings-security-tabs">
        <button
          type="button"
          class="button button--quiet settings-security-tabs__button"
          :class="{ 'is-active': showSecuritySession }"
          @click="securityTab = 'session'"
        >
          Session
        </button>
        <button
          type="button"
          class="button button--quiet settings-security-tabs__button"
          :class="{ 'is-active': showSecurityPassword }"
          @click="securityTab = 'password'"
        >
          Password rotation
        </button>
        <button
          type="button"
          class="button button--quiet settings-security-tabs__button"
          :class="{ 'is-active': showSecurityAccountKit }"
          @click="securityTab = 'account_kit'"
        >
          Account Kit
        </button>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <template v-if="showSecuritySession">
        <h2>Session</h2>
        <dl class="settings-meta">
          <div>
            <dt>Account</dt>
            <dd>{{ sessionStore.state.username ?? 'Unknown' }}</dd>
          </div>
          <div>
            <dt>Device</dt>
            <dd>{{ sessionStore.state.deviceName ?? 'Unknown' }}</dd>
          </div>
        </dl>
        <label class="field">
          <span class="field__label">Auto-lock after</span>
          <select
            v-model="selectedAutoLockAfterMs"
            class="field__select"
            aria-label="Auto-lock after"
            @change="updateAutoLockSetting"
          >
            <option
              v-for="option in autoLockOptions"
              :key="option.value"
              :value="String(option.value)"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" @click="lockNow">Lock now</SecondaryButton>
        </div>
        </template>

        <template v-else-if="showSecurityPassword">
          <h2>Password rotation</h2>
          <p class="module-empty-hint">
            Rotating password revokes older sessions and keeps trusted devices active.
          </p>
          <form class="form-stack" @submit.prevent="rotatePassword">
            <SecretField
              v-model="rotateCurrentPassword"
              label="Current password"
              autocomplete="current-password"
            />
            <SecretField
              v-model="rotateNextPassword"
              label="New password"
              autocomplete="new-password"
            />
            <SecretField
              v-model="rotateConfirmPassword"
              label="Confirm new password"
              autocomplete="new-password"
            />
            <InlineAlert v-if="rotationHint" tone="warning">
              {{ rotationHint }}
            </InlineAlert>
            <InlineAlert v-if="rotateErrorMessage" tone="danger">
              {{ rotateErrorMessage }}
            </InlineAlert>
            <div class="form-actions settings-section__actions">
              <PrimaryButton type="submit" :disabled="rotateSubmitDisabled">
                {{ rotateBusy ? 'Rotating...' : 'Rotate password' }}
              </PrimaryButton>
            </div>
          </form>
        </template>

        <template v-else>
          <h2>Account Kit</h2>
          <div class="warning-banner warning-banner--subtle">
            Store exported kits outside the browser. Reissuing creates a new signed export for this account.
          </div>
          <p class="module-empty-hint">Last reissued: {{ lastReissuedLabel }}</p>
          <div class="form-actions settings-section__actions">
            <PrimaryButton type="button" :disabled="busyStep === 'reissue'" @click="reissueAccountKit">
              {{ reissueLabel }}
            </PrimaryButton>
          </div>
        </template>
      </section>
    </div>

    <div v-else-if="showDevicesSection" class="settings-stack">
      <section class="panel-card panel-card--compact settings-section">
        <h2>Current device</h2>
        <dl class="settings-meta">
          <div>
            <dt>Name</dt>
            <dd>{{ sessionStore.state.deviceName ?? 'Unknown' }}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{{ sessionStore.state.lifecycleState ?? 'Unknown' }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Trusted devices</h2>
        <p class="module-empty-hint">{{ devicesRefreshLabel }}</p>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" :disabled="devicesBusy" @click="refreshDevices">
            {{ devicesBusy ? 'Refreshing...' : 'Refresh devices' }}
          </SecondaryButton>
        </div>
        <ul v-if="devices.length > 0" class="settings-device-list">
          <li v-for="device in devices" :key="device.deviceId" class="settings-device-row">
            <div class="settings-device-row__content">
              <p class="settings-device-row__title">
                {{ device.deviceName }}
                <span v-if="device.isCurrentDevice" class="settings-device-badge">Current device</span>
                <span
                  v-if="device.deviceState === 'revoked'"
                  class="settings-device-badge settings-device-badge--revoked"
                >
                  Revoked
                </span>
              </p>
              <p class="settings-device-row__meta">
                {{ device.platform }} · Created {{ formatDateTime(device.createdAt) }}
              </p>
              <p class="settings-device-row__meta">
                Última autenticação registrada: {{ formatDateTime(device.lastAuthenticatedAt) }}
              </p>
            </div>
            <div class="settings-device-row__actions">
              <DangerButton
                v-if="device.deviceState === 'active' && !device.isCurrentDevice"
                type="button"
                :disabled="revokeBusy"
                @click="openRevokeDialog(device)"
              >
                Revoke
              </DangerButton>
              <SecondaryButton
                v-else-if="device.isCurrentDevice"
                type="button"
                :disabled="true"
              >
                In use
              </SecondaryButton>
              <SecondaryButton
                v-else
                type="button"
                :disabled="true"
              >
                Revoked
              </SecondaryButton>
            </div>
          </li>
        </ul>
        <p v-else class="module-empty-hint">No trusted devices found for this account.</p>
      </section>
    </div>

    <div v-else-if="showExtensionSection" class="settings-stack">
      <section class="panel-card panel-card--compact settings-section">
        <h2>Pairing status</h2>
        <p class="module-empty-hint">
          {{ extensionDevices.length > 0 ? `${extensionDevices.length} extension device(s) linked.` : 'No browser extension connected yet.' }}
        </p>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Connect extension</h2>
        <p class="module-empty-hint">
          Open the extension popup and click <strong>Connect with trusted device</strong> to create a pending
          request. Review and approve it in the modal below.
        </p>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Pending trusted-surface requests</h2>
        <p class="module-empty-hint">
          Approve or reject new extension link requests created from untrusted browsers.
        </p>
        <InlineAlert v-if="extensionLinkErrorMessage" tone="danger">
          {{ extensionLinkErrorMessage }}
        </InlineAlert>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" :disabled="extensionLinkBusy" @click="refreshExtensionLinkRequests">
            {{ extensionLinkBusyAction === 'refresh' ? 'Refreshing...' : 'Refresh requests' }}
          </SecondaryButton>
        </div>
        <p v-if="targetRequestCode && !hasPendingTargetRequest" class="module-empty-hint">
          Waiting for request code <strong>{{ targetRequestCode }}</strong>. Keep extension popup open and click refresh.
        </p>
        <p v-if="pendingExtensionLinkRequests.length === 0" class="module-empty-hint">
          No pending trusted-surface request.
        </p>
        <ul v-else class="settings-device-list">
          <li
            v-for="request in pendingExtensionLinkRequests"
            :key="request.requestId"
            class="settings-device-row"
            :class="{ 'settings-device-row--target': targetRequestCode && request.shortCode === targetRequestCode }"
          >
            <div class="settings-device-row__content">
              <p class="settings-device-row__title">
                {{ request.deviceNameHint ?? 'VaultLite Extension' }}
                <span class="settings-device-badge">pending</span>
              </p>
              <p class="settings-device-row__meta">
                Code {{ request.shortCode }} · {{ request.fingerprintPhrase }}
              </p>
              <p class="settings-device-row__meta">
                Created {{ formatDateTime(request.createdAt) }} · Expires {{ formatDateTime(request.expiresAt) }}
              </p>
            </div>
            <div class="settings-device-row__actions">
              <PrimaryButton
                type="button"
                :disabled="extensionLinkBusy"
                @click="openExtensionLinkDecisionModal(request.requestId, 'approve')"
              >
                {{
                  extensionLinkBusyAction === 'approve' && extensionLinkBusyRequestId === request.requestId
                    ? 'Approving...'
                    : 'Approve'
                }}
              </PrimaryButton>
              <DangerButton
                type="button"
                :disabled="extensionLinkBusy"
                @click="openExtensionLinkDecisionModal(request.requestId, 'reject')"
              >
                {{
                  extensionLinkBusyAction === 'reject' && extensionLinkBusyRequestId === request.requestId
                    ? 'Rejecting...'
                    : 'Reject'
                }}
              </DangerButton>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Linked extension devices</h2>
        <p v-if="extensionDevices.length === 0" class="module-empty-hint">
          No linked extension device found.
        </p>
        <ul v-else class="settings-device-list">
          <li v-for="device in extensionDevices" :key="device.deviceId" class="settings-device-row">
            <div class="settings-device-row__content">
              <p class="settings-device-row__title">{{ device.deviceName }}</p>
              <p class="settings-device-row__meta">
                Created {{ formatDateTime(device.createdAt) }} · Last auth {{ formatDateTime(device.lastAuthenticatedAt) }}
              </p>
            </div>
            <div class="settings-device-row__actions">
              <DangerButton
                v-if="device.deviceState === 'active' && !device.isCurrentDevice"
                type="button"
                :disabled="revokeBusy"
                @click="openRevokeDialog(device)"
              >
                Revoke
              </DangerButton>
              <SecondaryButton v-else type="button" :disabled="true">
                {{ device.deviceState === 'active' ? 'In use' : 'Revoked' }}
              </SecondaryButton>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <div v-else-if="showDataSection" class="settings-stack">
      <DataPortabilitySection :session-store="sessionStore" @notify="showToast" />
    </div>

    <div v-else-if="showAdvancedSection" class="settings-stack">
      <section class="panel-card panel-card--compact settings-section">
        <h2>Connection diagnostics</h2>
        <dl class="settings-meta">
          <div>
            <dt>Server URL</dt>
            <dd>{{ runtimeMetadata?.serverUrl ?? 'Unavailable' }}</dd>
          </div>
          <div>
            <dt>Deployment fingerprint</dt>
            <dd>{{ runtimeMetadata?.deploymentFingerprint ?? 'Unavailable' }}</dd>
          </div>
          <div>
            <dt>Session phase</dt>
            <dd>{{ sessionStore.state.phase }}</dd>
          </div>
        </dl>
        <div class="form-actions settings-section__actions">
          <SecondaryButton type="button" :disabled="devicesBusy" @click="refreshRuntimeMetadata">
            Refresh metadata
          </SecondaryButton>
        </div>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Troubleshooting</h2>
        <p class="module-empty-hint">
          If extension pairing fails, verify server URL in extension Advanced settings and ensure API and web origins are aligned.
        </p>
      </section>

      <section class="panel-card panel-card--compact settings-section">
        <h2>Manual site icons</h2>
        <p class="module-empty-hint">
          Import icon by URL or file with MIME/size validation, normalize to 64x64, and store locally.
        </p>
        <p v-if="manualIconHostFromQuery" class="module-empty-hint">
          Editing icon for host <strong>{{ manualIconHostFromQuery }}</strong>.
        </p>
        <div class="form-stack">
          <label class="field">
            <span class="field__label">Host</span>
            <input v-model="iconHostInput" class="field__input" type="text" placeholder="example.com" />
          </label>
          <label class="field">
            <span class="field__label">Icon URL</span>
            <input
              v-model="iconUrlInput"
              class="field__input"
              type="url"
              placeholder="https://example.com/favicon.png"
            />
          </label>
          <label class="field">
            <span class="field__label">Icon file</span>
            <input
              ref="iconFileInput"
              class="field__input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon"
            />
          </label>
          <InlineAlert v-if="iconErrorMessage" tone="danger">
            {{ iconErrorMessage }}
          </InlineAlert>
          <div class="form-actions settings-section__actions">
            <SecondaryButton type="button" :disabled="iconBusy" @click="importManualIconFromUrlAction">
              {{ iconBusy ? 'Importing...' : 'Import URL' }}
            </SecondaryButton>
            <SecondaryButton type="button" :disabled="iconBusy" @click="importManualIconFromFileAction">
              {{ iconBusy ? 'Importing...' : 'Import file' }}
            </SecondaryButton>
          </div>
          <ul v-if="manualIcons.length > 0" class="settings-device-list">
            <li v-for="entry in manualIcons" :key="entry.host" class="settings-device-row">
              <div class="settings-device-row__content settings-icon-row__content">
                <img class="settings-icon-row__preview" :src="entry.dataUrl" alt="" />
                <div>
                  <p class="settings-device-row__title">{{ entry.host }}</p>
                  <p class="settings-device-row__meta">
                    Source: {{ entry.source }} · Updated {{ formatDateTime(entry.updatedAt) }}
                  </p>
                </div>
              </div>
              <div class="settings-device-row__actions">
                <DangerButton type="button" :disabled="iconBusy" @click="removeManualIconAction(entry.host)">
                  Remove
                </DangerButton>
              </div>
            </li>
          </ul>
          <p v-else class="module-empty-hint">No manual site icons stored.</p>
        </div>
      </section>
    </div>

    <DialogModal
      :open="revokeDialogOpen"
      :title="revokeTargetDevice ? `Revoke ${revokeTargetDevice.deviceName}?` : 'Revoke device'"
    >
      <p>
        Revoking a trusted device blocks new authentications for that device. Existing in-flight requests may
        finish, but all new authenticated requests after commit will be denied.
      </p>
      <SecretField
        v-model="revokePassword"
        label="Current password"
        autocomplete="current-password"
      />
      <InlineAlert v-if="revokeErrorMessage" tone="danger">
        {{ revokeErrorMessage }}
      </InlineAlert>
      <template #actions>
        <SecondaryButton type="button" :disabled="revokeBusy" @click="closeRevokeDialog">
          Cancel
        </SecondaryButton>
        <DangerButton type="button" :disabled="revokeBusy" @click="confirmRevokeDevice">
          {{ revokeBusy ? 'Revoking...' : 'Revoke device' }}
        </DangerButton>
      </template>
    </DialogModal>

    <DialogModal
      :open="extensionLinkModalOpen"
      :title="extensionLinkModalAction === 'approve' ? 'Approve extension request' : 'Reject extension request'"
    >
      <p v-if="extensionLinkModalRequest" class="module-empty-hint">
        Review the request details and confirm your decision.
      </p>
      <dl v-if="extensionLinkModalRequest" class="settings-meta">
        <div>
          <dt>Device</dt>
          <dd>{{ extensionLinkModalRequest.deviceNameHint ?? 'VaultLite Extension' }}</dd>
        </div>
        <div>
          <dt>Code</dt>
          <dd>{{ extensionLinkModalRequest.shortCode }}</dd>
        </div>
        <div>
          <dt>Phrase</dt>
          <dd>{{ extensionLinkModalRequest.fingerprintPhrase }}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{{ formatDateTime(extensionLinkModalRequest.createdAt) }}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{{ formatDateTime(extensionLinkModalRequest.expiresAt) }}</dd>
        </div>
      </dl>
      <SecretField
        v-if="extensionLinkModalRequiresPassword"
        v-model="extensionLinkModalPassword"
        label="Current password"
        autocomplete="current-password"
      />
      <InlineAlert v-if="extensionLinkModalErrorMessage" tone="danger">
        {{ extensionLinkModalErrorMessage }}
      </InlineAlert>
      <template #actions>
        <SecondaryButton type="button" :disabled="extensionLinkModalBusy" @click="closeExtensionLinkDecisionModal">
          Cancel
        </SecondaryButton>
        <PrimaryButton
          v-if="extensionLinkModalAction === 'approve'"
          type="button"
          :disabled="extensionLinkModalBusy"
          @click="confirmExtensionLinkDecision"
        >
          {{ extensionLinkModalBusy ? 'Approving…' : 'Approve request' }}
        </PrimaryButton>
        <DangerButton
          v-else
          type="button"
          :disabled="extensionLinkModalBusy"
          @click="confirmExtensionLinkDecision"
        >
          {{ extensionLinkModalBusy ? 'Rejecting…' : 'Reject request' }}
        </DangerButton>
      </template>
    </DialogModal>

    <ToastMessage v-if="toastMessage" :message="toastMessage" />
  </section>
</template>
