const CONTENT_RUNTIME_KEY = '__vaultliteContentRuntimeV2';
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
const INLINE_ASSIST_MODAL_STABILIZE_MS = 300;
const INLINE_ASSIST_DEBUG_HOSTS = new Set(['accounts.google.com']);
const DEFAULT_PASSWORD_TRANSITION_TIMEOUT_MS = 3000;
const CHALLENGE_PASSWORD_TRANSITION_TIMEOUT_MS = 12000;
const PASSWORD_TRANSITION_POLL_INTERVAL_MS = 250;
const INLINE_ASSIST_ANCHOR_BADGE_SIZE = 28;
const INLINE_ASSIST_ANCHOR_CHEVRON_WIDTH = 14;
const INLINE_ASSIST_ANCHOR_GAP = 4;
const INLINE_ASSIST_ANCHOR_WIDTH =
  INLINE_ASSIST_ANCHOR_BADGE_SIZE + INLINE_ASSIST_ANCHOR_CHEVRON_WIDTH + INLINE_ASSIST_ANCHOR_GAP;
const INLINE_ASSIST_TRAY_WIDTH = 248;
const INLINE_ASSIST_TRAY_ANIMATION_MS = 140;

function hasStronglyHiddenAncestor(element) {
  return Boolean(element.closest('[hidden], [inert], [data-is-visible="false"]'));
}

function isAriaHiddenVisibilityException(element, ariaHiddenAncestor) {
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

function isSemanticallyHidden(element) {
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

function isInlineAssistDebugEnabled() {
  try {
    if (INLINE_ASSIST_DEBUG_HOSTS.has((location.hostname ?? '').toLowerCase())) {
      return true;
    }
    if (globalThis.__VAULTLITE_DEBUG_INLINE__ === true) {
      return true;
    }
    const localFlag = globalThis.localStorage?.getItem?.('vaultlite.debug.inline');
    if (localFlag === '1' || localFlag === 'true') {
      return true;
    }
    const sessionFlag = globalThis.sessionStorage?.getItem?.('vaultlite.debug.inline');
    return sessionFlag === '1' || sessionFlag === 'true';
  } catch {
    return false;
  }
}

function summarizeDebugError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    message: String(error ?? 'unknown_error'),
  };
}

function debugFieldSummary(field) {
  if (!(field instanceof HTMLInputElement)) {
    return null;
  }
  const host = semanticHostForInput(field);
  return {
    id: field.id || null,
    name: readSemanticAttribute(field, 'name') ?? null,
    type: normalizeInputType(field),
    autocomplete: readAutocompleteToken(field),
    role: inferFieldRole(field),
    disabled: field.disabled,
    readOnly: field.readOnly,
    visible: isVisibleInput(field),
    ariaHidden: field.getAttribute('aria-hidden') ?? null,
    hostTag: host?.tagName?.toLowerCase?.() ?? null,
    hostId: host?.id ?? null,
  };
}

function debugContextSummary(context) {
  if (!context) {
    return null;
  }
  return {
    mode: context.mode,
    frameScope: context.frameScope,
    formId: context.formElement?.id ?? null,
    usernameRole: context.usernameRole ?? null,
    usernameField: debugFieldSummary(context.usernameField),
    passwordField: debugFieldSummary(context.passwordField),
    submitter: context.submitter
      ? {
          tag: context.submitter.tagName?.toLowerCase?.() ?? null,
          id: context.submitter.id ?? null,
          text:
            (context.submitter instanceof HTMLInputElement
              ? context.submitter.value
              : context.submitter.textContent ?? ''
            )
              .trim()
              .slice(0, 80),
          disabled:
            context.submitter instanceof HTMLButtonElement || context.submitter instanceof HTMLInputElement
              ? context.submitter.disabled
              : false,
        }
      : null,
    orderedFieldCount: Array.isArray(context.orderedFields) ? context.orderedFields.length : 0,
  };
}

function debugTargetSummary(target) {
  if (!target) {
    return null;
  }
  return {
    mode: target.mode,
    frameScope: target.frameScope,
    fieldRole: target.fieldRole,
    formFingerprint: target.formFingerprint,
    fieldFingerprint: target.fieldFingerprint,
    contextGroupKey: target.contextGroupKey,
    field: debugFieldSummary(target.fieldElement),
  };
}

function debugGroupsSummary(groups) {
  if (!groups || typeof groups !== 'object') {
    return {};
  }
  const entries = {};
  for (const [key, group] of Object.entries(groups)) {
    entries[key] = {
      status: group?.status ?? null,
      bestItemId: typeof group?.bestItemId === 'string' ? group.bestItemId : null,
      bestTitle: typeof group?.bestTitle === 'string' ? group.bestTitle : null,
      bestSubtitle: typeof group?.bestSubtitle === 'string' ? group.bestSubtitle : null,
      fillMode: group?.fillMode ?? null,
      matchKind: group?.matchKind ?? null,
      candidateCount: Number.isFinite(group?.candidateCount) ? group.candidateCount : 0,
    };
  }
  return entries;
}

function debugLog(event, details = {}) {
  if (event === 'google.stage.inferred') {
    console.log(`[vaultlite][content][${event}]`, details);
    return;
  }
  if (event.startsWith('inline.icon.')) {
    console.log(`[vaultlite][content][${event}]`, details);
    return;
  }
  if (!isInlineAssistDebugEnabled()) {
    return;
  }
  console.debug(`[vaultlite][content][${event}]`, details);
}

function debugWarn(event, details = {}) {
  if (event.startsWith('inline.icon.')) {
    console.warn(`[vaultlite][content][${event}]`, details);
    return;
  }
  if (!isInlineAssistDebugEnabled()) {
    return;
  }
  console.warn(`[vaultlite][content][${event}]`, details);
}

function isGoogleAccountsPage() {
  return (location.hostname ?? '').toLowerCase() === 'accounts.google.com';
}

function hasGoogleStageMarkers(document) {
  return Boolean(
    document.querySelector(
      '#identifierId, #hiddenEmail, #identifierNext, #passwordNext, input[name="Passwd"], [data-profile-identifier], [data-view-id="b5STy"]',
    ),
  );
}

function countVisibleInputs(document, predicate) {
  return queryDeepElements(
    document,
    'input',
    (element) => element instanceof HTMLInputElement && predicate(element),
  ).length;
}

function isChallengeFlowDocument(document) {
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
    (element) =>
      element instanceof HTMLInputElement &&
      ((readSemanticAttribute(element, 'autocomplete') ?? '').toLowerCase().includes('webauthn')),
  ).length > 0;
}

function resolvePasswordTransitionTimeout(document, requestedTimeoutMs) {
  if (isChallengeFlowDocument(document)) {
    return Math.max(requestedTimeoutMs, CHALLENGE_PASSWORD_TRANSITION_TIMEOUT_MS);
  }
  return requestedTimeoutMs;
}

function inferGoogleStage(document) {
  if (!isGoogleAccountsPage() && !hasGoogleStageMarkers(document)) {
    return null;
  }
  const visiblePasswordCount = countVisibleInputs(
    document,
    (input) => isVisibleInput(input) && normalizeInputType(input) === 'password',
  );
  if (visiblePasswordCount > 0) {
    return 'password';
  }
  const visibleIdentifierCount = countVisibleInputs(
    document,
    (input) =>
      isVisibleInput(input) &&
      normalizeInputType(input) !== 'password' &&
      inferFieldRole(input) !== 'unknown' &&
      !USERNAME_NEGATIVE_PATTERN.test(inputHint(input)),
  );
  if (visibleIdentifierCount > 0) {
    return 'identifier';
  }
  const pageText = normalizeObservedText(document.body?.textContent ?? '') ?? '';
  if (pageText.includes('try another way')) {
    return 'selection';
  }
  if (
    pageText.includes('passkey') ||
    pageText.includes('use your phone') ||
    document.querySelector('img[src*="passkey"], [data-challenge*="passkey"], [data-view-id*="passkey"]')
  ) {
    return 'passkey';
  }
  return 'unknown';
}

function debugScanMetadata(scanSequence) {
  return {
    scanSequence,
    rescannedAt: new Date().toISOString(),
    performanceNowMs: Number((globalThis.performance?.now?.() ?? 0).toFixed(1)),
  };
}

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

