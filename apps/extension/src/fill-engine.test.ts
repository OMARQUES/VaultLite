import { describe, expect, test } from 'vitest';

import {
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
  test('fills username and password in a simple form', () => {
    document.body.innerHTML = `
      <form>
        <input id="u" type="email" autocomplete="email" />
        <input id="p" type="password" />
      </form>
    `;

    const result = fillUsernamePassword({
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

  test('rejects ambiguous forms with multiple visible current-password fields', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" />
        <input type="password" />
        <input type="password" />
      </form>
    `;

    const result = fillUsernamePassword({
      document,
      credential: {
        username: 'alice',
        password: 'S3cret!',
      },
      topLevel: true,
    });

    expect(result).toBe('unsupported_form');
  });

  test('prefers current-password when multiple password fields exist', () => {
    document.body.innerHTML = `
      <form>
        <input id="user" type="text" autocomplete="username" />
        <input id="newPass" type="password" autocomplete="new-password" />
        <input id="currentPass" type="password" autocomplete="current-password" />
      </form>
    `;

    const result = fillUsernamePassword({
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

  test('avoids filling generic search field when a login identifier field exists', () => {
    document.body.innerHTML = `
      <form>
        <input id="search" type="text" name="search" />
        <input id="identifier" type="text" placeholder="Seu e-mail, CPF ou CNPJ" />
        <input id="password" type="password" />
      </form>
    `;

    const result = fillUsernamePassword({
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

  test('returns no-op on non top-level context', () => {
    document.body.innerHTML = '<input type="password" />';

    const result = fillUsernamePassword({
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
});
