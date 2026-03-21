import { describe, expect, test } from 'vitest';

import { diagnoseCredentialCache } from '../credential-cache-diagnostics.js';

describe('credential cache diagnostics', () => {
  test('reports decrypt mismatch when login entries exist but none can be decrypted', () => {
    expect(
      diagnoseCredentialCache({
        loginEntriesSeen: 7,
        decryptedEntries: 0,
        decryptFailures: 7,
      }),
    ).toEqual({
      code: 'credential_decrypt_failed',
      message:
        'Could not decrypt login items with this trusted state. Lock and unlock again. If it persists, reconnect this extension.',
    });
  });

  test('does not report mismatch when no login entries exist remotely', () => {
    expect(
      diagnoseCredentialCache({
        loginEntriesSeen: 0,
        decryptedEntries: 0,
        decryptFailures: 0,
      }),
    ).toBeNull();
  });

  test('does not report mismatch when at least one login decrypt succeeds', () => {
    expect(
      diagnoseCredentialCache({
        loginEntriesSeen: 7,
        decryptedEntries: 3,
        decryptFailures: 4,
      }),
    ).toBeNull();
  });
});

