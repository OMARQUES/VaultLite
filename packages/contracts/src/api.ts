import { z } from 'zod';

import {
  ATTACHMENT_LIFECYCLE_STATES,
  BOOTSTRAP_DEPLOYMENT_STATES,
  DEVICE_STATES,
  USER_LIFECYCLE_STATES,
  USER_ROLES,
  VAULT_ITEM_TYPES,
} from '@vaultlite/domain';
import {
  accountKeySchema,
  MAX_ATTACHMENT_UPLOAD_ENVELOPE_BODY_BYTES,
  MAX_ATTACHMENT_UPLOAD_SIZE_BYTES,
  MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES,
  base64UrlSchema,
  encryptedPayloadSchema,
  isoDatetimeSchema,
  usernameSchema,
} from './shared';

export const UserLifecycleStateSchema = z.enum(USER_LIFECYCLE_STATES);
export const UserRoleSchema = z.enum(USER_ROLES);
export const BootstrapDeploymentStateSchema = z.enum(BOOTSTRAP_DEPLOYMENT_STATES);
export const DeviceStateSchema = z.enum(DEVICE_STATES);
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
    currentAuthProof: encryptedPayloadSchema,
    nextAuthSalt: base64UrlSchema,
    nextAuthVerifier: encryptedPayloadSchema,
    nextEncryptedAccountBundle: encryptedPayloadSchema,
    nextAccountKeyWrapped: encryptedPayloadSchema,
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

export const CanonicalResultSchema = z.enum([
  'success_changed',
  'success_no_op',
  'conflict',
  'denied',
]);

export const BootstrapStateOutputSchema = z
  .object({
    bootstrapState: BootstrapDeploymentStateSchema,
  })
  .strict();

export const BootstrapVerifyInputSchema = z
  .object({
    bootstrapToken: z.string().min(1),
  })
  .strict();

export const BootstrapVerifyOutputSchema = z
  .object({
    ok: z.literal(true),
    verificationToken: z.string().min(1),
    validUntil: isoDatetimeSchema,
  })
  .strict();

export const BootstrapInitializeOwnerInputSchema = z
  .object({
    verificationToken: z.string().min(1),
    username: usernameSchema,
    authSalt: base64UrlSchema,
    authVerifier: encryptedPayloadSchema,
    encryptedAccountBundle: encryptedPayloadSchema,
    accountKeyWrapped: encryptedPayloadSchema,
    initialDeviceName: z.string().min(1),
    initialDevicePlatform: DevicePlatformSchema,
  })
  .strict();

export const BootstrapInitializeOwnerOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    bootstrapState: BootstrapDeploymentStateSchema,
    user: z
      .object({
        userId: z.string().min(1),
        username: usernameSchema,
        role: UserRoleSchema,
        bundleVersion: z.number().int().nonnegative(),
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

export const BootstrapCheckpointDownloadInputSchema = z
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

export const BootstrapCheckpointDownloadOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    downloadAttemptCount: z.number().int().positive(),
    accountKit: z.object({
      payload: BootstrapCheckpointDownloadInputSchema.shape.payload,
      signature: base64UrlSchema,
    }),
  })
  .strict();

export const BootstrapCheckpointCompleteInputSchema = z
  .object({
    confirmSavedOutsideBrowser: z.literal(true),
  })
  .strict();

export const BootstrapCheckpointCompleteOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    bootstrapState: BootstrapDeploymentStateSchema,
  })
  .strict();

export const RecentReauthInputSchema = z
  .object({
    authProof: encryptedPayloadSchema,
  })
  .strict();

export const RecentReauthOutputSchema = z
  .object({
    ok: z.literal(true),
    validUntil: isoDatetimeSchema,
  })
  .strict();

export const AdminInviteCreateInputSchema = z
  .object({
    expiresAt: isoDatetimeSchema,
  })
  .strict();

export const AdminInviteCreateOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    inviteId: z.string().min(1),
    expiresAt: isoDatetimeSchema,
    tokenPreview: z.string().min(1),
    inviteLink: z.string().url().optional(),
    tokenDelivery: z.enum(['delivered_once', 'not_available_on_replay']).optional(),
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const AdminInviteStatusSchema = z.enum(['active', 'used', 'expired', 'revoked']);

