export type ManualFillResult =
  | 'filled'
  | 'unsupported_form'
  | 'no_eligible_fields'
  | 'manual_fill_unavailable';

export type FormMetadataFieldRole =
  | 'username'
  | 'email'
  | 'password_current'
  | 'password_new'
  | 'password_confirmation'
  | 'otp'
  | 'unknown';

export type FormMetadataFrameScope = 'top' | 'same_origin_iframe';
export type FormMetadataConfidence =
  | 'heuristic'
  | 'filled'
  | 'submitted_confirmed'
  | 'user_corrected';
export type FormMetadataSelectorStatus = 'active' | 'suspect' | 'retired';

export interface ManualFillCredential {
  username: string;
  password: string;
}

export interface DetectedLoginFormContext {
  document: Document;
  frameScope: FormMetadataFrameScope;
  formElement: HTMLFormElement | null;
  orderedFields: HTMLInputElement[];
  usernameField: HTMLInputElement;
  usernameRole: 'username' | 'email';
  passwordField: HTMLInputElement;
}

export interface FormMetadataObservation {
  itemId: string | null;
  origin: string;
  formFingerprint: string;
  fieldFingerprint: string;
  frameScope: FormMetadataFrameScope;
  fieldRole: FormMetadataFieldRole;
  selectorCss: string;
  selectorFallbacks: string[];
  autocompleteToken: string | null;
  inputType: string | null;
  fieldName: string | null;
  fieldId: string | null;
  labelTextNormalized: string | null;
  placeholderNormalized: string | null;
  confidence: FormMetadataConfidence;
  selectorStatus: FormMetadataSelectorStatus;
}

const USERNAME_HINT_PATTERN =
  /\b(user(name)?|email|e-mail|login|cpf|cnpj|conta|account|documento|identifica[cç][aã]o)\b/i;
const USERNAME_NEGATIVE_PATTERN = /\b(search|busca|query|coupon|cupom|promo|newsletter)\b/i;
const PASSWORD_NEW_PATTERN =
  /\b(new|novo|nova|create|criar|choose|defina|definir|set|setup)\b/i;
const PASSWORD_CONFIRM_PATTERN =
  /\b(confirm|confirmation|repeat|repetir|again|verify|verifica[cç][aã]o)\b/i;
const OTP_PATTERN =
  /\b(otp|2fa|mfa|token|one[-\s_]?time|verification|codigo|c[oó]digo|passcode)\b/i;
const TEXT_NORMALIZATION_PATTERN = /[\s\p{P}\p{S}]+/gu;
const MAX_NORMALIZED_TEXT_LENGTH = 120;

function isVisibleAndEnabled(input: HTMLInputElement): boolean {
  if (input.disabled || input.type === 'hidden') {
    return false;
  }
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(input) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
}

