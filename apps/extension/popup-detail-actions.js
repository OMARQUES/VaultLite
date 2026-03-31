function resolveItemTypeLabel(itemType) {
  if (itemType === 'login') {
    return 'LOGIN';
  }
  if (itemType === 'card') {
    return 'CARD';
  }
  if (itemType === 'document') {
    return 'DOCUMENT';
  }
  if (itemType === 'secure_note') {
    return 'SECURE NOTE';
  }
  return 'ITEM';
}

function toNavigableUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null;
  }
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.toString();
  } catch {
    return null;
  }
}

const MASKED_PASSWORD = '••••••••••••';
const MASKED_CVV = '•••';
const MASKED_EXPIRY = '••/••';

export function buildDetailViewModel(item, options = {}) {
  const itemType = item?.itemType ?? 'item';
  const title = item?.title || 'Untitled item';
  const subtitle = item?.subtitle || '—';
  const firstUrl = item?.firstUrl || '';
  const urlValue = firstUrl || item?.urlHostSummary || 'No URL';
  const navigableUrl = toNavigableUrl(firstUrl);
  const passwordVisible = options?.passwordVisible === true;
  const passwordValue =
    passwordVisible && typeof options?.passwordValue === 'string' && options.passwordValue.length > 0
      ? options.passwordValue
      : MASKED_PASSWORD;

  if (item?.isDeleted === true) {
    const deletedAt =
      typeof item?.deletedAt === 'string' && item.deletedAt.length > 0 ? item.deletedAt : 'Unknown';
    const restoreExpiresAt =
      typeof item?.restoreExpiresAt === 'string' && item.restoreExpiresAt.length > 0
        ? item.restoreExpiresAt
        : 'Unknown';
    const restoreDaysRemaining = Number.isFinite(Number(item?.restoreDaysRemaining))
      ? Math.max(0, Math.trunc(Number(item.restoreDaysRemaining)))
      : null;
    const restoreHint =
      restoreDaysRemaining === null
        ? restoreExpiresAt
        : restoreDaysRemaining === 1
          ? '1 day left'
          : `${restoreDaysRemaining} days left`;
    return {
      typeLabel: 'TRASH',
      title,
      primaryAction: {
        id: 'restore_item',
        label: 'Restore',
      },
      rows: [
        {
          label: 'Deleted at',
          value: deletedAt,
          actions: [],
        },
        {
          label: 'Restore window',
          value: restoreHint,
          actions: [],
        },
        {
          label: 'Type',
          value: resolveItemTypeLabel(itemType),
          actions: [],
        },
      ],
    };
  }

  if (itemType === 'login') {
    return {
      typeLabel: 'LOGIN',
      title,
      primaryAction: {
        id: 'fill',
        label: 'Fill',
      },
      rows: [
        {
          label: 'Username',
          value: subtitle,
          defaultAction: 'copy_username',
          actions: [{ id: 'copy_username', label: 'Copy username' }],
        },
        {
          label: 'Password',
          value: passwordValue,
          password: true,
          defaultAction: 'copy_password',
          actions: [
            {
              id: 'toggle_password_visibility',
              label: passwordVisible ? 'Hide password' : 'Show password',
            },
            { id: 'copy_password', label: 'Copy password' },
          ],
        },
        {
          label: 'URL',
          value: urlValue,
          defaultAction: 'copy_url',
          actions: [
            { id: 'copy_url', label: 'Copy URL' },
            ...(navigableUrl ? [{ id: 'open_url', label: 'Open URL' }] : []),
          ],
        },
      ],
    };
  }

  if (itemType === 'card') {
    return {
      typeLabel: 'CARD',
      title,
      primaryAction: {
        id: 'copy_card_number',
        label: 'Copy number',
      },
      rows: [
        {
          label: 'Card number',
          value: subtitle,
          defaultAction: 'copy_card_number',
          actions: [{ id: 'copy_card_number', label: 'Copy card number' }],
        },
        {
          label: 'Security code',
          value: MASKED_CVV,
          password: true,
          defaultAction: 'copy_card_cvv',
          actions: [{ id: 'copy_card_cvv', label: 'Copy security code' }],
        },
        {
          label: 'Expiry',
          value: MASKED_EXPIRY,
          defaultAction: 'copy_card_expiry',
          actions: [{ id: 'copy_card_expiry', label: 'Copy expiry' }],
        },
      ],
    };
  }

  if (itemType === 'document') {
    return {
      typeLabel: 'DOCUMENT',
      title,
      primaryAction: {
        id: 'open_item_web',
        label: 'Open in web',
      },
      rows: [
        {
          label: 'Title',
          value: title,
          defaultAction: 'copy_title',
          actions: [{ id: 'copy_title', label: 'Copy title' }],
        },
        {
          label: 'Content',
          value: 'Open this document in web app for full content.',
          defaultAction: 'copy_content',
          actions: [{ id: 'copy_content', label: 'Copy content' }],
        },
        {
          label: 'Open',
          value: 'Open this item in web app.',
          defaultAction: 'open_item_web',
          actions: [{ id: 'open_item_web', label: 'Open in web app' }],
        },
      ],
    };
  }

  if (itemType === 'secure_note') {
    return {
      typeLabel: 'SECURE NOTE',
      title,
      primaryAction: {
        id: 'open_item_web',
        label: 'Open in web',
      },
      rows: [
        {
          label: 'Title',
          value: title,
          defaultAction: 'copy_title',
          actions: [{ id: 'copy_title', label: 'Copy title' }],
        },
        {
          label: 'Note',
          value: subtitle,
          defaultAction: 'copy_note',
          actions: [{ id: 'copy_note', label: 'Copy note' }],
        },
        {
          label: 'Open',
          value: 'Open this item in web app.',
          defaultAction: 'open_item_web',
          actions: [{ id: 'open_item_web', label: 'Open in web app' }],
        },
      ],
    };
  }

  return {
    typeLabel: resolveItemTypeLabel(itemType),
    title,
    primaryAction: {
      id: 'open_item_web',
      label: 'Open in web',
    },
    rows: [
      {
        label: 'Value',
        value: subtitle,
        defaultAction: 'copy_title',
        actions: [{ id: 'copy_title', label: 'Copy value' }],
      },
      {
        label: 'Type',
        value: resolveItemTypeLabel(itemType),
        actions: [],
      },
      {
        label: 'Info',
        value: item?.urlHostSummary || '—',
        actions: [],
      },
    ],
  };
}

export function isCopyActionId(actionId) {
  return typeof actionId === 'string' && actionId.startsWith('copy_');
}

export function pulseCopyIcon(button, durationMs = 600) {
  if (!button || !(button instanceof HTMLElement)) {
    return;
  }
  button.classList.add('is-copied');
  window.setTimeout(() => {
    button.classList.remove('is-copied');
  }, durationMs);
}
