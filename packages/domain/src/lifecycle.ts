export const USER_LIFECYCLE_STATES = ['active', 'suspended', 'deprovisioned'] as const;
export type UserLifecycleState = (typeof USER_LIFECYCLE_STATES)[number];

export const USER_ROLES = ['owner', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const BOOTSTRAP_DEPLOYMENT_STATES = [
  'UNINITIALIZED_PUBLIC_OPEN',
  'OWNER_CREATED_CHECKPOINT_PENDING',
  'INITIALIZED',
] as const;
export type BootstrapDeploymentState = (typeof BOOTSTRAP_DEPLOYMENT_STATES)[number];

export const DEVICE_STATES = ['active', 'revoked', 'deprovisioned'] as const;
export type DeviceState = (typeof DEVICE_STATES)[number];

export const ATTACHMENT_LIFECYCLE_STATES = ['pending', 'uploaded', 'attached', 'deleted', 'orphaned'] as const;
export type AttachmentLifecycleState = (typeof ATTACHMENT_LIFECYCLE_STATES)[number];

const userLifecycleTransitions: Record<UserLifecycleState, readonly UserLifecycleState[]> = {
  active: ['suspended', 'deprovisioned'],
  suspended: ['active', 'deprovisioned'],
  deprovisioned: [],
};

const attachmentLifecycleTransitions: Record<AttachmentLifecycleState, readonly AttachmentLifecycleState[]> = {
  pending: ['uploaded', 'deleted', 'orphaned'],
  uploaded: ['attached', 'deleted', 'orphaned'],
  attached: ['deleted'],
  deleted: [],
  orphaned: ['deleted'],
};

export function canTransitionUserLifecycle(from: UserLifecycleState, to: UserLifecycleState): boolean {
  return userLifecycleTransitions[from].includes(to);
}

export function canTransitionAttachmentLifecycle(
  from: AttachmentLifecycleState,
  to: AttachmentLifecycleState,
): boolean {
  return attachmentLifecycleTransitions[from].includes(to);
}
