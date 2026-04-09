import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const contentScriptPath = resolve(process.cwd(), 'content-script.js');

function installChromeRuntimeStub(overrides = {}) {
  const listeners = [];
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
      sendMessage: vi.fn(async (payload) => {
        if (payload?.type === 'vaultlite.inline_assist_prefetch') {
          const groupKey = payload?.targets?.[0]?.contextGroupKey ?? 'group-1';
          return {
            ok: true,
            groups: {
              [groupKey]: {
                status: 'ready',
                bestItemId: 'item_1',
                bestTitle: 'LinkedIn',
                bestSubtitle: 'alice@example.com',
                matchKind: 'exact_origin',
                candidateCount: 1,
                fillMode: 'fill',
              },
            },
          };
        }
        if (payload?.type === 'vaultlite.inline_assist_activate') {
          return {
            ok: true,
            result: 'filled',
          };
        }
        return {
          ok: true,
          result: 'manual_fill_unavailable',
        };
      }),
      ...overrides.runtime,
    },
    ...overrides,
  };
  vi.stubGlobal('chrome', chrome);
  return chrome;
}

async function flushInlineAssist() {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 640);
  });
}

function disposeRuntimeTimers() {
  const runtime = globalThis.__vaultliteContentRuntimeV2;
  if (!runtime) {
    return;
  }
  if (runtime.inlineAssistScanTimer !== null) {
    clearTimeout(runtime.inlineAssistScanTimer);
  }
  if (runtime.inlineAssistDeferredScanTimer !== null) {
    clearTimeout(runtime.inlineAssistDeferredScanTimer);
  }
}

describe('inline assist runtime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete globalThis.__vaultliteContentRuntimeV2;
    installChromeRuntimeStub();
  });

  afterEach(() => {
    disposeRuntimeTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete globalThis.__vaultliteContentRuntimeV2;
  });

  test('renders ready anchors on page load without requiring focus', async () => {
    document.body.innerHTML = `
      <form>
        <input id="identifier" type="email" name="email" autocomplete="username" />
        <input id="password" type="password" name="password" autocomplete="current-password" />
      </form>
    `;

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host).not.toBeNull();
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(2);
    expect([...anchors].map((entry) => entry.getAttribute('data-field-role'))).toEqual([
      'username',
      'password_current',
    ]);
  });

  test('reacts to late modal insertion and adds identifier-step anchor', async () => {
    document.body.innerHTML = '<main><button type="button">Open</button></main>';

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `
      <form>
        <input id="login" type="text" name="login" autocomplete="current-login" />
        <button type="submit">Continuar</button>
      </form>
    `;
    document.body.appendChild(dialog);
    dialog.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 120,
        right: 920,
        bottom: 620,
        width: 800,
        height: 520,
      });
    const login = dialog.querySelector('#login');
    login.getBoundingClientRect = () =>
      ({
        top: 200,
        left: 180,
        right: 780,
        bottom: 248,
        width: 600,
        height: 48,
      });

    await flushInlineAssist();
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute('data-field-role')).toBe('username');
    expect(host.parentElement).toBe(dialog);
    expect(anchors[0]?.style.display).toBe('inline-flex');
    expect(anchors[0]?.style.left).toBe('624px');
  });

  test('renders anchors for login inputs inside open shadow roots', async () => {
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

    const usernameHost = document.getElementById('login-username');
    const passwordHost = document.getElementById('login-password');
    usernameHost.attachShadow({ mode: 'open' }).innerHTML = '<input id="username-inner" type="text" />';
    passwordHost.attachShadow({ mode: 'open' }).innerHTML = '<input id="password-inner" type="password" />';

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host).not.toBeNull();
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(2);
    expect([...anchors].map((entry) => entry.getAttribute('data-field-role'))).toEqual([
      'username',
      'password_current',
    ]);
  });

  test('renders identifier-step anchor when submitter is a nearby button outside the form', async () => {
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

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host).not.toBeNull();
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute('data-field-role')).toBe('username');
  });

  test('renders google-style identifier-step anchor even when aria-hidden helper password exists', async () => {
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

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host).not.toBeNull();
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute('data-field-role')).toBe('username');
  });

  test('renders google-style identifier-step anchor when the first ancestor only contains secondary actions', async () => {
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

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host).not.toBeNull();
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute('data-field-role')).toBe('username');
  });

  test('renders google-style password-step anchor when the identifier is kept in a hidden state field', async () => {
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

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host).not.toBeNull();
    const anchors = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-anchor="true"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute('data-field-role')).toBe('password_current');
  });

  test('logs inferred google stage and rescan timestamp during inline scan', async () => {
    globalThis.__VAULTLITE_DEBUG_INLINE__ = true;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const googleStageCall = logSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('[vaultlite][content][google.stage.inferred]'),
    );
    expect(googleStageCall).toBeTruthy();
    expect(googleStageCall[1]).toMatchObject({
      stage: 'password',
      scanSequence: expect.any(Number),
      rescannedAt: expect.any(String),
      performanceNowMs: expect.any(Number),
    });
  });
});
