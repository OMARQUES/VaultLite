export const USER_LIFECYCLE_STATES = ['active', 'suspended', 'deprovisioned'] as const;
export type UserLifecycleState = (typeof USER_LIFECYCLE_STATES)[number];

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
