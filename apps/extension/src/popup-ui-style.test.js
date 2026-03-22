import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const popupHtmlPath = resolve(process.cwd(), 'popup.html');

describe('popup ui style regressions', () => {
  test('uses web-app blue tone for primary accents and selected rows', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('--vl-primary: #2562ea;');
    const selectedBlock = source.match(/\.vault-row\.is-selected\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(selectedBlock).toContain('background: #2562ea;');
    const newItemBlock = source.match(/\.new-item-btn\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(newItemBlock).toContain('background: var(--vl-primary);');
  });

  test('uses smooth master-detail transition instead of jumpy toggle', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('grid-template-columns: 1fr 0fr;');
    expect(source).toContain('transition: grid-template-columns 340ms cubic-bezier(0.22, 1, 0.36, 1);');
    expect(source).toContain('opacity: 0;');
    expect(source).toContain('transform: translateX(8px);');
    expect(source).toMatch(
      /transition:[\s\S]*opacity 320ms cubic-bezier\(0.22, 1, 0.36, 1\),[\s\S]*transform 320ms cubic-bezier\(0.22, 1, 0.36, 1\)/,
    );
    expect(source).toContain('opacity: 1;');
    expect(source).toContain('transform: translateX(0);');
  });

  test('uses primary blue tone for copy icon animation feedback', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    const copiedBlock = source.match(/\.row-action\.is-copied\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(copiedBlock).toContain('.row-action.is-copied');
    expect(copiedBlock).toContain('var(--vl-primary)');
    expect(copiedBlock).not.toContain('#22c55e');
  });

  test('keeps pre-auth layouts compact and top-aligned', () => {
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
    expect(source).toContain('justify-content: flex-start;');
    expect(source).toContain("body[data-layout='pairing'] {");
    expect(source).toContain("body[data-layout='unlock'] {");
    expect(source).toContain('background: #19181d;');
  });

  test('renders unlock context block with account and device details', () => {
    const source = readFileSync(popupHtmlPath, 'utf8');
    expect(source).toContain('class="unlock-context"');
    expect(source).toContain('id="unlockAccountValue"');
    expect(source).toContain('id="unlockDeviceValue"');
    expect(source).toContain('Enter your master password to unlock this trusted device.');
    expect(source).toContain('<span>Master password</span>');
  });
});
