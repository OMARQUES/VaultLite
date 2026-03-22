import type { SessionCookieBundle } from '@vaultlite/runtime-abstractions';

export interface CookieSerializeOptions {
  domain?: string;
  path?: string;
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
}

function encodeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieSerializeOptions,
): string {
  const segments = [`${name}=${encodeCookieValue(value)}`];
  segments.push(`Path=${options.path ?? '/'}`);

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }
  if (options.maxAgeSeconds !== undefined) {
    segments.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  if (options.httpOnly) {
    segments.push('HttpOnly');
  }
  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    segments.push('Secure');
  }

  return segments.join('; ');
}

export function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, segment) => {
      const separatorIndex = segment.indexOf('=');
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = segment.slice(0, separatorIndex);
      const value = decodeURIComponent(segment.slice(separatorIndex + 1));
      accumulator[key] = value;
      return accumulator;
    }, {});
}

export function createSessionCookieBundle(input: {
  domain?: string;
  secure: boolean;
  sessionMaxAgeSeconds: number;
  csrfMaxAgeSeconds: number;
}): SessionCookieBundle {
  return {
    session: {
      name: 'vl_session',
      domain: input.domain,
      path: '/',
      secure: input.secure,
      httpOnly: true,
      sameSite: 'Lax',
      maxAgeSeconds: input.sessionMaxAgeSeconds,
    },
    csrf: {
      name: 'vl_csrf',
      domain: input.domain,
      path: '/',
      secure: input.secure,
      httpOnly: false,
      sameSite: 'Strict',
      maxAgeSeconds: input.csrfMaxAgeSeconds,
    },
  };
}

export function createDefaultSecurityHeaders(input: {
  cspValue: string;
  includeHsts?: boolean;
  noStore?: boolean;
}): Headers {
  const headers = new Headers();
  headers.set('content-security-policy', input.cspValue);
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  if (input.noStore) {
    headers.set('cache-control', 'no-store');
  }
  if (input.includeHsts) {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  return headers;
}
