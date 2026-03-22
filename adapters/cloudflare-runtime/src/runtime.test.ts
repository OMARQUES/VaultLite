import { describe, expect, test } from 'vitest';

import {
  createDefaultSecurityHeaders,
  createSessionCookieBundle,
  parseCookieHeader,
  serializeCookie,
} from './index';

describe('cloudflare runtime adapter', () => {
  test('serializes hardened session cookies and parses them back', () => {
    const bundle = createSessionCookieBundle({
      secure: true,
      sessionMaxAgeSeconds: 3600,
      csrfMaxAgeSeconds: 3600,
    });
    const serialized = serializeCookie(bundle.session.name, 'session_1', bundle.session);
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('SameSite=Lax');
    expect(serialized).toContain('Secure');

    const parsed = parseCookieHeader('vl_session=session_1; vl_csrf=csrf_1');
    expect(parsed.vl_session).toBe('session_1');
    expect(parsed.vl_csrf).toBe('csrf_1');
  });

  test('creates security headers baseline', () => {
    const headers = createDefaultSecurityHeaders({
      cspValue: "default-src 'self'",
      includeHsts: true,
      noStore: true,
    });
    expect(headers.get('content-security-policy')).toBe("default-src 'self'");
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('permissions-policy')).toContain('camera=()');
    expect(headers.get('strict-transport-security')).toContain('max-age=');
    expect(headers.get('cache-control')).toBe('no-store');
  });
});
