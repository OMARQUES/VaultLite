const BACKGROUND_COMMAND_TIMEOUT_MS = 7_000;
const BACKGROUND_COMMAND_RETRY_DELAY_MS = 180;
const BACKGROUND_COMMAND_MAX_ATTEMPTS = 2;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function originPattern(serverOrigin) {
  if (typeof serverOrigin !== 'string' || serverOrigin.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(serverOrigin);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return null;
  }
}

function deriveWebOriginFromServerOrigin(serverOrigin) {
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
  if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && LOOPBACK_HOSTS.has(parsed.hostname) && parsed.port === '8787') {
    parsed.port = '5173';
    return parsed.origin;
  }
  return parsed.origin;
}

function isRetriableBackgroundError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('could not establish connection') ||
    message.includes('receiving end does not exist') ||
    message === 'background_timeout'
  );
}

async function sendMessageOnce(payload) {
  let response;
  let timeoutId = null;
  try {
    response = await Promise.race([
      chrome.runtime.sendMessage(payload),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          const timeoutError = new Error('background_timeout');
          timeoutError.code = 'background_timeout';
          reject(timeoutError);
        }, BACKGROUND_COMMAND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
  if (!response || typeof response.ok !== 'boolean') {
    throw new Error('invalid_extension_response');
  }
  return response;
}

export async function sendBackgroundCommand(payload) {
  let attempt = 0;
  let lastError = null;

  while (attempt < BACKGROUND_COMMAND_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      return await sendMessageOnce(payload);
    } catch (error) {
      lastError = error;
      if (attempt >= BACKGROUND_COMMAND_MAX_ATTEMPTS || !isRetriableBackgroundError(error)) {
        break;
      }
      await sleep(BACKGROUND_COMMAND_RETRY_DELAY_MS);
    }
  }

  const message =
    lastError instanceof Error && lastError.message === 'background_timeout'
      ? 'Extension background timed out. Reload the extension and try again.'
      : lastError instanceof Error
      ? lastError.message
      : 'Extension background is unavailable. Reload the extension and try again.';
  const enriched = new Error(message);
  enriched.code =
    lastError instanceof Error && lastError.message === 'background_timeout'
      ? 'background_timeout'
      : 'background_unavailable';
  throw enriched;
}

export async function ensureServerOriginPermission(serverOrigin) {
  if (!chrome.permissions?.contains) {
    return { ok: true };
  }

  const origins = [serverOrigin];
  const webOrigin = deriveWebOriginFromServerOrigin(serverOrigin);
  if (webOrigin && webOrigin !== serverOrigin) {
    origins.push(webOrigin);
  }
  const requestedPatterns = Array.from(
    new Set(
      origins
        .map((origin) => originPattern(origin))
        .filter((pattern) => typeof pattern === 'string' && pattern.length > 0),
    ),
  );
  if (requestedPatterns.length === 0) {
    return {
      ok: false,
      code: 'permission_pattern_invalid',
      message: 'Server URL is invalid for permission request.',
    };
  }
  const alreadyGranted = await chrome.permissions.contains({
    origins: requestedPatterns,
  });
  if (alreadyGranted) {
    return { ok: true };
  }

  if (!chrome.permissions?.request) {
    return {
      ok: false,
      code: 'permission_api_unavailable',
      message: 'Browser permission API is unavailable for this extension context.',
    };
  }

  try {
    const granted = await chrome.permissions.request({
      origins: requestedPatterns,
    });
    if (granted) {
      return { ok: true };
    }
    return {
      ok: false,
      code: 'permission_denied',
      message: 'Permission denied for this server origin.',
    };
  } catch {
    return {
      ok: false,
      code: 'permission_request_failed',
      message: 'This action is not allowed in this extension context.',
    };
  }
}

export function byId(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element: ${id}`);
  }
  return node;
}

export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTime(value) {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function hostFromUrl(rawUrl) {
  if (!rawUrl) {
    return 'No active site';
  }
  try {
    return new URL(rawUrl).host;
  } catch {
    return 'No active site';
  }
}

export function setFormDisabled(formElement, disabled) {
  const controls = formElement.querySelectorAll('input,button,select,textarea');
  controls.forEach((control) => {
    control.disabled = disabled;
  });
}

export async function copyToClipboard(value) {
  await navigator.clipboard.writeText(value);
}
