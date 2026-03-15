import { z } from 'zod';

import { ATTACHMENT_LIFECYCLE_STATES, USER_LIFECYCLE_STATES, VAULT_ITEM_TYPES } from '@vaultlite/domain';
import {
  accountKeySchema,
  base64UrlSchema,
  encryptedPayloadSchema,
  isoDatetimeSchema,
  usernameSchema,
} from './shared';

export const UserLifecycleStateSchema = z.enum(USER_LIFECYCLE_STATES);
export const AttachmentLifecycleStateSchema = z.enum(ATTACHMENT_LIFECYCLE_STATES);
export const DevicePlatformSchema = z.enum(['web', 'extension']);
export const SessionStateSchema = z.enum([
  'anonymous',
  'remote_authentication_required',
  'onboarding_export_required',
  'local_unlock_required',
  'ready',
]);
export const AccountKitVerificationStatusSchema = z.enum(['valid', 'invalid']);
export const GenericAuthFailureSchema = z.object({
  ok: z.literal(false),
  code: z.literal('invalid_credentials'),
  message: z.literal('Invalid credentials'),
});

export const OnboardingCompleteInputSchema = z
  .object({
    inviteToken: z.string().min(1),
    username: usernameSchema,
    authSalt: base64UrlSchema,
    authVerifier: encryptedPayloadSchema,
    encryptedAccountBundle: encryptedPayloadSchema,
    accountKeyWrapped: encryptedPayloadSchema,
    accountKitExportAcknowledged: z.literal(true),
    zeroRecoveryAcknowledged: z.literal(true),
    initialDevice: z
      .object({
        deviceId: z.string().min(1),
        deviceName: z.string().min(1),
        platform: DevicePlatformSchema,
      })
      .strict(),
  })
  .strict();

export const PasswordRotationInputSchema = z
  .object({
    currentPassword: z.string().min(1),
    nextPassword: z.string().min(1),
    expected_bundle_version: z.number().int().nonnegative(),
  })
  .strict();

export const RemoteAuthenticationInputSchema = z
  .object({
    username: usernameSchema,
    deviceId: z.string().min(1),
    authProof: encryptedPayloadSchema,
  })
  .strict();

export const RemoteAuthenticationChallengeInputSchema = z
  .object({
    username: usernameSchema,
  })
  .strict();

export const RemoteAuthenticationChallengeOutputSchema = z
  .object({
    authSalt: base64UrlSchema,
    requiresRemoteAuthentication: z.literal(true),
  })
  .strict();

export const NewDeviceBootstrapInputSchema = z
  .object({
    username: usernameSchema,
    authProof: encryptedPayloadSchema,
    deviceName: z.string().min(1),
    devicePlatform: DevicePlatformSchema,
  })
  .strict();

export const InviteCreateInputSchema = z
  .object({
    expiresAt: isoDatetimeSchema,
  })
  .strict();

export const InviteCreateOutputSchema = z
  .object({
    inviteToken: z.string().min(1),
    expiresAt: isoDatetimeSchema,
  })
  .strict();

export const RuntimeMetadataSchema = z
  .object({
    serverUrl: z.string().url(),
    deploymentFingerprint: z.string().min(1),
  })
  .strict();

