import { describe, expect, test } from 'vitest';

import {
  DEFAULT_LOCAL_API_ORIGIN,
  DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN,
  DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT,
  createWorkerRuntimeConfig,
} from './runtime-config';

describe('createWorkerRuntimeConfig', () => {
  test('returns local defaults for the worker runtime', () => {
    const config = createWorkerRuntimeConfig({});

    expect(config.serverUrl).toBe(DEFAULT_LOCAL_API_ORIGIN);
    expect(config.deploymentFingerprint).toBe(DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT);
    expect(config.bootstrapAdminToken).toBe(DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN);
    expect(config.secureCookies).toBe(false);
  });

  test('accepts explicit environment overrides', () => {
    const config = createWorkerRuntimeConfig({
      VAULTLITE_SERVER_URL: 'https://vaultlite.example',
      VAULTLITE_DEPLOYMENT_FINGERPRINT: 'production_deployment',
      VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'bootstrap-secret',
    });

    expect(config.serverUrl).toBe('https://vaultlite.example');
    expect(config.deploymentFingerprint).toBe('production_deployment');
    expect(config.bootstrapAdminToken).toBe('bootstrap-secret');
    expect(config.secureCookies).toBe(true);
  });
});
