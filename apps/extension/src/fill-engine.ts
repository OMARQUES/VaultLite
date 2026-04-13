export type ManualFillResult =
  | 'filled'
  | 'unsupported_form'
  | 'no_eligible_fields'
  | 'manual_fill_unavailable'
  | 'step_transition_try_again';

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
  mode: 'full_login';
  usernameField: HTMLInputElement;
  usernameRole: 'username' | 'email';
  passwordField: HTMLInputElement;
  submitter: HTMLElement | null;
}

export interface DetectedFillContext {
  document: Document;
  frameScope: FormMetadataFrameScope;
  formElement: HTMLFormElement | null;
  orderedFields: HTMLInputElement[];
  mode: 'full_login' | 'identifier_step' | 'password_step';
  usernameField: HTMLInputElement | null;
  usernameRole: 'username' | 'email' | null;
  passwordField: HTMLInputElement | null;
  submitter: HTMLElement | null;
}

export interface InlineAssistTarget {
  fieldElement: HTMLInputElement;
  fieldRole: 'username' | 'email' | 'password_current';
  mode: DetectedFillContext['mode'];
  frameScope: FormMetadataFrameScope;
  formFingerprint: string;
  fieldFingerprint: string;
  confidence: 'high';
  contextGroupKey: string;
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
const SUBMITTER_POSITIVE_PATTERN =
  /\b(next|continue|continuar|entrar|login|log\s*in|sign\s*in|submit|prosseguir|avancar|avan[cç]ar)\b/i;
const SUBMITTER_NEGATIVE_PATTERN =
  /\b(cancel|close|fechar|back|voltar|forgot|esqueci|register|cadastro|sign\s*up|google|apple|facebook|github|microsoft|sso|social)\b/i;
const PASSWORD_NEW_PATTERN =
  /\b(new|novo|nova|create|criar|choose|defina|definir|set|setup)\b/i;
const PASSWORD_CONFIRM_PATTERN =
  /\b(confirm|confirmation|repeat|repetir|again|verify|verifica[cç][aã]o)\b/i;
const OTP_PATTERN =
  /\b(otp|2fa|mfa|token|one[-\s_]?time|verification|codigo|c[oó]digo|passcode)\b/i;
const TEXT_NORMALIZATION_PATTERN = /[\s\p{P}\p{S}]+/gu;
const MAX_NORMALIZED_TEXT_LENGTH = 120;
const DEFAULT_PASSWORD_TRANSITION_TIMEOUT_MS = 3_000;
const CHALLENGE_PASSWORD_TRANSITION_TIMEOUT_MS = 12_000;
const PASSWORD_TRANSITION_POLL_INTERVAL_MS = 250;

function hasStronglyHiddenAncestor(element: Element): boolean {
  return Boolean(element.closest('[hidden], [inert], [data-is-visible="false"]'));
}

function isAriaHiddenVisibilityException(element: HTMLElement, ariaHiddenAncestor: Element): boolean {
  const activeElement = element.ownerDocument?.activeElement;
  if (activeElement instanceof Element && ariaHiddenAncestor.contains(activeElement)) {
    return true;
  }
  if (element.tabIndex >= 0) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return element.type !== 'hidden' && !element.disabled && element.tabIndex !== -1;
  }
  if (element instanceof HTMLButtonElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return !element.disabled;
  }
  if (element instanceof HTMLAnchorElement) {
    return element.hasAttribute('href');
  }
  return element.getAttribute('contenteditable') === 'true';
}

function isSemanticallyHidden(element: Element | null): boolean {
  if (!(element instanceof Element)) {
    return false;
  }
  if (hasStronglyHiddenAncestor(element)) {
    return true;
  }
  const ariaHiddenAncestor = element.closest('[aria-hidden="true"]');
  if (!ariaHiddenAncestor) {
    return false;
  }
  const visibilityTarget = element instanceof HTMLElement ? element : ariaHiddenAncestor;
  if (visibilityTarget instanceof HTMLElement && isAriaHiddenVisibilityException(visibilityTarget, ariaHiddenAncestor)) {
    return false;
  }
  return true;
}

function isVisibleInput(input: HTMLInputElement): boolean {
  if (input.type === 'hidden') {
    return false;
  }
  if (isSemanticallyHidden(input) || isSemanticallyHidden(semanticHostForInput(input))) {
    return false;
  }
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(input) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
}

function isVisibleAndEnabled(input: HTMLInputElement): boolean {
  return isVisibleInput(input) && !input.disabled;
}

