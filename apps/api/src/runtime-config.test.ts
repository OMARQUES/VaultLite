import { describe, expect, test } from 'vitest';

import {
  DEFAULT_LOCAL_API_ORIGIN,
  DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN,
  DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT,
  createWorkerRuntimeConfig,
} from './runtime-config';

describe('createWorkerRuntimeConfig', () => {
  test('requires explicit runtime mode', () => {
    expect(() => createWorkerRuntimeConfig({})).toThrow('runtime_config_invalid');
  });

  test('returns local defaults for development runtime', () => {
    const config = createWorkerRuntimeConfig({
      VAULTLITE_RUNTIME_MODE: 'development',
    });

    expect(config.serverUrl).toBe(DEFAULT_LOCAL_API_ORIGIN);
    expect(config.deploymentFingerprint).toBe(DEFAULT_LOCAL_DEPLOYMENT_FINGERPRINT);
    expect(config.bootstrapAdminToken).toBe(DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN);
    expect(config.secureCookies).toBe(false);
    expect(config.runtimeMode).toBe('development');
  });

  test('accepts explicit environment overrides', () => {
    const config = createWorkerRuntimeConfig({
      VAULTLITE_RUNTIME_MODE: 'test',
      VAULTLITE_SERVER_URL: 'https://vaultlite.example',
      VAULTLITE_DEPLOYMENT_FINGERPRINT: 'production_deployment',
      VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'bootstrap-secret',
    });

    expect(config.serverUrl).toBe('https://vaultlite.example');
    expect(config.deploymentFingerprint).toBe('production_deployment');
    expect(config.bootstrapAdminToken).toBe('bootstrap-secret');
    expect(config.secureCookies).toBe(true);
    expect(config.runtimeMode).toBe('test');
  });

  test('rejects invalid runtime mode', () => {
    expect(() =>
      createWorkerRuntimeConfig({
        VAULTLITE_RUNTIME_MODE: 'staging',
      }),
    ).toThrow('runtime_config_invalid');
  });

  test('rejects weak or default bootstrap tokens in production', () => {
    expect(() =>
      createWorkerRuntimeConfig({
        VAULTLITE_RUNTIME_MODE: 'production',
        VAULTLITE_SERVER_URL: 'https://vaultlite.example',
        VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: DEFAULT_LOCAL_BOOTSTRAP_ADMIN_TOKEN,
        VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY: 'priv',
        VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY: 'pub',
      }),
    ).toThrow('runtime_config_invalid');

    expect(() =>
      createWorkerRuntimeConfig({
        VAULTLITE_RUNTIME_MODE: 'production',
        VAULTLITE_SERVER_URL: 'https://vaultlite.example',
        VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'too-short',
        VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY: 'priv',
        VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY: 'pub',
      }),
    ).toThrow('runtime_config_invalid');
  });

  test('rejects missing account kit keypair in production', () => {
    expect(() =>
      createWorkerRuntimeConfig({
        VAULTLITE_RUNTIME_MODE: 'production',
        VAULTLITE_SERVER_URL: 'https://vaultlite.example',
        VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'very-strong-bootstrap-token-1234567890',
      }),
    ).toThrow('runtime_config_invalid');
  });

  test('accepts production runtime with strong token and explicit keypair', () => {
    const config = createWorkerRuntimeConfig({
      VAULTLITE_RUNTIME_MODE: 'production',
      VAULTLITE_SERVER_URL: 'https://vaultlite.example',
      VAULTLITE_DEPLOYMENT_FINGERPRINT: 'production_deployment',
      VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'very-strong-bootstrap-token-1234567890',
      VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY: 'private-key-material',
      VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY: 'public-key-material',
    });

    expect(config.runtimeMode).toBe('production');
    expect(config.accountKitPrivateKey).toBe('private-key-material');
    expect(config.accountKitPublicKey).toBe('public-key-material');
  });
});