function escapeCssIdentifier(value: string): string {
  if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fm_${(hash >>> 0).toString(36)}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function inputHint(input: HTMLInputElement): string {
  return [
    input.getAttribute('name') ?? '',
    input.id ?? '',
    input.getAttribute('placeholder') ?? '',
    input.getAttribute('aria-label') ?? '',
    input.getAttribute('autocomplete') ?? '',
    readAssociatedLabelText(input) ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function readAccessibleAutocompleteToken(input: HTMLInputElement): string | null {
  const rawToken = (input.getAttribute('autocomplete') ?? '').trim().toLowerCase();
  if (!rawToken) {
    return null;
  }
  const firstToken = rawToken
    .split(/\s+/u)
    .map((token) => token.trim())
    .find((token) => token.length > 0);
  return firstToken ?? null;
}

function normalizeInputType(input: HTMLInputElement): string {
  return (input.getAttribute('type') ?? input.type ?? 'text').trim().toLowerCase() || 'text';
}

function normalizeObservedText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(TEXT_NORMALIZATION_PATTERN, ' ')
    .trim()
    .slice(0, MAX_NORMALIZED_TEXT_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

export function readAssociatedLabelText(input: HTMLInputElement): string | null {
  const labels = Array.from(input.labels ?? []).map((label) => label.textContent ?? '');
  const ariaLabelledBy = (input.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => input.ownerDocument.getElementById(token)?.textContent ?? '');
  const inlineLabel = input.closest('label')?.textContent ?? '';
  const ariaLabel = input.getAttribute('aria-label') ?? '';
  const text = [...labels, ...ariaLabelledBy, inlineLabel, ariaLabel]
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  return text?.length ? text : null;
}

export function inferFieldRole(
  input: HTMLInputElement,
  options: {
    orderedFields?: HTMLInputElement[];
    activeElement?: Element | null;
  } = {},
): FormMetadataFieldRole {
  const autocompleteToken = readAccessibleAutocompleteToken(input);
  if (autocompleteToken === 'username') {
    return 'username';
  }
  if (autocompleteToken === 'email') {
    return 'email';
  }
  if (autocompleteToken === 'current-password') {
    return 'password_current';
  }
  if (autocompleteToken === 'new-password') {
    return 'password_new';
  }
  if (autocompleteToken === 'one-time-code') {
    return 'otp';
  }

  const normalizedType = normalizeInputType(input);
  const hint = inputHint(input);
  const labelText = normalizeObservedText(readAssociatedLabelText(input));
  const placeholderText = normalizeObservedText(input.getAttribute('placeholder'));
  const textSignals = [hint, labelText ?? '', placeholderText ?? ''].join(' ');

  if (normalizedType === 'password') {
    if (OTP_PATTERN.test(textSignals)) {
      return 'otp';
    }
    if (PASSWORD_CONFIRM_PATTERN.test(textSignals)) {
      return 'password_confirmation';
    }
    if (PASSWORD_NEW_PATTERN.test(textSignals)) {
      return 'password_new';
    }
    return 'password_current';
  }

  if (OTP_PATTERN.test(textSignals)) {
    return 'otp';
  }
  if (normalizedType === 'email') {
    return 'email';
  }
  if (USERNAME_NEGATIVE_PATTERN.test(textSignals)) {
    return 'unknown';
  }
  if (USERNAME_HINT_PATTERN.test(textSignals)) {
    return normalizedType === 'email' ? 'email' : 'username';
  }

  const orderedFields = Array.isArray(options.orderedFields) ? options.orderedFields : [];
  const currentIndex = orderedFields.indexOf(input);
  if (currentIndex >= 0) {
    const nextPasswordField = orderedFields
      .slice(currentIndex + 1)
      .find((candidate) => inferFieldRole(candidate, { orderedFields }) === 'password_current');
    if (nextPasswordField) {
      return normalizedType === 'email' ? 'email' : 'username';
    }
  }

  return 'unknown';
}

function isEligibleUsernameInput(input: HTMLInputElement): boolean {
  if (!isVisibleAndEnabled(input) || normalizeInputType(input) === 'password') {
    return false;
  }
  const normalizedType = normalizeInputType(input);
  return normalizedType === 'text' || normalizedType === 'email' || normalizedType === 'tel';
}

function scoreUsernameField(
  input: HTMLInputElement,
  passwordField: HTMLInputElement,
  orderedFields: HTMLInputElement[],
): number {
  const autocompleteToken = readAccessibleAutocompleteToken(input);
  const hint = inputHint(input);
  let score = 0;

  if (autocompleteToken === 'username' || autocompleteToken === 'email') {
    score += 120;
  }
  if (autocompleteToken === 'one-time-code') {
    score -= 120;
  }
  if (normalizeInputType(input) === 'email') {
    score += 25;
  }
  if (USERNAME_HINT_PATTERN.test(hint)) {
    score += 50;
  }
  if (USERNAME_NEGATIVE_PATTERN.test(hint)) {
    score -= 90;
  }

  const passwordIndex = orderedFields.indexOf(passwordField);
  const currentIndex = orderedFields.indexOf(input);
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

  const currentPasswordCandidates = passwordFields.filter(
    (field) => inferFieldRole(field, { orderedFields: passwordFields }) === 'password_current',
  );
  if (currentPasswordCandidates.length === 1) {
    return currentPasswordCandidates[0];
  }

  if (activeElement instanceof HTMLInputElement && currentPasswordCandidates.includes(activeElement)) {
    return activeElement;
  }

  return null;
}

function pickUsernameField(
  passwordField: HTMLInputElement,
  orderedFields: HTMLInputElement[],
): HTMLInputElement | null {
  const inSameForm = orderedFields.filter((input) => input.form === passwordField.form);
  const searchPool = inSameForm.length > 0 ? inSameForm : orderedFields;
  const usernameCandidates = searchPool.filter(isEligibleUsernameInput);
  if (usernameCandidates.length === 0) {
    return null;
  }
  const byAutocomplete = usernameCandidates.find((input) => {
    const autocompleteToken = readAccessibleAutocompleteToken(input);
    return autocompleteToken === 'username' || autocompleteToken === 'email';
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

function structuralSegmentForField(input: HTMLInputElement): string {
  const autocompleteToken = readAccessibleAutocompleteToken(input) ?? '';
  const fieldName = input.getAttribute('name') ?? '';
  const fieldId = input.id ?? '';
  const normalizedType = normalizeInputType(input);
  const role = inferFieldRole(input);
  return [role, normalizedType, autocompleteToken, fieldName, fieldId].join(':');
}

function uniqueSelector(document: Document, selector: string): string | null {
  if (!selector) {
    return null;
  }
  try {
    const matches = document.querySelectorAll(selector);
    if (matches.length === 1) {
      return selector;
    }
  } catch {
    return null;
  }
  return null;
}

function buildStructuralSelector(input: HTMLInputElement): string {
  const segments: string[] = [];
  let current: Element | null = input;
  let depth = 0;
  while (current && depth < 4 && current instanceof HTMLElement) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${escapeCssIdentifier(current.id)}` : '';
    if (id) {
      segments.unshift(`${tag}${id}`);
      break;
    }
    let nth = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) {
        nth += 1;
      }
      sibling = sibling.previousElementSibling;
    }
    segments.unshift(`${tag}:nth-of-type(${nth})`);
    current = current.parentElement;
    depth += 1;
  }
  return segments.join(' > ');
}

export function buildStableSelector(input: HTMLInputElement): string | null {
  const document = input.ownerDocument;
  const candidates = uniqueStrings([
    input.id ? `#${escapeCssIdentifier(input.id)}` : '',
    (() => {
      const name = input.getAttribute('name');
      return name ? `input[name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    (() => {
      const token = readAccessibleAutocompleteToken(input);
      return token ? `input[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    (() => {
      const name = input.getAttribute('name');
      const type = normalizeInputType(input);
      return name ? `input[type="${escapeCssIdentifier(type)}"][name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    buildStructuralSelector(input),
  ]);

  for (const candidate of candidates) {
    const unique = uniqueSelector(document, candidate);
    if (unique) {
      return unique;
    }
  }
  return candidates[0] ?? null;
}

export function buildSelectorFallbacks(input: HTMLInputElement): string[] {
  const document = input.ownerDocument;
  const candidates = uniqueStrings([
    buildStableSelector(input) ?? '',
    (() => {
      const name = input.getAttribute('name');
      return name ? `input[name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    (() => {
      const token = readAccessibleAutocompleteToken(input);
      return token ? `input[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    (() => {
      const type = normalizeInputType(input);
      return `input[type="${escapeCssIdentifier(type)}"]`;
    })(),
    buildStructuralSelector(input),
  ]);
  return candidates
    .map((candidate) => uniqueSelector(document, candidate) ?? candidate)
    .filter((candidate) => candidate.length > 0)
    .slice(0, 5);
}

export function buildFormFingerprint(input: {
  orderedFields: HTMLInputElement[];
  formElement: HTMLFormElement | null;
}): string {
  const formDescriptor = input.formElement
    ? [
        input.formElement.id,
        input.formElement.getAttribute('name') ?? '',
        input.formElement.getAttribute('action') ?? '',
        input.formElement.getAttribute('autocomplete') ?? '',
      ].join('|')
    : 'detached';
  const fieldDescriptor = input.orderedFields
    .slice(0, 12)
    .map((field) => structuralSegmentForField(field))
    .join('||');
  return fnv1a(`${formDescriptor}::${fieldDescriptor}`);
}

export function buildFieldFingerprint(input: {
  field: HTMLInputElement;
  orderedFields: HTMLInputElement[];
  inferredRole?: FormMetadataFieldRole;
}): string {
  const index = input.orderedFields.indexOf(input.field);
  const labelText = normalizeObservedText(readAssociatedLabelText(input.field)) ?? '';
  const placeholderText = normalizeObservedText(input.field.getAttribute('placeholder')) ?? '';
  const descriptor = [
    input.inferredRole ?? inferFieldRole(input.field, { orderedFields: input.orderedFields }),
    normalizeInputType(input.field),
    readAccessibleAutocompleteToken(input.field) ?? '',
    input.field.getAttribute('name') ?? '',
    input.field.id ?? '',
    labelText,
    placeholderText,
    String(index),
  ].join('|');
  return fnv1a(descriptor);
}

export function buildFormMetadataObservation(input: {
  itemId: string | null;
  origin: string;
  context: Pick<DetectedLoginFormContext, 'orderedFields' | 'formElement' | 'frameScope'>;
  field: HTMLInputElement;
  fieldRole: FormMetadataFieldRole;
  confidence: FormMetadataConfidence;
  selectorStatus?: FormMetadataSelectorStatus;
}): FormMetadataObservation | null {
  const selectorCss = buildStableSelector(input.field);
  if (!selectorCss) {
    return null;
  }
  const selectorFallbacks = buildSelectorFallbacks(input.field);
  return {
    itemId: input.itemId,
    origin: input.origin,
    formFingerprint: buildFormFingerprint({
      orderedFields: input.context.orderedFields,
      formElement: input.context.formElement,
    }),
    fieldFingerprint: buildFieldFingerprint({
      field: input.field,
      orderedFields: input.context.orderedFields,
      inferredRole: input.fieldRole,
    }),
    frameScope: input.context.frameScope,
    fieldRole: input.fieldRole,
    selectorCss,
    selectorFallbacks,
    autocompleteToken: readAccessibleAutocompleteToken(input.field),
    inputType: normalizeInputType(input.field),
    fieldName: input.field.getAttribute('name')?.trim() || null,
    fieldId: input.field.id?.trim() || null,
    labelTextNormalized: normalizeObservedText(readAssociatedLabelText(input.field)),
    placeholderNormalized: normalizeObservedText(input.field.getAttribute('placeholder')),
    confidence: input.confidence,
    selectorStatus: input.selectorStatus ?? 'active',
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function detectFormContext(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
  activeElement?: Element | null;
}): DetectedLoginFormContext | null {
  const orderedFields = Array.from(input.document.querySelectorAll('input')).filter(
    (field): field is HTMLInputElement => field instanceof HTMLInputElement && isVisibleAndEnabled(field),
  );
  const passwordFields = orderedFields.filter(
    (field) =>
      normalizeInputType(field) === 'password' &&
      inferFieldRole(field, {
        orderedFields,
        activeElement: input.activeElement ?? input.document.activeElement,
      }) === 'password_current',
  );

  const passwordField = choosePasswordField(passwordFields, input.activeElement ?? input.document.activeElement);
  if (!passwordField) {
    return null;
  }
  const usernameField = pickUsernameField(passwordField, orderedFields);
  if (!usernameField) {
    return null;
  }
  const usernameRole = inferFieldRole(usernameField, { orderedFields });
  return {
    document: input.document,
    frameScope: input.frameScope ?? 'top',
    formElement: passwordField.form ?? usernameField.form ?? null,
    orderedFields,
    usernameField,
    usernameRole: usernameRole === 'email' ? 'email' : 'username',
    passwordField,
  };
}

export function fillUsernamePassword(input: {
  document: Document;
  credential: ManualFillCredential;
  topLevel: boolean;
}): ManualFillResult {
  if (!input.topLevel) {
    return 'manual_fill_unavailable';
  }
  const context = detectFormContext({
    document: input.document,
    frameScope: 'top',
    activeElement: input.document.activeElement,
  });
  if (!context) {
    const passwordFields = Array.from(input.document.querySelectorAll('input[type="password"]')).filter(
      (field): field is HTMLInputElement => field instanceof HTMLInputElement && isVisibleAndEnabled(field),
    );
    return passwordFields.length === 0 ? 'no_eligible_fields' : 'unsupported_form';
  }
  setInputValue(context.usernameField, input.credential.username);
  setInputValue(context.passwordField, input.credential.password);
  return 'filled';
}