function isWritableInput(input: HTMLInputElement): boolean {
  return isVisibleInput(input) && !input.disabled && !input.readOnly;
}

function hasNonEmptyValue(input: HTMLInputElement): boolean {
  return typeof input.value === 'string' && input.value.trim().length > 0;
}

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (isSemanticallyHidden(element)) {
    return false;
  }
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
}

type QueryableRoot = Document | Element | ShadowRoot;

function rootSearchBase(root: QueryableRoot): Element | ShadowRoot | null {
  if (root instanceof Document) {
    return root.documentElement ?? root.body;
  }
  return root;
}

function isVaultLiteInlineElement(element: Element): boolean {
  return element.closest('[data-vaultlite-inline-root="true"]') instanceof Element;
}

function collectQueryableRoots(root: QueryableRoot): QueryableRoot[] {
  const roots: QueryableRoot[] = [root];
  const seen = new Set<Node>([root]);
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    const base = rootSearchBase(current);
    if (!base) {
      continue;
    }
    const elements = Array.from(base.querySelectorAll('*'));
    for (const element of elements) {
      if (element instanceof Element && isVaultLiteInlineElement(element)) {
        continue;
      }
      if (!(element instanceof HTMLElement) || !(element.shadowRoot instanceof ShadowRoot)) {
        continue;
      }
      if (seen.has(element.shadowRoot)) {
        continue;
      }
      seen.add(element.shadowRoot);
      roots.push(element.shadowRoot);
    }
  }
  return roots;
}

function isChallengeFlowDocument(document: Document): boolean {
  const href = document.defaultView?.location?.href ?? '';
  if (/accounts\.google\.com/i.test(href) || /\/challenge\//i.test(href)) {
    return true;
  }
  const pageText = normalizeObservedText(document.body?.textContent ?? '') ?? '';
  if (pageText.includes('passkey') || pageText.includes('try another way') || pageText.includes('use your phone')) {
    return true;
  }
  return queryDeepElements(
    document,
    'input',
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement &&
      ((readSemanticAttribute(element, 'autocomplete') ?? '').toLowerCase().includes('webauthn')),
  ).length > 0;
}

function resolvePasswordTransitionTimeout(document: Document, requestedTimeoutMs: number): number {
  if (isChallengeFlowDocument(document)) {
    return Math.max(requestedTimeoutMs, CHALLENGE_PASSWORD_TRANSITION_TIMEOUT_MS);
  }
  return requestedTimeoutMs;
}

function queryDeepElements<T extends Element>(
  root: QueryableRoot,
  selector: string,
  predicate: (element: Element) => element is T,
): T[] {
  const matches: T[] = [];
  const seen = new Set<Element>();
  for (const searchRoot of collectQueryableRoots(root)) {
    const base = rootSearchBase(searchRoot);
    if (!base) {
      continue;
    }
    const elements = Array.from(base.querySelectorAll(selector));
    for (const element of elements) {
      if (seen.has(element) || !predicate(element)) {
        continue;
      }
      seen.add(element);
      matches.push(element);
    }
  }
  return matches;
}

function semanticHostForInput(input: HTMLInputElement): HTMLElement | null {
  const rootNode = input.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.host instanceof HTMLElement ? rootNode.host : null;
}

function semanticOwnerElement(input: HTMLInputElement): HTMLElement {
  return semanticHostForInput(input) ?? input;
}

function readSemanticAttribute(input: HTMLInputElement, attribute: string): string | null {
  const directValue = input.getAttribute(attribute)?.trim();
  if (directValue) {
    return directValue;
  }
  const hostValue = semanticHostForInput(input)?.getAttribute(attribute)?.trim();
  return hostValue?.length ? hostValue : null;
}

function logicalFormOwner(input: HTMLInputElement): HTMLFormElement | null {
  const directForm = input.form;
  if (directForm instanceof HTMLFormElement) {
    return directForm;
  }
  return semanticOwnerElement(input).closest('form');
}

function findPreferredFieldRoot(document: Document): ParentNode {
  const dialogCandidates = Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]'),
  ).filter((candidate): candidate is HTMLElement => isVisibleElement(candidate));
  for (let index = dialogCandidates.length - 1; index >= 0; index -= 1) {
    const candidate = dialogCandidates[index];
    if (queryDeepElements(candidate, 'input', (field): field is HTMLInputElement => field instanceof HTMLInputElement).length > 0) {
      return candidate;
    }
  }
  return document;
}

