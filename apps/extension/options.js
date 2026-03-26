import { byId, ensureServerOriginPermission, formatTime, sendBackgroundCommand } from './runtime-ui.js';
import { canonicalizeServerUrl } from './runtime-common.js';
import { buildWebSettingsUrl } from './runtime-onboarding.js';
import {
  importManualIconFromFile,
  importManualIconFromUrl,
  sanitizeIconHost,
} from './manual-icons.js';

const elements = {
  serverUrlInput: byId('serverUrlInput'),
  saveServerUrlBtn: byId('saveServerUrlBtn'),
  openWebSettingsBtn: byId('openWebSettingsBtn'),
  resetTrustedStateBtn: byId('resetTrustedStateBtn'),
  phaseValue: byId('phaseValue'),
  usernameValue: byId('usernameValue'),
  deviceValue: byId('deviceValue'),
  sessionExpiresValue: byId('sessionExpiresValue'),
  trustedStateValue: byId('trustedStateValue'),
  statusBanner: byId('statusBanner'),
  iconHostInput: byId('iconHostInput'),
  iconUrlInput: byId('iconUrlInput'),
  iconFileInput: byId('iconFileInput'),
  importIconFromUrlBtn: byId('importIconFromUrlBtn'),
  importIconFromFileBtn: byId('importIconFromFileBtn'),
  manualIconList: byId('manualIconList'),
};

let currentState = null;
let busy = false;

function setBusy(nextBusy) {
  busy = nextBusy;
  elements.saveServerUrlBtn.disabled = nextBusy;
  elements.openWebSettingsBtn.disabled = nextBusy;
  elements.resetTrustedStateBtn.disabled = nextBusy;
  elements.serverUrlInput.disabled = nextBusy;
  elements.iconHostInput.disabled = nextBusy;
  elements.iconUrlInput.disabled = nextBusy;
  elements.iconFileInput.disabled = nextBusy;
  elements.importIconFromUrlBtn.disabled = nextBusy;
  elements.importIconFromFileBtn.disabled = nextBusy;
}

function setStatus(tone, message) {
  void tone;
  void message;
  elements.statusBanner.hidden = true;
  elements.statusBanner.textContent = '';
}

function renderState(state) {
  currentState = state;
  elements.phaseValue.textContent = state.phase ?? '—';
  elements.usernameValue.textContent = state.username ?? '—';
  elements.deviceValue.textContent = state.deviceName ?? '—';
  elements.sessionExpiresValue.textContent = formatTime(state.sessionExpiresAt);
  elements.trustedStateValue.textContent = state.hasTrustedState ? 'Yes' : 'No';
  if (!elements.serverUrlInput.value) {
    elements.serverUrlInput.value = state.serverOrigin ?? '';
  }

  if (state.lastError) {
    setStatus('warning', state.lastError);
  }
}

function renderManualIcons(icons) {
  elements.manualIconList.innerHTML = '';
  if (!Array.isArray(icons) || icons.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'hint';
    empty.textContent = 'No manual icons stored.';
    elements.manualIconList.appendChild(empty);
    return;
  }

  for (const icon of icons) {
    const safeHost = sanitizeIconHost(String(icon.host ?? ''));
    if (!safeHost || typeof icon.dataUrl !== 'string') {
      continue;
    }

    const row = document.createElement('li');
    row.className = 'icon-row';

    const preview = document.createElement('img');
    preview.className = 'icon-row__preview';
    preview.alt = '';
    preview.src = icon.dataUrl;

    const host = document.createElement('span');
    host.className = 'icon-row__host';
    host.textContent = safeHost;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn-danger';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('data-remove-host', safeHost);

    row.append(preview, host, removeButton);
    elements.manualIconList.appendChild(row);
  }
}

async function refreshManualIcons() {
  const response = await sendBackgroundCommand({ type: 'vaultlite.list_manual_icons' });
  if (!response.ok) {
    throw new Error(response.message || 'Could not load manual icons.');
  }
  renderManualIcons(response.icons ?? []);
}

async function refreshState() {
  try {
    const response = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true });
    if (!response.ok) {
      setStatus('danger', response.message || 'Failed to load extension state.');
      return;
    }
    renderState(response.state);
    await refreshManualIcons();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load extension state.';
    setStatus('danger', message);
  }
}

