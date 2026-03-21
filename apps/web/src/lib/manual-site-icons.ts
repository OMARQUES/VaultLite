const MANUAL_SITE_ICON_STORAGE_PREFIX = 'vaultlite.manual.site.icons.v1';
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

export interface ManualSiteIconRecord {
  dataUrl: string;
  source: 'url' | 'file';
  updatedAt: string;
}

export type ManualSiteIconMap = Record<string, ManualSiteIconRecord>;

function normalizedMimeType(value: string): string {
  return value.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isAllowedManualIconMimeType(value: string): boolean {
  return ALLOWED_ICON_MIME_TYPES.has(normalizedMimeType(value));
}

export function sanitizeIconHost(value: string): string | null {
  const input = value.trim();
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

export function validateManualIconDataUrl(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MANUAL_ICON_DATA_URL_LENGTH) {
    return false;
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) {
    return false;
  }
  return isAllowedManualIconMimeType(match[1] ?? '');
}

function storageKey(username: string | null | undefined): string {
  const normalizedUser = (username ?? 'anonymous').trim().toLowerCase() || 'anonymous';
  return `${MANUAL_SITE_ICON_STORAGE_PREFIX}:${normalizedUser}`;
}

function sortAndTrim(map: ManualSiteIconMap): ManualSiteIconMap {
  const entries = Object.entries(map)
    .sort((left, right) => {
      const leftTime = Date.parse(left[1].updatedAt);
      const rightTime = Date.parse(right[1].updatedAt);
      return Number.isNaN(rightTime) || Number.isNaN(leftTime) ? 0 : rightTime - leftTime;
    })
    .slice(0, MAX_MANUAL_ICON_RECORDS);
  return Object.fromEntries(entries);
}

export function listManualSiteIcons(username: string | null | undefined): ManualSiteIconMap {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  const raw = localStorage.getItem(storageKey(username));
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as ManualSiteIconMap;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const sanitized: ManualSiteIconMap = {};
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
  } catch {
    return {};
  }
}

function persistManualSiteIcons(username: string | null | undefined, value: ManualSiteIconMap) {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(storageKey(username), JSON.stringify(sortAndTrim(value)));
}

export function upsertManualSiteIcon(input: {
  username: string | null | undefined;
  host: string;
  dataUrl: string;
  source: 'url' | 'file';
}) {
  const safeHost = sanitizeIconHost(input.host);
  if (!safeHost) {
    throw new Error('icon_host_invalid');
  }
  if (!validateManualIconDataUrl(input.dataUrl)) {
    throw new Error('icon_data_invalid');
  }
  const current = listManualSiteIcons(input.username);
  current[safeHost] = {
    dataUrl: input.dataUrl,
    source: input.source,
    updatedAt: new Date().toISOString(),
  };
  persistManualSiteIcons(input.username, current);
}

export function removeManualSiteIcon(username: string | null | undefined, host: string) {
  const safeHost = sanitizeIconHost(host);
  if (!safeHost) {
    return;
  }
  const current = listManualSiteIcons(username);
  if (!(safeHost in current)) {
    return;
  }
  delete current[safeHost];
  persistManualSiteIcons(username, current);
}

export function getManualSiteIconDataUrl(username: string | null | undefined, hostOrUrl: string): string | null {
  const safeHost = sanitizeIconHost(hostOrUrl);
  if (!safeHost) {
    return null;
  }
  const current = listManualSiteIcons(username);
  return current[safeHost]?.dataUrl ?? null;
}

async function decodeBlobToImageBlob(blob: Blob): Promise<HTMLImageElement> {
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

export async function normalizeImageBlobTo64DataUrl(blob: Blob): Promise<string> {
  const mimeType = normalizedMimeType(blob.type);
  if (!isAllowedManualIconMimeType(mimeType)) {
    throw new Error('icon_mime_not_allowed');
  }
  if (blob.size <= 0 || blob.size > MAX_MANUAL_ICON_BYTES) {
    throw new Error('icon_size_limit_exceeded');
  }
  if (typeof document === 'undefined') {
    throw new Error('icon_runtime_unavailable');
  }

  const image = await decodeBlobToImageBlob(blob);
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

export async function importManualSiteIconFromFile(file: File): Promise<string> {
  return normalizeImageBlobTo64DataUrl(file);
}

export async function importManualSiteIconFromUrl(rawUrl: string): Promise<string> {
  const parsed = new URL(rawUrl.trim());
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

