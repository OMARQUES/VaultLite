import { describe, expect, test } from 'vitest';

import worker from './index';

describe('worker runtime bootstrap failures', () => {
  test('returns controlled JSON instead of opaque worker failure when production storage bindings are missing', async () => {
    const response = await worker.fetch(
      new Request('https://vaultlite.example.com/api/bootstrap/state'),
      {
        VAULTLITE_RUNTIME_MODE: 'production',
        VAULTLITE_SERVER_URL: 'https://vaultlite.example.com',
        VAULTLITE_DEPLOYMENT_FINGERPRINT: 'prod_deployment_1',
        VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'very-strong-bootstrap-token-1234567890',
        VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY: 'private-key-material',
        VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY: 'public-key-material',
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'runtime_config_invalid',
    });
  });
});