async function saveServerUrl() {
  if (busy) {
    return;
  }
  setBusy(true);
  try {
    let canonicalServerOrigin;
    try {
      canonicalServerOrigin = canonicalizeServerUrl(elements.serverUrlInput.value);
    } catch {
      setStatus('danger', 'Set a valid server URL first.');
      return;
    }

    const permission = await ensureServerOriginPermission(canonicalServerOrigin);
    if (!permission.ok) {
      setStatus('danger', permission.message || 'Could not request origin permission.');
      return;
    }

    const response = await sendBackgroundCommand({
      type: 'vaultlite.set_server_url',
      serverUrl: canonicalServerOrigin,
    });
    if (!response.ok) {
      setStatus('danger', response.message || 'Could not save server URL.');
      return;
    }
    setStatus('success', 'Server URL saved.');
    renderState(response.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save server URL.';
    setStatus('danger', message);
  } finally {
    setBusy(false);
  }
}

async function resetTrustedState() {
  if (busy) {
    return;
  }
  const confirmed = window.confirm('Reset trusted local state and extension session?');
  if (!confirmed) {
    return;
  }

  setBusy(true);
  try {
    const response = await sendBackgroundCommand({ type: 'vaultlite.reset_trusted_state' });
    if (!response.ok) {
      setStatus('danger', response.message || 'Could not reset trusted state.');
      return;
    }
    setStatus('success', 'Trusted state cleared. Pair extension again.');
    renderState(response.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reset trusted state.';
    setStatus('danger', message);
  } finally {
    setBusy(false);
  }
}

function openWebSettings() {
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      setStatus('warning', 'Set a valid server URL first.');
      return;
    }
  }
  if (!serverOrigin) {
    setStatus('warning', 'Set server URL first.');
    return;
  }
  const webSettingsUrl = buildWebSettingsUrl(serverOrigin);
  if (!webSettingsUrl) {
    setStatus('warning', 'Could not resolve web app URL from server URL.');
    return;
  }
  void chrome.tabs.create({ url: webSettingsUrl });
}

async function importIconFromUrlFlow() {
  const host = sanitizeIconHost(elements.iconHostInput.value);
  if (!host) {
    setStatus('warning', 'Enter a valid host (example.com).');
    return;
  }
  const sourceUrl = elements.iconUrlInput.value.trim();
  if (!sourceUrl) {
    setStatus('warning', 'Enter an icon URL.');
    return;
  }

  setBusy(true);
  try {
    const dataUrl = await importManualIconFromUrl(sourceUrl);
    const response = await sendBackgroundCommand({
      type: 'vaultlite.set_manual_icon',
      host,
      dataUrl,
      source: 'url',
    });
    if (!response.ok) {
      setStatus('danger', response.message || 'Could not save manual icon.');
      return;
    }
    renderManualIcons(response.icons ?? []);
    setStatus('success', `Manual icon saved for ${host}.`);
    elements.iconUrlInput.value = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import icon URL.';
    setStatus('danger', message);
  } finally {
    setBusy(false);
  }
}

async function importIconFromFileFlow() {
  const host = sanitizeIconHost(elements.iconHostInput.value);
  if (!host) {
    setStatus('warning', 'Enter a valid host (example.com).');
    return;
  }
  const [file] = elements.iconFileInput.files ?? [];
  if (!file) {
    setStatus('warning', 'Select an icon file first.');
    return;
  }

  setBusy(true);
  try {
    const dataUrl = await importManualIconFromFile(file);
    const response = await sendBackgroundCommand({
      type: 'vaultlite.set_manual_icon',
      host,
      dataUrl,
      source: 'file',
    });
    if (!response.ok) {
      setStatus('danger', response.message || 'Could not save manual icon.');
      return;
    }
    renderManualIcons(response.icons ?? []);
    setStatus('success', `Manual icon saved for ${host}.`);
    elements.iconFileInput.value = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import icon file.';
    setStatus('danger', message);
  } finally {
    setBusy(false);
  }
}

async function removeManualIconFlow(host) {
  setBusy(true);
  try {
    const response = await sendBackgroundCommand({
      type: 'vaultlite.remove_manual_icon',
      host,
    });
    if (!response.ok) {
      setStatus('danger', response.message || 'Could not remove icon.');
      return;
    }
    renderManualIcons(response.icons ?? []);
    setStatus('success', `Manual icon removed for ${host}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove icon.';
    setStatus('danger', message);
  } finally {
    setBusy(false);
  }
}

elements.saveServerUrlBtn.addEventListener('click', () => {
  void saveServerUrl();
});

elements.resetTrustedStateBtn.addEventListener('click', () => {
  void resetTrustedState();
});

elements.openWebSettingsBtn.addEventListener('click', openWebSettings);
elements.importIconFromUrlBtn.addEventListener('click', () => {
  void importIconFromUrlFlow();
});
elements.importIconFromFileBtn.addEventListener('click', () => {
  void importIconFromFileFlow();
});
elements.manualIconList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const host = target.getAttribute('data-remove-host');
  if (!host) {
    return;
  }
  void removeManualIconFlow(host);
});

void refreshState();
