import { getDomain } from 'tldts';

export interface SiteIconDiscoveryRecord {
  domain: string;
  dataUrl: string;
  sourceUrl: string | null;
  fetchedAt: string;
  updatedAt: string;
}

interface CandidateIconUrl {
  url: string;
  score: number;
}

interface ParsedLinkTag {
  rel: string;
  href: string;
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

function parseLinkTagAttributes(rawTag: string): ParsedLinkTag | null {
  const relMatch = rawTag.match(/\brel\s*=\s*(['"])(.*?)\1/iu);
  const hrefMatch = rawTag.match(/\bhref\s*=\s*(['"])(.*?)\1/iu);
  if (!hrefMatch || !hrefMatch[2]) {
    return null;
  }
  const rel = String(relMatch?.[2] ?? '').trim().toLowerCase();
  const href = String(hrefMatch[2]).trim();
  if (!href) {
    return null;
  }
  return { rel, href };
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
      icons.push({ url: candidateUrl, score: 120 });
      continue;
    }
    if (isAppleTouch) {
      icons.push({ url: candidateUrl, score: 100 });
      continue;
    }
    if (isMaskIcon) {
      icons.push({ url: candidateUrl, score: 60 });
    }
  }

  return { icons, manifests };
}

function parseManifestIconCandidates(input: { manifestPayload: string; manifestUrl: string }): CandidateIconUrl[] {
  try {
    const parsed = JSON.parse(input.manifestPayload) as { icons?: Array<{ src?: string }> };
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
      candidates.push({ url: candidateUrl, score: 80 });
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

  const conventionalCandidates: CandidateIconUrl[] = [
    { url: `https://${normalizedDomain}/favicon.ico`, score: 70 },
    { url: `https://${normalizedDomain}/apple-touch-icon.png`, score: 65 },
    { url: `https://${normalizedDomain}/favicon.svg`, score: 62 },
    { url: `https://${normalizedDomain}/favicon.png`, score: 60 },
    { url: `https://${normalizedDomain}/favicon.jpg`, score: 58 },
    { url: `https://${normalizedDomain}/favicon.jpeg`, score: 57 },
    { url: `https://${normalizedDomain}/favicon.webp`, score: 56 },
    { url: `https://${normalizedDomain}/apple-touch-icon-precomposed.png`, score: 55 },
  ];

  const fallbackCandidates: CandidateIconUrl[] = [
    {
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(normalizedDomain)}&sz=64`,
      score: 30,
    },
  ];
  const registrable = registrableDomain(normalizedDomain);
  if (registrable && registrable !== normalizedDomain) {
    fallbackCandidates.push({
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(registrable)}&sz=64`,
      score: 20,
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
    const contentTypeRaw = response.headers.get('content-type') ?? '';
    const mimeType = contentTypeRaw.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!mimeType.startsWith('image/')) {
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) {
      continue;
    }
    const dataUrl = `data:${mimeType};base64,${asBase64(bytes)}`;
    return {
      domain: normalizedDomain,
      dataUrl,
      sourceUrl: candidate.url,
      fetchedAt: input.nowIso,
      updatedAt: input.nowIso,
    };
  }

  return null;
}
