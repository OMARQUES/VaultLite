import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ImportPreviewTable from './ImportPreviewTable.vue';
import type { ImportPreviewRow } from '../../lib/vault-import';

function buildRows(): ImportPreviewRow[] {
  return [
    {
      rowIndex: 1,
      sourceFormat: 'onepassword_1pux_v1',
      sourceRef: 'onepassword_1pux_v1:row_1',
      itemType: 'login',
      title: 'Dropbox SigFarm',
      username: 'alice@example.com',
      firstUrl: 'https://dropbox.com',
      attachmentCount: 2,
      status: 'valid',
      reason: null,
    },
    {
      rowIndex: 2,
      sourceFormat: 'bitwarden_json_v1',
      sourceRef: 'bitwarden_json_v1:row_2',
      itemType: 'secure_note',
      title: 'Legacy note',
      username: '',
      firstUrl: '',
      attachmentCount: 0,
      status: 'duplicate',
      reason: 'duplicate_item',
    },
  ];
}

describe('ImportPreviewTable', () => {
  it('filters rows by title column', async () => {
    const wrapper = mount(ImportPreviewTable, {
      attachTo: document.body,
      props: {
        rows: buildRows(),
      },
    });

    await wrapper.get('[data-testid="column-menu-title"]').trigger('click');
    const filterInput = document.querySelector<HTMLInputElement>('[data-testid="column-filter-input-title"]');
    expect(filterInput).not.toBeNull();
    filterInput!.value = 'Dropbox';
    filterInput!.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();

    const optionCheckbox = document.querySelector<HTMLInputElement>(
      '[data-testid="column-filter-option-checkbox-title-0"]',
    );
    expect(optionCheckbox).not.toBeNull();
    optionCheckbox!.checked = true;
    optionCheckbox!.dispatchEvent(new Event('change', { bubbles: true }));
    await wrapper.vm.$nextTick();

    const applyButton = document.querySelector<HTMLButtonElement>('[data-testid="column-filter-apply-title"]');
    expect(applyButton).not.toBeNull();
    applyButton!.click();
    await wrapper.vm.$nextTick();

    const bodyRows = wrapper.findAll('tbody tr');
    expect(bodyRows).toHaveLength(1);
    expect(bodyRows[0]?.text()).toContain('Dropbox SigFarm');
    wrapper.unmount();
  });

  it('sorts by attachments when clicking column header', async () => {
    const wrapper = mount(ImportPreviewTable, {
      attachTo: document.body,
      props: {
        rows: buildRows(),
      },
    });

    await wrapper.get('[data-testid="column-menu-attachmentCount"]').trigger('click');
    const sortButton = document.querySelector<HTMLButtonElement>('[data-testid="column-sort-asc-attachmentCount"]');
    expect(sortButton).not.toBeNull();
    sortButton!.click();
    await wrapper.vm.$nextTick();

    const firstRowText = wrapper.findAll('tbody tr')[0]?.text() ?? '';
    expect(firstRowText).toContain('0');
    expect(firstRowText).toContain('Legacy note');
    wrapper.unmount();
  });
});