export const AdminInviteRecordSchema = z
  .object({
    inviteId: z.string().min(1),
    tokenPreview: z.string().min(1),
    status: AdminInviteStatusSchema,
    createdByUserId: z.string().min(1),
    expiresAt: isoDatetimeSchema,
    consumedAt: isoDatetimeSchema.nullable(),
    consumedByUserId: z.string().min(1).nullable(),
    revokedAt: isoDatetimeSchema.nullable(),
    revokedByUserId: z.string().min(1).nullable(),
    createdAt: isoDatetimeSchema,
  })
  .strict();

export const AdminInviteListOutputSchema = z
  .object({
    invites: z.array(AdminInviteRecordSchema),
  })
  .strict();

export const AdminInviteRevokeOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const AdminUserRecordSchema = z
  .object({
    userId: z.string().min(1),
    username: usernameSchema,
    role: UserRoleSchema,
    lifecycleState: UserLifecycleStateSchema,
    createdAt: isoDatetimeSchema,
    trustedDevicesCount: z.number().int().nonnegative(),
  })
  .strict();

export const AdminUserListOutputSchema = z
  .object({
    users: z.array(AdminUserRecordSchema),
  })
  .strict();

export const AdminUserLifecycleMutationOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
    user: AdminUserRecordSchema,
  })
  .strict();

export const AdminAuditEventRecordSchema = z
  .object({
    eventId: z.string().min(1),
    eventType: z.string().min(1),
    actorUserId: z.string().min(1).nullable(),
    targetType: z.string().min(1),
    targetId: z.string().min(1).nullable(),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).nullable(),
    requestId: z.string().min(1).nullable(),
    createdAt: isoDatetimeSchema,
    ipHash: z.string().min(1).nullable(),
    userAgentHash: z.string().min(1).nullable(),
  })
  .strict();

export const AdminAuditListOutputSchema = z
  .object({
    events: z.array(AdminAuditEventRecordSchema),
  })
  .strict();

export const DeviceSummarySchema = z
  .object({
    deviceId: z.string().min(1),
    deviceName: z.string().min(1),
    platform: DevicePlatformSchema,
    deviceState: DeviceStateSchema,
    createdAt: isoDatetimeSchema,
    revokedAt: isoDatetimeSchema.nullable(),
    isCurrentDevice: z.boolean(),
    lastAuthenticatedAt: isoDatetimeSchema.nullable(),
  })
  .strict();

export const DeviceListOutputSchema = z
  .object({
    devices: z.array(DeviceSummarySchema),
  })
  .strict();

export const DeviceRevokeOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const SyncSnapshotQuerySchema = z
  .object({
    snapshotToken: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  })
  .strict();

export const SyncSnapshotItemEntrySchema = z
  .object({
    entryType: z.literal('item'),
    item: z.lazy(() => VaultItemRecordSchema),
  })
  .strict();

export const SyncSnapshotTombstoneEntrySchema = z
  .object({
    entryType: z.literal('tombstone'),
    tombstone: z.lazy(() => VaultItemTombstoneRecordSchema),
  })
  .strict();

export const SyncSnapshotEntrySchema = z.union([
  SyncSnapshotItemEntrySchema,
  SyncSnapshotTombstoneEntrySchema,
]);

export const SyncSnapshotOutputSchema = z
  .object({
    snapshotToken: z.string().min(1),
    snapshotAsOf: isoDatetimeSchema,
    snapshotDigest: z.string().min(1),
    pageSize: z.number().int().positive(),
    nextCursor: z.string().min(1).nullable(),
    entries: z.array(SyncSnapshotEntrySchema),
  })
  .strict();