function queryScopedInputs(
  document: Document,
  predicate: (field: HTMLInputElement) => boolean,
): HTMLInputElement[] {
  const preferredRoot = findPreferredFieldRoot(document);
  const preferredInputs = queryDeepElements(
    preferredRoot as QueryableRoot,
    'input',
    (field): field is HTMLInputElement => field instanceof HTMLInputElement && predicate(field),
  );
  if (preferredInputs.length > 0) {
    return preferredInputs;
  }
  return queryDeepElements(document, 'input',
    (field): field is HTMLInputElement => field instanceof HTMLInputElement && predicate(field),
  );
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
    readSemanticAttribute(input, 'name') ?? '',
    readSemanticAttribute(input, 'id') ?? input.id ?? semanticHostForInput(input)?.id ?? '',
    readSemanticAttribute(input, 'placeholder') ?? '',
    readSemanticAttribute(input, 'aria-label') ?? '',
    readSemanticAttribute(input, 'autocomplete') ?? '',
    readAssociatedLabelText(input) ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function structuralTextSignals(input: HTMLInputElement): string {
  return [
    readSemanticAttribute(input, 'name') ?? '',
    readSemanticAttribute(input, 'id') ?? input.id ?? semanticHostForInput(input)?.id ?? '',
    readSemanticAttribute(input, 'placeholder') ?? '',
    readSemanticAttribute(input, 'aria-label') ?? '',
    readAssociatedLabelText(input) ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function readAccessibleAutocompleteToken(input: HTMLInputElement): string | null {
  const rawToken = (readSemanticAttribute(input, 'autocomplete') ?? '').trim().toLowerCase();
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
  return (readSemanticAttribute(input, 'type') ?? input.type ?? 'text').trim().toLowerCase() || 'text';
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
  const semanticHost = semanticHostForInput(input);
  const labels = Array.from(input.labels ?? []).map((label) => label.textContent ?? '');
  const ariaLabelledBy = (input.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => input.ownerDocument.getElementById(token)?.textContent ?? '');
  const inlineLabel = input.closest('label')?.textContent ?? '';
  const ariaLabel = input.getAttribute('aria-label') ?? '';
  const hostAriaLabelledBy = semanticHost
    ? (semanticHost.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .map((token) => input.ownerDocument.getElementById(token)?.textContent ?? '')
    : [];
  const hostLabel = semanticHost?.querySelector('[slot="label"]')?.textContent ?? '';
  const hostAriaLabel = semanticHost?.getAttribute('aria-label') ?? '';
  const text = [...labels, ...ariaLabelledBy, inlineLabel, ariaLabel, ...hostAriaLabelledBy, hostLabel, hostAriaLabel]
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
  if (!isWritableInput(input) || normalizeInputType(input) === 'password') {
    return false;
  }
  const normalizedType = normalizeInputType(input);
  return normalizedType === 'text' || normalizedType === 'email' || normalizedType === 'tel';
}

function isContextualUsernameAnchor(input: HTMLInputElement): boolean {
  if (!isVisibleInput(input) || normalizeInputType(input) === 'password') {
    return false;
  }
  const normalizedType = normalizeInputType(input);
  if (normalizedType !== 'text' && normalizedType !== 'email' && normalizedType !== 'tel') {
    return false;
  }
  if (!input.disabled && !input.readOnly) {
    return isEligibleUsernameInput(input);
  }
  return hasNonEmptyValue(input);
}

function isHiddenUsernameStateField(input: HTMLInputElement): boolean {
  if (isVisibleInput(input) || normalizeInputType(input) === 'password') {
    return false;
  }
  const normalizedType = normalizeInputType(input);
  if (normalizedType !== 'text' && normalizedType !== 'email' && normalizedType !== 'tel' && normalizedType !== 'hidden') {
    return false;
  }
  if (!hasNonEmptyValue(input)) {
    return false;
  }
  const autocompleteToken = readAccessibleAutocompleteToken(input);
  if (autocompleteToken === 'one-time-code') {
    return false;
  }
  const hint = inputHint(input);
  if (USERNAME_NEGATIVE_PATTERN.test(hint)) {
    return false;
  }
  return autocompleteToken === 'username' || autocompleteToken === 'email' || normalizedType === 'email' || USERNAME_HINT_PATTERN.test(hint);
}

function contextualFieldSearchPool(
  passwordField: HTMLInputElement,
  candidates: HTMLInputElement[],
): HTMLInputElement[] {
  const inSameForm = candidates.filter((input) => input.form === passwordField.form);
  const passwordForm = logicalFormOwner(passwordField);
  const inSameLogicalForm = candidates.filter((input) => logicalFormOwner(input) === passwordForm);
  return inSameLogicalForm.length > 0 ? inSameLogicalForm : inSameForm.length > 0 ? inSameForm : candidates;
}

function hasVisibleIdentifierEcho(
  passwordField: HTMLInputElement,
  candidateValue: string,
): boolean {
  const normalizedValue = normalizeObservedText(candidateValue);
  if (!normalizedValue) {
    return false;
  }
  const owner = semanticOwnerElement(passwordField);
  let depth = 0;
  for (let current: HTMLElement | null = owner; current && depth < 8; current = current.parentElement, depth += 1) {
    if (!isVisibleElement(current)) {
      continue;
    }
    const containerText = normalizeObservedText(
      [
        current.getAttribute('aria-label') ?? '',
        current.textContent ?? '',
      ].join(' '),
    );
    if (containerText?.includes(normalizedValue)) {
      return true;
    }
  }
  return false;
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
  const searchPool = contextualFieldSearchPool(passwordField, orderedFields);
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

function pickContextualUsernameField(
  passwordField: HTMLInputElement,
  orderedFields: HTMLInputElement[],
): HTMLInputElement | null {
  const searchPool = contextualFieldSearchPool(passwordField, orderedFields);
  const usernameCandidates = searchPool.filter(isContextualUsernameAnchor);
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
    .map((candidate) => {
      let score = scoreUsernameField(candidate, passwordField, searchPool);
      if ((candidate.disabled || candidate.readOnly) && hasNonEmptyValue(candidate)) {
        score += 80;
      }
      return {
        candidate,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0 || scored[0].score < 0) {
    return null;
  }
  return scored[0].candidate;
}

function pickHiddenUsernameStateField(
  passwordField: HTMLInputElement,
  visibleOrderedFields: HTMLInputElement[],
  allInputs: HTMLInputElement[],
): HTMLInputElement | null {
  const searchPool = contextualFieldSearchPool(passwordField, allInputs);
  const usernameCandidates = searchPool.filter(
    (candidate) => candidate !== passwordField && isHiddenUsernameStateField(candidate),
  );
  if (usernameCandidates.length === 0) {
    return null;
  }
  const passwordForm = logicalFormOwner(passwordField);
  const scored = usernameCandidates
    .map((candidate) => {
      let score = scoreUsernameField(candidate, passwordField, visibleOrderedFields);
      if (normalizeInputType(candidate) === 'email') {
        score += 25;
      }
      if (logicalFormOwner(candidate) && logicalFormOwner(candidate) === passwordForm) {
        score += 40;
      }
      if (hasVisibleIdentifierEcho(passwordField, candidate.value)) {
        score += 160;
      }
      return {
        candidate,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0 || scored[0].score < 120) {
    return null;
  }
  return scored[0].candidate;
}

function pickIdentifierField(orderedFields: HTMLInputElement[]): HTMLInputElement | null {
  const usernameCandidates = orderedFields.filter(isEligibleUsernameInput);
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
    .map((candidate, index) => {
      const hint = inputHint(candidate);
      let score = 0;
      if (normalizeInputType(candidate) === 'email') {
        score += 25;
      }
      if (USERNAME_HINT_PATTERN.test(hint)) {
        score += 50;
      }
      if (USERNAME_NEGATIVE_PATTERN.test(hint)) {
        score -= 90;
      }
      score += Math.max(0, 20 - index);
      return {
        candidate,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0 || scored[0].score < 0) {
    return null;
  }
  return scored[0].candidate;
}

function inferPasswordRoleForLoginContext(
  field: HTMLInputElement,
  orderedFields: HTMLInputElement[],
): FormMetadataFieldRole {
  const inferredRole = inferFieldRole(field, { orderedFields });
  if (inferredRole !== 'password_new') {
    return inferredRole;
  }

  const searchPool = orderedFields.filter((candidate) => candidate.form === field.form);
  const fieldForm = logicalFormOwner(field);
  const logicalSearchPool = orderedFields.filter((candidate) => logicalFormOwner(candidate) === fieldForm);
  const effectivePool = logicalSearchPool.length > 0 ? logicalSearchPool : searchPool.length > 0 ? searchPool : orderedFields;
  const writablePasswordFields = effectivePool.filter(
    (candidate) => candidate !== field && isWritableInput(candidate) && normalizeInputType(candidate) === 'password',
  );
  if (writablePasswordFields.length > 0) {
    return inferredRole;
  }

  const semanticSignals = structuralTextSignals(field);
  if (PASSWORD_NEW_PATTERN.test(semanticSignals) || PASSWORD_CONFIRM_PATTERN.test(semanticSignals) || OTP_PATTERN.test(semanticSignals)) {
    return inferredRole;
  }

  const hasUsernameCandidate = effectivePool.some((candidate) => candidate !== field && isEligibleUsernameInput(candidate));
  if (!hasUsernameCandidate) {
    return inferredRole;
  }

  return 'password_current';
}

function findFormSubmitter(formElement: HTMLFormElement | null): HTMLElement | null {
  if (!(formElement instanceof HTMLFormElement)) {
    return null;
  }
  const candidates = Array.from(
    formElement.querySelectorAll('button, input[type="submit"], input[type="image"]'),
  ).filter((candidate) => isVisibleElement(candidate));
  for (const candidate of candidates) {
    if (candidate instanceof HTMLButtonElement) {
      const type = (candidate.getAttribute('type') ?? 'submit').trim().toLowerCase();
      if (type === 'submit') {
        return candidate;
      }
      continue;
    }
    if (candidate instanceof HTMLInputElement) {
      const type = normalizeInputType(candidate);
      if (type === 'submit' || type === 'image') {
        return candidate;
      }
    }
  }
  return null;
}

function submitterHint(element: HTMLElement): string {
  const textValue = element instanceof HTMLInputElement ? element.value : element.textContent ?? '';
  return [
    element.getAttribute('aria-label') ?? '',
    textValue,
    element.getAttribute('name') ?? '',
    element.id ?? '',
    element.className ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function isSubmitterElement(element: Element): element is HTMLButtonElement | HTMLInputElement {
  if (element instanceof HTMLButtonElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    const type = normalizeInputType(element);
    return type === 'submit' || type === 'image' || type === 'button';
  }
  return false;
}

function scoreContextualSubmitter(
  candidate: HTMLButtonElement | HTMLInputElement,
  field: HTMLInputElement,
): number {
  if (!isVisibleElement(candidate)) {
    return Number.NEGATIVE_INFINITY;
  }
  let score = 0;
  const hint = submitterHint(candidate);
  if (SUBMITTER_POSITIVE_PATTERN.test(hint)) {
    score += 90;
  }
  if (SUBMITTER_NEGATIVE_PATTERN.test(hint)) {
    score -= 140;
  }
  const fieldForm = logicalFormOwner(field);
  if (fieldForm && candidate.closest('form') === fieldForm) {
    score += 60;
  }
  const owner = semanticOwnerElement(field);
  const dialogContainer = owner.closest('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]');
  if (dialogContainer && dialogContainer.contains(candidate)) {
    score += 45;
  }
  if (candidate.disabled || candidate.getAttribute('aria-disabled') === 'true') {
    score += 5;
  }
  return score;
}

function findContextualSubmitter(field: HTMLInputElement): HTMLElement | null {
  const directFormSubmitter = findFormSubmitter(logicalFormOwner(field));
  if (directFormSubmitter) {
    return directFormSubmitter;
  }
  const owner = semanticOwnerElement(field);
  const candidatesByAncestor: Array<HTMLButtonElement | HTMLInputElement> = [];
  const searchedAncestors = new Set<HTMLElement>();
  for (let current: HTMLElement | null = owner; current; current = current.parentElement) {
    if (!isVisibleElement(current) || searchedAncestors.has(current)) {
      continue;
    }
    searchedAncestors.add(current);
    const localCandidates = queryDeepElements(
      current,
      'button, input[type="submit"], input[type="image"], input[type="button"]',
      (element): element is HTMLButtonElement | HTMLInputElement => isSubmitterElement(element),
    );
    if (localCandidates.length === 0) {
      continue;
    }
    candidatesByAncestor.push(...localCandidates);
  }
  const scored = Array.from(new Set(candidatesByAncestor))
    .map((candidate) => ({
      candidate,
      score: scoreContextualSubmitter(candidate, field),
    }))
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0 || scored[0].score < 40) {
    return null;
  }
  return scored[0].candidate;
}

function structuralSegmentForField(input: HTMLInputElement): string {
  const autocompleteToken = readAccessibleAutocompleteToken(input) ?? '';
  const fieldName = readSemanticAttribute(input, 'name') ?? '';
  const fieldId = input.id || semanticHostForInput(input)?.id || '';
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

function buildStructuralSelector(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
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
  const selectorTarget = semanticOwnerElement(input);
  const selectorTag = selectorTarget.tagName.toLowerCase();
  const candidates = uniqueStrings([
    selectorTarget.id ? `#${escapeCssIdentifier(selectorTarget.id)}` : '',
    (() => {
      const name = readSemanticAttribute(input, 'name');
      return name ? `${selectorTag}[name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    (() => {
      const token = readAccessibleAutocompleteToken(input);
      return token ? `${selectorTag}[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    (() => {
      const name = readSemanticAttribute(input, 'name');
      const type = normalizeInputType(input);
      return name
        ? `${selectorTag}[type="${escapeCssIdentifier(type)}"][name="${escapeCssIdentifier(name)}"]`
        : '';
    })(),
    buildStructuralSelector(selectorTarget),
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
  const selectorTarget = semanticOwnerElement(input);
  const selectorTag = selectorTarget.tagName.toLowerCase();
  const candidates = uniqueStrings([
    buildStableSelector(input) ?? '',
    (() => {
      const name = readSemanticAttribute(input, 'name');
      return name ? `${selectorTag}[name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    (() => {
      const token = readAccessibleAutocompleteToken(input);
      return token ? `${selectorTag}[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    (() => {
      const type = normalizeInputType(input);
      return `${selectorTag}[type="${escapeCssIdentifier(type)}"]`;
    })(),
    buildStructuralSelector(selectorTarget),
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
    readSemanticAttribute(input.field, 'name') ?? '',
    input.field.id || semanticHostForInput(input.field)?.id || '',
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
      fieldName: readSemanticAttribute(input.field, 'name')?.trim() || null,
      fieldId: (input.field.id || semanticHostForInput(input.field)?.id || '').trim() || null,
    labelTextNormalized: normalizeObservedText(readAssociatedLabelText(input.field)),
    placeholderNormalized: normalizeObservedText(input.field.getAttribute('placeholder')),
    confidence: input.confidence,
    selectorStatus: input.selectorStatus ?? 'active',
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  if (typeof input.focus === 'function' && input.ownerDocument.activeElement !== input) {
    try {
      input.focus();
    } catch {
      // Ignore focus failures on detached/inert nodes.
    }
  }
  if (typeof globalThis.InputEvent === 'function') {
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: value, inputType: 'insertText' }));
  }
  const valueSetter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement?.prototype ?? HTMLInputElement.prototype,
    'value',
  )?.set;
  if (typeof valueSetter === 'function') {
    valueSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function commitIdentifierField(input: HTMLInputElement): void {
  if (typeof input.focus === 'function' && input.ownerDocument.activeElement !== input) {
    try {
      input.focus();
    } catch {
      // Ignore focus failures on detached/inert nodes.
    }
  }
  input.dispatchEvent(new Event('blur'));
  input.dispatchEvent(new Event('focusout', { bubbles: true }));
}

function isReadySubmitter(candidate: HTMLElement | null): candidate is HTMLButtonElement | HTMLInputElement {
  if (candidate instanceof HTMLButtonElement) {
    return !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true';
  }
  if (candidate instanceof HTMLInputElement) {
    const type = normalizeInputType(candidate);
    return (
      !candidate.disabled &&
      candidate.getAttribute('aria-disabled') !== 'true' &&
      (type === 'submit' || type === 'image')
    );
  }
  return false;
}

async function waitForReadyIdentifierSubmitter(context: DetectedFillContext, timeoutMs = 1_200): Promise<HTMLElement | null> {
  const current = findFormSubmitter(context.formElement) ?? context.submitter;
  if (isReadySubmitter(current)) {
    return current;
  }
  const formElement = context.formElement;
  if (!(formElement instanceof HTMLFormElement)) {
    return current;
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: HTMLElement | null) => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(value);
    };
    const check = () => {
      const next = findFormSubmitter(formElement) ?? context.submitter;
      if (isReadySubmitter(next)) {
        settle(next);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(formElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'],
    });
    const timeoutId = setTimeout(() => settle(findFormSubmitter(formElement) ?? context.submitter), timeoutMs);
    check();
  });
}

export function detectFormContext(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
  activeElement?: Element | null;
}): DetectedLoginFormContext | null {
  const orderedFields = queryScopedInputs(input.document, (field) => isWritableInput(field));
  const passwordFields = orderedFields.filter(
    (field) =>
      normalizeInputType(field) === 'password' &&
      inferPasswordRoleForLoginContext(field, orderedFields) === 'password_current',
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
    formElement: logicalFormOwner(passwordField) ?? logicalFormOwner(usernameField) ?? null,
    orderedFields,
    mode: 'full_login',
    usernameField,
    usernameRole: usernameRole === 'email' ? 'email' : 'username',
    passwordField,
    submitter: findContextualSubmitter(passwordField) ?? findContextualSubmitter(usernameField),
  };
}

function detectPasswordStepContext(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
  activeElement?: Element | null;
}): DetectedFillContext | null {
  const orderedFields = queryScopedInputs(input.document, (field) => isVisibleInput(field));
  const allInputs = queryScopedInputs(input.document, () => true);
  const writablePasswordFields = orderedFields.filter(
    (field) =>
      isWritableInput(field) &&
      normalizeInputType(field) === 'password' &&
      inferPasswordRoleForLoginContext(field, orderedFields) === 'password_current',
  );
  const passwordField = choosePasswordField(writablePasswordFields, input.activeElement ?? input.document.activeElement);
  if (!passwordField) {
    return null;
  }
  const usernameField =
    pickContextualUsernameField(passwordField, orderedFields) ??
    pickHiddenUsernameStateField(passwordField, orderedFields, allInputs);
  if (!usernameField) {
    return null;
  }
  if (isWritableInput(usernameField)) {
    return null;
  }
  const usernameRole = inferFieldRole(usernameField, { orderedFields });
  return {
    document: input.document,
    frameScope: input.frameScope ?? 'top',
    formElement: logicalFormOwner(passwordField) ?? logicalFormOwner(usernameField) ?? null,
    orderedFields,
    mode: 'password_step',
    usernameField,
    usernameRole: usernameRole === 'email' ? 'email' : 'username',
    passwordField,
    submitter: findContextualSubmitter(passwordField) ?? findContextualSubmitter(usernameField),
  };
}

function detectIdentifierStepContext(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
}): DetectedFillContext | null {
  const orderedFields = queryScopedInputs(input.document, (field) => isWritableInput(field));
  const passwordFields = orderedFields.filter(
    (field) => normalizeInputType(field) === 'password' && inferPasswordRoleForLoginContext(field, orderedFields) === 'password_current',
  );
  if (passwordFields.length > 0) {
    return null;
  }
  const usernameField = pickIdentifierField(orderedFields);
  if (!usernameField) {
    return null;
  }
  const formElement = logicalFormOwner(usernameField) ?? null;
  const submitter = findContextualSubmitter(usernameField);
  if (!submitter) {
    return null;
  }
  const usernameRole = inferFieldRole(usernameField, { orderedFields });
  return {
    document: input.document,
    frameScope: input.frameScope ?? 'top',
    formElement,
    orderedFields,
    mode: 'identifier_step',
    usernameField,
    usernameRole: usernameRole === 'email' ? 'email' : 'username',
    passwordField: null,
    submitter,
  };
}

export function detectBestFillContext(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
  activeElement?: Element | null;
}): DetectedFillContext | null {
  return (
    detectFormContext(input) ??
    detectPasswordStepContext(input) ??
    detectIdentifierStepContext(input) ??
    null
  );
}

function toInlineAssistFieldRole(input: {
  context: DetectedFillContext;
  field: HTMLInputElement;
}): InlineAssistTarget['fieldRole'] | null {
  if (input.context.mode === 'full_login' && input.context.usernameField === input.field) {
    return input.context.usernameRole === 'email' ? 'email' : 'username';
  }
  if (input.context.mode === 'identifier_step' && input.context.usernameField === input.field) {
    return input.context.usernameRole === 'email' ? 'email' : 'username';
  }
  if (input.context.passwordField === input.field) {
    return 'password_current';
  }
  return null;
}

function buildInlineAssistTargetsForContext(context: DetectedFillContext): InlineAssistTarget[] {
  const candidateFields =
    context.mode === 'full_login'
      ? [context.usernameField, context.passwordField]
      : context.mode === 'identifier_step'
        ? [context.usernameField]
        : [context.passwordField];
  const formFingerprint = buildFormFingerprint({
    orderedFields: context.orderedFields,
    formElement: context.formElement,
  });
  const contextGroupKey = `${context.frameScope}::${context.mode}::${formFingerprint}`;
  const targets: InlineAssistTarget[] = [];
  for (const field of candidateFields) {
    if (!(field instanceof HTMLInputElement) || !isVisibleInput(field)) {
      continue;
    }
    const fieldRole = toInlineAssistFieldRole({
      context,
      field,
    });
    if (!fieldRole) {
      continue;
    }
    targets.push({
      fieldElement: field,
      fieldRole,
      mode: context.mode,
      frameScope: context.frameScope,
      formFingerprint,
      fieldFingerprint: buildFieldFingerprint({
        field,
        orderedFields: context.orderedFields,
        inferredRole: fieldRole,
      }),
      confidence: 'high',
      contextGroupKey,
    });
  }
  return targets;
}

export function detectInlineAssistTargets(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
  activeElement?: Element | null;
}): InlineAssistTarget[] {
  const context = detectBestFillContext(input);
  if (!context) {
    return [];
  }
  return buildInlineAssistTargetsForContext(context);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function advanceIdentifierStep(context: DetectedFillContext): Promise<boolean> {
  if (!(context.usernameField instanceof HTMLInputElement)) {
    return false;
  }
  commitIdentifierField(context.usernameField);
  await Promise.resolve();
  await delay(0);
  const formElement = context.formElement;
  const submitter = await waitForReadyIdentifierSubmitter(context);
  try {
    if (formElement && typeof formElement.requestSubmit === 'function') {
      if (isReadySubmitter(submitter)) {
        formElement.requestSubmit(submitter);
        return true;
      }
      if (!submitter) {
        formElement.requestSubmit();
        return true;
      }
      return false;
    }
  } catch {
    // Fall through to click.
  }
  if (isReadySubmitter(submitter)) {
    submitter.click();
    return true;
  }
  return false;
}

async function waitForPasswordCapableContext(input: {
  document: Document;
  frameScope?: FormMetadataFrameScope;
  timeoutMs: number;
}): Promise<DetectedFillContext | null> {
  const effectiveTimeoutMs = resolvePasswordTransitionTimeout(input.document, input.timeoutMs);
  const immediate = detectBestFillContext({
    document: input.document,
    frameScope: input.frameScope,
    activeElement: input.document.activeElement,
  });
  if (immediate && immediate.mode !== 'identifier_step') {
    return immediate;
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: DetectedFillContext | null) => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      clearInterval(pollIntervalId);
      clearTimeout(timeoutId);
      resolve(value);
    };
    const check = () => {
      const next = detectBestFillContext({
        document: input.document,
        frameScope: input.frameScope,
        activeElement: input.document.activeElement,
      });
      if (next && next.mode !== 'identifier_step') {
        settle(next);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(input.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'readonly', 'type', 'value', 'class', 'style', 'aria-hidden'],
    });
    const pollIntervalId = setInterval(check, PASSWORD_TRANSITION_POLL_INTERVAL_MS);
    const timeoutId = setTimeout(() => settle(null), effectiveTimeoutMs);
    check();
  });
}

export async function fillUsernamePassword(input: {
  document: Document;
  credential: ManualFillCredential;
  topLevel: boolean;
}): Promise<ManualFillResult> {
  if (!input.topLevel) {
    return 'manual_fill_unavailable';
  }
  const context = detectBestFillContext({
    document: input.document,
    frameScope: 'top',
    activeElement: input.document.activeElement,
  });
  if (!context) {
    const passwordFields = Array.from(input.document.querySelectorAll('input[type="password"]')).filter(
      (field): field is HTMLInputElement => field instanceof HTMLInputElement && isVisibleInput(field),
    );
    return passwordFields.length === 0 ? 'no_eligible_fields' : 'unsupported_form';
  }
  if (context.mode === 'identifier_step') {
    if (!context.usernameField || !isWritableInput(context.usernameField)) {
      return 'unsupported_form';
    }
    setInputValue(context.usernameField, input.credential.username);
    const advanced = await advanceIdentifierStep(context);
    if (!advanced) {
      return 'unsupported_form';
    }
    const nextContext = await waitForPasswordCapableContext({
      document: input.document,
      frameScope: context.frameScope,
      timeoutMs: DEFAULT_PASSWORD_TRANSITION_TIMEOUT_MS,
    });
    if (!nextContext || !nextContext.passwordField) {
      return 'step_transition_try_again';
    }
    if (nextContext.mode === 'full_login' && nextContext.usernameField && isWritableInput(nextContext.usernameField)) {
      setInputValue(nextContext.usernameField, input.credential.username);
    }
    if (!isWritableInput(nextContext.passwordField)) {
      return 'unsupported_form';
    }
    setInputValue(nextContext.passwordField, input.credential.password);
    return 'filled';
  }
  if (context.mode === 'full_login') {
    if (!context.usernameField || !context.passwordField) {
      return 'unsupported_form';
    }
    setInputValue(context.usernameField, input.credential.username);
    setInputValue(context.passwordField, input.credential.password);
    return 'filled';
  }
  if (!context.passwordField || !isWritableInput(context.passwordField)) {
    return 'unsupported_form';
  }
  setInputValue(context.passwordField, input.credential.password);
  return 'filled';
}
