import { byId, ensureServerOriginPermission, sendBackgroundCommand } from './runtime-ui.js';
import {
  buildPairingDescription,
  buildWebSettingsUrl,
  buildServerUrlSuggestion,
  buildWebVaultUrl,
} from './runtime-onboarding.js';
import { canonicalizeServerUrl } from './runtime-common.js';

const elements = {
  contextLine: byId('contextLine'),
  statusBanner: byId('statusBanner'),
  pairingPanel: byId('pairingPanel'),
  pairingDescription: byId('pairingDescription'),
  unlockPanel: byId('unlockPanel'),
  readyPanel: byId('readyPanel'),
  serverUrlInput: byId('serverUrlInput'),
  deviceNameInput: byId('deviceNameInput'),
  unlockPasswordInput: byId('unlockPasswordInput'),
  pairBtn: byId('pairBtn'),
  unlockBtn: byId('unlockBtn'),
  openSettingsBtn: byId('openSettingsBtn'),
  openPopupBtn: byId('openPopupBtn'),
  openVaultBtn: byId('openVaultBtn'),
  lockBtn: byId('lockBtn'),
};

let currentState = null;
const FALLBACK_PAIRING_STATE = {
  phase: 'pairing_required',
  serverOrigin: null,
  username: null,
  deviceName: null,
  lastError: null,
};

function shouldForceStateRefreshAfterError(code) {
  return (
    code === 'remote_authentication_required' ||
    code === 'pairing_required' ||
    code === 'trusted_state_reset_required'
  );
}

function setStatus(message) {
  if (!message) {
    elements.statusBanner.hidden = true;
    elements.statusBanner.textContent = '';
    return;
  }
  elements.statusBanner.hidden = false;
  elements.statusBanner.textContent = message;
}

function showPanel(panel) {
  elements.pairingPanel.hidden = panel !== 'pairing';
  elements.unlockPanel.hidden = panel !== 'unlock';
  elements.readyPanel.hidden = panel !== 'ready';
}

function showFallbackPanel() {
  showPanel('pairing');
}

function renderState(state) {
  currentState = state;
  elements.deviceNameInput.value = state.deviceName ?? 'VaultLite Extension';
  if (document.activeElement !== elements.serverUrlInput) {
    elements.serverUrlInput.value = buildServerUrlSuggestion(state.serverOrigin);
  }
  elements.pairingDescription.textContent = buildPairingDescription(state);

  if (!state.serverOrigin) {
    elements.contextLine.textContent = 'Enter server URL and start a trusted-device request to connect this extension.';
    showPanel('pairing');
    setStatus('Server URL missing.');
    return;
  }

  if (state.phase === 'ready') {
    elements.contextLine.textContent = `Connected as ${state.username ?? 'unknown user'}.`;
    showPanel('ready');
  } else if (state.phase === 'local_unlock_required') {
    elements.contextLine.textContent = `Unlock required for ${state.username ?? 'this account'}.`;
    showPanel('unlock');
  } else {
    elements.contextLine.textContent = 'Pair this extension from web settings.';
    showPanel('pairing');
  }

  setStatus(state.lastError ?? '');
}

async function ensureServerOriginConfigured() {
  const rawInput = elements.serverUrlInput.value.trim();
  if (!rawInput && currentState?.serverOrigin) {
    return { ok: true };
  }
  if (!rawInput) {
    return {
      ok: false,
      message: 'Enter the server URL before connecting this extension.',
    };
  }

  let canonicalServerOrigin;
  try {
    canonicalServerOrigin = canonicalizeServerUrl(rawInput);
  } catch {
    return {
      ok: false,
      message: 'Server URL is invalid. Use HTTPS or local loopback HTTP.',
    };
  }

  if (canonicalServerOrigin === currentState?.serverOrigin) {
    return { ok: true };
  }

  const permission = await ensureServerOriginPermission(canonicalServerOrigin);
  if (!permission.ok) {
    return permission;
  }

  const response = await sendBackgroundCommand({
    type: 'vaultlite.set_server_url',
    serverUrl: canonicalServerOrigin,
  });
  if (!response.ok) {
    return {
      ok: false,
      code: response.code,
      message: response.message || 'Could not save server URL.',
    };
  }
  renderState(response.state);
  return { ok: true };
}