export const PasswordRotationCompleteOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    bundleVersion: z.number().int().nonnegative(),
    user: z
      .object({
        userId: z.string().min(1),
        username: usernameSchema,
        role: UserRoleSchema,
        bundleVersion: z.number().int().nonnegative(),
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
export const VaultItemRestoreOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    item: VaultItemRecordSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict();
export const VaultItemCreateInputSchema = z
  .object({
    itemType: VaultItemTypeSchema,
    encryptedPayload: encryptedPayloadSchema.max(
      MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES,
      'Vault item payload exceeds maximum size',
    ),
  })
  .strict();
export const VaultItemUpdateInputSchema = z
  .object({
    itemType: VaultItemTypeSchema,
    encryptedPayload: encryptedPayloadSchema.max(
      MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES,
      'Vault item payload exceeds maximum size',
    ),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const AttachmentUploadInitInputSchema = z
  .object({
    itemId: z.string().min(1),
    fileName: z.string().min(1),
    contentType: z.string().min(1),
    size: z.number().int().positive().max(MAX_ATTACHMENT_UPLOAD_SIZE_BYTES),
    idempotencyKey: z.string().min(1),
  })
  .strict();

export const AttachmentUploadContentInputSchema = z
  .object({
    uploadToken: z.string().min(1),
    encryptedEnvelope: encryptedPayloadSchema.max(
      MAX_ATTACHMENT_UPLOAD_ENVELOPE_BODY_BYTES,
      'Attachment upload envelope exceeds maximum size',
    ),
  })
  .strict();

export const AttachmentUploadFinalizeInputSchema = z
  .object({
    uploadId: z.string().min(1),
    itemId: z.string().min(1),
  })
  .strict();

export const AttachmentUploadRecordSchema = z
  .object({
    uploadId: z.string().min(1),
    itemId: z.string().min(1),
    fileName: z.string().min(1),
    lifecycleState: AttachmentLifecycleStateSchema,
    contentType: z.string().min(1),
    size: z.number().int().positive(),
    expiresAt: isoDatetimeSchema,
    uploadedAt: isoDatetimeSchema.nullable(),
    attachedAt: isoDatetimeSchema.nullable(),
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const AttachmentUploadInitOutputSchema = AttachmentUploadRecordSchema.extend({
  uploadToken: z.string().min(1),
}).strict();

export const AttachmentUploadListOutputSchema = z
  .object({
    uploads: z.array(AttachmentUploadRecordSchema),
  })
  .strict();

export const AttachmentUploadFinalizeOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    upload: AttachmentUploadRecordSchema,
  })
  .strict();

export const AttachmentUploadEnvelopeOutputSchema = z
  .object({
    uploadId: z.string().min(1),
    itemId: z.string().min(1),
    fileName: z.string().min(1),
    contentType: z.string().min(1),
    size: z.number().int().positive(),
    uploadedAt: isoDatetimeSchema,
    attachedAt: isoDatetimeSchema,
    encryptedEnvelope: encryptedPayloadSchema.max(
      MAX_ATTACHMENT_UPLOAD_ENVELOPE_BODY_BYTES,
      'Attachment upload envelope exceeds maximum size',
    ),
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
        role: UserRoleSchema,
        bundleVersion: z.number().int().nonnegative(),
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
        role: UserRoleSchema,
        bundleVersion: z.number().int().nonnegative(),
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
export type CanonicalResult = z.infer<typeof CanonicalResultSchema>;
export type BootstrapStateOutput = z.infer<typeof BootstrapStateOutputSchema>;
export type BootstrapVerifyInput = z.infer<typeof BootstrapVerifyInputSchema>;
export type BootstrapVerifyOutput = z.infer<typeof BootstrapVerifyOutputSchema>;
export type BootstrapInitializeOwnerInput = z.infer<typeof BootstrapInitializeOwnerInputSchema>;
export type BootstrapInitializeOwnerOutput = z.infer<typeof BootstrapInitializeOwnerOutputSchema>;
export type BootstrapCheckpointDownloadInput = z.infer<typeof BootstrapCheckpointDownloadInputSchema>;
export type BootstrapCheckpointDownloadOutput = z.infer<typeof BootstrapCheckpointDownloadOutputSchema>;
export type BootstrapCheckpointCompleteInput = z.infer<typeof BootstrapCheckpointCompleteInputSchema>;
export type BootstrapCheckpointCompleteOutput = z.infer<typeof BootstrapCheckpointCompleteOutputSchema>;
export type RecentReauthInput = z.infer<typeof RecentReauthInputSchema>;
export type RecentReauthOutput = z.infer<typeof RecentReauthOutputSchema>;
export type AdminInviteCreateInput = z.infer<typeof AdminInviteCreateInputSchema>;
export type AdminInviteCreateOutput = z.infer<typeof AdminInviteCreateOutputSchema>;
export type AdminInviteRecord = z.infer<typeof AdminInviteRecordSchema>;
export type AdminInviteListOutput = z.infer<typeof AdminInviteListOutputSchema>;
export type AdminInviteRevokeOutput = z.infer<typeof AdminInviteRevokeOutputSchema>;
export type AdminUserRecord = z.infer<typeof AdminUserRecordSchema>;
export type AdminUserListOutput = z.infer<typeof AdminUserListOutputSchema>;
export type AdminUserLifecycleMutationOutput = z.infer<typeof AdminUserLifecycleMutationOutputSchema>;
export type AdminAuditEventRecord = z.infer<typeof AdminAuditEventRecordSchema>;
export type AdminAuditListOutput = z.infer<typeof AdminAuditListOutputSchema>;
export type DeviceSummary = z.infer<typeof DeviceSummarySchema>;
export type DeviceListOutput = z.infer<typeof DeviceListOutputSchema>;
export type DeviceRevokeOutput = z.infer<typeof DeviceRevokeOutputSchema>;
export type VaultItemType = z.infer<typeof VaultItemTypeSchema>;
export type VaultItemSummary = z.infer<typeof VaultItemSummarySchema>;
export type VaultItemRecord = z.infer<typeof VaultItemRecordSchema>;
export type VaultItemTombstoneRecord = z.infer<typeof VaultItemTombstoneRecordSchema>;
export type VaultItemListOutput = z.infer<typeof VaultItemListOutputSchema>;
export type VaultItemRestoreOutput = z.infer<typeof VaultItemRestoreOutputSchema>;
export type VaultItemCreateInput = z.infer<typeof VaultItemCreateInputSchema>;
export type VaultItemUpdateInput = z.infer<typeof VaultItemUpdateInputSchema>;
export type AttachmentUploadInitInput = z.infer<typeof AttachmentUploadInitInputSchema>;
export type AttachmentUploadContentInput = z.infer<typeof AttachmentUploadContentInputSchema>;
export type AttachmentUploadFinalizeInput = z.infer<typeof AttachmentUploadFinalizeInputSchema>;
export type AttachmentUploadRecord = z.infer<typeof AttachmentUploadRecordSchema>;
export type AttachmentUploadInitOutput = z.infer<typeof AttachmentUploadInitOutputSchema>;
export type AttachmentUploadListOutput = z.infer<typeof AttachmentUploadListOutputSchema>;
export type AttachmentUploadFinalizeOutput = z.infer<typeof AttachmentUploadFinalizeOutputSchema>;
export type AttachmentUploadEnvelopeOutput = z.infer<typeof AttachmentUploadEnvelopeOutputSchema>;
export type TrustedSessionResponse = z.infer<typeof TrustedSessionResponseSchema>;
export type SessionRestoreResponse = z.infer<typeof SessionRestoreResponseSchema>;
export type GenericAuthFailure = z.infer<typeof GenericAuthFailureSchema>;
export type AccountKitSignatureInput = z.infer<typeof AccountKitSignatureInputSchema>;
export type AccountKitSignatureOutput = z.infer<typeof AccountKitSignatureOutputSchema>;
export type OnboardingAccountKitSignInput = z.infer<typeof OnboardingAccountKitSignInputSchema>;
export type AccountKitVerificationInput = z.infer<typeof AccountKitVerificationInputSchema>;
export type AccountKitVerificationOutput = z.infer<typeof AccountKitVerificationOutputSchema>;
export type SyncSnapshotQuery = z.infer<typeof SyncSnapshotQuerySchema>;
export type SyncSnapshotEntry = z.infer<typeof SyncSnapshotEntrySchema>;
export type SyncSnapshotOutput = z.infer<typeof SyncSnapshotOutputSchema>;
export type PasswordRotationCompleteOutput = z.infer<typeof PasswordRotationCompleteOutputSchema>;
