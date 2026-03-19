import { z } from 'zod';

import { VAULT_ITEM_TYPES } from '@vaultlite/domain';
import {
  base64UrlSchema,
  deploymentFingerprintSchema,
  isoDatetimeSchema,
  usernameSchema,
} from './shared';

const ExportVaultItemTypeSchema = z.enum(VAULT_ITEM_TYPES);

export const VaultJsonExportSourceSchema = z
  .object({
    app: z.literal('vaultlite-web'),
    schemaVersion: z.number().int().positive(),
    username: usernameSchema,
    deploymentFingerprint: deploymentFingerprintSchema,
  })
  .strict();

export const VaultJsonExportItemSchema = z
  .object({
    itemId: z.string().min(1),
    itemType: ExportVaultItemTypeSchema,
    revision: z.number().int().positive(),
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const VaultJsonExportTombstoneSchema = z
  .object({
    itemId: z.string().min(1),
    itemType: ExportVaultItemTypeSchema,
    revision: z.number().int().positive(),
    deletedAt: isoDatetimeSchema,
  })
  .strict();

export const VaultJsonExportUiFolderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export const VaultJsonExportUiStateSchema = z
  .object({
    favorites: z.array(z.string().min(1)),
    folderAssignments: z.record(z.string(), z.string().nullable()),
    folders: z.array(VaultJsonExportUiFolderSchema),
  })
  .strict();

export const VaultJsonExportV1Schema = z
  .object({
    version: z.literal('vaultlite.export.v1'),
    exportedAt: isoDatetimeSchema,
    source: VaultJsonExportSourceSchema,
    vault: z
      .object({
        items: z.array(VaultJsonExportItemSchema),
        tombstones: z.array(VaultJsonExportTombstoneSchema),
        counts: z
          .object({
            items: z.number().int().nonnegative(),
            tombstones: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    uiState: VaultJsonExportUiStateSchema.nullable(),
  })
  .strict();

export const BackupManifestV1Schema = z
  .object({
    itemCount: z.number().int().nonnegative(),
    tombstoneCount: z.number().int().nonnegative(),
    uiStateIncluded: z.boolean(),
    attachmentMode: z.enum(['none', 'inline_encrypted_blobs']),
    attachmentCount: z.number().int().nonnegative(),
    attachmentBytes: z.number().int().nonnegative(),
  })
  .strict();

export const BackupAttachmentEntryV1Schema = z
  .object({
    uploadId: z.string().min(1),
    itemId: z.string().min(1),
    fileName: z.string().min(1),
    contentType: z.string().min(1),
    size: z.number().int().positive(),
    uploadedAt: isoDatetimeSchema,
    attachedAt: isoDatetimeSchema,
    envelope: z.string().min(1),
    envelopeSha256: base64UrlSchema,
  })
  .strict();

export const EncryptedBackupPackageV1Schema = z
  .object({
    version: z.literal('vaultlite.backup.v1'),
    createdAt: isoDatetimeSchema,
    source: VaultJsonExportSourceSchema,
    manifest: BackupManifestV1Schema,
    kdf: z
      .object({
        algorithm: z.literal('argon2id'),
        memory: z.number().int().positive(),
        passes: z.number().int().positive(),
        parallelism: z.number().int().positive(),
        dkLen: z.number().int().positive(),
        salt: base64UrlSchema,
      })
      .strict(),
    encryption: z
      .object({
        algorithm: z.literal('aes-256-gcm'),
        nonce: base64UrlSchema,
        aad: z.literal('vaultlite.backup.v1'),
      })
      .strict(),
    payload: z
      .object({
        ciphertext: base64UrlSchema,
        authTag: base64UrlSchema,
        plaintextSha256: base64UrlSchema,
      })
      .strict(),
    vault: z
      .object({
        attachments: z.array(BackupAttachmentEntryV1Schema),
      })
      .strict(),
  })
  .strict();

export type VaultJsonExportV1 = z.infer<typeof VaultJsonExportV1Schema>;
export type BackupManifestV1 = z.infer<typeof BackupManifestV1Schema>;
export type BackupAttachmentEntryV1 = z.infer<typeof BackupAttachmentEntryV1Schema>;
export type EncryptedBackupPackageV1 = z.infer<typeof EncryptedBackupPackageV1Schema>;