function canonicalizeOrigin(urlValue) {
  try {
    const parsed = new URL(String(urlValue ?? ''));
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function isVisibleAndEnabled(input) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  if (input.disabled || input.type === 'hidden') {
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

function isVisibleInput(input) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
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

function isWritableInput(input) {
  return isVisibleInput(input) && !input.disabled && !input.readOnly;
}

function hasNonEmptyValue(input) {
  return typeof input?.value === 'string' && input.value.trim().length > 0;
}

function isVisibleElement(element) {
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

function rootSearchBase(root) {
  if (root instanceof Document) {
    return root.documentElement ?? root.body;
  }
  return root;
}

function isVaultLiteInlineElement(element) {
  return element instanceof Element && element.closest?.('[data-vaultlite-inline-root="true"]') instanceof Element;
}

function collectQueryableRoots(root) {
  const roots = [root];
  const seen = new Set([root]);
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    const base = rootSearchBase(current);
    if (!base) {
      continue;
    }
    const elements = Array.from(base.querySelectorAll('*'));
    for (const element of elements) {
      if (isVaultLiteInlineElement(element)) {
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

function queryDeepElements(root, selector, predicate) {
  const matches = [];
  const seen = new Set();
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

function semanticHostForInput(input) {
  const rootNode = input.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.host instanceof HTMLElement ? rootNode.host : null;
}

function semanticOwnerElement(input) {
  return semanticHostForInput(input) ?? input;
}

function readSemanticAttribute(input, attribute) {
  const directValue = input.getAttribute(attribute)?.trim();
  if (directValue) {
    return directValue;
  }
  const hostValue = semanticHostForInput(input)?.getAttribute(attribute)?.trim();
  return hostValue?.length ? hostValue : null;
}

function logicalFormOwner(input) {
  const directForm = input.form;
  if (directForm instanceof HTMLFormElement) {
    return directForm;
  }
  return semanticOwnerElement(input).closest('form');
}

function findPreferredFieldRoot(document) {
  const dialogCandidates = Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]'),
  ).filter((candidate) => isVisibleElement(candidate));
  for (let index = dialogCandidates.length - 1; index >= 0; index -= 1) {
    const candidate = dialogCandidates[index];
    if (queryDeepElements(candidate, 'input', (field) => field instanceof HTMLInputElement).length > 0) {
      return candidate;
    }
  }
  return document;
}

function queryScopedInputs(document, predicate) {
  const preferredRoot = findPreferredFieldRoot(document);
  const preferredInputs = queryDeepElements(
    preferredRoot,
    'input',
    (field) => field instanceof HTMLInputElement && predicate(field),
  );
  if (preferredInputs.length > 0) {
    return preferredInputs;
  }
  return queryDeepElements(
    document,
    'input',
    (field) => field instanceof HTMLInputElement && predicate(field),
  );
}

function escapeCssIdentifier(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fm_${(hash >>> 0).toString(36)}`;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

function normalizeObservedText(value) {
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

function readAssociatedLabelText(input) {
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

function readAutocompleteToken(input) {
  const rawToken = (readSemanticAttribute(input, 'autocomplete') ?? '').trim().toLowerCase();
  if (!rawToken) {
    return null;
  }
  return (
    rawToken
      .split(/\s+/u)
      .map((token) => token.trim())
      .find((token) => token.length > 0) ?? null
  );
}

function normalizeInputType(input) {
  return (readSemanticAttribute(input, 'type') ?? input.type ?? 'text').trim().toLowerCase() || 'text';
}

function inputHint(input) {
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

function structuralTextSignals(input) {
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

function inferFieldRole(input, orderedFields = []) {
  const autocompleteToken = readAutocompleteToken(input);
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
  const textSignals = [
    inputHint(input),
    normalizeObservedText(readAssociatedLabelText(input)) ?? '',
    normalizeObservedText(input.getAttribute('placeholder')) ?? '',
  ].join(' ');

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
  const currentIndex = orderedFields.indexOf(input);
  if (currentIndex >= 0) {
    const nextPasswordField = orderedFields
      .slice(currentIndex + 1)
      .find((candidate) => inferFieldRole(candidate, orderedFields) === 'password_current');
    if (nextPasswordField) {
      return normalizedType === 'email' ? 'email' : 'username';
    }
  }
  return 'unknown';
}

function isEligibleUsernameInput(input) {
  if (!isWritableInput(input) || normalizeInputType(input) === 'password') {
    return false;
  }
  const normalizedType = normalizeInputType(input);
  return normalizedType === 'text' || normalizedType === 'email' || normalizedType === 'tel';
}

function isContextualUsernameAnchor(input) {
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

function isHiddenUsernameStateField(input) {
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
  const token = readAutocompleteToken(input);
  if (token === 'one-time-code') {
    return false;
  }
  const hint = inputHint(input);
  if (USERNAME_NEGATIVE_PATTERN.test(hint)) {
    return false;
  }
  return token === 'username' || token === 'email' || normalizedType === 'email' || USERNAME_HINT_PATTERN.test(hint);
}

function contextualFieldSearchPool(passwordField, candidates) {
  const inSameForm = candidates.filter((input) => input.form === passwordField.form);
  const passwordForm = logicalFormOwner(passwordField);
  const inSameLogicalForm = candidates.filter((input) => logicalFormOwner(input) === passwordForm);
  return inSameLogicalForm.length > 0 ? inSameLogicalForm : inSameForm.length > 0 ? inSameForm : candidates;
}

function hasVisibleIdentifierEcho(passwordField, candidateValue) {
  const normalizedValue = normalizeObservedText(candidateValue);
  if (!normalizedValue) {
    return false;
  }
  const owner = semanticOwnerElement(passwordField);
  let depth = 0;
  for (let current = owner; current && depth < 8; current = current.parentElement, depth += 1) {
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

function scoreUsernameField(input, passwordField, orderedFields) {
  const autocompleteToken = readAutocompleteToken(input);
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

function choosePasswordField(passwordFields, activeElement) {
  if (passwordFields.length === 0) {
    return null;
  }
  if (passwordFields.length === 1) {
    return passwordFields[0];
  }
  const currentPasswordCandidates = passwordFields.filter(
    (field) => inferFieldRole(field, passwordFields) === 'password_current',
  );
  if (currentPasswordCandidates.length === 1) {
    return currentPasswordCandidates[0];
  }
  if (activeElement instanceof HTMLInputElement && currentPasswordCandidates.includes(activeElement)) {
    return activeElement;
  }
  return null;
}

function pickUsernameField(passwordField, orderedFields) {
  const searchPool = contextualFieldSearchPool(passwordField, orderedFields);
  const usernameCandidates = searchPool.filter(isEligibleUsernameInput);
  if (usernameCandidates.length === 0) {
    return null;
  }
  const byAutocomplete = usernameCandidates.find((input) => {
    const token = readAutocompleteToken(input);
    return token === 'username' || token === 'email';
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

function pickContextualUsernameField(passwordField, orderedFields) {
  const searchPool = contextualFieldSearchPool(passwordField, orderedFields);
  const usernameCandidates = searchPool.filter(isContextualUsernameAnchor);
  if (usernameCandidates.length === 0) {
    return null;
  }
  const byAutocomplete = usernameCandidates.find((input) => {
    const token = readAutocompleteToken(input);
    return token === 'username' || token === 'email';
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

function pickHiddenUsernameStateField(passwordField, visibleOrderedFields, allInputs) {
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

function pickIdentifierField(orderedFields) {
  const usernameCandidates = orderedFields.filter(isEligibleUsernameInput);
  if (usernameCandidates.length === 0) {
    return null;
  }
  const byAutocomplete = usernameCandidates.find((input) => {
    const token = readAutocompleteToken(input);
    return token === 'username' || token === 'email';
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

function inferPasswordRoleForLoginContext(field, orderedFields) {
  const inferredRole = inferFieldRole(field, orderedFields);
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
  if (
    PASSWORD_NEW_PATTERN.test(semanticSignals) ||
    PASSWORD_CONFIRM_PATTERN.test(semanticSignals) ||
    OTP_PATTERN.test(semanticSignals)
  ) {
    return inferredRole;
  }
  const hasUsernameCandidate = effectivePool.some((candidate) => candidate !== field && isEligibleUsernameInput(candidate));
  if (!hasUsernameCandidate) {
    return inferredRole;
  }
  return 'password_current';
}

function findFormSubmitter(formElement) {
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

function submitterHint(element) {
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

function isSubmitterElement(element) {
  if (element instanceof HTMLButtonElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    const type = normalizeInputType(element);
    return type === 'submit' || type === 'image' || type === 'button';
  }
  return false;
}

function scoreContextualSubmitter(candidate, field) {
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

function findContextualSubmitter(field) {
  const directFormSubmitter = findFormSubmitter(logicalFormOwner(field));
  if (directFormSubmitter) {
    return directFormSubmitter;
  }
  const owner = semanticOwnerElement(field);
  const candidatesByAncestor = [];
  const searchedAncestors = new Set();
  for (let current = owner; current; current = current.parentElement) {
    if (!isVisibleElement(current) || searchedAncestors.has(current)) {
      continue;
    }
    searchedAncestors.add(current);
    const localCandidates = queryDeepElements(
      current,
      'button, input[type="submit"], input[type="image"], input[type="button"]',
      (element) => isSubmitterElement(element),
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

function structuralSegmentForField(input) {
  const autocompleteToken = readAutocompleteToken(input) ?? '';
  const fieldName = readSemanticAttribute(input, 'name') ?? '';
  const fieldId = input.id || semanticHostForInput(input)?.id || '';
  const normalizedType = normalizeInputType(input);
  const role = inferFieldRole(input);
  return [
    role,
    normalizedType,
    autocompleteToken,
    fieldName,
    fieldId,
  ].join(':');
}

function uniqueSelector(document, selector) {
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

function buildStructuralSelector(element) {
  const segments = [];
  let current = element;
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

function buildStableSelector(input) {
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
      const token = readAutocompleteToken(input);
      return token ? `${selectorTag}[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    (() => {
      const name = readSemanticAttribute(input, 'name');
      const type = normalizeInputType(input);
      return name ? `${selectorTag}[type="${escapeCssIdentifier(type)}"][name="${escapeCssIdentifier(name)}"]` : '';
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

function buildSelectorFallbacks(input) {
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
      const token = readAutocompleteToken(input);
      return token ? `${selectorTag}[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    (() => `${selectorTag}[type="${escapeCssIdentifier(normalizeInputType(input))}"]`)(),
    buildStructuralSelector(selectorTarget),
  ]);
  return candidates
    .map((candidate) => uniqueSelector(document, candidate) ?? candidate)
    .filter((candidate) => candidate.length > 0)
    .slice(0, 5);
}

function buildFormFingerprint(orderedFields, formElement) {
  const formDescriptor = formElement
    ? [
        formElement.id,
        formElement.getAttribute('name') ?? '',
        formElement.getAttribute('action') ?? '',
        formElement.getAttribute('autocomplete') ?? '',
      ].join('|')
    : 'detached';
  const fieldDescriptor = orderedFields
    .slice(0, 12)
    .map((field) => structuralSegmentForField(field))
    .join('||');
  return fnv1a(`${formDescriptor}::${fieldDescriptor}`);
}

function buildFieldFingerprint(field, orderedFields, fieldRole) {
  const index = orderedFields.indexOf(field);
  const descriptor = [
    fieldRole ?? inferFieldRole(field, orderedFields),
    normalizeInputType(field),
    readAutocompleteToken(field) ?? '',
    readSemanticAttribute(field, 'name') ?? '',
    field.id || semanticHostForInput(field)?.id || '',
    normalizeObservedText(readAssociatedLabelText(field)) ?? '',
    normalizeObservedText(field.getAttribute('placeholder')) ?? '',
    String(index),
  ].join('|');
  return fnv1a(descriptor);
}

function buildObservation({ itemId, origin, context, field, fieldRole, confidence, selectorStatus = 'active' }) {
  const selectorCss = buildStableSelector(field);
  if (!selectorCss) {
    return null;
  }
  return {
    itemId,
    origin,
    formFingerprint: buildFormFingerprint(context.orderedFields, context.formElement),
    fieldFingerprint: buildFieldFingerprint(field, context.orderedFields, fieldRole),
    frameScope: context.frameScope,
    fieldRole,
    selectorCss,
    selectorFallbacks: buildSelectorFallbacks(field),
    autocompleteToken: readAutocompleteToken(field),
    inputType: normalizeInputType(field),
    fieldName: readSemanticAttribute(field, 'name')?.trim() || null,
    fieldId: (field.id || semanticHostForInput(field)?.id || '').trim() || null,
    labelTextNormalized: normalizeObservedText(readAssociatedLabelText(field)),
    placeholderNormalized: normalizeObservedText(field.getAttribute('placeholder')),
    confidence,
    selectorStatus,
  };
}

function detectDocumentLoginContext(document, frameScope) {
  const orderedFields = queryScopedInputs(document, (field) => isWritableInput(field));
  const passwordFields = orderedFields.filter(
    (field) =>
      normalizeInputType(field) === 'password' &&
      inferPasswordRoleForLoginContext(field, orderedFields) === 'password_current',
  );
  const passwordField = choosePasswordField(passwordFields, document.activeElement);
  if (!passwordField) {
    return null;
  }
  const usernameField = pickUsernameField(passwordField, orderedFields);
  if (!usernameField) {
    return null;
  }
  const usernameRole = inferFieldRole(usernameField, orderedFields) === 'email' ? 'email' : 'username';
  return {
    document,
    frameScope,
    formElement: logicalFormOwner(passwordField) ?? logicalFormOwner(usernameField) ?? null,
    orderedFields,
    mode: 'full_login',
    usernameField,
    usernameRole,
    passwordField,
    submitter: findContextualSubmitter(passwordField) ?? findContextualSubmitter(usernameField),
  };
}

function detectPasswordStepContext(document, frameScope) {
  const orderedFields = queryScopedInputs(document, (field) => isVisibleInput(field));
  const allInputs = queryScopedInputs(document, () => true);
  const passwordFields = orderedFields.filter(
    (field) =>
      isWritableInput(field) &&
      normalizeInputType(field) === 'password' &&
      inferPasswordRoleForLoginContext(field, orderedFields) === 'password_current',
  );
  const passwordField = choosePasswordField(passwordFields, document.activeElement);
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
  const usernameRole = inferFieldRole(usernameField, orderedFields) === 'email' ? 'email' : 'username';
  return {
    document,
    frameScope,
    formElement: logicalFormOwner(passwordField) ?? logicalFormOwner(usernameField) ?? null,
    orderedFields,
    mode: 'password_step',
    usernameField,
    usernameRole,
    passwordField,
    submitter: findContextualSubmitter(passwordField) ?? findContextualSubmitter(usernameField),
  };
}

function detectIdentifierStepContext(document, frameScope) {
  const orderedFields = queryScopedInputs(document, (field) => isWritableInput(field));
  const passwordFields = orderedFields.filter(
    (field) =>
      normalizeInputType(field) === 'password' &&
      inferPasswordRoleForLoginContext(field, orderedFields) === 'password_current',
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
  const usernameRole = inferFieldRole(usernameField, orderedFields) === 'email' ? 'email' : 'username';
  return {
    document,
    frameScope,
    formElement,
    orderedFields,
    mode: 'identifier_step',
    usernameField,
    usernameRole,
    passwordField: null,
    submitter,
  };
}

function collectAccessibleDocuments(rootWindow, rootOrigin, accumulator, seen) {
  if (!rootWindow || seen.has(rootWindow)) {
    return;
  }
  seen.add(rootWindow);
  accumulator.push({
    document: rootWindow.document,
    frameScope: accumulator.length === 0 ? 'top' : 'same_origin_iframe',
  });
  const frames = rootWindow.document.querySelectorAll('iframe');
  for (const frame of frames) {
    try {
      const frameWindow = frame.contentWindow;
      const frameDocument = frame.contentDocument;
      if (!frameWindow || !frameDocument) {
        continue;
      }
      if (frameWindow.location.origin !== rootOrigin) {
        continue;
      }
      collectAccessibleDocuments(frameWindow, rootOrigin, accumulator, seen);
    } catch {
      // Cross-origin iframe or inaccessible frame.
    }
  }
}

function contextPriority(context) {
  let score = context.frameScope === 'top' ? 10 : 0;
  if (context.mode === 'full_login') {
    score += 30;
  } else if (context.mode === 'password_step') {
    score += 20;
  }
  if (context.document.activeElement === context.passwordField) {
    score += 30;
  }
  if (context.document.activeElement === context.usernameField) {
    score += 20;
  }
  if (readAutocompleteToken(context.passwordField) === 'current-password') {
    score += 10;
  }
  if (readAutocompleteToken(context.usernameField) === 'username') {
    score += 10;
  }
  return score;
}

function detectBestLoginContext() {
  const rootOrigin = canonicalizeOrigin(location.href);
  if (!rootOrigin) {
    return null;
  }
  const documents = [];
  collectAccessibleDocuments(window, rootOrigin, documents, new Set());
  const contexts = documents
    .map(({ document, frameScope }) =>
      detectDocumentLoginContext(document, frameScope) ??
      detectPasswordStepContext(document, frameScope) ??
      detectIdentifierStepContext(document, frameScope),
    )
    .filter(Boolean)
    .sort((left, right) => contextPriority(right) - contextPriority(left));
  return contexts[0] ?? null;
}

function toInlineAssistFieldRole(context, field) {
  if (!context || !(field instanceof HTMLInputElement)) {
    return null;
  }
  if (
    (context.mode === 'full_login' || context.mode === 'identifier_step') &&
    context.usernameField === field
  ) {
    return context.usernameRole === 'email' ? 'email' : 'username';
  }
  if (context.passwordField === field) {
    return 'password_current';
  }
  return null;
}

function buildInlineAssistTargetsForContext(context) {
  if (!context) {
    return [];
  }
  const candidateFields =
    context.mode === 'full_login'
      ? [context.usernameField, context.passwordField]
      : context.mode === 'identifier_step'
        ? [context.usernameField]
        : [context.passwordField];
  const formFingerprint = buildFormFingerprint(context.orderedFields, context.formElement);
  const contextGroupKey = `${context.frameScope}::${context.mode}::${formFingerprint}`;
  const targets = [];
  for (const field of candidateFields) {
    if (!(field instanceof HTMLInputElement) || !isVisibleInput(field)) {
      continue;
    }
    const fieldRole = toInlineAssistFieldRole(context, field);
    if (!fieldRole) {
      continue;
    }
    targets.push({
      document: context.document,
      frameScope: context.frameScope,
      fieldElement: field,
      fieldRole,
      mode: context.mode,
      formFingerprint,
      fieldFingerprint: buildFieldFingerprint(field, context.orderedFields, fieldRole),
      confidence: 'high',
      contextGroupKey,
    });
  }
  return targets;
}

function collectInlineAssistTargets() {
  const rootOrigin = canonicalizeOrigin(location.href);
  if (!rootOrigin) {
    return [];
  }
  const documents = [];
  collectAccessibleDocuments(window, rootOrigin, documents, new Set());
  const targets = [];
  for (const { document, frameScope } of documents) {
    const context =
      detectDocumentLoginContext(document, frameScope) ??
      detectPasswordStepContext(document, frameScope) ??
      detectIdentifierStepContext(document, frameScope);
    if (!context) {
      continue;
    }
    targets.push(...buildInlineAssistTargetsForContext(context));
  }
  return targets;
}

function findFieldByMetadataRecord(document, record, options = {}) {
  const selectors = uniqueStrings([
    typeof record?.selectorCss === 'string' ? record.selectorCss : '',
    ...(Array.isArray(record?.selectorFallbacks) ? record.selectorFallbacks : []),
  ]);
  const allowContextOnly = options?.allowContextOnly === true;
  for (const selector of selectors) {
    try {
      const candidate = document.querySelector(selector);
      if (candidate instanceof HTMLElement && candidate.shadowRoot instanceof ShadowRoot) {
        const nestedCandidate = queryDeepElements(
          candidate.shadowRoot,
          'input',
          (field) =>
            field instanceof HTMLInputElement &&
            (allowContextOnly ? isVisibleInput(field) : isVisibleAndEnabled(field)),
        )[0];
        if (nestedCandidate) {
          return nestedCandidate;
        }
      }
      if (
        candidate instanceof HTMLInputElement &&
        (allowContextOnly ? isVisibleInput(candidate) : isVisibleAndEnabled(candidate))
      ) {
        return candidate;
      }
    } catch {
      // Ignore malformed selector and keep trying fallbacks.
    }
  }
  return null;
}

function findMetadataFillContext(records) {
  const rootOrigin = canonicalizeOrigin(location.href);
  if (!rootOrigin) {
    return null;
  }
  const documents = [];
  collectAccessibleDocuments(window, rootOrigin, documents, new Set());
  const activeRecords = (Array.isArray(records) ? records : []).filter(
    (record) => record && record.selectorStatus === 'active',
  );
  if (activeRecords.length === 0) {
    return null;
  }
  const missedRecords = [];
  for (const { document, frameScope } of documents) {
    const roleCandidates = {
      username: activeRecords.filter(
        (record) =>
          record.frameScope === frameScope &&
          (record.fieldRole === 'username' || record.fieldRole === 'email'),
      ),
      password_current: activeRecords.filter(
        (record) => record.frameScope === frameScope && record.fieldRole === 'password_current',
      ),
    };
    let usernameMatch = null;
    let usernameContextMatch = null;
    let passwordMatch = null;

    for (const record of roleCandidates.username) {
      const field = findFieldByMetadataRecord(document, record);
      if (field) {
        usernameMatch = {
          field,
          record,
        };
        break;
      }
      const contextField = findFieldByMetadataRecord(document, record, {
        allowContextOnly: true,
      });
      if (contextField && !usernameContextMatch) {
        usernameContextMatch = {
          field: contextField,
          record,
        };
      } else {
        missedRecords.push(record);
      }
    }
    for (const record of roleCandidates.password_current) {
      const field = findFieldByMetadataRecord(document, record);
      if (field) {
        passwordMatch = {
          field,
          record,
        };
        break;
      }
      missedRecords.push(record);
    }

    if (usernameMatch && passwordMatch) {
      const orderedFields = queryScopedInputs(document, (field) => isVisibleInput(field));
      return {
        context: {
          document,
          frameScope,
          formElement: logicalFormOwner(passwordMatch.field) ?? logicalFormOwner(usernameMatch.field) ?? null,
          orderedFields,
          mode: 'full_login',
          usernameField: usernameMatch.field,
          usernameRole: usernameMatch.record.fieldRole === 'email' ? 'email' : 'username',
          passwordField: passwordMatch.field,
          submitter: findContextualSubmitter(passwordMatch.field) ?? findContextualSubmitter(usernameMatch.field),
        },
        matchedRecords: [usernameMatch.record, passwordMatch.record],
        missedRecords,
      };
    }

    if (passwordMatch && usernameContextMatch) {
      const orderedFields = queryScopedInputs(document, (field) => isVisibleInput(field));
      return {
        context: {
          document,
          frameScope,
          formElement: logicalFormOwner(passwordMatch.field) ?? logicalFormOwner(usernameContextMatch.field) ?? null,
          orderedFields,
          mode: 'password_step',
          usernameField: usernameContextMatch.field,
          usernameRole: usernameContextMatch.record.fieldRole === 'email' ? 'email' : 'username',
          passwordField: passwordMatch.field,
          submitter: findContextualSubmitter(passwordMatch.field) ?? findContextualSubmitter(usernameContextMatch.field),
        },
        matchedRecords: [usernameContextMatch.record, passwordMatch.record],
        missedRecords,
      };
    }
  }
  return {
    context: null,
    matchedRecords: [],
    missedRecords,
  };
}

function setInputValue(input, value) {
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

function commitIdentifierField(input) {
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

function isReadySubmitter(candidate) {
  if (candidate instanceof HTMLButtonElement) {
    return !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true';
  }
  if (candidate instanceof HTMLInputElement) {
    const type = normalizeInputType(candidate);
    return !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true' && (type === 'submit' || type === 'image');
  }
  return false;
}

async function waitForReadyIdentifierSubmitter(context, timeoutMs = 1200) {
  const current = findFormSubmitter(context.formElement) ?? context.submitter;
  if (isReadySubmitter(current)) {
    return current;
  }
  if (!(context.formElement instanceof HTMLFormElement)) {
    return current;
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(value);
    };
    const check = () => {
      const next = findFormSubmitter(context.formElement) ?? context.submitter;
      if (isReadySubmitter(next)) {
        settle(next);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(context.formElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'],
    });
    const timeoutId = setTimeout(() => settle(findFormSubmitter(context.formElement) ?? context.submitter), timeoutMs);
    check();
  });
}

function structuralKey(record) {
  return [
    record?.origin ?? '',
    record?.formFingerprint ?? '',
    record?.fieldFingerprint ?? '',
    record?.fieldRole ?? '',
    record?.itemId ?? '',
  ].join('::');
}

function buildFillTelemetry({ itemId, origin, observationEntries, matchedRecords, missedRecords, fillConfidence }) {
  const heuristicObservations =
    matchedRecords.length > 0
      ? []
      : observationEntries
          .map((entry) =>
            buildObservation({
              itemId: null,
              origin,
              context: entry.context,
              field: entry.field,
              fieldRole: entry.fieldRole,
              confidence: 'heuristic',
            }),
          )
          .filter(Boolean);
  const fillObservations = observationEntries
    .map((entry) =>
      buildObservation({
        itemId,
        origin,
        context: entry.context,
        field: entry.field,
        fieldRole: entry.fieldRole,
        confidence: fillConfidence,
      }),
    )
    .filter(Boolean);

  const fillObservationKeys = new Set(fillObservations.map((record) => structuralKey(record)));
  const suspectRecords = missedRecords.filter((record) => !fillObservationKeys.has(structuralKey(record)));
  const retiredRecords =
    fillConfidence === 'user_corrected'
      ? suspectRecords
          .filter((record) =>
            fillObservations.some(
              (observation) => observation.fieldRole === record.fieldRole && observation.frameScope === record.frameScope,
            ),
          )
          .map((record) => ({
            ...record,
            selectorStatus: 'retired',
          }))
      : [];

  return {
    heuristicObservations,
    fillObservations,
    suspectRecords,
    retiredRecords,
    matchedRecords,
  };
}

function buildObservationEntries(contexts = []) {
  const entries = [];
  const seen = new Set();
  for (const context of Array.isArray(contexts) ? contexts : []) {
    if (!context || typeof context !== 'object') {
      continue;
    }
    if (
      context.mode !== 'password_step' &&
      context.usernameField instanceof HTMLInputElement &&
      context.usernameRole
    ) {
      const key = [
        'username',
        context.frameScope,
        context.usernameRole,
        context.usernameField.name,
        context.usernameField.id,
      ].join('::');
      if (!seen.has(key)) {
        entries.push({
          context,
          field: context.usernameField,
          fieldRole: context.usernameRole,
        });
        seen.add(key);
      }
    }
    if (context.passwordField instanceof HTMLInputElement) {
      const key = ['password', context.frameScope, context.passwordField.name, context.passwordField.id].join('::');
      if (!seen.has(key)) {
        entries.push({
          context,
          field: context.passwordField,
          fieldRole: 'password_current',
        });
        seen.add(key);
      }
    }
  }
  return entries;
}

function runtimeState() {
  if (!globalThis[CONTENT_RUNTIME_KEY]) {
    globalThis[CONTENT_RUNTIME_KEY] = {
      initialized: false,
      observedForms: new WeakSet(),
      formPayloads: new WeakMap(),
      inlineAssistInitialized: false,
      inlineAssistScanTimer: null,
      inlineAssistScanInFlight: null,
      inlineAssistScanQueued: false,
      inlineAssistScanSequence: 0,
      inlineAssistRenderGeneration: 0,
      inlineAssistRoots: new Map(),
      inlineAssistObservers: new Map(),
      inlineAssistDeferredScanTimer: null,
      inlineAssistModalSeenAt: new WeakMap(),
      inlineAssistContainerScrollHandlers: new WeakMap(),
      inlineAssistActiveTrayContextKey: null,
      inlineAssistActiveTrayTarget: null,
      inlineAssistActiveTrayGeneration: 0,
      inlineAssistActiveTrayDocument: null,
      inlineAssistAutoOpenedStrongContexts: new Set(),
      inlineAssistDismissedTrayContexts: new Set(),
      inlineAssistGlobalListenersBound: false,
      inlineAssistTrayCloseTimer: null,
    };
  }
  return globalThis[CONTENT_RUNTIME_KEY];
}

function scheduleDeferredInlineAssistScan(delayMs) {
  const runtime = runtimeState();
  if (runtime.inlineAssistDeferredScanTimer !== null) {
    clearTimeout(runtime.inlineAssistDeferredScanTimer);
  }
  runtime.inlineAssistDeferredScanTimer = setTimeout(() => {
    runtime.inlineAssistDeferredScanTimer = null;
    scheduleInlineAssistScan();
  }, Math.max(0, delayMs));
}

function resolveInlineAssistContainer(document, targets = []) {
  const runtime = runtimeState();
  for (const target of targets) {
    const modalContainer = target?.fieldElement?.closest?.(
      '[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]',
    );
    if (isVisibleElement(modalContainer)) {
      const now = Date.now();
      const firstSeenAt = runtime.inlineAssistModalSeenAt.get(modalContainer) ?? now;
      runtime.inlineAssistModalSeenAt.set(modalContainer, firstSeenAt);
      const readyInMs = firstSeenAt + INLINE_ASSIST_MODAL_STABILIZE_MS - now;
      if (readyInMs > 0) {
        scheduleDeferredInlineAssistScan(readyInMs + 16);
        return {
          container: null,
          deferred: true,
        };
      }
      return {
        container: modalContainer,
        deferred: false,
      };
    }
  }
  const preferredRoot = findPreferredFieldRoot(document);
  if (preferredRoot instanceof HTMLElement) {
    return {
      container: preferredRoot,
      deferred: false,
    };
  }
  return {
    container: document.body ?? document.documentElement,
    deferred: false,
  };
}

function inlineAssistRootForDocument(document, container = null) {
  const runtime = runtimeState();
  if (runtime.inlineAssistRoots.has(document)) {
    const existing = runtime.inlineAssistRoots.get(document);
    const parent = container instanceof HTMLElement ? container : document.body ?? document.documentElement;
    if (parent && existing.host.parentNode !== parent) {
      parent.appendChild(existing.host);
    }
    existing.container = parent;
    existing.positionMode =
      parent !== document.body && parent !== document.documentElement ? 'container' : 'viewport';
    return existing;
  }
  const host = document.createElement('div');
  host.setAttribute('data-vaultlite-inline-root', 'true');
  host.style.all = 'initial';
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    :host,
    .vaultlite-inline-layer {
      --vl-border: #364154;
      --vl-divider: rgba(255, 255, 255, 0.08);
      --vl-text: #f4f7fb;
      --vl-text-muted: #c8d1de;
      --vl-primary: #2562ea;
      --vl-primary-hover: #1f56d6;
    }
    .vaultlite-inline-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483646;
      font-family: "Manrope", "Segoe UI", sans-serif;
    }
    .vaultlite-inline-anchor {
      position: fixed;
      width: 46px;
      height: 28px;
      border: 0;
      background: transparent;
      color: #141a24;
      font: 700 11px/1 "Manrope", "Segoe UI", sans-serif;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
      padding: 0;
      pointer-events: auto;
      cursor: pointer;
      box-shadow: none;
      transition: transform 120ms ease, opacity 120ms ease;
      opacity: 0.96;
    }
    .vaultlite-inline-anchor[data-inline-expanded="true"] {
      color: #141a24;
    }
    .vaultlite-inline-anchor:hover,
    .vaultlite-inline-anchor:focus-visible {
      transform: translateY(-1px);
      outline: none;
    }
    .vaultlite-inline-anchor[data-inline-expanded="true"]:hover,
    .vaultlite-inline-anchor[data-inline-expanded="true"]:focus-visible {
      color: #141a24;
    }
    .vaultlite-inline-anchor[data-inline-state="probing"] {
      opacity: 0.78;
    }
    .vaultlite-inline-anchor[data-inline-state="no_match"] {
      opacity: 0.84;
    }
    .vaultlite-inline-anchor:disabled {
      cursor: progress;
      opacity: 0.72;
    }
    .vaultlite-inline-anchor-badge {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(37, 98, 234, 0.96);
      color: #ffffff;
      font: 700 11px/1 "Manrope", "Segoe UI", sans-serif;
      letter-spacing: -0.01em;
      flex: 0 0 auto;
    }
    .vaultlite-inline-anchor-chevron {
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
      color: #141a24;
    }
    .vaultlite-inline-tray {
      position: fixed;
      width: min(248px, calc(100vw - 24px));
      border: 0;
      background: transparent;
      color: var(--vl-text);
      box-shadow: none;
      pointer-events: auto;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      opacity: 0;
      transform: translateY(-4px) scale(0.985);
      transition:
        opacity 140ms cubic-bezier(0.2, 0.8, 0.2, 1),
        transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .vaultlite-inline-tray[data-inline-open="false"] {
      display: none;
    }
    .vaultlite-inline-tray[data-inline-open="true"] {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .vaultlite-inline-tray[data-inline-open="closing"] {
      opacity: 0;
      transform: translateY(-4px) scale(0.985);
    }
    .vaultlite-inline-tray[data-inline-scrollable="true"] {
      max-height: 154px;
      overflow-y: auto;
      scrollbar-width: thin;
      padding-right: 2px;
    }
    .vaultlite-inline-result-card,
    .vaultlite-inline-result {
      display: flex;
      width: 100%;
      text-align: left;
      color: var(--vl-text);
      padding: 5px 7px;
      border: 1px solid color-mix(in srgb, var(--vl-border) 86%, transparent);
      align-items: center;
      gap: 6px;
      border-radius: 9px;
      cursor: pointer;
      font: 600 10px/1 "Manrope", "Segoe UI", sans-serif;
      background: #202328;
    }
    .vaultlite-inline-result-card:hover,
    .vaultlite-inline-result-card:focus-visible,
    .vaultlite-inline-result:hover,
    .vaultlite-inline-result:focus-visible {
      background: #25272c;
      outline: none;
    }
    .vaultlite-inline-result-card:disabled,
    .vaultlite-inline-result:disabled {
      cursor: progress;
      opacity: 0.72;
    }
    .vaultlite-inline-result-content {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 7px;
      align-items: center;
      width: 100%;
      min-width: 0;
    }
    .vaultlite-inline-result-icon {
      width: 30px;
      height: 30px;
      border-radius: 7px;
      border: 1px solid var(--vl-border);
      background: linear-gradient(180deg, #2c3748, #20293a);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #d6e1f5;
      flex: 0 0 auto;
      overflow: hidden;
      position: relative;
      letter-spacing: -0.02em;
    }
    .vaultlite-inline-result-image {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }
    .vaultlite-inline-result-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .vaultlite-inline-result-title {
      font: 700 11px/1.15 "Manrope", "Segoe UI", sans-serif;
      color: var(--vl-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vaultlite-inline-result-subtitle {
      font: 500 10px/1.15 "Manrope", "Segoe UI", sans-serif;
      color: var(--vl-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  const layer = document.createElement('div');
  layer.className = 'vaultlite-inline-layer';
  shadowRoot.append(style, layer);
  const parent = container instanceof HTMLElement ? container : document.body ?? document.documentElement;
  parent.appendChild(host);
  const entry = {
    host,
    shadowRoot,
    layer,
    tray: null,
    container: parent,
    positionMode: parent !== document.body && parent !== document.documentElement ? 'container' : 'viewport',
  };
  runtime.inlineAssistRoots.set(document, entry);
  return entry;
}

function disposeInlineAssistRoot(document) {
  const runtime = runtimeState();
  const entry = runtime.inlineAssistRoots.get(document);
  if (!entry) {
    return;
  }
  runtime.inlineAssistRoots.delete(document);
  try {
    entry.host.remove();
  } catch {
    // Best effort only.
  }
  if (runtime.inlineAssistActiveTrayDocument === document) {
    closeInlineAssistTray({ dismiss: false });
  }
}

function ensureInlineAssistObservation(document) {
  const runtime = runtimeState();
  if (runtime.inlineAssistObservers.has(document)) {
    return;
  }
  const defaultView = document.defaultView;
  if (!defaultView || !document.documentElement) {
    return;
  }
  const schedule = (event = null) => {
    const target = event?.target;
    if (
      target instanceof Element &&
      target.closest?.('[data-vaultlite-inline-root="true"]') instanceof Element
    ) {
      return;
    }
    if (typeof event?.composedPath === 'function') {
      const path = event.composedPath();
      const insideInlineAssist = path.some(
        (entry) =>
          entry instanceof Element &&
          entry.closest?.('[data-vaultlite-inline-root="true"]') instanceof Element,
      );
      if (insideInlineAssist) {
        return;
      }
    }
    scheduleInlineAssistScan();
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'role', 'aria-hidden', 'aria-modal', 'disabled', 'readonly', 'type', 'name', 'autocomplete'],
  });
  defaultView.addEventListener('scroll', schedule, true);
  defaultView.addEventListener('resize', schedule);
  defaultView.addEventListener('focusin', schedule, true);
  defaultView.addEventListener('focusout', schedule, true);
  runtime.inlineAssistObservers.set(document, {
    observer,
    defaultView,
    schedule,
  });
}

function ensureInlineAssistContainerScrollObservation(entry, document) {
  const runtime = runtimeState();
  if (!entry || entry.positionMode !== 'container' || !(entry.container instanceof HTMLElement)) {
    return;
  }
  if (runtime.inlineAssistContainerScrollHandlers.has(entry.container)) {
    return;
  }
  const handler = () => {
    scheduleInlineAssistScan();
  };
  entry.container.addEventListener('scroll', handler, true);
  runtime.inlineAssistContainerScrollHandlers.set(entry.container, handler);
}

function setInlineAssistAnchorPosition(button, field, entry) {
  if (!(button instanceof HTMLElement) || !(field instanceof HTMLInputElement)) {
    return;
  }
  const rect = field.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    button.style.display = 'none';
    return;
  }
  const buttonHeight = 28;
  const buttonWidth = INLINE_ASSIST_ANCHOR_WIDTH;
  const insideField = rect.width >= 148;
  let top = rect.top + Math.max(0, (rect.height - buttonHeight) / 2);
  let left = insideField ? rect.right - buttonWidth - 8 : rect.right + 8;
  if (entry?.positionMode === 'container' && entry.container instanceof HTMLElement) {
    const containerRect = entry.container.getBoundingClientRect();
    top -= containerRect.top;
    left -= containerRect.left;
  }
  top = Math.max(6, top);
  button.style.display = 'inline-flex';
  button.style.top = `${Math.round(top)}px`;
  button.style.left = `${Math.round(left)}px`;
}

function shouldAutoOpenInlineAssist(matchKind) {
  return matchKind === 'metadata_confirmed' || matchKind === 'exact_origin';
}

function setInlineAssistFloatingPosition(element, field, entry) {
  if (!(element instanceof HTMLElement) || !(field instanceof HTMLInputElement)) {
    return;
  }
  const rect = field.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    element.style.display = 'none';
    return;
  }
  const trayWidth = INLINE_ASSIST_TRAY_WIDTH;
  const viewportWidth = field.ownerDocument?.defaultView?.innerWidth ?? 1280;
  const viewportHeight = field.ownerDocument?.defaultView?.innerHeight ?? 720;
  let top = rect.bottom + 10;
  let left = rect.right - Math.min(trayWidth, rect.width + 48);
  const runtime = runtimeState();
  const activeTarget = runtime.inlineAssistActiveTrayTarget;
  if (activeTarget) {
    const anchor = entry?.layer?.querySelector?.(
      `[data-vaultlite-inline-anchor="true"][data-context-group-key="${escapeCssIdentifier(activeTarget.contextGroupKey)}"][data-field-fingerprint="${escapeCssIdentifier(activeTarget.fieldFingerprint)}"]`,
    );
    if (anchor instanceof HTMLElement) {
      const anchorRect = anchor.getBoundingClientRect();
      left = anchorRect.left + INLINE_ASSIST_ANCHOR_CHEVRON_WIDTH - trayWidth;
      top = anchorRect.bottom + 8;
    }
  }
  if (entry?.positionMode === 'container' && entry.container instanceof HTMLElement) {
    const containerRect = entry.container.getBoundingClientRect();
    top -= containerRect.top;
    left -= containerRect.left;
  }
  const maxLeft = Math.max(8, viewportWidth - trayWidth - 8);
  left = Math.max(8, Math.min(left, maxLeft));
  if (entry?.positionMode !== 'container' && top + 260 > viewportHeight) {
    top = Math.max(8, rect.top - 270);
  }
  element.style.display = 'flex';
  element.style.top = `${Math.round(top)}px`;
  element.style.left = `${Math.round(left)}px`;
}

function ensureInlineAssistTrayElement(entry, target) {
  if (entry.tray instanceof HTMLElement) {
    if (!entry.layer.contains(entry.tray)) {
      entry.layer.appendChild(entry.tray);
    }
    setInlineAssistFloatingPosition(entry.tray, target.fieldElement, entry);
    return entry.tray;
  }
  const tray = target.document.createElement('div');
  tray.className = 'vaultlite-inline-tray';
  tray.setAttribute('data-vaultlite-inline-tray', 'true');
  tray.setAttribute('data-inline-open', 'false');
  tray.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  }, true);
  tray.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  }, true);
  entry.layer.appendChild(tray);
  entry.tray = tray;
  setInlineAssistFloatingPosition(tray, target.fieldElement, entry);
  return tray;
}

function buildInlineAssistMonogram(label) {
  const normalized = String(label ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) {
    return 'VL';
  }
  const words = normalized
    .split(' ')
    .map((part) => part.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  const compact = words[0] ?? normalized.replace(/[^a-z0-9]/gi, '');
  return compact.slice(0, 2).toUpperCase() || 'VL';
}

function renderInlineAssistResultIcon(iconContainer, result) {
  if (!(iconContainer instanceof HTMLElement)) {
    return;
  }
  const monogram = buildInlineAssistMonogram(result?.title);
  iconContainer.replaceChildren();
  const iconUrl = typeof result?.iconUrl === 'string' && result.iconUrl.length > 0 ? result.iconUrl : null;
  if (!iconUrl) {
    debugLog('inline.icon.missing', {
      itemId: result?.itemId ?? null,
      title: result?.title ?? null,
      iconUrl: null,
    });
    iconContainer.textContent = monogram;
    return;
  }
  debugLog('inline.icon.render', {
    itemId: result?.itemId ?? null,
    title: result?.title ?? null,
    iconUrl,
  });
  const image = iconContainer.ownerDocument.createElement('img');
  image.className = 'vaultlite-inline-result-image';
  image.setAttribute('data-vaultlite-inline-result-image', 'true');
  image.setAttribute('alt', '');
  image.decoding = 'async';
  image.src = iconUrl;
  iconContainer.appendChild(image);
  image.addEventListener(
    'load',
    () => {
      debugLog('inline.icon.load', {
        itemId: result?.itemId ?? null,
        title: result?.title ?? null,
        iconUrl,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    },
    { once: true },
  );
  image.addEventListener(
    'error',
    () => {
      debugWarn('inline.icon.error', {
        itemId: result?.itemId ?? null,
        title: result?.title ?? null,
        iconUrl,
      });
      iconContainer.replaceChildren();
      iconContainer.textContent = monogram;
    },
    { once: true },
  );
}

function renderInlineAssistAnchorGlyph(button, expanded) {
  if (!(button instanceof HTMLElement)) {
    return;
  }
  button.replaceChildren();
  button.setAttribute('data-inline-expanded', expanded ? 'true' : 'false');
  const chevron = button.ownerDocument.createElement('span');
  chevron.className = 'vaultlite-inline-anchor-chevron';
  chevron.setAttribute('data-vaultlite-inline-anchor-chevron', 'true');
  const chevronIcon = button.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevronIcon.setAttribute('viewBox', '0 0 16 16');
  chevronIcon.setAttribute('width', '12');
  chevronIcon.setAttribute('height', '12');
  chevronIcon.setAttribute('aria-hidden', 'true');
  chevronIcon.setAttribute('focusable', 'false');
  const chevronPath = button.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevronPath.setAttribute('d', expanded ? 'M3.5 6l4.5 4 4.5-4' : 'M3.5 10l4.5-4 4.5 4');
  chevronPath.setAttribute('fill', 'none');
  chevronPath.setAttribute('stroke', 'currentColor');
  chevronPath.setAttribute('stroke-width', '1.8');
  chevronPath.setAttribute('stroke-linecap', 'round');
  chevronPath.setAttribute('stroke-linejoin', 'round');
  chevronIcon.appendChild(chevronPath);
  chevron.appendChild(chevronIcon);
  button.appendChild(chevron);
  const badge = button.ownerDocument.createElement('span');
  badge.className = 'vaultlite-inline-anchor-badge';
  badge.textContent = 'VL';
  button.appendChild(badge);
}

function syncInlineAssistAnchorState() {
  const runtime = runtimeState();
  for (const entry of runtime.inlineAssistRoots.values()) {
    if (!(entry?.layer instanceof HTMLElement)) {
      continue;
    }
    const anchors = entry.layer.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    for (const anchor of anchors) {
      if (!(anchor instanceof HTMLElement)) {
        continue;
      }
      const isExpanded =
        runtime.inlineAssistActiveTrayContextKey === anchor.getAttribute('data-context-group-key') &&
        runtime.inlineAssistActiveTrayTarget?.fieldFingerprint === anchor.getAttribute('data-field-fingerprint');
      renderInlineAssistAnchorGlyph(anchor, isExpanded);
    }
  }
}

function closeInlineAssistTray(options = {}) {
  const runtime = runtimeState();
  if (runtime.inlineAssistTrayCloseTimer !== null) {
    clearTimeout(runtime.inlineAssistTrayCloseTimer);
    runtime.inlineAssistTrayCloseTimer = null;
  }
  if (options.dismiss && typeof runtime.inlineAssistActiveTrayContextKey === 'string' && runtime.inlineAssistActiveTrayContextKey.length > 0) {
    runtime.inlineAssistDismissedTrayContexts.add(runtime.inlineAssistActiveTrayContextKey);
  }
  for (const entry of runtime.inlineAssistRoots.values()) {
    if (entry?.tray instanceof HTMLElement) {
      const tray = entry.tray;
      tray.setAttribute('data-inline-open', 'closing');
      runtime.inlineAssistTrayCloseTimer = setTimeout(() => {
        try {
          tray.remove();
        } catch {
          // Best effort only.
        }
        if (entry.tray === tray) {
          entry.tray = null;
        }
      }, INLINE_ASSIST_TRAY_ANIMATION_MS);
    }
  }
  runtime.inlineAssistActiveTrayContextKey = null;
  runtime.inlineAssistActiveTrayTarget = null;
  runtime.inlineAssistActiveTrayDocument = null;
  runtime.inlineAssistActiveTrayGeneration += 1;
  syncInlineAssistAnchorState();
}

function setInlineAssistActiveTray(target, options = {}) {
  const runtime = runtimeState();
  const nextContextKey = typeof target?.contextGroupKey === 'string' ? target.contextGroupKey : null;
  if (!nextContextKey) {
    closeInlineAssistTray({ dismiss: false });
    return;
  }
  runtime.inlineAssistActiveTrayContextKey = nextContextKey;
  runtime.inlineAssistActiveTrayTarget = target;
  runtime.inlineAssistActiveTrayDocument = target.document;
  runtime.inlineAssistActiveTrayGeneration += 1;
  if (options.autoOpen === true) {
    runtime.inlineAssistAutoOpenedStrongContexts.add(nextContextKey);
  } else {
    runtime.inlineAssistDismissedTrayContexts.delete(nextContextKey);
  }
  syncInlineAssistAnchorState();
}

function renderInlineAssistTrayState(entry, target, payload, options = {}) {
  if (!entry || !target) {
    return;
  }
  const tray = ensureInlineAssistTrayElement(entry, target);
  tray.replaceChildren();
  tray.setAttribute('data-inline-open', 'true');
  const entries = [];
  if (payload?.primary?.itemId) {
    entries.push(payload.primary);
  }
  if (Array.isArray(payload?.results)) {
    for (const result of payload.results) {
      if (!result?.itemId || entries.some((entryItem) => entryItem?.itemId === result.itemId)) {
        continue;
      }
      entries.push(result);
    }
  }
  tray.setAttribute('data-inline-scrollable', entries.length > 3 ? 'true' : 'false');
  for (const result of entries) {
    const row = target.document.createElement('button');
    row.type = 'button';
    row.className = 'vaultlite-inline-result-card vaultlite-inline-result';
    row.setAttribute('data-vaultlite-inline-result', 'true');
    const rowContent = target.document.createElement('div');
    rowContent.className = 'vaultlite-inline-result-content';
    const rowIcon = target.document.createElement('span');
    rowIcon.className = 'vaultlite-inline-result-icon';
    rowIcon.setAttribute('data-vaultlite-inline-result-icon', 'true');
    renderInlineAssistResultIcon(rowIcon, result);
    const rowMain = target.document.createElement('div');
    rowMain.className = 'vaultlite-inline-result-main';
    const rowTitle = target.document.createElement('span');
    rowTitle.className = 'vaultlite-inline-result-title';
    rowTitle.textContent = result.title;
    const rowSubtitle = target.document.createElement('span');
    rowSubtitle.className = 'vaultlite-inline-result-subtitle';
    rowSubtitle.textContent = result.subtitle;
    rowMain.append(rowTitle, rowSubtitle);
    rowContent.append(rowIcon, rowMain);
    row.append(rowContent);
    row.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void activateInlineAssistSelection(target, result, row);
    });
    tray.appendChild(row);
  }
}

async function activateInlineAssistSelection(target, result, button) {
  if (!result || typeof result.itemId !== 'string' || result.itemId.length === 0) {
    return;
  }
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'vaultlite.inline_assist_activate',
      itemId: result.itemId,
      pageUrl: location.href,
      contextGroupKey: target.contextGroupKey,
      fieldRole: target.fieldRole,
      mode: target.mode,
      formFingerprint: target.formFingerprint,
      fieldFingerprint: target.fieldFingerprint,
    });
    debugLog('inline.activate.response', {
      target: debugTargetSummary(target),
      response,
    });
    if (response?.ok === true) {
      closeInlineAssistTray({ dismiss: false });
      scheduleInlineAssistScan();
    }
  } catch (error) {
    debugWarn('inline.activate.error', {
      target: debugTargetSummary(target),
      error: summarizeDebugError(error),
    });
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
    }
  }
}

async function renderActiveInlineAssistTray(options = {}) {
  const runtime = runtimeState();
  const target = runtime.inlineAssistActiveTrayTarget;
  if (!target || runtime.inlineAssistActiveTrayContextKey !== target.contextGroupKey) {
    closeInlineAssistTray({ dismiss: false });
    return;
  }
  const entry = inlineAssistRootForDocument(target.document, resolveInlineAssistContainer(target.document, [target]).container);
  const trayGeneration = runtime.inlineAssistActiveTrayGeneration + 1;
  runtime.inlineAssistActiveTrayGeneration = trayGeneration;
  let response = null;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'vaultlite.inline_assist_query',
      pageUrl: location.href,
      target: {
        contextGroupKey: target.contextGroupKey,
      frameScope: target.frameScope,
      mode: target.mode,
      fieldRole: target.fieldRole,
      formFingerprint: target.formFingerprint,
      fieldFingerprint: target.fieldFingerprint,
    },
      limit: 5,
    });
  } catch (error) {
    debugWarn('inline.query.error', {
      target: debugTargetSummary(target),
      error: summarizeDebugError(error),
    });
    response = null;
  }
  if (runtime.inlineAssistActiveTrayGeneration !== trayGeneration || runtime.inlineAssistActiveTrayContextKey !== target.contextGroupKey) {
    return;
  }
  const results = Array.isArray(response?.results) ? response.results.filter((result) => result?.itemId) : [];
  const hasPrimary = Boolean(response?.primary?.itemId);
  if (response?.status !== 'ready' || (!hasPrimary && results.length === 0)) {
    closeInlineAssistTray({ dismiss: false });
    return;
  }
  renderInlineAssistTrayState(entry, target, response, {});
}

function buildInlineAssistAriaLabel(target, group) {
  const titleSuffix =
    group && typeof group.bestTitle === 'string' && group.bestTitle.length > 0 ? ` for ${group.bestTitle}` : '';
  if (target.mode === 'identifier_step') {
    return `Continue with VaultLite${titleSuffix}`;
  }
  if (target.fieldRole === 'password_current') {
    return `Fill password${titleSuffix}`;
  }
  return `Fill username${titleSuffix}`;
}

function openInlineAssistTrayFromAnchor(target, group, options = {}) {
  debugLog('inline.tray.open', {
    target: debugTargetSummary(target),
    group: debugGroupsSummary({ [target?.contextGroupKey ?? 'unknown']: group }),
    autoOpen: options.autoOpen === true,
  });
  const runtime = runtimeState();
  if (
    runtime.inlineAssistActiveTrayContextKey === target?.contextGroupKey &&
    runtime.inlineAssistActiveTrayTarget &&
    runtime.inlineAssistActiveTrayTarget.contextGroupKey === target.contextGroupKey &&
    runtime.inlineAssistActiveTrayTarget.fieldFingerprint === target.fieldFingerprint
  ) {
    closeInlineAssistTray({ dismiss: true });
    scheduleInlineAssistScan();
    return;
  }
  setInlineAssistActiveTray(target, {
    autoOpen: options.autoOpen === true,
  });
  void renderActiveInlineAssistTray({});
}

function renderInlineAssistTargets(targets, groups) {
  const activeDocuments = new Set(targets.map((target) => target.document));
  const runtime = runtimeState();
  const availableTargetsByContext = new Map(targets.map((target) => [target.contextGroupKey, target]));
  for (const [document] of runtime.inlineAssistRoots.entries()) {
    if (!activeDocuments.has(document)) {
      disposeInlineAssistRoot(document);
    }
  }
  if (
    runtime.inlineAssistActiveTrayContextKey &&
    !availableTargetsByContext.has(runtime.inlineAssistActiveTrayContextKey)
  ) {
    closeInlineAssistTray({ dismiss: false });
  }
  const groupedTargetsByDocument = new Map();
  for (const target of targets) {
    const existing = groupedTargetsByDocument.get(target.document) ?? [];
    existing.push(target);
    groupedTargetsByDocument.set(target.document, existing);
  }
  for (const [document, documentTargets] of groupedTargetsByDocument.entries()) {
    const containerResolution = resolveInlineAssistContainer(document, documentTargets);
    if (containerResolution.deferred) {
      continue;
    }
    const entry = inlineAssistRootForDocument(document, containerResolution.container);
    ensureInlineAssistContainerScrollObservation(entry, document);
    entry.layer.replaceChildren();
    for (const target of documentTargets) {
      const group = groups[target.contextGroupKey] ?? {
        status: 'probing',
        bestItemId: null,
        bestTitle: null,
        bestSubtitle: null,
        candidateCount: 0,
        fillMode: null,
        matchKind: 'none',
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vaultlite-inline-anchor';
      button.setAttribute('data-vaultlite-inline-anchor', 'true');
      button.setAttribute('data-inline-state', group.status);
      button.setAttribute('data-field-role', target.fieldRole);
      button.setAttribute('data-context-group-key', target.contextGroupKey);
      button.setAttribute('data-field-fingerprint', target.fieldFingerprint);
      const isExpanded =
        runtime.inlineAssistActiveTrayContextKey === target.contextGroupKey &&
        runtime.inlineAssistActiveTrayTarget?.fieldFingerprint === target.fieldFingerprint;
      renderInlineAssistAnchorGlyph(button, isExpanded);
      button.setAttribute('aria-label', buildInlineAssistAriaLabel(target, group));
      button.title =
        group.status === 'ready' && group.bestTitle
          ? `VaultLite • ${group.bestTitle}`
          : 'VaultLite assist';
      const stopAnchorEvent = (event) => {
        event.stopPropagation();
      };
      button.addEventListener('pointerdown', stopAnchorEvent, true);
      button.addEventListener('mousedown', stopAnchorEvent, true);
      button.addEventListener('mouseup', stopAnchorEvent, true);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openInlineAssistTrayFromAnchor(target, group, {
          autoOpen: false,
        });
      });
      setInlineAssistAnchorPosition(button, target.fieldElement, entry);
      entry.layer.appendChild(button);
    }
  }

  if (!runtime.inlineAssistActiveTrayContextKey) {
    const autoOpenTarget = targets.find((target) => {
      const group = groups[target.contextGroupKey];
      if (!group || group.status !== 'ready' || !shouldAutoOpenInlineAssist(group.matchKind)) {
        return false;
      }
      if (runtime.inlineAssistAutoOpenedStrongContexts.has(target.contextGroupKey)) {
        return false;
      }
      if (runtime.inlineAssistDismissedTrayContexts.has(target.contextGroupKey)) {
        return false;
      }
      return true;
    });
    if (autoOpenTarget) {
      openInlineAssistTrayFromAnchor(autoOpenTarget, groups[autoOpenTarget.contextGroupKey], {
        autoOpen: true,
      });
      return;
    }
  }

  if (runtime.inlineAssistActiveTrayContextKey) {
    const activeTarget = availableTargetsByContext.get(runtime.inlineAssistActiveTrayContextKey);
    if (activeTarget) {
      runtime.inlineAssistActiveTrayTarget = activeTarget;
      const entry = runtime.inlineAssistRoots.get(activeTarget.document);
      if (entry?.tray instanceof HTMLElement) {
        if (!entry.layer.contains(entry.tray)) {
          entry.layer.appendChild(entry.tray);
        }
        setInlineAssistFloatingPosition(entry.tray, activeTarget.fieldElement, entry);
        return;
      }
      void renderActiveInlineAssistTray({});
    }
  }
}

async function scanInlineAssistNow() {
  const runtime = runtimeState();
  const scanSequence = runtime.inlineAssistScanSequence + 1;
  runtime.inlineAssistScanSequence = scanSequence;
  const scanMetadata = debugScanMetadata(scanSequence);
  const googleStage = inferGoogleStage(document);
  if (googleStage) {
    debugLog('google.stage.inferred', {
      ...scanMetadata,
      stage: googleStage,
      readyState: document.readyState,
    });
  }
  if (!isPageUrlEligibleForFill(location.href) || !chrome?.runtime?.sendMessage) {
    debugWarn('inline.scan.ineligible', {
      ...scanMetadata,
      pageUrl: location.href,
      pageEligible: isPageUrlEligibleForFill(location.href),
      hasRuntimeMessaging: Boolean(chrome?.runtime?.sendMessage),
      googleStage,
    });
    return;
  }
  debugLog('inline.scan.start', {
    ...scanMetadata,
    pageUrl: location.href,
    readyState: document.readyState,
    googleStage,
  });
  const targets = collectInlineAssistTargets();
  const accessibleDocuments = new Set(targets.map((target) => target.document));
  for (const document of accessibleDocuments) {
    ensureInlineAssistObservation(document);
  }
  if (targets.length === 0) {
    debugWarn('inline.scan.no_targets', {
      ...scanMetadata,
      pageUrl: location.href,
      context: debugContextSummary(detectBestLoginContext()),
      googleStage,
    });
    closeInlineAssistTray({ dismiss: false });
    for (const [document] of runtime.inlineAssistRoots.entries()) {
      disposeInlineAssistRoot(document);
    }
    return;
  }
  debugLog('inline.scan.targets', {
    ...scanMetadata,
    count: targets.length,
    targets: targets.map((target) => debugTargetSummary(target)),
    googleStage,
  });
  const summaries = Array.from(
    new Map(
      targets.map((target) => [
        target.contextGroupKey,
        {
          contextGroupKey: target.contextGroupKey,
          frameScope: target.frameScope,
          mode: target.mode,
          fieldRole: target.fieldRole,
          formFingerprint: target.formFingerprint,
          fieldFingerprint: target.fieldFingerprint,
        },
      ]),
    ).values(),
  );
  const generation = runtime.inlineAssistRenderGeneration + 1;
  runtime.inlineAssistRenderGeneration = generation;
  let response = null;
  try {
    debugLog('inline.prefetch.request', {
      ...scanMetadata,
      pageUrl: location.href,
      targets: summaries,
      googleStage,
    });
    response = await chrome.runtime.sendMessage({
      type: 'vaultlite.inline_assist_prefetch',
      pageUrl: location.href,
      frameScope: 'top',
      targets: summaries,
    });
    debugLog('inline.prefetch.response', {
      ...scanMetadata,
      response,
      groups: debugGroupsSummary(response?.groups),
      googleStage,
    });
  } catch (error) {
    debugWarn('inline.prefetch.error', {
      ...scanMetadata,
      error: summarizeDebugError(error),
      googleStage,
    });
    response = null;
  }
  if (runtime.inlineAssistRenderGeneration !== generation) {
    debugWarn('inline.render.stale_generation', {
      ...scanMetadata,
      generation,
      currentGeneration: runtime.inlineAssistRenderGeneration,
      googleStage,
    });
    return;
  }
  const groups = response?.ok && response?.groups && typeof response.groups === 'object' ? response.groups : {};
  debugLog('inline.render.targets', {
    ...scanMetadata,
    targetCount: targets.length,
    groups: debugGroupsSummary(groups),
    googleStage,
  });
  renderInlineAssistTargets(targets, groups);
}

function scheduleInlineAssistScan() {
  const runtime = runtimeState();
  if (runtime.inlineAssistScanTimer !== null) {
    clearTimeout(runtime.inlineAssistScanTimer);
  }
  runtime.inlineAssistScanTimer = setTimeout(() => {
    runtime.inlineAssistScanTimer = null;
    if (runtime.inlineAssistScanInFlight) {
      runtime.inlineAssistScanQueued = true;
      return;
    }
    runtime.inlineAssistScanInFlight = (async () => {
      try {
        await scanInlineAssistNow();
      } finally {
        runtime.inlineAssistScanInFlight = null;
        if (runtime.inlineAssistScanQueued) {
          runtime.inlineAssistScanQueued = false;
          scheduleInlineAssistScan();
        }
      }
    })();
  }, 120);
}

function startInlineAssistRuntime() {
  const runtime = runtimeState();
  if (runtime.inlineAssistInitialized) {
    return;
  }
  runtime.inlineAssistInitialized = true;
  if (!runtime.inlineAssistGlobalListenersBound) {
    runtime.inlineAssistGlobalListenersBound = true;
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !runtime.inlineAssistActiveTrayContextKey) {
          return;
        }
        closeInlineAssistTray({ dismiss: true });
        scheduleInlineAssistScan();
      },
      true,
    );
  }
  ensureInlineAssistObservation(document);
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        scheduleInlineAssistScan();
      },
      { once: true },
    );
    return;
  }
  scheduleInlineAssistScan();
}

function armSubmitObservation(context, payload) {
  if (!(context.formElement instanceof HTMLFormElement)) {
    return;
  }
  const runtime = runtimeState();
  runtime.formPayloads.set(context.formElement, payload);
  if (runtime.observedForms.has(context.formElement)) {
    return;
  }
  runtime.observedForms.add(context.formElement);
  context.formElement.addEventListener(
    'submit',
    () => {
      const activePayload = runtime.formPayloads.get(context.formElement);
      if (!activePayload || activePayload.submitted || activePayload.pageUrl !== location.href) {
        return;
      }
      activePayload.submitted = true;
      void chrome.runtime.sendMessage({
        type: 'vaultlite.form_metadata_submit_signal',
        itemId: activePayload.itemId,
        origin: activePayload.origin,
        observations: activePayload.observations,
        retiredRecords: activePayload.retiredRecords,
      });
    },
    { capture: true },
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function advanceIdentifierStep(context) {
  commitIdentifierField(context.usernameField);
  await Promise.resolve();
  await delay(0);
  const submitter = await waitForReadyIdentifierSubmitter(context);
  try {
    if (context.formElement && typeof context.formElement.requestSubmit === 'function') {
      if (isReadySubmitter(submitter)) {
        context.formElement.requestSubmit(submitter);
        return true;
      }
      if (!submitter) {
        context.formElement.requestSubmit();
        return true;
      }
      return false;
    }
  } catch {
    // Fall through to click fallback.
  }
  if (isReadySubmitter(submitter)) {
    submitter.click();
    return true;
  }
  return false;
}

async function waitForPasswordCapableContext(frameScope, timeoutMs) {
  const effectiveTimeoutMs = resolvePasswordTransitionTimeout(document, timeoutMs);
  const immediate = detectBestLoginContext();
  if (immediate && immediate.mode !== 'identifier_step') {
    return immediate;
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
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
      const next = detectBestLoginContext();
      if (next && next.mode !== 'identifier_step') {
        settle(next);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
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

async function performFill(message) {
  const credential = message.credential;
  if (!credential || typeof credential.username !== 'string' || typeof credential.password !== 'string') {
    debugWarn('fill.start.invalid_credential', {
      hasCredential: Boolean(credential),
      usernameType: typeof credential?.username,
      passwordType: typeof credential?.password,
    });
    return { ok: true, result: 'manual_fill_unavailable' };
  }
  const origin = canonicalizeOrigin(location.href);
  if (!origin) {
    debugWarn('fill.start.invalid_origin', {
      href: location.href,
    });
    return { ok: true, result: 'manual_fill_unavailable' };
  }

  const metadataFill = findMetadataFillContext(message.formMetadataRecords);
  let context = metadataFill?.context ?? null;
  let matchedRecords = metadataFill?.matchedRecords ?? [];
  let missedRecords = metadataFill?.missedRecords ?? [];
  const metadataContextSummary = debugContextSummary(metadataFill?.context ?? null);

  debugLog('fill.start', {
    href: location.href,
    origin,
    itemId: typeof message.itemId === 'string' ? message.itemId : null,
    expectedPageUrl: typeof message.expectedPageUrl === 'string' ? message.expectedPageUrl : null,
    metadataRecordCount: Array.isArray(message.formMetadataRecords) ? message.formMetadataRecords.length : 0,
    metadataContext: metadataContextSummary,
    matchedRecordCount: matchedRecords.length,
    missedRecordCount: missedRecords.length,
  });

  if (!context) {
    context = detectBestLoginContext();
    debugLog('fill.context.detected', {
      source: 'live_detection',
      context: debugContextSummary(context),
    });
  } else {
    debugLog('fill.context.detected', {
      source: 'metadata',
      context: metadataContextSummary,
    });
  }
  if (!context) {
    const passwordFields = Array.from(document.querySelectorAll('input[type="password"]')).filter((field) =>
      isVisibleInput(field),
    );
    const result = passwordFields.length === 0 ? 'no_eligible_fields' : 'unsupported_form';
    debugWarn('fill.no_context', {
      result,
      visiblePasswordCount: passwordFields.length,
    });
    return {
      ok: true,
      result,
    };
  }

  const filledContexts = [];
  if (context.mode === 'identifier_step') {
    debugLog('fill.identifier_step.start', {
      context: debugContextSummary(context),
    });
    if (!(context.usernameField instanceof HTMLInputElement) || !isWritableInput(context.usernameField)) {
      debugWarn('fill.identifier_step.unwritable_username', {
        context: debugContextSummary(context),
      });
      return { ok: true, result: 'unsupported_form' };
    }
    setInputValue(context.usernameField, credential.username);
    filledContexts.push(context);
    const advanced = await advanceIdentifierStep(context);
    debugLog('fill.identifier_step.advanced', {
      advanced,
      context: debugContextSummary(context),
    });
    if (!advanced) {
      return { ok: true, result: 'unsupported_form' };
    }
    const nextContext = await waitForPasswordCapableContext(context.frameScope, DEFAULT_PASSWORD_TRANSITION_TIMEOUT_MS);
    debugLog('fill.identifier_step.next_context', {
      context: debugContextSummary(nextContext),
    });
    if (!nextContext || !(nextContext.passwordField instanceof HTMLInputElement)) {
      debugWarn('fill.identifier_step.transition_timeout', {
        frameScope: context.frameScope,
      });
      return { ok: true, result: 'step_transition_try_again' };
    }
    context = nextContext;
    if (context.mode === 'full_login' && context.usernameField instanceof HTMLInputElement && isWritableInput(context.usernameField)) {
      setInputValue(context.usernameField, credential.username);
    }
    if (!isWritableInput(context.passwordField)) {
      return { ok: true, result: 'unsupported_form' };
    }
    setInputValue(context.passwordField, credential.password);
    filledContexts.push(context);
  } else if (context.mode === 'password_step') {
    debugLog('fill.password_step.start', {
      context: debugContextSummary(context),
    });
    if (!isWritableInput(context.passwordField)) {
      debugWarn('fill.password_step.unwritable_password', {
        context: debugContextSummary(context),
      });
      return { ok: true, result: 'unsupported_form' };
    }
    setInputValue(context.passwordField, credential.password);
    filledContexts.push(context);
  } else {
    debugLog('fill.full_login.start', {
      context: debugContextSummary(context),
    });
    setInputValue(context.usernameField, credential.username);
    setInputValue(context.passwordField, credential.password);
    filledContexts.push(context);
  }

  const fillConfidence =
    matchedRecords.length > 0 && missedRecords.length > 0
      ? 'user_corrected'
      : matchedRecords.length > 0
        ? 'filled'
        : missedRecords.length > 0
          ? 'user_corrected'
          : 'filled';
  const telemetry = buildFillTelemetry({
    itemId: typeof message.itemId === 'string' && message.itemId.trim().length > 0 ? message.itemId.trim() : null,
    origin,
    observationEntries: buildObservationEntries(filledContexts),
    matchedRecords,
    missedRecords,
    fillConfidence,
  });

  armSubmitObservation(context, {
    itemId: typeof message.itemId === 'string' ? message.itemId : null,
    origin,
    observations: telemetry.fillObservations.map((record) => ({
      ...record,
      confidence: record.confidence === 'user_corrected' ? 'user_corrected' : 'submitted_confirmed',
    })),
    retiredRecords: telemetry.retiredRecords,
    pageUrl: location.href,
    submitted: false,
  });

  return {
    ok: true,
    result: 'filled',
    telemetry,
  };
}

function handleFillMessage(message, sendResponse) {
  if (window !== window.top) {
    debugWarn('fill.message.blocked_iframe', {
      href: location.href,
    });
    sendResponse({ ok: true, result: 'manual_fill_unavailable' });
    return true;
  }

  if (!isPageUrlEligibleForFill(location.href)) {
    debugWarn('fill.message.ineligible_url', {
      href: location.href,
    });
    sendResponse({ ok: true, result: 'manual_fill_unavailable' });
    return true;
  }

  if (typeof message.expectedPageUrl === 'string' && message.expectedPageUrl !== location.href) {
    debugWarn('fill.message.page_changed', {
      expectedPageUrl: message.expectedPageUrl,
      currentPageUrl: location.href,
    });
    sendResponse({ ok: true, result: 'page_changed_try_again' });
    return true;
  }

  void performFill(message)
    .then((result) => {
      debugLog('fill.message.result', {
        result: result?.result ?? null,
        ok: result?.ok === true,
        telemetry: result?.telemetry
          ? {
              fillObservationCount: Array.isArray(result.telemetry.fillObservations)
                ? result.telemetry.fillObservations.length
                : 0,
              retiredRecordCount: Array.isArray(result.telemetry.retiredRecords)
                ? result.telemetry.retiredRecords.length
                : 0,
            }
          : null,
      });
      sendResponse(result);
    })
    .catch((error) => {
      debugWarn('fill.message.error', {
        error: summarizeDebugError(error),
      });
      sendResponse({ ok: true, result: 'manual_fill_unavailable' });
    });
  return true;
}

if (!runtimeState().initialized) {
  runtimeState().initialized = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return false;
    }
    if (message.type === 'vaultlite.runtime_probe') {
      sendResponse({
        ok: true,
        runtime: 'content_script',
      });
      return false;
    }
    if (message.type !== 'vaultlite.fill') {
      return false;
    }
    return handleFillMessage(message, sendResponse);
  });
  startInlineAssistRuntime();
}
