const ALWAYS_ENABLED_WHILE_BUSY = new Set(['searchInput']);

export function shouldDisableControlWhileBusy(controlId, isBusy) {
  if (!isBusy) {
    return false;
  }
  return !ALWAYS_ENABLED_WHILE_BUSY.has(controlId);
}

