import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  detectBestFillContext,
  detectInlineAssistTargets,
  buildFieldFingerprint,
  buildFormFingerprint,
  buildFormMetadataObservation,
  buildSelectorFallbacks,
  buildStableSelector,
  detectFormContext,
  fillUsernamePassword,
  inferFieldRole,
  readAssociatedLabelText,
} from './fill-engine';

describe('fill-engine helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('fills username and password in a simple form', async () => {
    document.body.innerHTML = `
      <form>
        <input id="u" type="email" autocomplete="email" />
        <input id="p" type="password" />
      </form>
    `;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('u') as HTMLInputElement).value).toBe('alice@example.com');
    expect((document.getElementById('p') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('rejects ambiguous forms with multiple visible current-password fields', async () => {
    document.body.innerHTML = `
      <form>
        <input type="text" />
        <input type="password" />
        <input type="password" />
      </form>
    `;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('unsupported_form');
  });

  test('prefers current-password when multiple password fields exist', async () => {
    document.body.innerHTML = `
      <form>
        <input id="user" type="text" autocomplete="username" />
        <input id="newPass" type="password" autocomplete="new-password" />
        <input id="currentPass" type="password" autocomplete="current-password" />
      </form>
    `;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('user') as HTMLInputElement).value).toBe('alice@example.com');
    expect((document.getElementById('newPass') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('currentPass') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('avoids filling generic search field when a login identifier field exists', async () => {
    document.body.innerHTML = `
      <form>
        <input id="search" type="text" name="search" />
        <input id="identifier" type="text" placeholder="Seu e-mail, CPF ou CNPJ" />
        <input id="password" type="password" />
      </form>
    `;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('search') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('identifier') as HTMLInputElement).value).toBe('alice@example.com');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('returns no-op on non top-level context', async () => {
    document.body.innerHTML = '<input type="password" />';

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice',
        password: 'S3cret!',
      },
      topLevel: false,
    });

    expect(result).toBe('manual_fill_unavailable');
  });

  test('infers roles from autocomplete and labels without using field values', () => {
    document.body.innerHTML = `
      <form>
        <label for="emailField">Corporate email</label>
        <input id="emailField" type="text" autocomplete="username" value="do-not-read-me" />
        <label for="newPasswordField">Choose a new password</label>
        <input id="newPasswordField" type="password" />
        <label for="otpField">Verification code</label>
        <input id="otpField" type="text" inputmode="numeric" />
      </form>
    `;
    const fields = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    expect(readAssociatedLabelText(fields[0])).toBe('Corporate email');
    expect(inferFieldRole(fields[0], { orderedFields: fields })).toBe('username');
    expect(inferFieldRole(fields[1], { orderedFields: fields })).toBe('password_new');
    expect(inferFieldRole(fields[2], { orderedFields: fields })).toBe('otp');
  });

  test('builds stable selectors and caps fallbacks at five entries', () => {
    document.body.innerHTML = `
      <form id="login-form">
        <input id="login-email" name="email" type="email" autocomplete="email" />
      </form>
    `;
    const input = document.getElementById('login-email') as HTMLInputElement;
    expect(buildStableSelector(input)).toBe('#login-email');
    const fallbacks = buildSelectorFallbacks(input);
    expect(fallbacks[0]).toBe('#login-email');
    expect(fallbacks.length).toBeLessThanOrEqual(5);
  });

  test('builds deterministic fingerprints that ignore typed values', () => {
    document.body.innerHTML = `
      <form id="login-form" action="/login">
        <input id="username" name="username" type="text" autocomplete="username" />
        <input id="password" name="password" type="password" autocomplete="current-password" />
      </form>
    `;
    const context = detectFormContext({
      document,
      frameScope: 'top',
    });
    expect(context).not.toBeNull();
    const typedUsername = document.getElementById('username') as HTMLInputElement;
    typedUsername.value = 'alice@example.com';
    const typedPassword = document.getElementById('password') as HTMLInputElement;
    typedPassword.value = 'should-not-affect-fingerprint';

    const formFingerprintA = buildFormFingerprint({
      orderedFields: context!.orderedFields,
      formElement: context!.formElement,
    });
    const fieldFingerprintA = buildFieldFingerprint({
      field: context!.usernameField,
      orderedFields: context!.orderedFields,
      inferredRole: context!.usernameRole,
    });

    typedUsername.value = 'bob@example.com';
    typedPassword.value = 'still-ignored';
    const formFingerprintB = buildFormFingerprint({
      orderedFields: context!.orderedFields,
      formElement: context!.formElement,
    });
    const fieldFingerprintB = buildFieldFingerprint({
      field: context!.usernameField,
      orderedFields: context!.orderedFields,
      inferredRole: context!.usernameRole,
    });

    expect(formFingerprintA).toBe(formFingerprintB);
    expect(fieldFingerprintA).toBe(fieldFingerprintB);
  });

  test('builds sanitized metadata observations for username and password fields', () => {
    document.body.innerHTML = `
      <form id="signin">
        <label for="identifier">Work email</label>
        <input id="identifier" name="email" type="email" autocomplete="email" />
        <label for="secret">Current password</label>
        <input id="secret" name="currentPassword" type="password" autocomplete="current-password" />
      </form>
    `;
    const context = detectFormContext({
      document,
      frameScope: 'top',
    });
    expect(context).not.toBeNull();

    const usernameObservation = buildFormMetadataObservation({
      itemId: null,
      origin: 'https://accounts.example.com',
      context: context!,
      field: context!.usernameField,
      fieldRole: context!.usernameRole,
      confidence: 'heuristic',
    });
    const passwordObservation = buildFormMetadataObservation({
      itemId: 'item_1',
      origin: 'https://accounts.example.com/login',
      context: context!,
      field: context!.passwordField,
      fieldRole: 'password_current',
      confidence: 'filled',
    });

    expect(usernameObservation).toMatchObject({
      itemId: null,
      origin: 'https://accounts.example.com',
      frameScope: 'top',
      fieldRole: 'email',
      confidence: 'heuristic',
      selectorStatus: 'active',
      labelTextNormalized: 'work email',
    });
    expect(passwordObservation).toMatchObject({
      itemId: 'item_1',
      origin: 'https://accounts.example.com/login',
      fieldRole: 'password_current',
      confidence: 'filled',
      selectorStatus: 'active',
    });
    expect(passwordObservation?.selectorFallbacks.length).toBeLessThanOrEqual(5);
    expect(passwordObservation?.selectorCss.length).toBeGreaterThan(0);
  });

  test('detects password step when identifier is disabled in the same form', () => {
    document.body.innerHTML = `
      <form>
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" autocomplete="current-pasword" />
      </form>
    `;

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('password_step');
    expect(context?.usernameField?.id).toBe('login');
    expect(context?.passwordField?.id).toBe('password');
  });

  test('detects password step when identifier is readonly in the same form', () => {
    document.body.innerHTML = `
      <form>
        <input id="login" type="email" name="login" value="alice@example.com" readonly />
        <input id="password" type="password" name="password" />
      </form>
    `;

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('password_step');
    expect(context?.usernameField?.id).toBe('login');
    expect(context?.passwordField?.id).toBe('password');
  });

  test('detects identifier step and auto-advances before filling password', async () => {
    document.body.innerHTML = `
      <form id="step-login">
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button id="continue" type="submit">Continuar</button>
      </form>
    `;

    const form = document.getElementById('step-login') as HTMLFormElement;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      form.innerHTML = `
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" autocomplete="current-pasword" />
        <button id="submit" type="submit">Entrar</button>
      `;
    });

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });
    expect(context?.mode).toBe('identifier_step');

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('login') as HTMLInputElement).value).toBe('alice@example.com');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('treats lone login password field with broken new-password autocomplete as current password', async () => {
    document.body.innerHTML = `
      <form>
        <label for="email">E-mail</label>
        <input id="email" type="text" name="email" />
        <label for="password">Senha</label>
        <input id="password" type="password" name="password" autocomplete="new-password" />
        <button type="submit">Acessar minha conta</button>
      </form>
    `;

    const context = detectFormContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('full_login');
    expect(context?.passwordField.id).toBe('password');

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('alice@example.com');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('returns step transition retry when identifier step does not reveal password in time', async () => {
    document.body.innerHTML = `
      <form>
        <input id="login" type="text" name="login" />
        <button type="submit">Continuar</button>
      </form>
    `;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('step_transition_try_again');
  });

  test('waits longer for challenge-style transitions before revealing the password step', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <section id="google-signin">
        <div class="identifier-pane">
          <input id="identifierId" type="email" name="identifier" autocomplete="username webauthn" aria-label="Email or phone" />
        </div>
        <div class="actions">
          <button id="next-button" type="button">Next</button>
        </div>
      </section>
    `;

    const nextButton = document.getElementById('next-button') as HTMLButtonElement;
    nextButton.addEventListener('click', () => {
      setTimeout(() => {
        const container = document.getElementById('google-signin') as HTMLElement;
        container.innerHTML = `
          <div class="account-summary" role="link" aria-label="alice@example.com selected. Switch account">
            <div class="profile-identifier" data-profile-identifier="" translate="no">alice@example.com</div>
          </div>
          <div class="password-pane">
            <input id="hiddenEmail" type="email" name="identifier" value="alice@example.com" tabindex="-1" aria-hidden="true" autocomplete="off" />
            <div id="password">
              <input id="password-field" type="password" name="Passwd" autocomplete="current-password webauthn" aria-label="Enter your password" />
            </div>
          </div>
          <div class="footer-actions">
            <div id="passwordNext">
              <button id="password-next" type="button">Next</button>
            </div>
          </div>
        `;
      }, 4500);
    });

    const resultPromise = fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    await vi.advanceTimersByTimeAsync(5200);
    const result = await resultPromise;

    expect(result).toBe('filled');
    expect((document.getElementById('password-field') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('waits for identifier-step submitter that is enabled after blur before advancing', async () => {
    document.body.innerHTML = `
      <form id="step-login">
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button id="continue" type="submit" disabled>Entrar</button>
      </form>
    `;

    const form = document.getElementById('step-login') as HTMLFormElement;
    const login = document.getElementById('login') as HTMLInputElement;
    const continueButton = document.getElementById('continue') as HTMLButtonElement;

    login.addEventListener('blur', () => {
      continueButton.disabled = false;
    });

    form.requestSubmit = ((submitter?: HTMLElement) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) {
        return;
      }
      form.innerHTML = `
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" />
        <button id="submit" type="submit">Entrar</button>
      `;
    }) as typeof form.requestSubmit;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('waits briefly for controlled identifier-step submitter to enable after input', async () => {
    document.body.innerHTML = `
      <form id="step-login">
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button id="continue" type="submit" disabled>Entrar</button>
      </form>
    `;

    const form = document.getElementById('step-login') as HTMLFormElement;
    const login = document.getElementById('login') as HTMLInputElement;
    const continueButton = document.getElementById('continue') as HTMLButtonElement;

    login.addEventListener('input', () => {
      setTimeout(() => {
        continueButton.disabled = false;
      }, 10);
    });

    form.requestSubmit = ((submitter?: HTMLElement) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) {
        return;
      }
      form.innerHTML = `
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" />
        <button id="submit" type="submit">Entrar</button>
      `;
    }) as typeof form.requestSubmit;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('prefers identifier step inside an open dialog over competing background inputs', async () => {
    document.body.innerHTML = `
      <form id="background-form">
        <input id="background-email" type="email" name="email" placeholder="E-mail ou usuário" />
        <button type="submit">Enviar</button>
      </form>
      <div role="dialog" aria-modal="true">
        <form id="modal-form">
          <input id="modal-login" type="text" name="login" autocomplete="current-login" />
          <button id="modal-continue" type="submit" disabled>Entrar</button>
        </form>
      </div>
    `;

    const modalForm = document.getElementById('modal-form') as HTMLFormElement;
    const modalLogin = document.getElementById('modal-login') as HTMLInputElement;
    const modalContinue = document.getElementById('modal-continue') as HTMLButtonElement;

    modalLogin.addEventListener('keyup', () => {
      modalContinue.disabled = false;
    });

    modalForm.requestSubmit = ((submitter?: HTMLElement) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) {
        return;
      }
      modalForm.innerHTML = `
        <input id="modal-login" type="text" name="login" value="alice@example.com" disabled />
        <input id="modal-password" type="password" name="password" />
        <button type="submit">Continuar</button>
      `;
    }) as typeof modalForm.requestSubmit;

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('identifier_step');
    expect(context?.usernameField?.id).toBe('modal-login');

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('background-email') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('modal-password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('waits for identifier-step submitter that enables on keyup listeners', async () => {
    document.body.innerHTML = `
      <form id="step-login">
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button id="continue" type="submit" disabled>Entrar</button>
      </form>
    `;

    const form = document.getElementById('step-login') as HTMLFormElement;
    const login = document.getElementById('login') as HTMLInputElement;
    const continueButton = document.getElementById('continue') as HTMLButtonElement;

    login.addEventListener('keyup', () => {
      continueButton.disabled = false;
    });

    form.requestSubmit = ((submitter?: HTMLElement) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) {
        return;
      }
      form.innerHTML = `
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" />
        <button id="submit" type="submit">Entrar</button>
      `;
    }) as typeof form.requestSubmit;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('waits long enough for delayed identifier-step submitter enablement', async () => {
    document.body.innerHTML = `
      <form id="step-login">
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button id="continue" type="submit" disabled>Entrar</button>
      </form>
    `;

    const form = document.getElementById('step-login') as HTMLFormElement;
    const login = document.getElementById('login') as HTMLInputElement;
    const continueButton = document.getElementById('continue') as HTMLButtonElement;

    login.addEventListener('input', () => {
      setTimeout(() => {
        continueButton.disabled = false;
      }, 700);
    });

    form.requestSubmit = ((submitter?: HTMLElement) => {
      if (!(submitter instanceof HTMLButtonElement) || submitter.disabled) {
        return;
      }
      form.innerHTML = `
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" />
        <button id="submit" type="submit">Entrar</button>
      `;
    }) as typeof form.requestSubmit;

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('detects inline assist targets for full login and groups related fields together', () => {
    document.body.innerHTML = `
      <form id="signin">
        <input id="identifier" type="email" name="email" autocomplete="username" />
        <input id="password" type="password" name="password" autocomplete="current-password" />
      </form>
    `;

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.fieldElement.id)).toEqual(['identifier', 'password']);
    expect(targets.map((target) => target.fieldRole)).toEqual(['username', 'password_current']);
    expect(new Set(targets.map((target) => target.contextGroupKey)).size).toBe(1);
  });

  test('detects only identifier inline assist target during identifier step', () => {
    document.body.innerHTML = `
      <form id="step-login">
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button type="submit">Continuar</button>
      </form>
    `;

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.fieldElement.id).toBe('login');
    expect(targets[0]?.mode).toBe('identifier_step');
    expect(targets[0]?.fieldRole).toBe('username');
  });

  test('detects inline assist targets for login fields rendered inside open shadow roots', () => {
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" id="reddit-modal">
        <faceplate-text-input id="login-username" name="username" autocomplete="username">
          <span slot="label">Username</span>
        </faceplate-text-input>
        <faceplate-text-input id="login-password" name="password" type="password" autocomplete="current-password">
          <span slot="label">Password</span>
        </faceplate-text-input>
        <button type="button">Log In</button>
      </div>
    `;

    const usernameHost = document.getElementById('login-username') as HTMLElement;
    const passwordHost = document.getElementById('login-password') as HTMLElement;
    const usernameShadow = usernameHost.attachShadow({ mode: 'open' });
    usernameShadow.innerHTML = '<input id="username-inner" type="text" />';
    const passwordShadow = passwordHost.attachShadow({ mode: 'open' });
    passwordShadow.innerHTML = '<input id="password-inner" type="password" />';

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.fieldRole)).toEqual(['username', 'password_current']);
    expect(targets[0]?.fieldElement.id).toBe('username-inner');
    expect(targets[1]?.fieldElement.id).toBe('password-inner');
  });

  test('detects identifier step when submitter is a nearby button outside the form', async () => {
    document.body.innerHTML = `
      <div role="main">
        <section id="google-signin">
          <div class="identifier-pane">
            <input id="identifierId" type="email" name="identifier" autocomplete="username webauthn" aria-label="Email or phone" />
          </div>
          <div class="actions">
            <button id="next-button" type="button">Next</button>
          </div>
        </section>
      </div>
    `;

    const nextButton = document.getElementById('next-button') as HTMLButtonElement;
    nextButton.addEventListener('click', () => {
      const container = document.getElementById('google-signin') as HTMLElement;
      container.innerHTML = `
        <div class="password-pane">
          <input id="hidden-identifier" type="email" name="identifier" value="alice@example.com" readonly />
          <input id="password" type="password" name="Passwd" autocomplete="current-password" aria-label="Enter your password" />
          <button id="password-next" type="button">Next</button>
        </div>
      `;
    });

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });
    expect(context?.mode).toBe('identifier_step');
    expect(context?.usernameField?.id).toBe('identifierId');

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]?.fieldElement.id).toBe('identifierId');

    const result = await fillUsernamePassword({
      document,
      credential: {
        username: 'alice@example.com',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('filled');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('S3cret!');
  });

  test('ignores aria-hidden helper password fields when detecting google-style identifier step', () => {
    document.body.innerHTML = `
      <section id="google-signin">
        <div class="identifier-pane">
          <input id="identifierId" type="email" name="identifier" autocomplete="username webauthn" aria-label="Email or phone" />
        </div>
        <div class="dMNVAe">
          <button id="forgot-email" type="button">Forgot email?</button>
        </div>
        <input type="password" name="hiddenPassword" class="Hvu6D" tabindex="-1" aria-hidden="true" />
        <div class="actions">
          <div id="identifierNext">
            <button id="next-button" type="button">Next</button>
          </div>
        </div>
      </section>
    `;

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('identifier_step');
    expect(context?.usernameField?.id).toBe('identifierId');
  });

  test('detects google-style identifier step when the first ancestor only contains secondary actions', () => {
    document.body.innerHTML = `
      <section id="google-signin">
        <div class="content-shell">
          <div class="identifier-pane">
            <div class="field-shell">
              <input
                id="identifierId"
                type="email"
                name="identifier"
                autocomplete="username webauthn"
                aria-label="Email or phone"
              />
              <div class="dMNVAe">
                <button id="forgot-email" type="button">Forgot email?</button>
              </div>
            </div>
          </div>
        </div>
        <input type="password" name="hiddenPassword" class="Hvu6D" tabindex="-1" aria-hidden="true" />
        <div class="footer-actions">
          <div id="identifierNext">
            <button id="next-button" type="button">Next</button>
          </div>
        </div>
      </section>
    `;

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('identifier_step');
    expect(context?.usernameField?.id).toBe('identifierId');
    expect((context?.submitter as HTMLButtonElement | null)?.id).toBe('next-button');

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.fieldElement.id).toBe('identifierId');
  });

  test('detects only password inline assist target during password step with disabled identifier', () => {
    document.body.innerHTML = `
      <form>
        <input id="login" type="text" name="login" value="alice@example.com" disabled />
        <input id="password" type="password" name="password" />
      </form>
    `;

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.fieldElement.id).toBe('password');
    expect(targets[0]?.mode).toBe('password_step');
    expect(targets[0]?.fieldRole).toBe('password_current');
  });

  test('detects google-style password step when the identifier is preserved in a hidden state field', () => {
    document.body.innerHTML = `
      <section id="google-password-step">
        <div class="account-summary" role="link" aria-label="otavio.marques20@hotmail.com selected. Switch account">
          <div class="profile-identifier" data-profile-identifier="" translate="no">otavio.marques20@hotmail.com</div>
        </div>
        <div class="password-pane">
          <input
            type="email"
            id="hiddenEmail"
            name="identifier"
            value="otavio.marques20@hotmail.com"
            tabindex="-1"
            aria-hidden="true"
            autocomplete="off"
          />
          <div id="password">
            <input
              id="google-password"
              type="password"
              name="Passwd"
              autocomplete="current-password webauthn"
              aria-label="Enter your password"
            />
          </div>
        </div>
        <div class="footer-actions">
          <div id="passwordNext">
            <button id="next-button" type="button">Next</button>
          </div>
          <button id="try-another-way" type="button">Try another way</button>
        </div>
      </section>
    `;

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
    });

    expect(context?.mode).toBe('password_step');
    expect(context?.passwordField?.id).toBe('google-password');
    expect(context?.usernameField?.id).toBe('hiddenEmail');
    expect((context?.submitter as HTMLButtonElement | null)?.id).toBe('next-button');

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.fieldElement.id).toBe('google-password');
    expect(targets[0]?.fieldRole).toBe('password_current');
    expect(targets[0]?.mode).toBe('password_step');
  });

  test('treats aria-hidden as a weak signal when the password field is still active and interactive', () => {
    document.body.innerHTML = `
      <section id="google-password-step">
        <div aria-hidden="true">
          <div class="account-summary" role="link" aria-label="otavio.marques20@hotmail.com selected. Switch account">
            <div class="profile-identifier" data-profile-identifier="" translate="no">otavio.marques20@hotmail.com</div>
          </div>
          <div class="password-pane">
            <input
              type="email"
              id="hiddenEmail"
              name="identifier"
              value="otavio.marques20@hotmail.com"
              tabindex="-1"
              aria-hidden="true"
              autocomplete="off"
            />
            <div id="password">
              <input
                id="google-password"
                type="password"
                name="Passwd"
                tabindex="0"
                autocomplete="current-password webauthn"
                aria-label="Enter your password"
              />
            </div>
          </div>
        </div>
        <div class="footer-actions">
          <div id="passwordNext">
            <button id="next-button" type="button">Next</button>
          </div>
        </div>
      </section>
    `;

    const passwordField = document.getElementById('google-password') as HTMLInputElement;
    passwordField.focus();

    const context = detectBestFillContext({
      document,
      frameScope: 'top',
      activeElement: passwordField,
    });

    expect(context?.mode).toBe('password_step');
    expect(context?.passwordField?.id).toBe('google-password');
  });

  test('does not create inline assist targets for newsletter/search fields', () => {
    document.body.innerHTML = `
      <form>
        <input id="search" type="text" name="search" placeholder="Buscar produtos" />
        <input id="newsletter" type="email" name="newsletter" placeholder="Seu email" />
      </form>
    `;

    const targets = detectInlineAssistTargets({
      document,
      frameScope: 'top',
    });

    expect(targets).toEqual([]);
  });
});
