import { getDomain } from './vendor/tldts/index.esm.min.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeHost(hostname) {
  if (typeof hostname !== 'string') {
    return '';
  }
  return hostname.trim().toLowerCase().replace(/\.$/u, '');
}

function isIpv4Host(hostname) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(hostname);
}

function isIpv6Host(hostname) {
  return hostname.includes(':');
}

function isIpHost(hostname) {
  return isIpv4Host(hostname) || isIpv6Host(hostname);
}

export function hostFromRawUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null;
  }
  try {
    const value = rawUrl.trim();
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    const hostname = normalizeHost(parsed.hostname);
    if (!hostname) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export function registrableDomain(hostname) {
  const normalizedHost = normalizeHost(hostname);
  if (!normalizedHost) {
    return null;
  }
  if (LOOPBACK_HOSTS.has(normalizedHost) || isIpHost(normalizedHost)) {
    return normalizedHost;
  }
  const domain = getDomain(normalizedHost, { allowPrivateDomains: true });
  return normalizeHost(domain || normalizedHost);
}

export function buildFaviconCandidates(rawUrl) {
  const host = hostFromRawUrl(rawUrl);
  if (!host) {
    return [];
  }
  const candidates = [
    `https://${host}/favicon.ico`,
    `https://${host}/favicon.png`,
    `https://${host}/apple-touch-icon.png`,
    `https://${host}/apple-touch-icon-precomposed.png`,
  ];
  candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
  const rootDomain = registrableDomain(host);
  if (rootDomain && rootDomain !== host) {
    candidates.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rootDomain)}&sz=64`,
    );
  }
  return candidates;
}
