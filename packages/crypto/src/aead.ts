import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { fromBase64Url, toBase64Url } from './base64';

interface EncryptAeadInput {
  key: Buffer;
  plaintext: Buffer;
  nonce?: Buffer;
  aad?: string;
}

interface EncryptAeadOutput {
  nonce: string;
  ciphertext: string;
  authTag: string;
}

interface DecryptAeadInput {
  key: Buffer;
  nonce: string;
  ciphertext: string;
  authTag: string;
  aad?: string;
}

const AES_256_GCM = 'aes-256-gcm';
const GCM_NONCE_LENGTH = 12;

export function encryptAead({ key, plaintext, nonce = randomBytes(GCM_NONCE_LENGTH), aad }: EncryptAeadInput): EncryptAeadOutput {
  const cipher = createCipheriv(AES_256_GCM, key, nonce);

  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(ciphertext),
    authTag: toBase64Url(authTag),
  };
}

export function decryptAead({ key, nonce, ciphertext, authTag, aad }: DecryptAeadInput): Buffer {
  const decipher = createDecipheriv(AES_256_GCM, key, fromBase64Url(nonce));

  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  decipher.setAuthTag(fromBase64Url(authTag));

  return Buffer.concat([
    decipher.update(fromBase64Url(ciphertext)),
    decipher.final(),
  ]);
}
