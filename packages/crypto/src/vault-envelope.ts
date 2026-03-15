import { VaultEnvelopeSchema, type VaultEnvelope } from '@vaultlite/contracts';

import { decryptAead, encryptAead } from './aead';
import { assertSupportedVersion } from './versioned';

interface EncryptVaultEnvelopeInput {
  key: Buffer;
  plaintext: Buffer;
  aad: string;
  nonce?: Buffer;
}

interface DecryptVaultEnvelopeInput {
  key: Buffer;
  envelope: VaultEnvelope;
  aad: string;
}

const SUPPORTED_VAULT_VERSIONS = ['vault.v1'] as const;

export function encryptVaultEnvelope({ key, plaintext, aad, nonce }: EncryptVaultEnvelopeInput): VaultEnvelope {
  const encrypted = encryptAead({ key, plaintext, nonce, aad });

  return VaultEnvelopeSchema.parse({
    version: 'vault.v1',
    algorithm: 'aes-256-gcm',
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
    authTag: encrypted.authTag,
    aad,
  });
}

export function decryptVaultEnvelope({ key, envelope, aad }: DecryptVaultEnvelopeInput): Buffer {
  assertSupportedVersion(envelope.version, SUPPORTED_VAULT_VERSIONS);
  VaultEnvelopeSchema.parse(envelope);

  return decryptAead({
    key,
    nonce: envelope.nonce,
    ciphertext: envelope.ciphertext,
    authTag: envelope.authTag,
    aad,
  });
}
