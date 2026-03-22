import { getDomain } from 'tldts';

export interface SiteIconDiscoveryRecord {
  domain: string;
  dataUrl: string;
  sourceUrl: string | null;
  fetchedAt: string;
  updatedAt: string;
  resolvedBy?: string;
  finalUrl?: string | null;
  candidateCount?: number;
  reasonCode?: string;
}

interface CandidateIconUrl {
  url: string;
  score: number;
  resolvedBy: string;
  reasonCode: string;
}

interface ParsedLinkTag {
  rel: string;
  href: string;
  type: string;
  sizes: string;
}

const DEFAULT_FETCH_TIMEOUT_MS = 3_500;
const DEFAULT_MAX_IMAGE_BYTES = 512 * 1024;
const DEFAULT_MAX_HTML_BYTES = 256 * 1024;

function stripTrailingDot(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

export function normalizeDomainCandidate(rawValue: string): string | null {
  if (typeof rawValue !== 'string') {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    const hostname = stripTrailingDot(url.hostname.toLowerCase());
    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const parsed = parts.map((part) => Number.parseInt(part, 10));
  if (parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return parsed;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function normalizeIpv6(hostname: string): string {
  return hostname.replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = normalizeIpv6(hostname);
  if (!normalized.includes(':')) {
    return false;
  }
  if (normalized === '::1' || normalized === '::') {
    return true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  return false;
}

export function isBlockedIconHost(hostname: string): boolean {
  const normalized = stripTrailingDot(hostname.trim().toLowerCase());
  if (!normalized) {
    return true;
  }
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa') ||
    normalized.endsWith('.localdomain')
  ) {
    return true;
  }
  if (isPrivateIpv4(normalized) || isPrivateIpv6(normalized)) {
    return true;
  }
  return false;
}

export function registrableDomain(hostname: string): string | null {
  const normalized = normalizeDomainCandidate(hostname);
  if (!normalized) {
    return null;
  }
  return getDomain(normalized, { allowPrivateDomains: false });
}

function parseTagAttributes(rawTag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const matcher = /\b([^\s"'=<>`\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  let match = matcher.exec(rawTag);
  while (match) {
    const key = String(match[1] ?? '').trim().toLowerCase();
    if (key && key !== 'link') {
      const value = String(match[2] ?? match[3] ?? match[4] ?? '').trim();
      attributes.set(key, value);
    }
    match = matcher.exec(rawTag);
  }
  return attributes;
}

function parseLinkTagAttributes(rawTag: string): ParsedLinkTag | null {
  const attributes = parseTagAttributes(rawTag);
  const href = String(attributes.get('href') ?? '').trim();
  if (!href) {
    return null;
  }
  const rel = String(attributes.get('rel') ?? '').trim().toLowerCase();
  const type = String(attributes.get('type') ?? '').trim().toLowerCase();
  const sizes = String(attributes.get('sizes') ?? '').trim().toLowerCase();
  return { rel, href, type, sizes };
}

function iconSizeBonus(rawSizes: string): number {
  const sizes = String(rawSizes ?? '').trim().toLowerCase();
  if (!sizes) {
    return 0;
  }
  if (sizes.includes('any')) {
    return 10;
  }
  let maxSize = 0;
  const entries = sizes.split(/\s+/u);
  for (const entry of entries) {
    const match = /^(\d{1,4})x(\d{1,4})$/u.exec(entry);
    if (!match) {
      continue;
    }
    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }
    maxSize = Math.max(maxSize, Math.min(width, height));
  }
  if (maxSize >= 192) {
    return 24;
  }
  if (maxSize >= 128) {
    return 20;
  }
  if (maxSize >= 64) {
    return 14;
  }
  if (maxSize >= 32) {
    return 8;
  }
  if (maxSize > 0) {
    return 4;
  }
  return 0;
}

function iconTypeBonus(rawType: string): number {
  const mime = String(rawType ?? '').trim().toLowerCase();
  if (!mime) {
    return 0;
  }
  if (mime === 'image/svg+xml') {
    return 8;
  }
  if (mime === 'image/png' || mime === 'image/webp') {
    return 6;
  }
  if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') {
    return 4;
  }
  if (mime.startsWith('image/')) {
    return 2;
  }
  return 0;
}

function scoreFromMetadata(baseScore: number, parsed: ParsedLinkTag): number {
  return baseScore + iconSizeBonus(parsed.sizes) + iconTypeBonus(parsed.type);
}

function resolveCandidateUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseHeadCandidates(input: {
  html: string;
  baseUrl: string;
}): {
  icons: CandidateIconUrl[];
  manifests: string[];
} {
  const matches = input.html.match(/<link\b[^>]*>/giu) ?? [];
  const icons: CandidateIconUrl[] = [];
  const manifests: string[] = [];

  for (const rawTag of matches) {
    const parsed = parseLinkTagAttributes(rawTag);
    if (!parsed) {
      continue;
    }
    const relTokens = parsed.rel
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const candidateUrl = resolveCandidateUrl(parsed.href, input.baseUrl);
    if (!candidateUrl) {
      continue;
    }

    if (relTokens.includes('manifest')) {
      manifests.push(candidateUrl);
      continue;
    }

    const isIcon = relTokens.includes('icon') || parsed.rel === 'shortcut icon';
    const isAppleTouch =
      relTokens.includes('apple-touch-icon') || relTokens.includes('apple-touch-icon-precomposed');
    const isMaskIcon = relTokens.includes('mask-icon');

    if (isIcon) {
      icons.push({
        url: candidateUrl,
        score: scoreFromMetadata(120, parsed),
        resolvedBy: 'html_link_icon',
        reasonCode: 'head_link_icon',
      });
      continue;
    }
    if (isAppleTouch) {
      icons.push({
        url: candidateUrl,
        score: scoreFromMetadata(100, parsed),
        resolvedBy: 'apple_touch_icon',
        reasonCode: 'head_apple_touch_icon',
      });
      continue;
    }
    if (isMaskIcon) {
      icons.push({
        url: candidateUrl,
        score: scoreFromMetadata(60, parsed),
        resolvedBy: 'mask_icon',
        reasonCode: 'head_mask_icon',
      });
    }
  }

  return { icons, manifests };
}

function parseManifestIconCandidates(input: { manifestPayload: string; manifestUrl: string }): CandidateIconUrl[] {
  try {
    const parsed = JSON.parse(input.manifestPayload) as {
      icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
    };
    if (!Array.isArray(parsed.icons)) {
      return [];
    }
    const candidates: CandidateIconUrl[] = [];
    for (const icon of parsed.icons) {
      if (!icon || typeof icon.src !== 'string' || icon.src.trim().length === 0) {
        continue;
      }
      const candidateUrl = resolveCandidateUrl(icon.src, input.manifestUrl);
      if (!candidateUrl) {
        continue;
      }
      const sizesBonus = iconSizeBonus(String(icon.sizes ?? ''));
      const typeBonus = iconTypeBonus(String(icon.type ?? ''));
      const purposeBonus = String(icon.purpose ?? '').toLowerCase().includes('maskable') ? 6 : 0;
      candidates.push({
        url: candidateUrl,
        score: 80 + sizesBonus + typeBonus + purposeBonus,
        resolvedBy: 'manifest_icon',
        reasonCode: 'manifest_icon',
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

function dedupeCandidates(candidates: CandidateIconUrl[]): CandidateIconUrl[] {
  const byUrl = new Map<string, CandidateIconUrl>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing || existing.score < candidate.score) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return Array.from(byUrl.values()).sort((left, right) => right.score - left.score);
}

function asBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/avif',
  'image/apng',
]);

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0, 0, 1, 0])) {
    return 'image/x-icon';
  }
  if (startsWithBytes(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return 'image/png';
  }
  if (startsWithBytes(bytes, [255, 216, 255])) {
    return 'image/jpeg';
  }
  if (startsWithBytes(bytes, [82, 73, 70, 70]) && bytes.byteLength >= 12) {
    const webpMarker = [87, 69, 66, 80];
    if (
      bytes[8] === webpMarker[0] &&
      bytes[9] === webpMarker[1] &&
      bytes[10] === webpMarker[2] &&
      bytes[11] === webpMarker[3]
    ) {
      return 'image/webp';
    }
  }
  const probeLength = Math.min(bytes.byteLength, 512);
  const probeText = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, probeLength)).toLowerCase();
  if (probeText.includes('<svg') || probeText.startsWith('<?xml')) {
    return 'image/svg+xml';
  }
  return null;
}

function resolveEffectiveImageMime(contentTypeHeader: string, bytes: Uint8Array): string | null {
  const headerMime = String(contentTypeHeader ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  if (headerMime && ALLOWED_IMAGE_MIME_TYPES.has(headerMime)) {
    return headerMime;
  }
  if (headerMime && headerMime.startsWith('image/')) {
    return headerMime;
  }
  return detectImageMimeFromBytes(bytes);
}

async function readResponseTextWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  const contentLengthRaw = response.headers.get('content-length');
  if (contentLengthRaw) {
    const parsedLength = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return null;
    }
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    return null;
  }
  return new TextDecoder().decode(buffer);
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'VaultLiteIconResolver/1.0',
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isAllowedAutomaticCandidate(input: { candidateUrl: string; originalDomain: string }): boolean {
  try {
    const parsed = new URL(input.candidateUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'www.google.com' && parsed.pathname === '/s2/favicons') {
      return true;
    }
    if (isBlockedIconHost(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function discoverSiteIcon(input: {
  domain: string;
  nowIso: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxImageBytes?: number;
  maxHtmlBytes?: number;
}): Promise<SiteIconDiscoveryRecord | null> {
  const normalizedDomain = normalizeDomainCandidate(input.domain);
  if (!normalizedDomain || isBlockedIconHost(normalizedDomain)) {
    return null;
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxImageBytes = input.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const maxHtmlBytes = input.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;

  const homepageUrl = `https://${normalizedDomain}/`;
  const linkIcons: CandidateIconUrl[] = [];
  const manifestIcons: CandidateIconUrl[] = [];
  const manifests: string[] = [];

  const homepageResponse = await fetchWithTimeout(fetchImpl, homepageUrl, timeoutMs);
  if (homepageResponse && homepageResponse.ok) {
    const homepageHtml = await readResponseTextWithLimit(homepageResponse, maxHtmlBytes);
    if (homepageHtml) {
      const baseUrl = homepageResponse.url || homepageUrl;
      const parsedHead = parseHeadCandidates({
        html: homepageHtml,
        baseUrl,
      });
      linkIcons.push(...parsedHead.icons);
      manifests.push(...parsedHead.manifests);
    }
  }

  for (const manifestUrl of manifests) {
    const response = await fetchWithTimeout(fetchImpl, manifestUrl, timeoutMs);
    if (!response || !response.ok) {
      continue;
    }
    const payload = await readResponseTextWithLimit(response, maxHtmlBytes);
    if (!payload) {
      continue;
    }
    manifestIcons.push(
      ...parseManifestIconCandidates({
        manifestPayload: payload,
        manifestUrl: response.url || manifestUrl,
      }),
    );
  }

  const candidateHosts = new Set<string>([normalizedDomain]);
  const registrable = registrableDomain(normalizedDomain);
  if (normalizedDomain.startsWith('www.') && normalizedDomain.length > 4) {
    candidateHosts.add(normalizedDomain.slice(4));
  }
  if (registrable) {
    candidateHosts.add(registrable);
    candidateHosts.add(`www.${registrable}`);
  }
  const hostList = Array.from(candidateHosts).filter((host) => host.length > 0);

  const conventionalCandidates: CandidateIconUrl[] = [];
  for (const host of hostList) {
    const hostPenalty = host === normalizedDomain ? 0 : 8;
    conventionalCandidates.push(
      {
        url: `https://${host}/favicon.ico`,
        score: 70 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_favicon_ico' : 'conventional_favicon_ico_alias',
      },
      {
        url: `https://${host}/apple-touch-icon.png`,
        score: 65 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_apple_touch_icon' : 'conventional_apple_touch_icon_alias',
      },
      {
        url: `https://${host}/favicon.svg`,
        score: 62 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_favicon_svg' : 'conventional_favicon_svg_alias',
      },
      {
        url: `https://${host}/favicon.png`,
        score: 60 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_favicon_png' : 'conventional_favicon_png_alias',
      },
      {
        url: `https://${host}/favicon.jpg`,
        score: 58 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_favicon_jpg' : 'conventional_favicon_jpg_alias',
      },
      {
        url: `https://${host}/favicon.jpeg`,
        score: 57 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_favicon_jpeg' : 'conventional_favicon_jpeg_alias',
      },
      {
        url: `https://${host}/favicon.webp`,
        score: 56 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode: host === normalizedDomain ? 'conventional_favicon_webp' : 'conventional_favicon_webp_alias',
      },
      {
        url: `https://${host}/apple-touch-icon-precomposed.png`,
        score: 55 - hostPenalty,
        resolvedBy: 'conventional_path',
        reasonCode:
          host === normalizedDomain
            ? 'conventional_apple_touch_icon_precomposed'
            : 'conventional_apple_touch_icon_precomposed_alias',
      },
    );
  }

  const fallbackCandidates: CandidateIconUrl[] = [
    {
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(normalizedDomain)}&sz=64`,
      score: 30,
      resolvedBy: 's2_fallback',
      reasonCode: 'fallback_s2_host',
    },
  ];
  if (registrable && registrable !== normalizedDomain) {
    fallbackCandidates.push({
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(registrable)}&sz=64`,
      score: 20,
      resolvedBy: 's2_fallback',
      reasonCode: 'fallback_s2_registrable',
    });
  }

  const candidates = dedupeCandidates([
    ...linkIcons,
    ...manifestIcons,
    ...conventionalCandidates,
    ...fallbackCandidates,
  ]).filter((candidate) =>
    isAllowedAutomaticCandidate({
      candidateUrl: candidate.url,
      originalDomain: normalizedDomain,
    }),
  );

  for (const candidate of candidates) {
    const response = await fetchWithTimeout(fetchImpl, candidate.url, timeoutMs);
    if (!response || !response.ok) {
      continue;
    }
    const contentLengthRaw = response.headers.get('content-length');
    if (contentLengthRaw) {
      const parsedLength = Number.parseInt(contentLengthRaw, 10);
      if (Number.isFinite(parsedLength) && parsedLength > maxImageBytes) {
        continue;
      }
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) {
      continue;
    }
    const mimeType = resolveEffectiveImageMime(response.headers.get('content-type') ?? '', bytes);
    if (!mimeType) {
      continue;
    }
    const dataUrl = `data:${mimeType};base64,${asBase64(bytes)}`;
    return {
      domain: normalizedDomain,
      dataUrl,
      sourceUrl: candidate.url,
      fetchedAt: input.nowIso,
      updatedAt: input.nowIso,
      resolvedBy: candidate.resolvedBy,
      finalUrl: response.url || candidate.url,
      candidateCount: candidates.length,
      reasonCode: candidate.reasonCode,
    };
  }

  return null;
}