export const VaultItemTypeSchema = z.enum(VAULT_ITEM_TYPES);
export const VaultItemSummarySchema = z
  .object({
    itemId: z.string().min(1),
    itemType: VaultItemTypeSchema,
    revision: z.number().int().positive(),
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict();
export const VaultItemRecordSchema = VaultItemSummarySchema.extend({
  encryptedPayload: encryptedPayloadSchema,
}).strict();
export const VaultItemTombstoneRecordSchema = z
  .object({
    itemId: z.string().min(1),
    ownerUserId: z.string().min(1),
    itemType: VaultItemTypeSchema,
    revision: z.number().int().positive(),
    deletedAt: isoDatetimeSchema,
  })
  .strict();
export const VaultItemListOutputSchema = z
  .object({
    items: z.array(VaultItemRecordSchema),
  })
  .strict();
export const VaultItemCreateInputSchema = z
  .object({
    itemType: VaultItemTypeSchema,
    encryptedPayload: encryptedPayloadSchema,
  })
  .strict();
export const VaultItemUpdateInputSchema = z
  .object({
    itemType: VaultItemTypeSchema,
    encryptedPayload: encryptedPayloadSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const TrustedSessionResponseSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().min(1),
    csrfToken: z.string().min(1),
    user: z
      .object({
        userId: z.string().min(1),
        username: usernameSchema,
        lifecycleState: UserLifecycleStateSchema,
      })
      .strict(),
    device: z
      .object({
        deviceId: z.string().min(1),
        deviceName: z.string().min(1),
        platform: DevicePlatformSchema,
      })
      .strict(),
  })
  .strict();

export const SessionRestoreResponseSchema = z
  .object({
    ok: z.literal(true),
    sessionState: SessionStateSchema,
    user: z
      .object({
        userId: z.string().min(1),
        username: usernameSchema,
        lifecycleState: UserLifecycleStateSchema,
      })
      .strict()
      .optional(),
    device: z
      .object({
        deviceId: z.string().min(1),
        deviceName: z.string().min(1),
        platform: DevicePlatformSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const AccountKitSignatureInputSchema = z
  .object({
    payload: z.object({
      version: z.literal('account-kit.v1'),
      serverUrl: z.string().url(),
      username: usernameSchema,
      accountKey: accountKeySchema,
      deploymentFingerprint: z.string().min(1),
      issuedAt: isoDatetimeSchema,
    }),
  })
  .strict();

export const AccountKitSignatureOutputSchema = z
  .object({
    signature: base64UrlSchema,
    canonicalPayload: z.string().min(1).optional(),
  })
  .strict();

export const OnboardingAccountKitSignInputSchema = z
  .object({
    inviteToken: z.string().min(1),
    username: usernameSchema,
    payload: AccountKitSignatureInputSchema.shape.payload,
  })
  .strict();

export const AccountKitVerificationInputSchema = z
  .object({
    payload: z.object({
      version: z.literal('account-kit.v1'),
      serverUrl: z.string().url(),
      username: usernameSchema,
      accountKey: accountKeySchema,
      deploymentFingerprint: z.string().min(1),
      issuedAt: isoDatetimeSchema,
    }),
    signature: base64UrlSchema,
  })
  .strict();

export const AccountKitVerificationOutputSchema = z
  .object({
    status: AccountKitVerificationStatusSchema,
  })
  .strict();

export type OnboardingCompleteInput = z.infer<typeof OnboardingCompleteInputSchema>;
export type PasswordRotationInput = z.infer<typeof PasswordRotationInputSchema>;
export type RemoteAuthenticationInput = z.infer<typeof RemoteAuthenticationInputSchema>;
export type RemoteAuthenticationChallengeInput = z.infer<
  typeof RemoteAuthenticationChallengeInputSchema
>;
export type RemoteAuthenticationChallengeOutput = z.infer<
  typeof RemoteAuthenticationChallengeOutputSchema
>;
export type NewDeviceBootstrapInput = z.infer<typeof NewDeviceBootstrapInputSchema>;
export type InviteCreateInput = z.infer<typeof InviteCreateInputSchema>;
export type InviteCreateOutput = z.infer<typeof InviteCreateOutputSchema>;
export type RuntimeMetadata = z.infer<typeof RuntimeMetadataSchema>;
export type VaultItemType = z.infer<typeof VaultItemTypeSchema>;
export type VaultItemSummary = z.infer<typeof VaultItemSummarySchema>;
export type VaultItemRecord = z.infer<typeof VaultItemRecordSchema>;
export type VaultItemTombstoneRecord = z.infer<typeof VaultItemTombstoneRecordSchema>;
export type VaultItemListOutput = z.infer<typeof VaultItemListOutputSchema>;
export type VaultItemCreateInput = z.infer<typeof VaultItemCreateInputSchema>;
export type VaultItemUpdateInput = z.infer<typeof VaultItemUpdateInputSchema>;
export type TrustedSessionResponse = z.infer<typeof TrustedSessionResponseSchema>;
export type SessionRestoreResponse = z.infer<typeof SessionRestoreResponseSchema>;
export type GenericAuthFailure = z.infer<typeof GenericAuthFailureSchema>;
export type AccountKitSignatureInput = z.infer<typeof AccountKitSignatureInputSchema>;
export type AccountKitSignatureOutput = z.infer<typeof AccountKitSignatureOutputSchema>;
export type OnboardingAccountKitSignInput = z.infer<typeof OnboardingAccountKitSignInputSchema>;
export type AccountKitVerificationInput = z.infer<typeof AccountKitVerificationInputSchema>;
export type AccountKitVerificationOutput = z.infer<typeof AccountKitVerificationOutputSchema>;
