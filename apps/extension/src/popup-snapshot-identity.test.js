import { describe, expect, test } from 'vitest';

import {
  buildTrustedIdentitySignature,
  isTrustedIdentitySoftMatch,
  resolveTrustedIdentitySignatureFromPersistedPayload,
  resolveTrustedIdentitySignatureFromState,
  resolveTrustedIdentitySignatureFromTrustedRecord,
} from '../popup-snapshot-identity.js';

describe('popup snapshot trusted identity signature', () => {
  test('builds stable signature from trusted identity fields', () => {
    expect(
      buildTrustedIdentitySignature({
        serverOrigin: 'HTTPS://VaultLite-Web.Pages.Dev',
        deploymentFingerprint: 'vaultlite_prod_001',
        username: 'omarques',
        deviceId: 'device_ext_123',
      }),
    ).toBe('https://vaultlite-web.pages.dev|vaultlite_prod_001|omarques|device_ext_123');
  });

  test('returns null when any required trusted identity field is missing', () => {
    expect(
      buildTrustedIdentitySignature({
        serverOrigin: 'https://vaultlite-web.pages.dev',
        deploymentFingerprint: 'vaultlite_prod_001',
        username: '',
        deviceId: 'device_ext_123',
      }),
    ).toBeNull();
  });

  test('uses legacy fallback when deployment fingerprint is missing', () => {
    expect(
      buildTrustedIdentitySignature({
        serverOrigin: 'https://vaultlite-web.pages.dev',
        username: 'omarques',
        deviceId: 'device_ext_123',
      }),
    ).toBe('https://vaultlite-web.pages.dev|__legacy_deployment_fingerprint__|omarques|device_ext_123');
  });

  test('resolves trusted signature from state only when trusted state is present', () => {
    expect(
      resolveTrustedIdentitySignatureFromState({
        hasTrustedState: true,
        serverOrigin: 'https://vaultlite-web.pages.dev',
        deploymentFingerprint: 'vaultlite_prod_001',
        username: 'omarques',
        deviceId: 'device_ext_123',
      }),
    ).toBe('https://vaultlite-web.pages.dev|vaultlite_prod_001|omarques|device_ext_123');

    expect(
      resolveTrustedIdentitySignatureFromState({
        hasTrustedState: false,
        serverOrigin: 'https://vaultlite-web.pages.dev',
        deploymentFingerprint: 'vaultlite_prod_001',
        username: 'omarques',
        deviceId: 'device_ext_123',
      }),
    ).toBeNull();
  });

  test('resolves trusted signature from trusted record payload', () => {
    expect(
      resolveTrustedIdentitySignatureFromTrustedRecord({
        serverOrigin: 'https://vaultlite-web.pages.dev',
        deploymentFingerprint: 'vaultlite_prod_001',
        username: 'omarques',
        deviceId: 'device_ext_123',
      }),
    ).toBe('https://vaultlite-web.pages.dev|vaultlite_prod_001|omarques|device_ext_123');
  });

  test('prefers explicit persisted signature when present', () => {
    expect(
      resolveTrustedIdentitySignatureFromPersistedPayload({
        trustedIdentitySignature: 'sig:trusted:v1',
        serverOrigin: 'https://should-not-be-used.dev',
      }),
    ).toBe('sig:trusted:v1');
  });

  test('falls back to deriving persisted signature from identity fields', () => {
    expect(
      resolveTrustedIdentitySignatureFromPersistedPayload({
        serverOrigin: 'https://vaultlite-web.pages.dev',
        deploymentFingerprint: 'vaultlite_prod_001',
        username: 'omarques',
        deviceId: 'device_ext_123',
      }),
    ).toBe('https://vaultlite-web.pages.dev|vaultlite_prod_001|omarques|device_ext_123');
  });

  test('allows soft match when deployment fingerprint falls back to legacy placeholder', () => {
    expect(
      isTrustedIdentitySoftMatch(
        'https://vaultlite-web.pages.dev|vaultlite_prod_001|omarques|device_ext_123',
        'https://vaultlite-web.pages.dev|__legacy_deployment_fingerprint__|omarques|device_ext_123',
      ),
    ).toBe(true);
  });

  test('rejects soft match when account identity differs', () => {
    expect(
      isTrustedIdentitySoftMatch(
        'https://vaultlite-web.pages.dev|vaultlite_prod_001|omarques|device_ext_123',
        'https://vaultlite-web.pages.dev|vaultlite_prod_001|other-user|device_ext_123',
      ),
    ).toBe(false);
  });
});
