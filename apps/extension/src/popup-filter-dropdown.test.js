import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createFilterDropdown, FILTER_OPTIONS } from '../popup-filter-dropdown.js';

function setupDom() {
  document.body.innerHTML = `
    <div id="dropdownRoot">
      <button id="filterDropdownButton" type="button" aria-expanded="false"></button>
      <span id="filterDropdownLabel"></span>
      <span id="filterDropdownIcon"></span>
      <div id="filterDropdownMenu" hidden role="listbox"></div>
    </div>
  `;
}

describe('popup-filter-dropdown', () => {
  beforeEach(() => {
    setupDom();
  });

  test('opens and closes dropdown on button click', () => {
    const button = document.getElementById('filterDropdownButton');
    const label = document.getElementById('filterDropdownLabel');
    const icon = document.getElementById('filterDropdownIcon');
    const menu = document.getElementById('filterDropdownMenu');
    const onChange = vi.fn();
    createFilterDropdown({ button, label, icon, menu, onChange });

    expect(menu.hidden).toBe(true);
    button.click();
    expect(menu.hidden).toBe(false);
    button.click();
    expect(menu.hidden).toBe(true);
  });

  test('selects option and notifies callback', () => {
    const button = document.getElementById('filterDropdownButton');
    const label = document.getElementById('filterDropdownLabel');
    const icon = document.getElementById('filterDropdownIcon');
    const menu = document.getElementById('filterDropdownMenu');
    const onChange = vi.fn();
    const dropdown = createFilterDropdown({ button, label, icon, menu, onChange });

    dropdown.setValue('all');
    button.click();
    const loginOption = menu.querySelector('[data-filter-value="login"]');
    loginOption.click();

    expect(dropdown.getValue()).toBe('login');
    expect(onChange).toHaveBeenCalledWith('login');
    expect(label.textContent).toContain('Logins');
  });

  test('supports keyboard navigation with arrows and enter', () => {
    const button = document.getElementById('filterDropdownButton');
    const label = document.getElementById('filterDropdownLabel');
    const icon = document.getElementById('filterDropdownIcon');
    const menu = document.getElementById('filterDropdownMenu');
    const onChange = vi.fn();
    const dropdown = createFilterDropdown({ button, label, icon, menu, onChange });

    dropdown.setValue('all');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(FILTER_OPTIONS.some((option) => option.value === dropdown.getValue())).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(label.textContent).not.toBe('');
  });
});

