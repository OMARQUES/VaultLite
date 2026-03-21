export interface ServerUrlValidationOptions {
  isDevelopment: boolean;
}

const DEV_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface NormalizedServerUrl {
  canonicalUrl: string;
  origin: string;
}

export function normalizeServerUrl(
  rawValue: string,
  options: ServerUrlValidationOptions,
): NormalizedServerUrl {
  const value = rawValue.trim();
  if (!value) {
    throw new Error('server_origin_not_allowed');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('server_origin_not_allowed');
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  if (protocol === 'https:') {
    return {
      canonicalUrl: parsed.origin,
      origin: parsed.origin,
    };
  }

  if (protocol !== 'http:' || !options.isDevelopment || !DEV_HTTP_HOSTS.has(hostname)) {
    throw new Error('server_origin_not_allowed');
  }

  return {
    canonicalUrl: parsed.origin,
    origin: parsed.origin,
  };
}
