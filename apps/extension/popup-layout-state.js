export function resolveLayoutMode(phase) {
  if (phase === 'ready') {
    return 'ready';
  }
  if (phase === 'local_unlock_required') {
    return 'unlock';
  }
  return 'pairing';
}

export function shouldShowHeaderSearch(layoutMode) {
  return layoutMode === 'ready';
}

export function shouldShowLockIcon(layoutMode) {
  return layoutMode === 'ready';
}

export function shouldUseExpandedPopup(layoutMode, selectedItemId) {
  return layoutMode === 'ready' && typeof selectedItemId === 'string' && selectedItemId.length > 0;
}

