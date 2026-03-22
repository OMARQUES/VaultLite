export const FILTER_OPTIONS = [
  { value: 'all', label: 'All Items', icon: 'all' },
  { value: 'login', label: 'Logins', icon: 'logins' },
  { value: 'card', label: 'Cards', icon: 'cards' },
  { value: 'document', label: 'Docs', icon: 'docs' },
  { value: 'secure_note', label: 'Notes', icon: 'notes' },
  { value: 'suggested', label: 'Suggested', icon: 'suggested' },
];

function iconSvg(name) {
  if (name === 'logins') {
    return '<svg viewBox="0 0 24 24"><path d="M8 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"></path><path d="M2 22a6 6 0 0 1 12 0"></path><path d="M14 11h8"></path><path d="M18 7v8"></path></svg>';
  }
  if (name === 'cards') {
    return '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h4"></path></svg>';
  }
  if (name === 'docs') {
    return '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path></svg>';
  }
  if (name === 'notes') {
    return '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M9 16h4"></path></svg>';
  }
  if (name === 'suggested') {
    return '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.5L21 9.4l-4.5 4.4 1 6.2L12 17.1 6.5 20l1-6.2L3 9.4l6.3-.9Z"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.2"></rect><rect x="14" y="3" width="7" height="7" rx="1.2"></rect><rect x="3" y="14" width="7" height="7" rx="1.2"></rect><rect x="14" y="14" width="7" height="7" rx="1.2"></rect></svg>';
}

function findOption(value) {
  return FILTER_OPTIONS.find((option) => option.value === value) ?? FILTER_OPTIONS[0];
}

function renderOption(option, selectedValue) {
  const selected = option.value === selectedValue;
  const selectedAttr = selected ? ' aria-selected="true"' : ' aria-selected="false"';
  const selectedClass = selected ? ' is-selected' : '';
  return `
    <button
      type="button"
      class="filter-dropdown-option${selectedClass}"
      role="option"
      id="filter-option-${option.value}"
      data-filter-value="${option.value}"
      ${selectedAttr}
    >
      <span class="filter-dropdown-option-icon" aria-hidden="true">${iconSvg(option.icon)}</span>
      <span>${option.label}</span>
    </button>
  `;
}

export function createFilterDropdown({ button, label, icon, menu, onChange }) {
  const root = button.parentElement ?? button;
  let selectedValue = 'all';
  let open = false;
  let activeIndex = 0;

  const optionByValue = (value) => {
    if (typeof value !== 'string') {
      return null;
    }
    return menu.querySelector(`[data-filter-value="${value.replace(/"/g, '\\"')}"]`);
  };

  function syncButton(value) {
    const option = findOption(value);
    label.textContent = option.label;
    icon.innerHTML = iconSvg(option.icon);
    button.setAttribute('aria-label', `Filter items: ${option.label}`);
  }

  function setAriaExpanded(nextOpen) {
    button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }

  function renderMenu() {
    menu.innerHTML = FILTER_OPTIONS.map((option) => renderOption(option, selectedValue)).join('');
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-activedescendant', `filter-option-${findOption(selectedValue).value}`);
    activeIndex = FILTER_OPTIONS.findIndex((option) => option.value === selectedValue);
    if (activeIndex < 0) {
      activeIndex = 0;
    }
  }

  function setActiveIndex(nextIndex) {
    activeIndex = (nextIndex + FILTER_OPTIONS.length) % FILTER_OPTIONS.length;
    const option = FILTER_OPTIONS[activeIndex];
    menu.setAttribute('aria-activedescendant', `filter-option-${option.value}`);
    const optionNode = optionByValue(option.value);
    optionNode?.focus();
  }

  function closeMenu() {
    if (!open) {
      return;
    }
    open = false;
    menu.hidden = true;
    setAriaExpanded(false);
  }

  function openMenu() {
    if (open) {
      return;
    }
    renderMenu();
    open = true;
    menu.hidden = false;
    setAriaExpanded(true);
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  }

  function selectValue(value, emit) {
    const next = findOption(value);
    selectedValue = next.value;
    syncButton(next.value);
    renderMenu();
    if (emit) {
      onChange?.(next.value);
    }
  }

  function onDocumentPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!root.contains(target)) {
      closeMenu();
    }
  }

  function onButtonKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu();
      setActiveIndex(activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
      setActiveIndex(activeIndex - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) {
        const option = FILTER_OPTIONS[activeIndex];
        selectValue(option.value, true);
        closeMenu();
      } else {
        openMenu();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  function onMenuKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(activeIndex - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = FILTER_OPTIONS[activeIndex];
      selectValue(option.value, true);
      closeMenu();
      button.focus();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      button.focus();
    }
  }

  function onMenuClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const optionNode = target.closest('[data-filter-value]');
    if (!(optionNode instanceof HTMLElement)) {
      return;
    }
    const value = optionNode.dataset.filterValue ?? 'all';
    selectValue(value, true);
    closeMenu();
    button.focus();
  }

  button.setAttribute('aria-haspopup', 'listbox');
  if (!menu.id) {
    menu.id = 'filter-dropdown-menu';
  }
  button.setAttribute('aria-controls', menu.id);
  setAriaExpanded(false);
  renderMenu();
  syncButton(selectedValue);

  button.addEventListener('click', toggleMenu);
  button.addEventListener('keydown', onButtonKeyDown);
  menu.addEventListener('keydown', onMenuKeyDown);
  menu.addEventListener('click', onMenuClick);
  document.addEventListener('mousedown', onDocumentPointerDown);

  return {
    getValue() {
      return selectedValue;
    },
    setValue(value) {
      selectValue(value, false);
    },
    setDisabled(disabled) {
      button.disabled = disabled;
      if (disabled) {
        closeMenu();
      }
    },
    close: closeMenu,
    destroy() {
      button.removeEventListener('click', toggleMenu);
      button.removeEventListener('keydown', onButtonKeyDown);
      menu.removeEventListener('keydown', onMenuKeyDown);
      menu.removeEventListener('click', onMenuClick);
      document.removeEventListener('mousedown', onDocumentPointerDown);
      closeMenu();
    },
  };
}
