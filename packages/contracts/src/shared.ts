import { z } from 'zod';

export const MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES = 256 * 1024;
export const MAX_ATTACHMENT_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_UPLOAD_ENVELOPE_BODY_BYTES = 40 * 1024 * 1024;

export const base64UrlSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, 'Expected a base64url string');

export const isoDatetimeSchema = z.string().datetime({ offset: true });
export const usernameSchema = z
  .string()
  .min(3, 'Username must have at least 3 characters')
  .max(64, 'Username must have at most 64 characters')
  .regex(/^[A-Za-z0-9._-]+$/, 'Username contains unsupported characters');
export const serverUrlSchema = z.url({ protocol: /^https?$/ });
export const deploymentFingerprintSchema = z
  .string()
  .min(8, 'Deployment fingerprint is too short')
  .max(128, 'Deployment fingerprint is too long');
export const accountKeySchema = base64UrlSchema.length(43, 'Account Key must encode 32 bytes');
export const encryptedPayloadSchema = base64UrlSchema.min(1, 'Encrypted payload is too short');
