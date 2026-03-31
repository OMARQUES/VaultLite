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
    iconsAssetBaseUrl: z.string().url().optional(),
    deploymentFingerprint: z.string().min(1),
    realtime: z
      .object({
        enabled: z.boolean(),
        wsBaseUrl: z.string().url(),
        authLeaseSeconds: z.number().int().positive(),
        heartbeatIntervalMs: z.number().int().positive(),
        flags: z
          .object({
            realtime_ws_v1: z.boolean(),
            realtime_delta_vault_v1: z.boolean(),
            realtime_delta_icons_v1: z.boolean(),
            realtime_delta_history_v1: z.boolean(),
            realtime_delta_attachments_v1: z.boolean(),
            realtime_apply_web_v1: z.boolean(),
            realtime_apply_extension_v1: z.boolean(),
            icons_state_sync_v1: z.boolean(),
            icons_ws_apply_web_v1: z.boolean(),
            icons_ws_apply_extension_v1: z.boolean(),
            icons_discovery_v2_v1: z.boolean(),
            icons_fast_first_v1: z.boolean(),
            icons_best_later_v1: z.boolean(),
            icons_http_fallback_v1: z.boolean(),
            icons_manual_private_ticket_v1: z.boolean(),
            icons_provider_favicon_vemetric_enabled: z.boolean(),
            icons_provider_google_s2_enabled: z.boolean(),
            icons_provider_icon_horse_enabled: z.boolean(),
            icons_provider_duckduckgo_ip3_enabled: z.boolean(),
            icons_provider_faviconextractor_enabled: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const RealtimeConnectTokenOutputSchema = z
  .object({
    wsUrl: z.string().url(),
    connectToken: z.string().min(1),
    expiresAt: isoDatetimeSchema,
    resumeCursor: z.number().int().nonnegative(),
    authLeaseExpiresAt: isoDatetimeSchema,
    heartbeatIntervalMs: z.number().int().positive(),
  })
  .strict();

export const RealtimeTopicSchema = z.enum([
  'vault.item.upserted',
  'vault.item.tombstoned',
  'vault.history.upserted',
  'vault.folder.upserted',
  'vault.folder.assignment_changed',
  'icons.state.upserted',
  'icons.state.removed',
  'icons.manual.upserted',
  'icons.manual.removed',
  'icons.discover.resolved',
  'password_history.upserted',
  'password_history.removed',
  'vault.attachment.state_changed',
  'vault.attachment.removed',
]);

export const RealtimeVaultItemUpsertedPayloadSchema = z
  .object({
    itemId: z.string().min(1),
    itemType: z.enum(VAULT_ITEM_TYPES),
    revision: z.number().int().positive(),
    updatedAt: isoDatetimeSchema,
    encryptedPayload: encryptedPayloadSchema,
  })
  .strict();

export const RealtimeVaultItemTombstonedPayloadSchema = z
  .object({
    itemId: z.string().min(1),
    itemType: z.enum(VAULT_ITEM_TYPES),
    revision: z.number().int().positive(),
    deletedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeVaultHistoryUpsertedPayloadSchema = z
  .object({
    historyId: z.string().min(1),
    itemId: z.string().min(1),
    itemRevision: z.number().int().positive(),
    changeType: z.enum(['create', 'update', 'delete', 'restore']),
    createdAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeVaultFolderUpsertedPayloadSchema = z
  .object({
    folderId: z.string().min(1),
    name: z.string().min(1),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeVaultFolderAssignmentChangedPayloadSchema = z
  .object({
    itemId: z.string().min(1),
    folderId: z.string().min(1).nullable(),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeIconsManualUpsertedPayloadSchema = z
  .object({
    domain: z.string().trim().min(1),
    dataUrl: z.string().min(1),
    source: z.enum(['automatic', 'manual', 'url', 'file']),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeIconsManualRemovedPayloadSchema = z
  .object({
    domain: z.string().trim().min(1),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeIconsDiscoverResolvedPayloadSchema = z
  .object({
    icons: z.array(
      z
        .object({
          domain: z.string().trim().min(1),
          dataUrl: z.string().min(1),
          source: z.enum(['automatic', 'manual', 'url', 'file']),
          sourceUrl: z.string().url().nullable(),
          updatedAt: isoDatetimeSchema,
        })
        .strict(),
    ),
    unresolved: z.array(z.string().trim().min(1)),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const IconObjectClassSchema = z.enum(['automatic_public', 'manual_private']);

export const IconStateStatusSchema = z.enum(['pending', 'ready', 'absent', 'removed']);

export const IconStateRecordSchema = z
  .object({
    domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]{1,255}$/),
    status: IconStateStatusSchema,
    objectId: z.string().min(1).nullable(),
    objectClass: IconObjectClassSchema.nullable(),
    objectSha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    contentType: z.string().min(1).nullable(),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeIconsStateUpsertedPayloadSchema = z
  .object({
    iconsVersion: z.number().int().nonnegative(),
    record: IconStateRecordSchema,
  })
  .strict();

export const RealtimeIconsStateRemovedPayloadSchema = z
  .object({
    iconsVersion: z.number().int().nonnegative(),
    domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]{1,255}$/),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimePasswordHistoryUpsertedPayloadSchema = z
  .object({
    entryId: z.string().min(1),
    encryptedPayload: encryptedPayloadSchema,
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimePasswordHistoryRemovedPayloadSchema = z
  .object({
    entryId: z.string().min(1),
    removedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeAttachmentStateChangedPayloadSchema = z
  .object({
    uploadId: z.string().min(1),
    itemId: z.string().min(1),
    lifecycleState: z.literal('attached'),
    contentType: z.string().min(1),
    size: z.number().int().nonnegative(),
    uploadedAt: isoDatetimeSchema,
    attachedAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const RealtimeAttachmentRemovedPayloadSchema = z
  .object({
    uploadId: z.string().min(1),
    itemId: z.string().min(1),
    removedAt: isoDatetimeSchema,
    reason: z.enum(['deleted', 'orphaned']),
  })
  .strict();

export const RealtimeEventEnvelopeSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    eventId: z.string().min(1),
    occurredAt: isoDatetimeSchema,
    deploymentFingerprint: z.string().min(1),
    topic: RealtimeTopicSchema,
    sourceDeviceId: z.string().min(1).nullable(),
    payload: z.unknown(),
  })
  .strict();

export const RealtimeServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('hello'),
      cursor: z.number().int().nonnegative(),
      authLeaseExpiresAt: isoDatetimeSchema,
      heartbeatIntervalMs: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('event'),
      event: RealtimeEventEnvelopeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('resync_required'),
      domains: z.array(
        z.enum([
          'vault',
          'vault_history',
          'icons_manual',
          'icons_state',
          'password_history',
          'attachments',
          'folders',
        ]),
      ),
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('invalidated'),
      code: z.enum([
        'session_revoked',
        'lifecycle_not_active',
        'trusted_state_invalid',
        'lock_revision_advanced',
        'auth_lease_expired_revalidate',
        'deployment_fingerprint_mismatch',
      ]),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .strict(),
]);

export const RealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('hello'),
      cursor: z.number().int().nonnegative().optional(),
      deviceId: z.string().min(1).optional(),
      surface: z.enum(['web', 'extension']).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ack'),
      seq: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('resume'),
      cursor: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ping'),
      ts: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);

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
    encryptedDiffPayload: encryptedPayloadSchema.max(
      MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES,
      'Vault item diff payload exceeds maximum size',
    ).optional(),
  })
  .strict();

export const VaultItemExtensionUpdateInputSchema = VaultItemUpdateInputSchema;
export const VaultItemExtensionCreateInputSchema = VaultItemCreateInputSchema.extend({
  encryptedDiffPayload: encryptedPayloadSchema.max(
    MAX_VAULT_ITEM_ENCRYPTED_PAYLOAD_BYTES,
    'Vault item diff payload exceeds maximum size',
  ).optional(),
}).strict();

export const VaultItemHistoryChangeTypeSchema = z.enum(['create', 'update', 'delete', 'restore']);

export const VaultItemHistoryDiffClassificationSchema = z.enum(['sensitive', 'non_sensitive']);

export const VaultItemHistoryDiffEntrySchema = z
  .object({
    fieldPath: z.string().min(1),
    before: z.string(),
    after: z.string(),
    classification: VaultItemHistoryDiffClassificationSchema,
  })
  .strict();

export const VaultItemHistoryRecordSchema = z
  .object({
    historyId: z.string().min(1),
    itemId: z.string().min(1),
    itemRevision: z.number().int().positive(),
    changeType: VaultItemHistoryChangeTypeSchema,
    encryptedDiffPayload: encryptedPayloadSchema.nullable(),
    sourceDeviceId: z.string().min(1).nullable(),
    sourceDeviceName: z.string().min(1).nullable(),
    createdAt: isoDatetimeSchema,
  })
  .strict();

export const VaultItemHistoryListOutputSchema = z
  .object({
    records: z.array(VaultItemHistoryRecordSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export const VaultFolderRecordSchema = z
  .object({
    folderId: z.string().min(1),
    name: z.string().min(1),
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const VaultFolderAssignmentRecordSchema = z
  .object({
    itemId: z.string().min(1),
    folderId: z.string().min(1),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const VaultFoldersStateOutputSchema = z
  .object({
    folders: z.array(VaultFolderRecordSchema),
    assignments: z.array(VaultFolderAssignmentRecordSchema),
  })
  .strict();

export const VaultFolderUpsertInputSchema = z
  .object({
    folderId: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
  })
  .strict();

export const VaultFolderAssignmentUpsertInputSchema = z
  .object({
    itemId: z.string().min(1),
    folderId: z.string().min(1).max(64).nullable(),
  })
  .strict();

export const VaultFolderMutationOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
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

export const AttachmentStateEntrySchema = z.union([
  z
    .object({
      entryType: z.literal('state_changed'),
      uploadId: z.string().min(1),
      itemId: z.string().min(1),
      lifecycleState: z.literal('attached'),
      contentType: z.string().min(1),
      size: z.number().int().nonnegative(),
      uploadedAt: isoDatetimeSchema,
      attachedAt: isoDatetimeSchema,
      updatedAt: isoDatetimeSchema,
    })
    .strict(),
  z
    .object({
      entryType: z.literal('removed'),
      uploadId: z.string().min(1),
      itemId: z.string().min(1),
      removedAt: isoDatetimeSchema,
      reason: z.enum(['deleted', 'orphaned']),
    })
    .strict(),
]);

export const AttachmentStateOutputSchema = z
  .object({
    cursor: z.string().min(1).nullable(),
    pageSize: z.number().int().positive(),
    entries: z.array(AttachmentStateEntrySchema),
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
    extensionSessionToken: z.string().min(1).optional(),
    sessionExpiresAt: isoDatetimeSchema.optional(),
    unlockIdleTimeoutMs: z.number().int().positive().optional(),
    unlockGrantEnabled: z.boolean().optional(),
    lockRevision: z.number().int().nonnegative().optional(),
    lockScope: z.literal('linked_surface_pair').optional(),
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

export const SessionLockInputSchema = z
  .object({
    reasonCode: z.string().min(1).max(64).optional(),
  })
  .strict();

export const SessionLockOutputSchema = z
  .object({
    ok: z.literal(true),
    lockRevision: z.number().int().nonnegative(),
    appliedScope: z.literal('linked_surface_pair'),
  })
  .strict();

export const SessionPolicySchema = z
  .object({
    unlockIdleTimeoutMs: z.number().int().min(30_000).max(24 * 60 * 60 * 1000),
  })
  .strict();

export const SessionPolicyOutputSchema = z
  .object({
    ok: z.literal(true),
    policy: SessionPolicySchema,
    bounds: z
      .object({
        minUnlockIdleTimeoutMs: z.number().int().positive(),
        maxUnlockIdleTimeoutMs: z.number().int().positive(),
        defaultUnlockIdleTimeoutMs: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const SessionPolicyUpdateInputSchema = SessionPolicySchema;

export const UnlockGrantSurfaceSchema = z.enum(['web', 'extension']);

export const UnlockGrantRequestPublicKeySchema = base64UrlSchema.min(40);

export const UnlockGrantRequestInputSchema = z
  .object({
    deploymentFingerprint: z.string().min(1),
    targetSurface: UnlockGrantSurfaceSchema,
    requestPublicKey: UnlockGrantRequestPublicKeySchema,
    clientNonce: base64UrlSchema.min(16),
  })
  .strict();

export const UnlockGrantRequestOutputSchema = z
  .object({
    ok: z.literal(true),
    requestId: z.string().min(16),
    expiresAt: isoDatetimeSchema,
    interval: z.number().int().positive(),
    serverOrigin: z.string().url(),
    targetSurface: UnlockGrantSurfaceSchema,
  })
  .strict();

export const UnlockGrantPendingRecordSchema = z
  .object({
    requestId: z.string().min(16),
    requesterSurface: UnlockGrantSurfaceSchema,
    requesterDeviceId: z.string().min(1),
    approverSurface: UnlockGrantSurfaceSchema,
    approverDeviceId: z.string().min(1),
    status: z.enum(['pending', 'approved', 'rejected', 'consumed', 'expired']),
    createdAt: isoDatetimeSchema,
    expiresAt: isoDatetimeSchema,
    approvedAt: isoDatetimeSchema.nullable(),
  })
  .strict();

export const UnlockGrantPendingListOutputSchema = z
  .object({
    ok: z.literal(true),
    requests: z.array(UnlockGrantPendingRecordSchema),
  })
  .strict();

export const UnlockGrantActionOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const UnlockGrantProofSchema = z
  .object({
    nonce: base64UrlSchema.min(16),
    signature: base64UrlSchema.min(40),
  })
  .strict();

export const UnlockGrantApproveInputSchema = z
  .object({
    requestId: z.string().min(16),
    approvalNonce: base64UrlSchema.min(16),
    unlockAccountKey: z.string().min(20).optional(),
  })
  .strict();

export const UnlockGrantRejectInputSchema = z
  .object({
    requestId: z.string().min(16),
    rejectionReasonCode: z.string().min(1).max(64).optional(),
  })
  .strict();

export const UnlockGrantStatusInputSchema = z
  .object({
    requestId: z.string().min(16),
    requestProof: UnlockGrantProofSchema,
  })
  .strict();

export const UnlockGrantStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    status: z.enum([
      'authorization_pending',
      'slow_down',
      'approved',
      'rejected',
      'consumed',
      'expired',
      'denied',
    ]),
    interval: z.number().int().positive().optional(),
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const UnlockGrantConsumeInputSchema = z
  .object({
    requestId: z.string().min(16),
    requestProof: UnlockGrantProofSchema,
    consumeNonce: base64UrlSchema.min(16),
  })
  .strict();

export const UnlockGrantConsumeOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    extensionSessionToken: z.string().min(1).optional(),
    sessionExpiresAt: isoDatetimeSchema.optional(),
    unlockAccountKey: z.string().min(20).optional(),
    sessionState: SessionStateSchema,
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

export const ExtensionSessionRecoverInputSchema = z
  .object({
    deviceId: z.string().min(1),
    sessionRecoverKey: base64UrlSchema.min(24),
  })
  .strict();

export const ExtensionSessionRecoverOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    extensionSessionToken: z.string().min(1),
    sessionExpiresAt: isoDatetimeSchema,
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

export const WebBootstrapGrantRequestPublicKeySchema = base64UrlSchema.min(40);

export const WebBootstrapGrantRequestInputSchema = z
  .object({
    deploymentFingerprint: z.string().min(1),
    requestPublicKey: WebBootstrapGrantRequestPublicKeySchema,
    clientNonce: base64UrlSchema.min(16),
    webChallenge: base64UrlSchema.min(16),
    unlockAccountKey: z.string().min(20),
  })
  .strict();

export const WebBootstrapGrantRequestOutputSchema = z
  .object({
    ok: z.literal(true),
    grantId: z.string().min(16),
    expiresAt: isoDatetimeSchema,
    interval: z.number().int().positive(),
    serverOrigin: z.string().url(),
  })
  .strict();

export const WebBootstrapGrantConsumeInputSchema = z
  .object({
    grantId: z.string().min(16),
    requestProof: UnlockGrantProofSchema,
    consumeNonce: base64UrlSchema.min(16),
  })
  .strict();

export const WebBootstrapGrantConsumeOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    sessionState: SessionStateSchema,
    unlockAccountKey: z.string().min(20).optional(),
    lockRevision: z.number().int().nonnegative().optional(),
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

export const LocalUnlockEnvelopeSchema = z
  .object({
    version: z.literal('local-unlock.v1'),
    nonce: base64UrlSchema,
    ciphertext: base64UrlSchema,
    kdfProfile: z
      .object({
        algorithm: z.literal('argon2id'),
        memory: z.number().int().positive(),
        passes: z.number().int().positive(),
        parallelism: z.number().int().positive(),
        tagLength: z.literal(32),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ExtensionTrustedPackageSchema = z
  .object({
    authSalt: base64UrlSchema,
    encryptedAccountBundle: encryptedPayloadSchema,
    accountKeyWrapped: encryptedPayloadSchema,
    localUnlockEnvelope: LocalUnlockEnvelopeSchema,
  })
  .strict();

export const ExtensionTrustedSessionOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    extensionSessionToken: z.string().min(1),
    sessionExpiresAt: isoDatetimeSchema,
    sessionRecoverKey: base64UrlSchema.min(24).optional(),
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
    package: ExtensionTrustedPackageSchema,
  })
  .strict();

export const ExtensionLinkRequestPublicKeySchema = base64UrlSchema.min(40);

export const ExtensionLinkRequestInputSchema = z
  .object({
    deploymentFingerprint: z.string().min(1),
    requestPublicKey: ExtensionLinkRequestPublicKeySchema,
    clientNonce: base64UrlSchema.min(16),
    deviceNameHint: z.string().min(1).max(80).optional(),
  })
  .strict();

export const ExtensionLinkRequestOutputSchema = z
  .object({
    ok: z.literal(true),
    requestId: z.string().min(16),
    shortCode: z.string().regex(/^[A-Z2-7]{8}$/),
    fingerprintPhrase: z.string().min(4).max(64),
    expiresAt: isoDatetimeSchema,
    interval: z.number().int().positive(),
    serverOrigin: z.string().url(),
  })
  .strict();

export const ExtensionLinkApproveInputSchema = z
  .object({
    requestId: z.string().min(16),
    approvalNonce: base64UrlSchema.min(16),
    package: ExtensionTrustedPackageSchema,
  })
  .strict();

export const ExtensionLinkRejectInputSchema = z
  .object({
    requestId: z.string().min(16),
    rejectionReasonCode: z.string().min(1).max(64).optional(),
  })
  .strict();

export const ExtensionLinkPendingRecordSchema = z
  .object({
    requestId: z.string().min(16),
    status: z.enum(['pending', 'approved', 'rejected', 'consumed', 'expired']),
    shortCode: z.string().regex(/^[A-Z2-7]{8}$/),
    fingerprintPhrase: z.string().min(4).max(64),
    deviceNameHint: z.string().min(1).max(80).nullable(),
    createdAt: isoDatetimeSchema,
    expiresAt: isoDatetimeSchema,
    approvedAt: isoDatetimeSchema.nullable(),
  })
  .strict();

export const ExtensionLinkPendingListOutputSchema = z
  .object({
    ok: z.literal(true),
    requests: z.array(ExtensionLinkPendingRecordSchema),
  })
  .strict();

export const ExtensionLinkActionOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const ExtensionLinkProofSchema = z
  .object({
    nonce: base64UrlSchema.min(16),
    signature: base64UrlSchema.min(40),
  })
  .strict();

export const ExtensionLinkStatusInputSchema = z
  .object({
    requestId: z.string().min(16),
    requestProof: ExtensionLinkProofSchema,
  })
  .strict();

export const ExtensionLinkStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    status: z.enum([
      'authorization_pending',
      'slow_down',
      'approved',
      'rejected',
      'consumed',
      'expired',
      'denied',
    ]),
    interval: z.number().int().positive().optional(),
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const ExtensionLinkConsumeInputSchema = z
  .object({
    requestId: z.string().min(16),
    requestProof: ExtensionLinkProofSchema,
    consumeNonce: base64UrlSchema.min(16),
  })
  .strict();

export const ExtensionLinkConsumeOutputSchema = ExtensionTrustedSessionOutputSchema;

export const SiteIconDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]{1,255}$/);

export const SiteIconSourceSchema = z.enum(['manual', 'automatic']);

export const SiteIconRecordSchema = z
  .object({
    domain: SiteIconDomainSchema,
    dataUrl: z.string().min(32),
    source: SiteIconSourceSchema,
    sourceUrl: z.string().url().nullable(),
    resolvedBy: z.string().min(1).optional(),
    finalUrl: z.string().url().nullable().optional(),
    candidateCount: z.number().int().nonnegative().optional(),
    reasonCode: z.string().min(1).optional(),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const SiteIconResolveBatchInputSchema = z
  .object({
    domains: z.array(SiteIconDomainSchema).min(1).max(200),
  })
  .strict();

export const SiteIconResolveBatchOutputSchema = z
  .object({
    ok: z.literal(true),
    icons: z.array(SiteIconRecordSchema),
  })
  .strict();

export const SiteIconDiscoverBatchInputSchema = z
  .object({
    domains: z.array(SiteIconDomainSchema).min(1).max(200),
    forceRefresh: z.boolean().optional(),
  })
  .strict();

export const SiteIconDiscoverBatchOutputSchema = z
  .object({
    ok: z.literal(true),
    icons: z.array(SiteIconRecordSchema),
    unresolved: z.array(SiteIconDomainSchema),
  })
  .strict();

export const SiteIconManualUpsertInputSchema = z
  .object({
    domain: SiteIconDomainSchema,
    dataUrl: z.string().min(32),
    source: z.enum(['url', 'file']).default('url'),
  })
  .strict();

export const SiteIconManualListOutputSchema = z
  .object({
    ok: z.literal(true),
    icons: z.array(
      z
        .object({
          domain: SiteIconDomainSchema,
          dataUrl: z.string().min(32),
          source: z.enum(['url', 'file']),
          updatedAt: isoDatetimeSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const SiteIconManualRemoveInputSchema = z
  .object({
    domain: SiteIconDomainSchema,
  })
  .strict();

export const SiteIconManualActionOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict();

export const IconObjectIdSchema = z.string().trim().min(1).max(128);

export const IconSha256Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/);

export const IconsStateQuerySchema = z
  .object({
    includeDomains: z.array(SiteIconDomainSchema).min(1).max(500).optional(),
  })
  .strict();

export const IconsStateOutputSchema = z
  .object({
    ok: z.literal(true),
    iconsVersion: z.number().int().nonnegative(),
    etag: z.string().min(1),
    records: z.array(IconStateRecordSchema),
    serverNow: isoDatetimeSchema,
  })
  .strict();

export const IconsDomainItemPutInputSchema = z
  .object({
    itemId: z.string().min(1),
    itemRevision: z.number().int().nonnegative(),
    hosts: z.array(SiteIconDomainSchema).max(100),
  })
  .strict();

export const IconsDomainItemPutOutputSchema = z
  .object({
    ok: z.literal(true),
    result: z.enum(['success_changed', 'success_no_op', 'success_no_op_stale_revision']),
    domainsChanged: z.boolean(),
    itemId: z.string().min(1),
    itemRevision: z.number().int().nonnegative(),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const IconsDomainBatchPutInputSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            itemId: z.string().min(1),
            itemRevision: z.number().int().nonnegative(),
            hosts: z.array(SiteIconDomainSchema).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const IconsDomainBatchPutEntryOutputSchema = z
  .object({
    itemId: z.string().min(1),
    itemRevision: z.number().int().nonnegative(),
    result: z.enum(['success_changed', 'success_no_op', 'success_no_op_stale_revision']),
    domainsChanged: z.boolean(),
  })
  .strict();

export const IconsDomainBatchPutOutputSchema = z
  .object({
    ok: z.literal(true),
    acceptedItems: z.number().int().nonnegative(),
    entries: z.array(IconsDomainBatchPutEntryOutputSchema),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const IconsDomainReindexStartInputSchema = z
  .object({
    generationId: z.string().trim().min(1).max(128),
  })
  .strict();

export const IconsDomainReindexChunkInputSchema = z
  .object({
    generationId: z.string().trim().min(1).max(128),
    entries: z
      .array(
        z
          .object({
            itemId: z.string().min(1),
            itemRevision: z.number().int().nonnegative(),
            hosts: z.array(SiteIconDomainSchema).max(100),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const IconsDomainReindexCommitInputSchema = z
  .object({
    generationId: z.string().trim().min(1).max(128),
  })
  .strict();

export const IconsDomainReindexOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    generationId: z.string().min(1),
    acceptedItems: z.number().int().nonnegative(),
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const IconsObjectTicketIssueInputSchema = z
  .object({
    objectIds: z.array(IconObjectIdSchema).min(1).max(200),
    ttlSeconds: z.number().int().positive().max(300).optional(),
  })
  .strict();

export const IconsObjectTicketIssueOutputSchema = z
  .object({
    ok: z.literal(true),
    expiresAt: isoDatetimeSchema,
    tickets: z.array(
      z
        .object({
          objectId: IconObjectIdSchema,
          ticket: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const PasswordGeneratorHistoryEntryIdSchema = z
  .string()
  .trim()
  .min(12)
  .max(96)
  .regex(/^[A-Za-z0-9_-]+$/);

export const PasswordGeneratorHistoryRecordSchema = z
  .object({
    entryId: PasswordGeneratorHistoryEntryIdSchema,
    encryptedPayload: encryptedPayloadSchema,
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
  })
  .strict();

export const PasswordGeneratorHistoryListOutputSchema = z
  .object({
    ok: z.literal(true),
    entries: z.array(PasswordGeneratorHistoryRecordSchema),
  })
  .strict();

export const PasswordGeneratorHistoryUpsertInputSchema = z
  .object({
    entryId: PasswordGeneratorHistoryEntryIdSchema,
    encryptedPayload: encryptedPayloadSchema,
    createdAt: isoDatetimeSchema,
  })
  .strict();

export const PasswordGeneratorHistoryActionOutputSchema = z
  .object({
    ok: z.literal(true),
    result: CanonicalResultSchema,
    reasonCode: z.string().min(1).optional(),
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
export type RealtimeConnectTokenOutput = z.infer<typeof RealtimeConnectTokenOutputSchema>;
export type RealtimeTopic = z.infer<typeof RealtimeTopicSchema>;
export type RealtimeVaultItemUpsertedPayload = z.infer<typeof RealtimeVaultItemUpsertedPayloadSchema>;
export type RealtimeVaultItemTombstonedPayload = z.infer<typeof RealtimeVaultItemTombstonedPayloadSchema>;
export type RealtimeVaultHistoryUpsertedPayload = z.infer<typeof RealtimeVaultHistoryUpsertedPayloadSchema>;
export type RealtimeVaultFolderUpsertedPayload = z.infer<typeof RealtimeVaultFolderUpsertedPayloadSchema>;
export type RealtimeVaultFolderAssignmentChangedPayload = z.infer<typeof RealtimeVaultFolderAssignmentChangedPayloadSchema>;
export type RealtimeIconsStateUpsertedPayload = z.infer<typeof RealtimeIconsStateUpsertedPayloadSchema>;
export type RealtimeIconsStateRemovedPayload = z.infer<typeof RealtimeIconsStateRemovedPayloadSchema>;
export type RealtimeIconsManualUpsertedPayload = z.infer<typeof RealtimeIconsManualUpsertedPayloadSchema>;
export type RealtimeIconsManualRemovedPayload = z.infer<typeof RealtimeIconsManualRemovedPayloadSchema>;
export type RealtimeIconsDiscoverResolvedPayload = z.infer<typeof RealtimeIconsDiscoverResolvedPayloadSchema>;
export type RealtimePasswordHistoryUpsertedPayload = z.infer<typeof RealtimePasswordHistoryUpsertedPayloadSchema>;
export type RealtimePasswordHistoryRemovedPayload = z.infer<typeof RealtimePasswordHistoryRemovedPayloadSchema>;
export type RealtimeAttachmentStateChangedPayload = z.infer<typeof RealtimeAttachmentStateChangedPayloadSchema>;
export type RealtimeAttachmentRemovedPayload = z.infer<typeof RealtimeAttachmentRemovedPayloadSchema>;
export type RealtimeEventEnvelope = z.infer<typeof RealtimeEventEnvelopeSchema>;
export type RealtimeServerMessage = z.infer<typeof RealtimeServerMessageSchema>;
export type RealtimeClientMessage = z.infer<typeof RealtimeClientMessageSchema>;
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
export type VaultItemExtensionUpdateInput = z.infer<typeof VaultItemExtensionUpdateInputSchema>;
export type VaultItemExtensionCreateInput = z.infer<typeof VaultItemExtensionCreateInputSchema>;
export type VaultItemHistoryChangeType = z.infer<typeof VaultItemHistoryChangeTypeSchema>;
export type VaultItemHistoryDiffClassification = z.infer<typeof VaultItemHistoryDiffClassificationSchema>;
export type VaultItemHistoryDiffEntry = z.infer<typeof VaultItemHistoryDiffEntrySchema>;
export type VaultItemHistoryRecord = z.infer<typeof VaultItemHistoryRecordSchema>;
export type VaultItemHistoryListOutput = z.infer<typeof VaultItemHistoryListOutputSchema>;
export type VaultFolderRecord = z.infer<typeof VaultFolderRecordSchema>;
export type VaultFolderAssignmentRecord = z.infer<typeof VaultFolderAssignmentRecordSchema>;
export type VaultFoldersStateOutput = z.infer<typeof VaultFoldersStateOutputSchema>;
export type VaultFolderUpsertInput = z.infer<typeof VaultFolderUpsertInputSchema>;
export type VaultFolderAssignmentUpsertInput = z.infer<typeof VaultFolderAssignmentUpsertInputSchema>;
export type VaultFolderMutationOutput = z.infer<typeof VaultFolderMutationOutputSchema>;
export type AttachmentUploadInitInput = z.infer<typeof AttachmentUploadInitInputSchema>;
export type AttachmentUploadContentInput = z.infer<typeof AttachmentUploadContentInputSchema>;
export type AttachmentUploadFinalizeInput = z.infer<typeof AttachmentUploadFinalizeInputSchema>;
export type AttachmentUploadRecord = z.infer<typeof AttachmentUploadRecordSchema>;
export type AttachmentUploadInitOutput = z.infer<typeof AttachmentUploadInitOutputSchema>;
export type AttachmentUploadListOutput = z.infer<typeof AttachmentUploadListOutputSchema>;
export type AttachmentUploadFinalizeOutput = z.infer<typeof AttachmentUploadFinalizeOutputSchema>;
export type AttachmentUploadEnvelopeOutput = z.infer<typeof AttachmentUploadEnvelopeOutputSchema>;
export type AttachmentStateEntry = z.infer<typeof AttachmentStateEntrySchema>;
export type AttachmentStateOutput = z.infer<typeof AttachmentStateOutputSchema>;
export type TrustedSessionResponse = z.infer<typeof TrustedSessionResponseSchema>;
export type SessionRestoreResponse = z.infer<typeof SessionRestoreResponseSchema>;
export type SessionLockInput = z.infer<typeof SessionLockInputSchema>;
export type SessionLockOutput = z.infer<typeof SessionLockOutputSchema>;
export type SessionPolicy = z.infer<typeof SessionPolicySchema>;
export type SessionPolicyOutput = z.infer<typeof SessionPolicyOutputSchema>;
export type SessionPolicyUpdateInput = z.infer<typeof SessionPolicyUpdateInputSchema>;
export type LocalUnlockEnvelope = z.infer<typeof LocalUnlockEnvelopeSchema>;
export type ExtensionTrustedPackage = z.infer<typeof ExtensionTrustedPackageSchema>;
export type ExtensionTrustedSessionOutput = z.infer<typeof ExtensionTrustedSessionOutputSchema>;
export type UnlockGrantSurface = z.infer<typeof UnlockGrantSurfaceSchema>;
export type UnlockGrantRequestInput = z.infer<typeof UnlockGrantRequestInputSchema>;
export type UnlockGrantRequestOutput = z.infer<typeof UnlockGrantRequestOutputSchema>;
export type UnlockGrantPendingRecord = z.infer<typeof UnlockGrantPendingRecordSchema>;
export type UnlockGrantPendingListOutput = z.infer<typeof UnlockGrantPendingListOutputSchema>;
export type UnlockGrantActionOutput = z.infer<typeof UnlockGrantActionOutputSchema>;
export type UnlockGrantProof = z.infer<typeof UnlockGrantProofSchema>;
export type UnlockGrantApproveInput = z.infer<typeof UnlockGrantApproveInputSchema>;
export type UnlockGrantRejectInput = z.infer<typeof UnlockGrantRejectInputSchema>;
export type UnlockGrantStatusInput = z.infer<typeof UnlockGrantStatusInputSchema>;
export type UnlockGrantStatusOutput = z.infer<typeof UnlockGrantStatusOutputSchema>;
export type UnlockGrantConsumeInput = z.infer<typeof UnlockGrantConsumeInputSchema>;
export type UnlockGrantConsumeOutput = z.infer<typeof UnlockGrantConsumeOutputSchema>;
export type ExtensionSessionRecoverInput = z.infer<typeof ExtensionSessionRecoverInputSchema>;
export type ExtensionSessionRecoverOutput = z.infer<typeof ExtensionSessionRecoverOutputSchema>;
export type WebBootstrapGrantRequestInput = z.infer<typeof WebBootstrapGrantRequestInputSchema>;
export type WebBootstrapGrantRequestOutput = z.infer<typeof WebBootstrapGrantRequestOutputSchema>;
export type WebBootstrapGrantConsumeInput = z.infer<typeof WebBootstrapGrantConsumeInputSchema>;
export type WebBootstrapGrantConsumeOutput = z.infer<typeof WebBootstrapGrantConsumeOutputSchema>;
export type ExtensionLinkRequestInput = z.infer<typeof ExtensionLinkRequestInputSchema>;
export type ExtensionLinkRequestOutput = z.infer<typeof ExtensionLinkRequestOutputSchema>;
export type ExtensionLinkApproveInput = z.infer<typeof ExtensionLinkApproveInputSchema>;
export type ExtensionLinkRejectInput = z.infer<typeof ExtensionLinkRejectInputSchema>;
export type ExtensionLinkPendingRecord = z.infer<typeof ExtensionLinkPendingRecordSchema>;
export type ExtensionLinkPendingListOutput = z.infer<typeof ExtensionLinkPendingListOutputSchema>;
export type ExtensionLinkActionOutput = z.infer<typeof ExtensionLinkActionOutputSchema>;
export type ExtensionLinkProof = z.infer<typeof ExtensionLinkProofSchema>;
export type ExtensionLinkStatusInput = z.infer<typeof ExtensionLinkStatusInputSchema>;
export type ExtensionLinkStatusOutput = z.infer<typeof ExtensionLinkStatusOutputSchema>;
export type ExtensionLinkConsumeInput = z.infer<typeof ExtensionLinkConsumeInputSchema>;
export type ExtensionLinkConsumeOutput = z.infer<typeof ExtensionLinkConsumeOutputSchema>;
export type SiteIconDomain = z.infer<typeof SiteIconDomainSchema>;
export type SiteIconSource = z.infer<typeof SiteIconSourceSchema>;
export type SiteIconRecord = z.infer<typeof SiteIconRecordSchema>;
export type SiteIconResolveBatchInput = z.infer<typeof SiteIconResolveBatchInputSchema>;
export type SiteIconResolveBatchOutput = z.infer<typeof SiteIconResolveBatchOutputSchema>;
export type SiteIconDiscoverBatchInput = z.infer<typeof SiteIconDiscoverBatchInputSchema>;
export type SiteIconDiscoverBatchOutput = z.infer<typeof SiteIconDiscoverBatchOutputSchema>;
export type SiteIconManualUpsertInput = z.infer<typeof SiteIconManualUpsertInputSchema>;
export type SiteIconManualListOutput = z.infer<typeof SiteIconManualListOutputSchema>;
export type SiteIconManualRemoveInput = z.infer<typeof SiteIconManualRemoveInputSchema>;
export type SiteIconManualActionOutput = z.infer<typeof SiteIconManualActionOutputSchema>;
export type IconObjectClass = z.infer<typeof IconObjectClassSchema>;
export type IconStateStatus = z.infer<typeof IconStateStatusSchema>;
export type IconStateRecord = z.infer<typeof IconStateRecordSchema>;
export type IconsStateQuery = z.infer<typeof IconsStateQuerySchema>;
export type IconsStateOutput = z.infer<typeof IconsStateOutputSchema>;
export type IconsDomainItemPutInput = z.infer<typeof IconsDomainItemPutInputSchema>;
export type IconsDomainItemPutOutput = z.infer<typeof IconsDomainItemPutOutputSchema>;
export type IconsDomainBatchPutInput = z.infer<typeof IconsDomainBatchPutInputSchema>;
export type IconsDomainBatchPutEntryOutput = z.infer<typeof IconsDomainBatchPutEntryOutputSchema>;
export type IconsDomainBatchPutOutput = z.infer<typeof IconsDomainBatchPutOutputSchema>;
export type IconsDomainReindexStartInput = z.infer<typeof IconsDomainReindexStartInputSchema>;
export type IconsDomainReindexChunkInput = z.infer<typeof IconsDomainReindexChunkInputSchema>;
export type IconsDomainReindexCommitInput = z.infer<typeof IconsDomainReindexCommitInputSchema>;
export type IconsDomainReindexOutput = z.infer<typeof IconsDomainReindexOutputSchema>;
export type IconsObjectTicketIssueInput = z.infer<typeof IconsObjectTicketIssueInputSchema>;
export type IconsObjectTicketIssueOutput = z.infer<typeof IconsObjectTicketIssueOutputSchema>;
export type PasswordGeneratorHistoryRecord = z.infer<typeof PasswordGeneratorHistoryRecordSchema>;
export type PasswordGeneratorHistoryListOutput = z.infer<typeof PasswordGeneratorHistoryListOutputSchema>;
export type PasswordGeneratorHistoryUpsertInput = z.infer<typeof PasswordGeneratorHistoryUpsertInputSchema>;
export type PasswordGeneratorHistoryActionOutput = z.infer<typeof PasswordGeneratorHistoryActionOutputSchema>;
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
