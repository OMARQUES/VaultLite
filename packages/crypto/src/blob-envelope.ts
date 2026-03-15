import { AttachmentEnvelopeSchema, type AttachmentEnvelope } from '@vaultlite/contracts';

import { decryptAead, encryptAead } from './aead';
import { assertSupportedVersion } from './versioned';

interface EncryptBlobEnvelopeInput {
  key: Buffer;
  plaintext: Buffer;
  contentType: string;
  nonce?: Buffer;
}

interface DecryptBlobEnvelopeInput {
  key: Buffer;
  envelope: AttachmentEnvelope;
}

const SUPPORTED_BLOB_VERSIONS = ['blob.v1'] as const;

export function encryptBlobEnvelope({ key, plaintext, contentType, nonce }: EncryptBlobEnvelopeInput): AttachmentEnvelope {
  const encrypted = encryptAead({ key, plaintext, nonce });

  return AttachmentEnvelopeSchema.parse({
    version: 'blob.v1',
    algorithm: 'aes-256-gcm',
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
    authTag: encrypted.authTag,
    contentType,
    originalSize: plaintext.byteLength,
  });
}

export function decryptBlobEnvelope({ key, envelope }: DecryptBlobEnvelopeInput): Buffer {
  assertSupportedVersion(envelope.version, SUPPORTED_BLOB_VERSIONS);
  AttachmentEnvelopeSchema.parse(envelope);

  return decryptAead({
    key,
    nonce: envelope.nonce,
    ciphertext: envelope.ciphertext,
    authTag: envelope.authTag,
  });
}
