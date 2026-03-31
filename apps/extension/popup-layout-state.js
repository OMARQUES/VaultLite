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

export function shouldUseExpandedPopup(layoutMode, selectedItemId, detailPanelMode = 'view') {
  if (layoutMode !== 'ready') {
    return false;
  }
  if (detailPanelMode === 'create') {
    return true;
  }
  return typeof selectedItemId === 'string' && selectedItemId.length > 0;
}
