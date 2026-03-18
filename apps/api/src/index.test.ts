import { describe, expect, test } from 'vitest';

import { createWorkerApp } from './index';

describe('createWorkerApp', () => {
  test('rejects production runtime when distributed storage bindings are missing', async () => {
    await expect(
      createWorkerApp({
        VAULTLITE_RUNTIME_MODE: 'production',
        VAULTLITE_SERVER_URL: 'https://vaultlite.example.com',
        VAULTLITE_DEPLOYMENT_FINGERPRINT: 'prod_deployment_1',
        VAULTLITE_BOOTSTRAP_ADMIN_TOKEN: 'very-strong-bootstrap-token-1234567890',
        VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY: 'private-key-material',
        VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY: 'public-key-material',
      }),
    ).rejects.toThrow('runtime_config_invalid');
  });
});
