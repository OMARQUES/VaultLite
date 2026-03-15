export const KDF_TEST_VECTOR_V1 = {
  password: 'correct horse battery staple',
  saltHex: '00112233445566778899aabbccddeeff',
  derivedKeyHex: 'aeb08a81bdb9da07c32f8f9d2c87cfba3313c0fdc7468179e494c56680f0ae8d',
} as const;

export const ACCOUNT_KIT_CANONICAL_VECTOR_V1 = {
  canonicalPayload: '{"accountKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","deploymentFingerprint":"fp_owner_deployment","issuedAt":"2026-03-15T12:00:00.000Z","serverUrl":"https://vaultlite.example.com","username":"alice","version":"account-kit.v1"}',
} as const;
