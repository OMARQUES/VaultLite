import type { ProxyOptions } from 'vite';

export const DEFAULT_LOCAL_API_PROXY_TARGET = 'http://127.0.0.1:8787';

export function createApiProxyTarget(env: Record<string, string | undefined>): string {
  return env.VITE_API_PROXY_TARGET?.trim() || DEFAULT_LOCAL_API_PROXY_TARGET;
}

export function createLocalApiProxyConfig(env: Record<string, string | undefined>): Record<string, ProxyOptions> {
  return {
    '/api': {
      target: createApiProxyTarget(env),
      changeOrigin: true,
      secure: false,
    },
  };
}
