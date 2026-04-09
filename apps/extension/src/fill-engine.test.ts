import { describe, expect, test } from 'vitest';

import {
  detectBestFillContext,
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
});
