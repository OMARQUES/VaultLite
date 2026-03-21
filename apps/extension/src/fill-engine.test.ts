import { describe, expect, test } from 'vitest';

import { fillUsernamePassword } from './fill-engine';

describe('fillUsernamePassword', () => {
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

  test('rejects ambiguous forms with multiple visible password fields', () => {
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
});
