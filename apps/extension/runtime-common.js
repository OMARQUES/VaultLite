export const STORAGE_LOCAL_CONFIG_KEY = 'vaultlite.extension.config.v1';
export const STORAGE_LOCAL_TRUSTED_KEY = 'vaultlite.extension.trusted.v1';
export const STORAGE_SESSION_KEY = 'vaultlite.extension.session.v1';
export const POPUP_LAST_STATE_STORAGE_KEY = 'vaultlite.popup.last_state.v1';
export const POPUP_LAST_READY_LIST_STORAGE_KEY = 'vaultlite.popup.last_ready_list.v1';

const BLOCKED_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'file:',
  'data:',
  'about:',
  'edge:',
  'moz-extension:',
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const CONTEXT_CAPABILITIES = {
  background: new Set([
    'state:read',
    'state:write',
    'session:restore',
    'pairing:lts',
    'unlock:local',
    'vault:list',
    'fill:dispatch',
    'clipboard:reveal',
  ]),
  popup: new Set([
    'state:read',
    'pairing:lts',
    'unlock:local',
    'vault:list',
    'fill:dispatch',
    'clipboard:reveal',
    'state:write',
  ]),
  options: new Set(['state:read', 'state:write']),
  full_page_auth: new Set([
    'state:read',
    'pairing:lts',
    'unlock:local',
    'state:write',
  ]),
  content_script: new Set([
    'fill:execute',
    'bridge:auto_pair',
    'form_metadata:signal',
    'inline_assist:prefetch',
    'inline_assist:activate',
  ]),
};

export function contextHasCapability(context, capability) {
  const capabilities = CONTEXT_CAPABILITIES[context];
  if (!capabilities) {
    return false;
  }
  return capabilities.has(capability);
}

export function resolveSenderContext(sender, extensionOrigin) {
  if (!sender) {
    return 'unknown';
  }
  if (sender.id && sender.id !== chrome.runtime.id) {
    return 'unknown';
  }
  const senderUrl =
    (typeof sender.url === 'string' && sender.url) ||
    (typeof sender.documentUrl === 'string' && sender.documentUrl) ||
    '';
  const senderOrigin =
    (typeof sender.origin === 'string' && sender.origin) ||
    (typeof sender.documentOrigin === 'string' && sender.documentOrigin) ||
    '';
  if (senderUrl.startsWith(extensionOrigin)) {
    try {
      const pathname = new URL(senderUrl).pathname;
      if (pathname.endsWith('/popup.html')) {
        return 'popup';
      }
      if (pathname.endsWith('/options.html')) {
        return 'options';
      }
      if (pathname.endsWith('/full-page-auth.html')) {
        return 'full_page_auth';
      }
    } catch {
      // keep unknown fallback below
    }
  }
  if (!senderUrl && senderOrigin === extensionOrigin) {
    return 'popup';
  }
  if (sender.tab && typeof sender.tab.id === 'number') {
    return 'content_script';
  }
  return 'unknown';
}

export function isDevHost(hostname) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function canonicalizeServerUrl(value) {
  const input = (value ?? '').trim();
  if (!input) {
    throw new Error('server_origin_not_allowed');
  }
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('server_origin_not_allowed');
  }
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  if (protocol === 'https:') {
    return parsed.origin;
  }
  if (protocol === 'http:' && isDevHost(hostname)) {
    return parsed.origin;
  }
  throw new Error('server_origin_not_allowed');
}

export function deriveWebOriginFromServerOrigin(serverOrigin) {
  const normalized = typeof serverOrigin === 'string' ? serverOrigin.trim() : '';
  if (!normalized) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return null;
  }
  if (protocol === 'http:' && isDevHost(parsed.hostname) && parsed.port === '8787') {
    parsed.port = '5173';
    return parsed.origin;
  }
  return parsed.origin;
}

export function isAllowedSettingsPath(input) {
  const pathname = typeof input?.pathname === 'string' ? input.pathname : '';
  if (pathname === '/settings/extension' || pathname === '/settings/extension/') {
    return true;
  }
  if (pathname !== '/settings') {
    return false;
  }
  const search = typeof input?.search === 'string' ? input.search : '';
  const params = new URLSearchParams(search);
  return params.get('panel') === 'extension';
}

export function isAllowedUnlockPath(input) {
  const pathname = typeof input?.pathname === 'string' ? input.pathname : '';
  return pathname === '/unlock' || pathname === '/unlock/';
}

export function isAllowedAuthPath(input) {
  const pathname = typeof input?.pathname === 'string' ? input.pathname : '';
  return pathname === '/auth' || pathname === '/auth/';
}

function normalizePort(protocol, port) {
  if (port) {
    return port;
  }
  if (protocol === 'https:') {
    return '443';
  }
  if (protocol === 'http:') {
    return '80';
  }
  return '';
}

export function canonicalOrigin(urlValue) {
  const parsed = new URL(urlValue);
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = normalizePort(protocol, parsed.port);
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

export function isPageUrlEligibleForFill(urlValue) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(protocol)) {
    return false;
  }
  if (protocol === 'https:') {
    return true;
  }
  if (protocol !== 'http:') {
    return false;
  }
  return isDevHost(parsed.hostname);
}

export function isCredentialAllowedForSite(pageUrl, credentialUrls) {
  if (!isPageUrlEligibleForFill(pageUrl)) {
    return false;
  }
  const pageOrigin = canonicalOrigin(pageUrl);
  for (const rawUrl of credentialUrls ?? []) {
    try {
      if (canonicalOrigin(rawUrl) === pageOrigin) {
        return true;
      }
    } catch {
      // Ignore malformed URL entries.
    }
  }
  return false;
}

export function scoreDomainMatch(pageUrl, candidateUrls) {
  try {
    const page = new URL(pageUrl);
    const pageHost = page.hostname.toLowerCase();
    for (const rawUrl of candidateUrls ?? []) {
      const candidate = new URL(rawUrl);
      const candidateHost = candidate.hostname.toLowerCase();
      if (candidateHost === pageHost) {
        return 2;
      }
      if (candidateHost.endsWith(`.${pageHost}`) || pageHost.endsWith(`.${candidateHost}`)) {
        return 1;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function nowIso() {
  return new Date().toISOString();
}

export function maskSecret(value) {
  if (!value) {
    return '********';
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

export function matchesQuery(credential, rawQuery) {
  const query = (rawQuery ?? '').trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [
    credential.title ?? '',
    credential.subtitle ?? '',
    credential.searchText ?? '',
    credential.username ?? '',
    ...(credential.urls ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}
