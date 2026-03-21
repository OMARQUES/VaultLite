export const MANUAL_ICON_STORAGE_KEY = 'vaultlite.extension.manual_icons.v1';
const ALLOWED_ICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

export const MAX_MANUAL_ICON_BYTES = 1_000_000;
export const MAX_MANUAL_ICON_DATA_URL_LENGTH = 350_000;
const MAX_MANUAL_ICON_RECORDS = 400;

function normalizedMimeType(value) {
  return String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function isAllowedManualIconMimeType(value) {
  return ALLOWED_ICON_MIME_TYPES.has(normalizedMimeType(value));
}

export function sanitizeIconHost(value) {
  const input = String(value ?? '').trim();
  if (!input) {
    return null;
  }
  try {
    const parsed = new URL(input.includes('://') ? input : `https://${input}`);
    const normalizedHost = parsed.hostname.toLowerCase().replace(/\.$/u, '');
    if (!normalizedHost) {
      return null;
    }
    return normalizedHost;
  } catch {
    return null;
  }
}

export function validateManualIconDataUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MANUAL_ICON_DATA_URL_LENGTH) {
    return false;
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) {
    return false;
  }
  return isAllowedManualIconMimeType(match[1] ?? '');
}

function sortAndTrim(map) {
  return Object.fromEntries(
    Object.entries(map)
      .sort((left, right) => {
        const leftTime = Date.parse(left[1]?.updatedAt ?? '');
        const rightTime = Date.parse(right[1]?.updatedAt ?? '');
        if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
          return 0;
        }
        return rightTime - leftTime;
      })
      .slice(0, MAX_MANUAL_ICON_RECORDS),
  );
}

export async function loadManualIconMapFromStorage() {
  const raw = await chrome.storage.local.get([MANUAL_ICON_STORAGE_KEY]);
  const parsed = raw?.[MANUAL_ICON_STORAGE_KEY];
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  const sanitized = {};
  for (const [host, record] of Object.entries(parsed)) {
    const safeHost = sanitizeIconHost(host);
    if (!safeHost || !record || typeof record !== 'object') {
      continue;
    }
    if (!validateManualIconDataUrl(record.dataUrl)) {
      continue;
    }
    sanitized[safeHost] = {
      dataUrl: record.dataUrl,
      source: record.source === 'url' ? 'url' : 'file',
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    };
  }
  return sortAndTrim(sanitized);
}

async function persistManualIconMapToStorage(map) {
  await chrome.storage.local.set({
    [MANUAL_ICON_STORAGE_KEY]: sortAndTrim(map),
  });
}

export async function upsertManualIconRecord(input) {
  const safeHost = sanitizeIconHost(input?.host ?? '');
  if (!safeHost) {
    throw new Error('icon_host_invalid');
  }
  if (!validateManualIconDataUrl(input?.dataUrl ?? '')) {
    throw new Error('icon_data_invalid');
  }
  const current = await loadManualIconMapFromStorage();
  current[safeHost] = {
    dataUrl: input.dataUrl,
    source: input.source === 'url' ? 'url' : 'file',
    updatedAt: new Date().toISOString(),
  };
  await persistManualIconMapToStorage(current);
  return current;
}

export async function removeManualIconRecord(host) {
  const safeHost = sanitizeIconHost(host);
  if (!safeHost) {
    return await loadManualIconMapFromStorage();
  }
  const current = await loadManualIconMapFromStorage();
  if (safeHost in current) {
    delete current[safeHost];
    await persistManualIconMapToStorage(current);
  }
  return current;
}

function decodeBlobToImage(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('icon_image_decode_failed'));
    };
    image.src = objectUrl;
  });
}

export async function normalizeImageBlobTo64DataUrl(blob) {
  const mimeType = normalizedMimeType(blob?.type ?? '');
  if (!isAllowedManualIconMimeType(mimeType)) {
    throw new Error('icon_mime_not_allowed');
  }
  if (!blob || blob.size <= 0 || blob.size > MAX_MANUAL_ICON_BYTES) {
    throw new Error('icon_size_limit_exceeded');
  }
  if (typeof document === 'undefined') {
    throw new Error('icon_runtime_unavailable');
  }

  const image = await decodeBlobToImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('icon_runtime_unavailable');
  }
  context.clearRect(0, 0, 64, 64);
  context.drawImage(image, 0, 0, 64, 64);
  const dataUrl = canvas.toDataURL('image/png');
  if (!validateManualIconDataUrl(dataUrl)) {
    throw new Error('icon_data_invalid');
  }
  return dataUrl;
}

export async function importManualIconFromFile(file) {
  return normalizeImageBlobTo64DataUrl(file);
}

export async function importManualIconFromUrl(rawUrl) {
  const parsed = new URL(String(rawUrl ?? '').trim());
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('icon_source_not_allowed');
  }

  const response = await fetch(parsed.toString(), {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error('icon_fetch_failed');
  }
  const contentType = normalizedMimeType(response.headers.get('content-type') ?? '');
  if (contentType && !isAllowedManualIconMimeType(contentType)) {
    throw new Error('icon_mime_not_allowed');
  }
  const contentLengthRaw = response.headers.get('content-length');
  if (contentLengthRaw) {
    const contentLength = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_MANUAL_ICON_BYTES) {
      throw new Error('icon_size_limit_exceeded');
    }
  }
  const blob = await response.blob();
  return normalizeImageBlobTo64DataUrl(blob);
}

