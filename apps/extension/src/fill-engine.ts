export type ManualFillResult =
  | 'filled'
  | 'unsupported_form'
  | 'no_eligible_fields'
  | 'manual_fill_unavailable';

export interface ManualFillCredential {
  username: string;
  password: string;
}

const USERNAME_HINT_PATTERN =
  /\b(user(name)?|email|e-mail|login|cpf|cnpj|conta|account|documento|identifica[cç][aã]o)\b/i;
const USERNAME_NEGATIVE_PATTERN = /\b(search|busca|query|coupon|cupom|promo|newsletter)\b/i;
const PASSWORD_NEGATIVE_PATTERN =
  /\b(confirm|confirmation|repeat|repetir|again|new|novo|nova|otp|2fa|mfa|token|one[-\s_]?time|verification|codigo|c[oó]digo)\b/i;

function isVisibleAndEnabled(input: HTMLInputElement): boolean {
  if (input.disabled) {
    return false;
  }
  if (input.type === 'hidden') {
    return false;
  }
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(input) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
}

function fieldHint(input: HTMLInputElement): string {
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

function isLikelyLoginPasswordField(input: HTMLInputElement): boolean {
  const autocomplete = (input.getAttribute('autocomplete') ?? '').toLowerCase();
  if (autocomplete.includes('current-password')) {
    return true;
  }
  if (autocomplete.includes('new-password') || autocomplete.includes('one-time-code')) {
    return false;
  }
  return !PASSWORD_NEGATIVE_PATTERN.test(fieldHint(input));
}

function choosePasswordField(
  passwordFields: HTMLInputElement[],
  activeElement: Element | null,
): HTMLInputElement | null {
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

  if (activeElement instanceof HTMLInputElement && likelyCandidates.includes(activeElement)) {
    return activeElement;
  }

  return null;
}

function isEligibleUsernameInput(input: HTMLInputElement): boolean {
  if (!isVisibleAndEnabled(input)) {
    return false;
  }
  if (input.type === 'password') {
    return false;
  }
  return input.type === 'text' || input.type === 'email' || input.type === 'tel';
}

function scoreUsernameField(
  input: HTMLInputElement,
  passwordField: HTMLInputElement,
  orderedInputs: HTMLInputElement[],
): number {
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

function pickUsernameField(passwordField: HTMLInputElement): HTMLInputElement | null {
  const allInputs = Array.from(
    (passwordField.ownerDocument?.querySelectorAll('input') ?? []) as NodeListOf<HTMLInputElement>,
  );

  const visibleInputs = allInputs.filter((input) => isVisibleAndEnabled(input));
  const inSameForm = visibleInputs.filter((input) => input.form === passwordField.form);
  const searchPool = inSameForm.length > 0 ? inSameForm : visibleInputs;

  const usernameCandidates = searchPool.filter(isEligibleUsernameInput);
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
      score: scoreUsernameField(candidate, passwordField, searchPool),
    }))
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0 || scored[0].score < 0) {
    return null;
  }
  return scored[0].candidate;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function fillUsernamePassword(input: {
  document: Document;
  credential: ManualFillCredential;
  topLevel: boolean;
}): ManualFillResult {
  if (!input.topLevel) {
    return 'manual_fill_unavailable';
  }

  const passwordFields = Array.from(
    input.document.querySelectorAll('input[type="password"]'),
  ).filter((field): field is HTMLInputElement => field instanceof HTMLInputElement && isVisibleAndEnabled(field));

  const passwordField = choosePasswordField(passwordFields, input.document.activeElement);
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

  setInputValue(usernameField, input.credential.username);
  setInputValue(passwordField, input.credential.password);
  return 'filled';
}
