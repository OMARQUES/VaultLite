export interface OriginPolicyOptions {
  isDevelopment: boolean;
}

const BLOCKED_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'file:',
  'data:',
  'about:',
  'edge:',
  'moz-extension:',
]);

function normalizePort(protocol: string, port: string): string {
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

function isDevLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1';
}

export function canonicalOrigin(urlValue: string): string {
  const parsed = new URL(urlValue);
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = normalizePort(protocol, parsed.port);
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

export function isPageUrlEligibleForFill(urlValue: string, options: OriginPolicyOptions): boolean {
  let parsed: URL;
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

  return options.isDevelopment && isDevLoopback(parsed.hostname);
}

export function isCredentialAllowedForSite(input: {
  pageUrl: string;
  credentialUrls: string[];
  options: OriginPolicyOptions;
}): boolean {
  if (!isPageUrlEligibleForFill(input.pageUrl, input.options)) {
    return false;
  }

  const pageOrigin = canonicalOrigin(input.pageUrl);
  for (const rawUrl of input.credentialUrls) {
    try {
      if (canonicalOrigin(rawUrl) === pageOrigin) {
        return true;
      }
    } catch {
      // Ignore invalid item URL entries.
    }
  }
  return false;
}

export function scoreDomainMatch(input: { pageUrl: string; candidateUrls: string[] }): number {
  try {
    const page = new URL(input.pageUrl);
    const pageHost = page.hostname.toLowerCase();
    for (const candidateUrl of input.candidateUrls) {
      const candidate = new URL(candidateUrl);
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
