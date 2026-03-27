import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

import { createLocalApiProxyConfig } from './vite.proxy';

function canonicalizeConnectOrigin(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(httpOrigin: string): string | null {
  try {
    const parsed = new URL(httpOrigin);
    if (parsed.protocol === 'https:') {
      parsed.protocol = 'wss:';
    } else if (parsed.protocol === 'http:') {
      parsed.protocol = 'ws:';
    } else {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseCsvOrigins(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  const allowed = new Set<string>();
  for (const candidate of input.split(',')) {
    const normalized = canonicalizeConnectOrigin(candidate);
    if (normalized) {
      allowed.add(normalized);
    }
  }
  return Array.from(allowed);
}

function buildWebCsp(mode: string, env: Record<string, string>): string {
  const connectSrc = new Set<string>(["'self'"]);

  if (mode === 'development') {
    [
      'http://127.0.0.1:8787',
      'ws://127.0.0.1:8787',
      'http://localhost:8787',
      'ws://localhost:8787',
    ].forEach((origin) => connectSrc.add(origin));
    parseCsvOrigins(env.VITE_DEV_CSP_CONNECT_SRC).forEach((origin) => connectSrc.add(origin));
  } else {
    parseCsvOrigins(env.VITE_CSP_CONNECT_SRC).forEach((origin) => connectSrc.add(origin));

    const apiOrigin = canonicalizeConnectOrigin(env.VITE_API_ORIGIN ?? '');
    if (apiOrigin) {
      connectSrc.add(apiOrigin);
      const wsFromApi = toWebSocketOrigin(apiOrigin);
      if (wsFromApi) {
        connectSrc.add(wsFromApi);
      }
    }

    const wsOrigin = canonicalizeConnectOrigin(env.VITE_REALTIME_WS_BASE_URL ?? '');
    if (wsOrigin) {
      connectSrc.add(wsOrigin);
    }
  }

  return [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    `connect-src ${Array.from(connectSrc).join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function createCspHtmlPlugin(mode: string, env: Record<string, string>): Plugin {
  const csp = buildWebCsp(mode, env);
  return {
    name: 'vaultlite-web-csp',
    transformIndexHtml(html) {
      return html.replace('%VAULTLITE_WEB_CSP%', csp);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue(), createCspHtmlPlugin(mode, env)],
    server: {
      proxy: createLocalApiProxyConfig(process.env),
    },
  };
});
