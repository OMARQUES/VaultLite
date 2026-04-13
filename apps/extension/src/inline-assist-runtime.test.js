import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const contentScriptPath = resolve(process.cwd(), 'content-script.js');

function installChromeRuntimeStub(overrides = {}) {
  const listeners = [];
  const queryResults =
    overrides.queryResults ??
    [
      {
        itemId: 'item_1',
        title: 'LinkedIn',
        subtitle: 'alice@example.com',
        matchKind: 'exact_origin',
        fillMode: 'fill',
        exactOrigin: true,
        domainScore: 12,
      },
    ];
  const chrome = {
    runtime: {
      ...(overrides.runtime ?? {}),
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
        if (payload?.type === 'vaultlite.inline_assist_query') {
          const filteredResults = queryResults.filter((entry) => entry?.matchKind && entry.matchKind !== 'none');
          return {
            ok: true,
            status: filteredResults.length > 0 ? 'ready' : 'no_match',
            matchKind: filteredResults[0]?.matchKind ?? 'none',
            autoOpenEligible: ['metadata_confirmed', 'exact_origin'].includes(filteredResults[0]?.matchKind),
            primary: filteredResults[0] ?? null,
            results: filteredResults,
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
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'runtime')),
  };
  if (typeof overrides?.runtime?.sendMessage === 'function') {
    chrome.runtime.sendMessage = overrides.runtime.sendMessage;
  }
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
  if (runtime.inlineAssistTrayCloseTimer !== null) {
    clearTimeout(runtime.inlineAssistTrayCloseTimer);
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
    expect(anchors[0]?.style.left).toBe('606px');
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

  test('auto-opens a tray once for strong matches and keeps a single tray instance across rescans', async () => {
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
    const firstTray = host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]');
    expect(firstTray).not.toBeNull();
    expect(firstTray.getAttribute('data-inline-open')).toBe('true');

    document.body.appendChild(document.createElement('div'));
    await flushInlineAssist();
    await flushInlineAssist();

    const trays = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-tray="true"]');
    expect(trays).toHaveLength(1);
  });

  test('renders only the primary credential once when there are no alternative site matches', async () => {
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
    const tray = host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]');
    expect(tray).not.toBeNull();
    expect(tray.querySelector('[data-vaultlite-inline-search="true"]')).toBeNull();
    expect(tray.querySelectorAll('[data-vaultlite-inline-result="true"]')).toHaveLength(1);
    expect((tray.textContent.match(/LinkedIn/g) ?? []).length).toBe(1);
  });

  test('keeps medium-confidence matches collapsed until the anchor is clicked and can reopen after explicit close', async () => {
    installChromeRuntimeStub({
      queryResults: [
        {
          itemId: 'item_1',
          title: 'LinkedIn Heuristic',
          subtitle: 'alice@example.com',
          matchKind: 'metadata_heuristic',
          fillMode: 'fill',
          exactOrigin: false,
          domainScore: 2,
        },
      ],
      runtime: {
        sendMessage: vi.fn(async (payload) => {
          if (payload?.type === 'vaultlite.inline_assist_prefetch') {
            const groupKey = payload?.targets?.[0]?.contextGroupKey ?? 'group-1';
            return {
              ok: true,
              groups: {
                [groupKey]: {
                  status: 'ready',
                  bestItemId: 'item_1',
                  bestTitle: 'LinkedIn Heuristic',
                  bestSubtitle: 'alice@example.com',
                  matchKind: 'metadata_heuristic',
                  candidateCount: 1,
                  fillMode: 'fill',
                },
              },
            };
          }
          if (payload?.type === 'vaultlite.inline_assist_query') {
            return {
              ok: true,
              status: 'ready',
              matchKind: 'metadata_heuristic',
              autoOpenEligible: false,
              primary: {
                itemId: 'item_1',
                title: 'LinkedIn Heuristic',
                subtitle: 'alice@example.com',
                matchKind: 'metadata_heuristic',
                fillMode: 'fill',
                exactOrigin: false,
                domainScore: 2,
              },
              results: [
                {
                  itemId: 'item_1',
                  title: 'LinkedIn Heuristic',
                  subtitle: 'alice@example.com',
                  matchKind: 'metadata_heuristic',
                  fillMode: 'fill',
                  exactOrigin: false,
                  domainScore: 2,
                },
              ],
            };
          }
          if (payload?.type === 'vaultlite.inline_assist_activate') {
            return { ok: true, result: 'filled' };
          }
          return { ok: true, result: 'manual_fill_unavailable' };
        }),
      },
    });
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
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')).toBeNull();

    const anchor = host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"]');
    expect(anchor.getAttribute('data-inline-expanded')).toBe('false');
    expect(anchor.querySelector('[data-vaultlite-inline-anchor-chevron="true"]')).not.toBeNull();
    expect(anchor.querySelector('path')?.getAttribute('d')).toBe('M3.5 10l4.5-4 4.5 4');
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushInlineAssist();

    const tray = host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]');
    expect(tray).not.toBeNull();
    expect(tray.getAttribute('data-inline-open')).toBe('true');
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"]').getAttribute('data-inline-expanded')).toBe('true');
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"] path')?.getAttribute('d')).toBe(
      'M3.5 6l4.5 4 4.5-4',
    );

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushInlineAssist();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')).not.toBeNull();

    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')?.getAttribute('data-inline-open')).toBe(
      'closing',
    );
    await flushInlineAssist();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')).toBeNull();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"]').getAttribute('data-inline-expanded')).toBe('false');
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"] path')?.getAttribute('d')).toBe(
      'M3.5 10l4.5-4 4.5 4',
    );

    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushInlineAssist();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')).not.toBeNull();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"]').getAttribute('data-inline-expanded')).toBe('true');
  });

  test('renders only site-valid tray results and closes on escape', async () => {
    installChromeRuntimeStub({
      queryResults: [
        {
          itemId: 'item_1',
          title: 'Google Primary',
          subtitle: 'alice@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
        {
          itemId: 'item_2',
          title: 'Google Secondary',
          subtitle: 'secondary@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
        {
          itemId: 'item_3',
          title: 'Outlook Shared',
          subtitle: 'shared.outlook@example.com',
          matchKind: 'none',
          fillMode: 'fill',
          exactOrigin: false,
          domainScore: 0,
        },
      ],
    });
    document.body.innerHTML = `
      <section id="google-signin">
        <input id="identifier" type="email" name="email" autocomplete="username" />
        <button id="next-button" type="button">Next</button>
      </section>
    `;

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    const firstResultTitle = host.shadowRoot.querySelector('.vaultlite-inline-result-title');
    const results = host.shadowRoot.querySelectorAll('[data-vaultlite-inline-result="true"]');
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-search="true"]')).toBeNull();
    expect(firstResultTitle?.textContent).toContain('Google Primary');
    expect(results).toHaveLength(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushInlineAssist();

    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')).toBeNull();
  });

  test('does not render a search input in the tray', async () => {
    installChromeRuntimeStub({
      queryResults: [
        {
          itemId: 'item_1',
          title: 'Google Primary',
          subtitle: 'alice@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
        {
          itemId: 'item_2',
          title: 'Google Secondary',
          subtitle: 'secondary@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
      ],
    });
    document.body.innerHTML = `
      <section id="google-signin">
        <input id="identifier" type="email" name="email" autocomplete="username" />
        <button id="next-button" type="button">Next</button>
      </section>
    `;

    const source = readFileSync(contentScriptPath, 'utf8');
    globalThis.Function(source)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushInlineAssist();

    const host = document.querySelector('[data-vaultlite-inline-root="true"]');
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-search="true"]')).toBeNull();
  });

  test('renders the primary credential without a separate fill button element', async () => {
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
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-primary-action="true"]')).toBeNull();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-primary="true"]')).toBeNull();
    expect(host.shadowRoot.querySelectorAll('[data-vaultlite-inline-result="true"]')).toHaveLength(1);
    expect(host.shadowRoot.textContent.includes('Fill')).toBe(false);
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-close="true"]')).toBeNull();
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-result-icon="true"]')).not.toBeNull();
    const anchor = host.shadowRoot.querySelector('[data-vaultlite-inline-anchor="true"]');
    expect(anchor.getAttribute('data-inline-expanded')).toBe('true');
    expect(anchor.querySelector('[data-vaultlite-inline-anchor-chevron="true"]')).not.toBeNull();
  });

  test('renders favicon imagery in the tray when the inline result includes an iconUrl', async () => {
    installChromeRuntimeStub({
      queryResults: [
        {
          itemId: 'item_1',
          title: 'Ceted',
          subtitle: 'otavio.marques20@hotmail.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
          iconUrl: 'data:image/png;base64,AAA',
        },
      ],
    });
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
    const image = host.shadowRoot.querySelector('[data-vaultlite-inline-result-image="true"]');
    expect(image).not.toBeNull();
    expect(image.getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  test('marks multi-credential trays as compact scrollable lists', async () => {
    installChromeRuntimeStub({
      queryResults: [
        {
          itemId: 'item_1',
          title: 'Credential One',
          subtitle: 'one@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
        {
          itemId: 'item_2',
          title: 'Credential Two',
          subtitle: 'two@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
        {
          itemId: 'item_3',
          title: 'Credential Three',
          subtitle: 'three@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
        {
          itemId: 'item_4',
          title: 'Credential Four',
          subtitle: 'four@example.com',
          matchKind: 'exact_origin',
          fillMode: 'fill',
          exactOrigin: true,
          domainScore: 10,
        },
      ],
    });
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
    const tray = host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]');
    expect(tray).not.toBeNull();
    expect(tray.getAttribute('data-inline-scrollable')).toBe('true');
    expect(host.shadowRoot.querySelectorAll('[data-vaultlite-inline-result="true"]')).toHaveLength(4);
  });

  test('activates the primary credential card and closes the tray on successful fill', async () => {
    const sendMessage = vi.fn(async (payload) => {
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
      if (payload?.type === 'vaultlite.inline_assist_query') {
        return {
          ok: true,
          status: 'ready',
          matchKind: 'exact_origin',
          autoOpenEligible: true,
          primary: {
            itemId: 'item_1',
            title: 'LinkedIn',
            subtitle: 'alice@example.com',
            matchKind: 'exact_origin',
            fillMode: 'fill',
            exactOrigin: true,
            domainScore: 10,
          },
          results: [
            {
              itemId: 'item_1',
              title: 'LinkedIn',
              subtitle: 'alice@example.com',
              matchKind: 'exact_origin',
              fillMode: 'fill',
              exactOrigin: true,
              domainScore: 10,
            },
          ],
        };
      }
      if (payload?.type === 'vaultlite.inline_assist_activate') {
        return { ok: true, result: 'filled', uiAction: 'fill' };
      }
      return { ok: true, result: 'manual_fill_unavailable' };
    });
    installChromeRuntimeStub({
      runtime: {
        sendMessage,
      },
    });
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
    const firstCard = host.shadowRoot.querySelector('[data-vaultlite-inline-result="true"]');
    firstCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushInlineAssist();

    expect(
      sendMessage.mock.calls.some(
        ([payload]) => payload?.type === 'vaultlite.inline_assist_activate' && payload?.itemId === 'item_1',
      ),
    ).toBe(true);
    expect(host.shadowRoot.querySelector('[data-vaultlite-inline-tray="true"]')).toBeNull();
  });
});
