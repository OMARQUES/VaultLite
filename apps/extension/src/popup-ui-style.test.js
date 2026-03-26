import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const popupHtmlPath = resolve(process.cwd(), 'popup.html');

describe('popup ui style regressions', () => {
  test('uses web-app blue tone for primary accents and selected rows', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('--vl-primary: #2562ea;');
    const selectedBlock = source.match(/\.vault-row\.is-selected\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(selectedBlock).toContain('background: #2562ea');
    const newItemBlock = source.match(/\.new-item-btn\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(newItemBlock).toContain('background: var(--vl-primary);');
  });

  test('uses smooth master-detail transition instead of jumpy toggle', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('grid-template-columns: 1fr 0fr;');
    expect(source).toContain('transition: grid-template-columns 360ms cubic-bezier(0.4, 0, 0.2, 1);');
    expect(source).toContain('opacity: 0;');
    expect(source).toContain('transform: translateX(18px) scale(0.985);');
    expect(source).toMatch(
      /transition:[\s\S]*opacity 360ms cubic-bezier\(0.4, 0, 0.2, 1\),[\s\S]*transform 360ms cubic-bezier\(0.4, 0, 0.2, 1\)/,
    );
    expect(source).toContain('opacity: 1;');
    expect(source).toContain('transform: translateX(0) scale(1);');
  });

  test('uses primary blue tone for copy icon animation feedback', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    const copiedBlock = source.match(/\.row-action\.is-copied\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(copiedBlock).toContain('.row-action.is-copied');
    expect(copiedBlock).toContain('var(--vl-primary)');
    expect(copiedBlock).not.toContain('#22c55e');
  });

  test('keeps pre-auth layouts compact with centered simplified unlock stage', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('--pairing-min-height: 340px;');
    expect(source).toContain('--pairing-min-height-link-open: 470px;');
    expect(source).toContain('--unlock-min-height: 252px;');
    expect(source).toContain('--ready-min-height: 520px;');
    expect(source).toContain("body[data-layout='pairing'][data-link-request='open']");
    expect(source).not.toContain('height: var(--pairing-height);');
    expect(source).not.toContain('height: var(--unlock-height);');
    expect(source).not.toContain('height: var(--ready-height);');
    expect(source).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(source).toContain("body[data-layout='pairing'] .popup-content,");
    expect(source).toContain("body[data-layout='unlock'] .popup-content {");
    expect(source).toContain("body[data-layout='unlock'] .popup-header {");
    expect(source).toContain('display: none;');
    expect(source).toContain('justify-content: center;');
    expect(source).toContain('align-items: center;');
    expect(source).toContain("body[data-layout='pairing'] {");
    expect(source).toContain("body[data-layout='unlock'] {");
    expect(source).toContain('background: #1c1e24;');
  });

  test('renders simplified unlock stage with account-only title and inline field actions', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('class="compact-stage unlock-stage"');
    expect(source).toContain('class="unlock-stage-logo">VaultLite</h2>');
    expect(source).toContain('id="unlockAccountValue"');
    expect(source).toContain('id="unlockDeviceValue"');
    expect(source).toContain('id="unlockRevealBtn"');
    expect(source).toContain('id="unlockBtn"');
    expect(source).toContain('placeholder="Enter your password"');
    expect(source).toContain('.unlock-password-shell');
    expect(source).toContain('background: #2a2f37;');
    expect(source).toContain('border-color: #2562ea;');
  });

  test('keeps detail icon edit affordance transient and aligned', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).not.toContain('.detail-icon-shell.is-editable:focus-within .detail-icon-edit');
    expect(source).not.toContain('.detail-icon-edit:focus-visible');
    const editBlock = source.match(/\.detail-icon-edit\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(editBlock).toContain('pointer-events: none;');
    expect(editBlock).toContain('inset: 0;');
    expect(editBlock).toContain('line-height: 0;');
    expect(editBlock).toContain('display: grid;');
    expect(editBlock).toContain('place-items: center;');
  });
});