async function refreshState() {
  try {
    const response = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true });
    if (!response.ok) {
      setStatus(response.message || 'Failed to load extension state.');
      return;
    }
    renderState(response.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load extension state.';
    setStatus(message);
    showFallbackPanel();
  }
}

async function pairExtension() {
  try {
    const serverSetup = await ensureServerOriginConfigured();
    if (!serverSetup.ok) {
      setStatus(serverSetup.message || 'Could not configure server URL.');
      if (shouldForceStateRefreshAfterError(serverSetup.code)) {
        await refreshState();
      }
      return;
    }

    const response = await sendBackgroundCommand({
      type: 'vaultlite.start_link_pairing',
      deviceNameHint: elements.deviceNameInput.value,
    });
    if (!response.ok) {
      setStatus(response.message || 'Trusted-device request failed.');
      if (shouldForceStateRefreshAfterError(response.code)) {
        await refreshState();
      }
      return;
    }
    const code = response.linkRequest?.shortCode ?? '—';
    const phrase = response.linkRequest?.fingerprintPhrase ?? '—';
    setStatus(`Request ${code} created (${phrase}). Approve it in web settings.`);
    renderState(response.state ?? currentState ?? FALLBACK_PAIRING_STATE);
    openSettings();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trusted-device request failed.';
    setStatus(message);
  }
}

async function unlockExtension() {
  try {
    const response = await sendBackgroundCommand({
      type: 'vaultlite.unlock_local',
      password: elements.unlockPasswordInput.value,
    });
    if (!response.ok) {
      setStatus(response.message || 'Unlock failed.');
      if (shouldForceStateRefreshAfterError(response.code)) {
        await refreshState();
      }
      return;
    }
    elements.unlockPasswordInput.value = '';
    setStatus('Extension unlocked. Use popup for listing and fill.');
    renderState(response.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unlock failed.';
    setStatus(message);
  }
}

async function lockExtension() {
  try {
    const response = await sendBackgroundCommand({ type: 'vaultlite.lock' });
    if (!response.ok) {
      setStatus(response.message || 'Could not lock extension.');
      return;
    }
    setStatus('Extension locked.');
    renderState(response.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not lock extension.';
    setStatus(message);
  }
}

function openSettings() {
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      setStatus('Set a valid server URL first.');
      return;
    }
  }
  if (!serverOrigin) {
    setStatus('Set server URL first.');
    return;
  }
  const webSettingsUrl = buildWebSettingsUrl(serverOrigin);
  if (!webSettingsUrl) {
    setStatus('Could not resolve web app URL from server URL.');
    return;
  }
  void chrome.tabs.create({ url: webSettingsUrl });
}

function openVault() {
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      setStatus('Set a valid server URL first.');
      return;
    }
  }
  if (!serverOrigin) {
    setStatus('Set server URL first.');
    return;
  }
  const webVaultUrl = buildWebVaultUrl(serverOrigin);
  if (!webVaultUrl) {
    setStatus('Could not resolve web app URL from server URL.');
    return;
  }
  void chrome.tabs.create({ url: webVaultUrl });
}

elements.pairBtn.addEventListener('click', () => {
  void pairExtension();
});

elements.unlockBtn.addEventListener('click', () => {
  void unlockExtension();
});

elements.lockBtn.addEventListener('click', () => {
  void lockExtension();
});

elements.openSettingsBtn.addEventListener('click', openSettings);

elements.openVaultBtn.addEventListener('click', openVault);

elements.openPopupBtn.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

renderState({ ...FALLBACK_PAIRING_STATE });
void refreshState();
