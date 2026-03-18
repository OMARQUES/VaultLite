const CODE_TO_MESSAGE: Record<string, string> = {
  invalid_credentials: 'We couldn’t verify your credentials. Check your password and try again.',
  unauthorized: 'Your session is no longer valid. Unlock and try again.',
  forbidden: 'You don’t have permission to do this action.',
  csrf_invalid: 'Your security session expired. Refresh the page and try again.',
  recent_reauth_required: 'Confirm your master password to continue.',
  rate_limited: 'Too many attempts. Wait a moment and try again.',
  username_unavailable: 'This username is already in use.',
  invalid_invite: 'This invite link is invalid.',
  invite_token_invalid: 'This invite link is invalid.',
  invite_token_expired: 'This invite link expired. Ask for a new invite.',
  invite_expired: 'This invite link expired. Ask for a new invite.',
  invite_revoked: 'This invite link was revoked. Ask for a new invite.',
  invite_consumed: 'This invite link was already used.',
  bootstrap_required: 'This deployment still needs initial setup.',
  initialization_pending: 'Setup is still in progress. Try again in a moment.',
  invalid_bootstrap_token: 'Bootstrap token is invalid. Check it and try again.',
  account_kit_payload_mismatch: 'This Account Kit does not match this deployment.',
  invalid_account_kit: 'This Account Kit file is invalid.',
  payload_too_large: 'This content is too large. Reduce it and try again.',
  attachment_too_large: 'This attachment is too large.',
  upload_envelope_too_large: 'This attachment is too large.',
  revision_conflict: 'This item changed in another session. Reload and try again.',
  item_deleted_conflict: 'This item was deleted in another session. Reload to continue.',
  restore_window_expired: 'This item can no longer be restored from trash.',
  vault_item_restore_failed: 'We couldn’t restore this item right now. Try again.',
  bootstrap_already_initialized: 'This deployment is already initialized.',
  trusted_local_state_missing: 'This device is no longer trusted for this account. Add the device again.',
  account_suspended: 'Your account is suspended. Ask the owner to reactivate access.',
  cannot_revoke_current_device: 'You can’t revoke the device you are using right now.',
  device_already_revoked: 'This device is already revoked.',
  device_not_found: 'This device could not be found.',
  stale_bundle_version: 'Your account changed in another session. Refresh and try again.',
  rotation_context_invalid: 'Your security context changed. Unlock again and retry.',
  password_rotation_failed: 'We couldn’t rotate your password right now. Try again.',
  idempotency_key_reuse_conflict: 'This action was retried with different data. Start it again.',
  invalid_snapshot_context: 'Sync context expired. Refreshing your vault now.',
  snapshot_expired: 'Sync token expired. Retrying automatically.',
};

const STATUS_TO_MESSAGE: Record<number, string> = {
  400: 'We couldn’t process this request. Check the form and try again.',
  401: 'Your credentials or session are no longer valid. Try again.',
  403: 'You don’t have permission to do this action.',
  404: 'We couldn’t find what you were looking for.',
  409: 'This action can’t be completed right now. Refresh and try again.',
  413: 'This content is too large.',
  429: 'Too many attempts. Wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
};

function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseRequestFailure(message: string): {
  status: number | null;
  detailCode: string | null;
} {
  const match = message.match(/Request failed with status\s+(\d+)(?:\s+\(([^)]+)\))?/i);
  if (!match) {
    return { status: null, detailCode: null };
  }

  const status = Number.parseInt(match[1] ?? '', 10);
  const detailRaw = match[2]?.trim() ?? '';
  return {
    status: Number.isFinite(status) ? status : null,
    detailCode: detailRaw ? normalizeCode(detailRaw) : null,
  };
}

function findKnownCode(message: string): string | null {
  const lowered = message.toLowerCase();
  const knownCodes = Object.keys(CODE_TO_MESSAGE);
  return knownCodes.find((code) => lowered.includes(code)) ?? null;
}

function mapRawTechnicalMessage(message: string): string | null {
  const normalized = normalizeCode(message);
  if (CODE_TO_MESSAGE[normalized]) {
    return CODE_TO_MESSAGE[normalized];
  }

  if (normalized === 'server_failed' || normalized === 'internal_error') {
    return STATUS_TO_MESSAGE[500];
  }
  if (normalized === 'invalid_account_kit' || normalized === 'account_kit_deployment_mismatch') {
    return CODE_TO_MESSAGE.invalid_account_kit;
  }
  if (normalized === 'account_kit_username_mismatch') {
    return 'This Account Kit belongs to another username.';
  }
  if (normalized === 'trusted_local_state_not_found_for_this_username') {
    return CODE_TO_MESSAGE.trusted_local_state_missing;
  }
  if (normalized === 'unauthorized') {
    return CODE_TO_MESSAGE.unauthorized;
  }

  return null;
}

function looksTechnical(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes('request failed with status') ||
    lowered.includes('internal_error') ||
    lowered.includes('invalid_') ||
    lowered.includes('csrf_') ||
    lowered.includes('reason_code') ||
    lowered.includes('server failed') ||
    /^[a-z0-9_]+$/.test(message)
  );
}

export function toHumanErrorMessage(
  error: unknown,
  options?: {
    fallback?: string;
  },
): string {
  const fallback = options?.fallback ?? 'Something went wrong. Please try again.';
  const rawMessage = (error instanceof Error ? error.message : String(error)).trim();
  if (!rawMessage) {
    return fallback;
  }

  const requestFailure = parseRequestFailure(rawMessage);
  if (requestFailure.detailCode && CODE_TO_MESSAGE[requestFailure.detailCode]) {
    return CODE_TO_MESSAGE[requestFailure.detailCode];
  }
  if (requestFailure.status && STATUS_TO_MESSAGE[requestFailure.status]) {
    return STATUS_TO_MESSAGE[requestFailure.status];
  }

  const knownCode = findKnownCode(rawMessage);
  if (knownCode && CODE_TO_MESSAGE[knownCode]) {
    return CODE_TO_MESSAGE[knownCode];
  }

  const mappedTechnical = mapRawTechnicalMessage(rawMessage);
  if (mappedTechnical) {
    return mappedTechnical;
  }

  if (looksTechnical(rawMessage)) {
    return fallback;
  }

  return rawMessage;
}
