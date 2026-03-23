export const MANUAL_ICON_STORAGE_KEY = 'vaultlite.extension.manual_icons.v1';
const ALLOWED_ICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
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

const ICON_EXTENSION_MIME_MAP = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

function extensionFromName(name) {
  const normalized = String(name ?? '').trim().toLowerCase();
  const index = normalized.lastIndexOf('.');
  if (index < 0 || index === normalized.length - 1) {
    return null;
  }
  return normalized.slice(index + 1);
}

function detectMimeTypeFromSignature(bytes) {
  if (bytes.length >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png';
    }
  }
  if (bytes.length >= 3) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
  }
  if (bytes.length >= 12) {
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
      return 'image/x-icon';
    }
  }
  if (bytes.length > 0) {
    const ascii = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trimStart();
    if (ascii.startsWith('<svg') || ascii.startsWith('<?xml')) {
      return 'image/svg+xml';
    }
  }
  return null;
}

async function resolveIconMimeType(blob, options = {}) {
  const explicitMime = normalizedMimeType(blob?.type ?? '');
  if (isAllowedManualIconMimeType(explicitMime)) {
    return explicitMime;
  }
  const signatureBytes = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
  const sniffedMime = detectMimeTypeFromSignature(signatureBytes);
  if (sniffedMime && isAllowedManualIconMimeType(sniffedMime)) {
    return sniffedMime;
  }
  const extension = extensionFromName(options.fileName);
  if (!extension) {
    return null;
  }
  const byExtension = ICON_EXTENSION_MIME_MAP[extension] ?? null;
  return byExtension && isAllowedManualIconMimeType(byExtension) ? byExtension : null;
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function toDataUrl(blob, mimeType) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
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
  if (!blob || blob.size <= 0 || blob.size > MAX_MANUAL_ICON_BYTES) {
    throw new Error('icon_size_limit_exceeded');
  }
  if (typeof document === 'undefined') {
    throw new Error('icon_runtime_unavailable');
  }
  const mimeType = await resolveIconMimeType(blob);
  if (!mimeType) {
    throw new Error('icon_mime_not_allowed');
  }
  const imageBlob =
    normalizedMimeType(blob.type) === mimeType ? blob : new Blob([await blob.arrayBuffer()], { type: mimeType });
  let image;
  try {
    image = await decodeBlobToImage(imageBlob);
  } catch {
    const fallbackDataUrl = await toDataUrl(imageBlob, mimeType);
    if (!validateManualIconDataUrl(fallbackDataUrl)) {
      throw new Error('icon_image_decode_failed');
    }
    return fallbackDataUrl;
  }
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
  if (!file || file.size <= 0 || file.size > MAX_MANUAL_ICON_BYTES) {
    throw new Error('icon_size_limit_exceeded');
  }
  const mimeType = await resolveIconMimeType(file, { fileName: file.name });
  if (!mimeType) {
    throw new Error('icon_mime_not_allowed');
  }
  const normalizedBlob =
    normalizedMimeType(file.type) === mimeType
      ? file
      : new Blob([await file.arrayBuffer()], { type: mimeType });
  return normalizeImageBlobTo64DataUrl(normalizedBlob);
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
  const contentLengthRaw = response.headers.get('content-length');
  if (contentLengthRaw) {
    const contentLength = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_MANUAL_ICON_BYTES) {
      throw new Error('icon_size_limit_exceeded');
    }
  }
  const blob = await response.blob();
  const mimeType = await resolveIconMimeType(blob, { fileName: parsed.pathname });
  if (!mimeType) {
    throw new Error('icon_mime_not_allowed');
  }
  const normalizedBlob =
    normalizedMimeType(blob.type) === mimeType
      ? blob
      : new Blob([await blob.arrayBuffer()], { type: mimeType });
  return normalizeImageBlobTo64DataUrl(normalizedBlob);
}
