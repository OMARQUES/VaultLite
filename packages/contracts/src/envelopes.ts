import { z } from 'zod';

import { encryptedPayloadSchema } from './shared';

const algorithmSchema = z.literal('aes-256-gcm');

export const VaultEnvelopeSchema = z
  .object({
    version: z.literal('vault.v1'),
    algorithm: algorithmSchema,
    nonce: encryptedPayloadSchema,
    ciphertext: encryptedPayloadSchema,
    authTag: encryptedPayloadSchema,
    aad: z.string().min(1, 'AAD is required'),
  })
  .strict();

export const AttachmentEnvelopeSchema = z
  .object({
    version: z.literal('blob.v1'),
    algorithm: algorithmSchema,
    nonce: encryptedPayloadSchema,
    ciphertext: encryptedPayloadSchema,
    authTag: encryptedPayloadSchema,
    contentType: z.string().min(1, 'Content type is required'),
    originalSize: z.number().int().nonnegative(),
  })
  .strict();

export type VaultEnvelope = z.infer<typeof VaultEnvelopeSchema>;
export type AttachmentEnvelope = z.infer<typeof AttachmentEnvelopeSchema>;
