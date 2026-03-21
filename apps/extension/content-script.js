const BLOCKED_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'file:',
  'data:',
  'about:',
  'edge:',
  'moz-extension:',
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const USERNAME_HINT_PATTERN =
  /\b(user(name)?|email|e-mail|login|cpf|cnpj|conta|account|documento|identifica[cç][aã]o)\b/i;
const USERNAME_NEGATIVE_PATTERN = /\b(search|busca|query|coupon|cupom|promo|newsletter)\b/i;
const PASSWORD_NEGATIVE_PATTERN =
  /\b(confirm|confirmation|repeat|repetir|again|new|novo|nova|otp|2fa|mfa|token|one[-\s_]?time|verification|codigo|c[oó]digo)\b/i;

function isDevHost(hostname) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function isPageUrlEligibleForFill(urlValue) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(protocol)) {
    return false;
  }
  if (protocol === 'https:') {
    return true;
  }
  if (protocol !== 'http:') {
    return false;
  }
  return isDevHost(parsed.hostname);
}

function isVisibleAndEnabled(input) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  if (input.disabled || input.type === 'hidden') {
    return false;
  }
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(input) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
}

function fieldHint(input) {
  return [
    input.getAttribute('name') ?? '',
    input.id ?? '',
    input.getAttribute('placeholder') ?? '',
    input.getAttribute('aria-label') ?? '',
    input.getAttribute('autocomplete') ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function isLikelyLoginPasswordField(input) {
  const autocomplete = (input.getAttribute('autocomplete') ?? '').toLowerCase();
  if (autocomplete.includes('current-password')) {
    return true;
  }
  if (autocomplete.includes('new-password') || autocomplete.includes('one-time-code')) {
    return false;
  }
  return !PASSWORD_NEGATIVE_PATTERN.test(fieldHint(input));
}

function choosePasswordField(passwordFields) {
  if (passwordFields.length === 0) {
    return null;
  }
  if (passwordFields.length === 1) {
    return passwordFields[0];
  }

  const currentPasswordCandidates = passwordFields.filter((field) =>
    (field.getAttribute('autocomplete') ?? '').toLowerCase().includes('current-password'),
  );
  if (currentPasswordCandidates.length === 1) {
    return currentPasswordCandidates[0];
  }

  const likelyCandidates = passwordFields.filter(isLikelyLoginPasswordField);
  if (likelyCandidates.length === 1) {
    return likelyCandidates[0];
  }

  if (document.activeElement instanceof HTMLInputElement && likelyCandidates.includes(document.activeElement)) {
    return document.activeElement;
  }

  return null;
}

function isEligibleUsernameInput(input) {
  if (!isVisibleAndEnabled(input)) {
    return false;
  }
  if (input.type === 'password') {
    return false;
  }
  return input.type === 'text' || input.type === 'email' || input.type === 'tel';
}

function scoreUsernameField(input, passwordField, orderedInputs) {
  const autocomplete = (input.getAttribute('autocomplete') ?? '').toLowerCase();
  const hint = fieldHint(input);
  let score = 0;

  if (autocomplete === 'username' || autocomplete === 'email') {
    score += 120;
  }
  if (autocomplete.includes('one-time-code')) {
    score -= 120;
  }
  if (input.type === 'email') {
    score += 25;
  }
  if (USERNAME_HINT_PATTERN.test(hint)) {
    score += 50;
  }
  if (USERNAME_NEGATIVE_PATTERN.test(hint)) {
    score -= 90;
  }

  const passwordIndex = orderedInputs.indexOf(passwordField);
  const currentIndex = orderedInputs.indexOf(input);
  if (passwordIndex >= 0 && currentIndex >= 0) {
    const delta = passwordIndex - currentIndex;
    if (delta >= 0) {
      score += Math.max(0, 30 - delta);
    } else {
      score -= 20;
    }
  }

  return score;
}

function pickUsernameField(passwordField) {
  const allInputs = Array.from(passwordField.ownerDocument?.querySelectorAll('input') ?? []).filter((input) =>
    isVisibleAndEnabled(input),
  );
  const inSameForm = allInputs.filter((input) => input.form === passwordField.form);
  const pool = inSameForm.length > 0 ? inSameForm : allInputs;
  const usernameCandidates = pool.filter(isEligibleUsernameInput);
  if (usernameCandidates.length === 0) {
    return null;
  }

  const byAutocomplete = usernameCandidates.find((input) => {
    const autocomplete = (input.getAttribute('autocomplete') ?? '').toLowerCase();
    return autocomplete === 'username' || autocomplete === 'email';
  });
  if (byAutocomplete) {
    return byAutocomplete;
  }

  const scored = usernameCandidates
    .map((candidate) => ({
      candidate,
      score: scoreUsernameField(candidate, passwordField, pool),
    }))
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0 || scored[0].score < 0) {
    return null;
  }
  return scored[0].candidate;
}

function setInputValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillUsernamePassword(credential) {
  const passwordFields = Array.from(document.querySelectorAll('input[type="password"]')).filter((field) =>
    isVisibleAndEnabled(field),
  );

  const passwordField = choosePasswordField(passwordFields);
  if (!passwordField && passwordFields.length === 0) {
    return 'no_eligible_fields';
  }
  if (!passwordField) {
    return 'unsupported_form';
  }
  const usernameField = pickUsernameField(passwordField);
  if (!usernameField) {
    return 'no_eligible_fields';
  }

  setInputValue(usernameField, credential.username);
  setInputValue(passwordField, credential.password);
  return 'filled';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'vaultlite.fill') {
    return false;
  }

  if (window !== window.top) {
    sendResponse({ ok: true, result: 'manual_fill_unavailable' });
    return true;
  }

  if (!isPageUrlEligibleForFill(location.href)) {
    sendResponse({ ok: true, result: 'manual_fill_unavailable' });
    return true;
  }

  if (typeof message.expectedPageUrl === 'string' && message.expectedPageUrl !== location.href) {
    sendResponse({ ok: true, result: 'page_changed_try_again' });
    return true;
  }

  const credential = message.credential;
  if (!credential || typeof credential.username !== 'string' || typeof credential.password !== 'string') {
    sendResponse({ ok: true, result: 'manual_fill_unavailable' });
    return true;
  }

  const result = fillUsernamePassword({
    username: credential.username,
    password: credential.password,
  });

  sendResponse({ ok: true, result });
  return true;
});
