const ALWAYS_ENABLED_WHILE_BUSY = new Set(['searchInput']);

export function shouldDisableControlWhileBusy(controlId, isBusy) {
  if (!isBusy) {
    return false;
  }
  return !ALWAYS_ENABLED_WHILE_BUSY.has(controlId);
}

export function describeFillResult(result) {
  if (result === 'filled') {
    return {
      alert: { level: 'success', message: 'Filled username and password.' },
      disableFillReason: null,
    };
  }
  if (result === 'credential_not_allowed_for_site') {
    return {
      alert: { level: 'warning', message: 'Credential not allowed for this site.' },
      disableFillReason: null,
    };
  }
  if (result === 'page_changed_try_again') {
    return {
      alert: { level: 'warning', message: 'Page changed during fill. Try again.' },
      disableFillReason: null,
    };
  }
  if (result === 'unsupported_form') {
    return {
      alert: { level: 'warning', message: 'Manual fill unavailable for this form.' },
      disableFillReason: null,
    };
  }
  if (result === 'no_eligible_fields') {
    return {
      alert: null,
      disableFillReason: 'No supported fields found on this page.',
    };
  }
  return {
    alert: { level: 'warning', message: 'Manual fill unavailable on this page.' },
    disableFillReason: null,
  };
}
