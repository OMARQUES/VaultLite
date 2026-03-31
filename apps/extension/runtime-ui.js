const BACKGROUND_COMMAND_TIMEOUT_MS = 7_000;
const BACKGROUND_COMMAND_MAX_ATTEMPTS = 7;
const BACKGROUND_COMMAND_RETRY_BUDGET_MS = 4_000;
const BACKGROUND_COMMAND_RETRY_BASE_DELAY_MS = 120;
const BACKGROUND_COMMAND_RETRY_MAX_DELAY_MS = 700;
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
    message.includes('message port closed before a response was received') ||
    message.includes('extension context invalidated') ||
    message === 'background_timeout'
  );
}

function classifyBackgroundError(error) {
  if (!(error instanceof Error)) {
    return {
      kind: 'protocol',
      code: 'background_unavailable',
      retriable: false,
      rawMessage: null,
    };
  }
  const message = error.message.toLowerCase();
  if (message === 'background_timeout') {
    return {
      kind: 'transport_transient',
      code: 'background_timeout',
      retriable: true,
      rawMessage: error.message,
    };
  }
  if (isRetriableBackgroundError(error)) {
    return {
      kind: 'transport_transient',
      code: 'background_unavailable',
      retriable: true,
      rawMessage: error.message,
    };
  }
  if (message.includes('invalid_extension_response')) {
    return {
      kind: 'protocol',
      code: 'background_protocol_error',
      retriable: false,
      rawMessage: error.message,
    };
  }
  return {
    kind: 'transport_terminal',
    code: 'background_unavailable',
    retriable: false,
    rawMessage: error.message,
  };
}

function computeRetryDelayMs(attempt) {
  const exponent = Math.max(0, attempt - 1);
  const baseDelay = Math.min(
    BACKGROUND_COMMAND_RETRY_MAX_DELAY_MS,
    BACKGROUND_COMMAND_RETRY_BASE_DELAY_MS * 2 ** exponent,
  );
  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.max(40, Math.round(baseDelay * jitterFactor));
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
  const startedAt = Date.now();
  let attempt = 0;
  let lastError = null;
  let lastClassification = {
    kind: 'transport_terminal',
    code: 'background_unavailable',
    retriable: false,
    rawMessage: null,
  };

  while (attempt < BACKGROUND_COMMAND_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      return await sendMessageOnce(payload);
    } catch (error) {
      lastError = error;
      lastClassification = classifyBackgroundError(error);
      if (attempt >= BACKGROUND_COMMAND_MAX_ATTEMPTS || !lastClassification.retriable) {
        break;
      }
      const elapsedMs = Date.now() - startedAt;
      const remainingBudgetMs = BACKGROUND_COMMAND_RETRY_BUDGET_MS - elapsedMs;
      if (remainingBudgetMs <= 0) {
        break;
      }
      const retryDelayMs = computeRetryDelayMs(attempt);
      await sleep(Math.min(retryDelayMs, remainingBudgetMs));
    }
  }

  const message = (() => {
    if (lastClassification.code === 'background_timeout') {
      return 'Extension background timed out. Reload the extension and try again.';
    }
    if (lastClassification.kind === 'transport_transient') {
      return 'Extension background is waking up. Try again in a moment.';
    }
    if (lastError instanceof Error && typeof lastError.message === 'string' && lastError.message.length > 0) {
      return lastError.message;
    }
    return 'Extension background is unavailable. Reload the extension and try again.';
  })();
  const enriched = new Error(message);
  enriched.code = lastClassification.code;
  enriched.kind = lastClassification.kind;
  enriched.retriable = lastClassification.retriable;
  enriched.rawMessage = lastClassification.rawMessage;
  enriched.attempts = attempt;
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
  const text = typeof value === 'string' ? value : String(value ?? '');
  if (typeof document.execCommand === 'function') {
    const fallbackArea = document.createElement('textarea');
    fallbackArea.value = text;
    fallbackArea.setAttribute('readonly', 'readonly');
    fallbackArea.style.position = 'fixed';
    fallbackArea.style.top = '-9999px';
    fallbackArea.style.opacity = '0';
    document.body.appendChild(fallbackArea);
    fallbackArea.focus();
    fallbackArea.select();
    const copied = document.execCommand('copy');
    fallbackArea.remove();
    if (copied) {
      return;
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error('Clipboard is unavailable.');
}
