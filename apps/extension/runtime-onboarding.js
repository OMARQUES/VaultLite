import { deriveWebOriginFromServerOrigin } from './runtime-common.js';

const DEV_DEFAULT_SERVER_URL = 'http://127.0.0.1:8787';

export function buildPairingDescription(state) {
  if (state?.phase === 'remote_authentication_required') {
    return 'Session expired or changed. Start a new trusted-device request to reconnect.';
  }
  return 'Start a trusted-device request and approve it in web settings.';
}

export function buildServerUrlSuggestion(serverOrigin) {
  const normalized = typeof serverOrigin === 'string' ? serverOrigin.trim() : '';
  if (normalized.length > 0) {
    return normalized;
  }
  return DEV_DEFAULT_SERVER_URL;
}

export function buildWebVaultUrl(serverOrigin) {
  const webOrigin = deriveWebOriginFromServerOrigin(serverOrigin);
  if (!webOrigin) {
    return null;
  }
  return `${webOrigin}/vault`;
}

export function buildWebSettingsUrl(serverOrigin) {
  const webVaultUrl = buildWebVaultUrl(serverOrigin);
  if (!webVaultUrl) {
    return null;
  }
  const parsed = new URL(webVaultUrl);
  parsed.pathname = '/settings/extension';
  parsed.search = '';
  return parsed.toString();
}
