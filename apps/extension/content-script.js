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
const PASSWORD_NEW_PATTERN =
  /\b(new|novo|nova|create|criar|choose|defina|definir|set|setup)\b/i;
const PASSWORD_CONFIRM_PATTERN =
  /\b(confirm|confirmation|repeat|repetir|again|verify|verifica[cç][aã]o)\b/i;
const OTP_PATTERN =
  /\b(otp|2fa|mfa|token|one[-\s_]?time|verification|codigo|c[oó]digo|passcode)\b/i;
const TEXT_NORMALIZATION_PATTERN = /[\s\p{P}\p{S}]+/gu;
const MAX_NORMALIZED_TEXT_LENGTH = 120;

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
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(input) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
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

function readAutocompleteToken(input) {
  const rawToken = (input.getAttribute('autocomplete') ?? '').trim().toLowerCase();
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
  return (input.getAttribute('type') ?? input.type ?? 'text').trim().toLowerCase() || 'text';
}

function inputHint(input) {
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
  if (!isVisibleAndEnabled(input) || normalizeInputType(input) === 'password') {
    return false;
  }
  const normalizedType = normalizeInputType(input);
  return normalizedType === 'text' || normalizedType === 'email' || normalizedType === 'tel';
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
  const inSameForm = orderedFields.filter((input) => input.form === passwordField.form);
  const searchPool = inSameForm.length > 0 ? inSameForm : orderedFields;
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

function structuralSegmentForField(input) {
  return [
    inferFieldRole(input),
    normalizeInputType(input),
    readAutocompleteToken(input) ?? '',
    input.getAttribute('name') ?? '',
    input.id ?? '',
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

function buildStructuralSelector(input) {
  const segments = [];
  let current = input;
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
  const candidates = uniqueStrings([
    input.id ? `#${escapeCssIdentifier(input.id)}` : '',
    (() => {
      const name = input.getAttribute('name');
      return name ? `input[name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    (() => {
      const token = readAutocompleteToken(input);
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

function buildSelectorFallbacks(input) {
  const document = input.ownerDocument;
  const candidates = uniqueStrings([
    buildStableSelector(input) ?? '',
    (() => {
      const name = input.getAttribute('name');
      return name ? `input[name="${escapeCssIdentifier(name)}"]` : '';
    })(),
    (() => {
      const token = readAutocompleteToken(input);
      return token ? `input[autocomplete="${escapeCssIdentifier(token)}"]` : '';
    })(),
    `input[type="${escapeCssIdentifier(normalizeInputType(input))}"]`,
    buildStructuralSelector(input),
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
    field.getAttribute('name') ?? '',
    field.id ?? '',
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
    fieldName: field.getAttribute('name')?.trim() || null,
    fieldId: field.id?.trim() || null,
    labelTextNormalized: normalizeObservedText(readAssociatedLabelText(field)),
    placeholderNormalized: normalizeObservedText(field.getAttribute('placeholder')),
    confidence,
    selectorStatus,
  };
}

function detectDocumentLoginContext(document, frameScope) {
  const orderedFields = Array.from(document.querySelectorAll('input')).filter((field) => isVisibleAndEnabled(field));
  const passwordFields = orderedFields.filter(
    (field) =>
      normalizeInputType(field) === 'password' &&
      inferFieldRole(field, orderedFields) === 'password_current',
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
    formElement: passwordField.form ?? usernameField.form ?? null,
    orderedFields,
    usernameField,
    usernameRole,
    passwordField,
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
    .map(({ document, frameScope }) => detectDocumentLoginContext(document, frameScope))
    .filter(Boolean)
    .sort((left, right) => contextPriority(right) - contextPriority(left));
  return contexts[0] ?? null;
}

function findFieldByMetadataRecord(document, record) {
  const selectors = uniqueStrings([
    typeof record?.selectorCss === 'string' ? record.selectorCss : '',
    ...(Array.isArray(record?.selectorFallbacks) ? record.selectorFallbacks : []),
  ]);
  for (const selector of selectors) {
    try {
      const candidate = document.querySelector(selector);
      if (candidate instanceof HTMLInputElement && isVisibleAndEnabled(candidate)) {
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
      missedRecords.push(record);
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
      const orderedFields = Array.from(document.querySelectorAll('input')).filter((field) => isVisibleAndEnabled(field));
      return {
        context: {
          document,
          frameScope,
          formElement: passwordMatch.field.form ?? usernameMatch.field.form ?? null,
          orderedFields,
          usernameField: usernameMatch.field,
          usernameRole: usernameMatch.record.fieldRole === 'email' ? 'email' : 'username',
          passwordField: passwordMatch.field,
        },
        matchedRecords: [usernameMatch.record, passwordMatch.record],
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
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
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

function buildFillTelemetry({ itemId, origin, context, matchedRecords, missedRecords, fillConfidence }) {
  const heuristicObservations = matchedRecords.length > 0 ? [] : [
    buildObservation({
      itemId: null,
      origin,
      context,
      field: context.usernameField,
      fieldRole: context.usernameRole,
      confidence: 'heuristic',
    }),
    buildObservation({
      itemId: null,
      origin,
      context,
      field: context.passwordField,
      fieldRole: 'password_current',
      confidence: 'heuristic',
    }),
  ].filter(Boolean);
  const fillObservations = [
    buildObservation({
      itemId,
      origin,
      context,
      field: context.usernameField,
      fieldRole: context.usernameRole,
      confidence: fillConfidence,
    }),
    buildObservation({
      itemId,
      origin,
      context,
      field: context.passwordField,
      fieldRole: 'password_current',
      confidence: fillConfidence,
    }),
  ].filter(Boolean);

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

function runtimeState() {
  if (!globalThis[CONTENT_RUNTIME_KEY]) {
    globalThis[CONTENT_RUNTIME_KEY] = {
      initialized: false,
      observedForms: new WeakSet(),
      formPayloads: new WeakMap(),
    };
  }
  return globalThis[CONTENT_RUNTIME_KEY];
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

function performFill(message) {
  const credential = message.credential;
  if (!credential || typeof credential.username !== 'string' || typeof credential.password !== 'string') {
    return { ok: true, result: 'manual_fill_unavailable' };
  }
  const origin = canonicalizeOrigin(location.href);
  if (!origin) {
    return { ok: true, result: 'manual_fill_unavailable' };
  }

  const metadataFill = findMetadataFillContext(message.formMetadataRecords);
  let context = metadataFill?.context ?? null;
  let matchedRecords = metadataFill?.matchedRecords ?? [];
  let missedRecords = metadataFill?.missedRecords ?? [];

  if (!context) {
    context = detectBestLoginContext();
  }
  if (!context) {
    const passwordFields = Array.from(document.querySelectorAll('input[type="password"]')).filter((field) =>
      isVisibleAndEnabled(field),
    );
    return {
      ok: true,
      result: passwordFields.length === 0 ? 'no_eligible_fields' : 'unsupported_form',
    };
  }

  setInputValue(context.usernameField, credential.username);
  setInputValue(context.passwordField, credential.password);

  const fillConfidence = matchedRecords.length > 0 && missedRecords.length > 0 ? 'user_corrected' : matchedRecords.length > 0 ? 'filled' : missedRecords.length > 0 ? 'user_corrected' : 'filled';
  const telemetry = buildFillTelemetry({
    itemId: typeof message.itemId === 'string' && message.itemId.trim().length > 0 ? message.itemId.trim() : null,
    origin,
    context,
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

  sendResponse(performFill(message));
  return true;
}

if (!runtimeState().initialized) {
  runtimeState().initialized = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'vaultlite.fill') {
      return false;
    }
    return handleFillMessage(message, sendResponse);
  });
}
