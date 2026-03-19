<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import type { ImportPreviewRow } from '../../lib/vault-import';

type ColumnKey = 'sourceFormat' | 'itemType' | 'status' | 'title' | 'account' | 'attachmentCount' | 'reason';
type SortDir = 'asc' | 'desc';
type NormalizedRow = ImportPreviewRow & { account: string; reasonText: string };

const props = defineProps<{
  rows: ImportPreviewRow[];
}>();

const tableColumns: Array<{
  key: ColumnKey;
  label: string;
  sortAscLabel: string;
  sortDescLabel: string;
}> = [
  { key: 'sourceFormat', label: 'Source', sortAscLabel: 'Sort A-Z', sortDescLabel: 'Sort Z-A' },
  { key: 'itemType', label: 'Type', sortAscLabel: 'Sort A-Z', sortDescLabel: 'Sort Z-A' },
  { key: 'status', label: 'Status', sortAscLabel: 'Sort A-Z', sortDescLabel: 'Sort Z-A' },
  { key: 'title', label: 'Title', sortAscLabel: 'Sort A-Z', sortDescLabel: 'Sort Z-A' },
  { key: 'account', label: 'Account/Username', sortAscLabel: 'Sort A-Z', sortDescLabel: 'Sort Z-A' },
  { key: 'attachmentCount', label: 'Attachment(s)', sortAscLabel: 'Sort low-high', sortDescLabel: 'Sort high-low' },
  { key: 'reason', label: 'Reason', sortAscLabel: 'Sort A-Z', sortDescLabel: 'Sort Z-A' },
];

function buildEmptyColumnFilters(): Record<ColumnKey, string[]> {
  return {
    sourceFormat: [],
    itemType: [],
    status: [],
    title: [],
    account: [],
    attachmentCount: [],
    reason: [],
  };
}

const columnFilters = reactive<Record<ColumnKey, string[]>>(buildEmptyColumnFilters());
const sortState = reactive<{ by: ColumnKey; dir: SortDir }>({
  by: 'title',
  dir: 'asc',
});
const activeColumnMenu = ref<ColumnKey | null>(null);
const activeColumnMenuAnchor = ref<HTMLElement | null>(null);
const activeColumnMenuPanel = ref<HTMLElement | null>(null);
const columnFilterDraft = ref('');
const columnFilterSelectionDraft = ref<string[]>([]);
const columnMenuPosition = reactive({ top: 0, left: 0 });

const normalizedRows = computed<NormalizedRow[]>(() =>
  props.rows.map((row) => ({
    ...row,
    account: row.username || row.firstUrl || '',
    reasonText: row.reason || '',
  })),
);

const columnMenuStyle = computed(() => ({
  top: `${columnMenuPosition.top}px`,
  left: `${columnMenuPosition.left}px`,
}));

const activeColumnFilteredOptions = computed(() => {
  if (!activeColumnMenu.value) return [];
  const options = getColumnDistinctValues(activeColumnMenu.value);
  const search = columnFilterDraft.value.trim();
  if (!search) return options;
  return options.filter((option) => optionMatchesSearch(activeColumnMenu.value!, option, search));
});

const visibleRows = computed(() => getClientFilteredRows(normalizedRows.value));

function statusLabel(status: ImportPreviewRow['status']): string {
  if (status === 'valid') return 'Valid';
  if (status === 'duplicate') return 'Duplicate';
  if (status === 'skipped_non_login') return 'Skipped';
  if (status === 'unsupported_type') return 'Unsupported';
  if (status === 'possible_duplicate_requires_review') return 'Needs review';
  if (status === 'skipped_encrypted_export') return 'Encrypted export';
  return 'Invalid';
}

function getColumnWidthClass(column: ColumnKey): string {
  switch (column) {
    case 'sourceFormat':
      return 'import-preview-table__col--source';
    case 'itemType':
      return 'import-preview-table__col--type';
    case 'status':
      return 'import-preview-table__col--status';
    case 'title':
      return 'import-preview-table__col--title';
    case 'account':
      return 'import-preview-table__col--account';
    case 'attachmentCount':
      return 'import-preview-table__col--attachments';
    case 'reason':
      return 'import-preview-table__col--reason';
    default:
      return '';
  }
}

function normalizeText(value: string | number | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function normalizeDigits(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').trim();
}

function rowColumnValue(row: NormalizedRow, column: ColumnKey): string | number {
  switch (column) {
    case 'sourceFormat':
      return row.sourceFormat;
    case 'itemType':
      return row.itemType;
    case 'status':
      return statusLabel(row.status);
    case 'title':
      return row.title;
    case 'account':
      return row.account;
    case 'attachmentCount':
      return Number(row.attachmentCount ?? 0);
    case 'reason':
      return row.reasonText;
    default:
      return '';
  }
}

function getColumnComparableValue(row: NormalizedRow, column: ColumnKey): string | number {
  if (column === 'attachmentCount') return Number(row.attachmentCount ?? 0);
  if (column === 'account') return normalizeText(row.account);
  if (column === 'reason') return normalizeText(row.reasonText);
  if (column === 'status') return normalizeText(statusLabel(row.status));
  return normalizeText(rowColumnValue(row, column));
}

function rowMatchesColumnFilters(row: NormalizedRow, ignoreColumn?: ColumnKey): boolean {
  for (const column of tableColumns) {
    if (ignoreColumn && column.key === ignoreColumn) continue;
    if (columnFilters[column.key].length === 0) continue;
    const rowValue = String(rowColumnValue(row, column.key));
    if (!columnFilters[column.key].includes(rowValue)) return false;
  }
  return true;
}

function getRowsFilteredByAllButColumn(column: ColumnKey): NormalizedRow[] {
  return normalizedRows.value.filter((row) => rowMatchesColumnFilters(row, column));
}

function getColumnDistinctValues(column: ColumnKey): string[] {
  const rowsForOptions = getRowsFilteredByAllButColumn(column);
  const values = Array.from(
    new Set([
      ...rowsForOptions.map((row) => String(rowColumnValue(row, column))),
      ...columnFilters[column],
    ]),
  );

  if (column === 'attachmentCount') {
    return values.sort((a, b) => Number(a) - Number(b));
  }

  return values.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function getClientFilteredRows(source: NormalizedRow[]): NormalizedRow[] {
  let filtered = source.filter((row) => rowMatchesColumnFilters(row));

  filtered = [...filtered].sort((a, b) => {
    const av = getColumnComparableValue(a, sortState.by);
    const bv = getColumnComparableValue(b, sortState.by);
    let comparison = 0;

    if (typeof av === 'number' && typeof bv === 'number') {
      comparison = av - bv;
    } else {
      comparison = String(av).localeCompare(String(bv), 'pt-BR');
    }

    return sortState.dir === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

function hasActiveFilter(column: ColumnKey): boolean {
  return columnFilters[column].length > 0;
}

function toggleColumnMenu(column: ColumnKey, event: MouseEvent): void {
  if (activeColumnMenu.value === column) {
    closeColumnMenu();
    return;
  }
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  activeColumnMenu.value = column;
  activeColumnMenuAnchor.value = target;
  columnFilterDraft.value = '';
  columnFilterSelectionDraft.value = [...columnFilters[column]];
  void nextTick(() => updateColumnMenuPosition());
}

function closeColumnMenu(): void {
  activeColumnMenu.value = null;
  activeColumnMenuAnchor.value = null;
  activeColumnMenuPanel.value = null;
  columnFilterDraft.value = '';
  columnFilterSelectionDraft.value = [];
}

function updateColumnMenuPosition(): void {
  if (!activeColumnMenuAnchor.value) return;

  const rect = activeColumnMenuAnchor.value.getBoundingClientRect();
  const viewportPadding = 8;
  const panelWidth =
    activeColumnMenuPanel.value?.offsetWidth ?? Math.min(352, window.innerWidth - viewportPadding * 2);
  const panelHeight =
    activeColumnMenuPanel.value?.offsetHeight ??
    Math.min(520, window.innerHeight - viewportPadding * 2);
  const maxLeft = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding);

  let top = rect.bottom + 6;
  if (top + panelHeight > window.innerHeight - viewportPadding) {
    top = rect.top - panelHeight - 6;
  }

  columnMenuPosition.left = Math.min(Math.max(viewportPadding, rect.left), maxLeft);
  columnMenuPosition.top = Math.max(viewportPadding, top);
}

function getColumnSortLabel(column: ColumnKey, direction: SortDir): string {
  const target = tableColumns.find((item) => item.key === column);
  if (!target) return '';
  return direction === 'asc' ? target.sortAscLabel : target.sortDescLabel;
}

function setSort(column: ColumnKey, dir: SortDir): void {
  sortState.by = column;
  sortState.dir = dir;
  closeColumnMenu();
}

function applyActiveColumnFilter(): void {
  if (!activeColumnMenu.value) return;
  columnFilters[activeColumnMenu.value] = [...columnFilterSelectionDraft.value];
  closeColumnMenu();
}

function clearColumnFilter(column: ColumnKey): void {
  columnFilters[column] = [];
  closeColumnMenu();
}

function clearActiveColumnFilter(): void {
  if (!activeColumnMenu.value) return;
  clearColumnFilter(activeColumnMenu.value);
}

function isDraftValueSelected(value: string): boolean {
  return columnFilterSelectionDraft.value.includes(value);
}

function toggleDraftValue(value: string): void {
  if (isDraftValueSelected(value)) {
    columnFilterSelectionDraft.value = columnFilterSelectionDraft.value.filter((candidate) => candidate !== value);
    return;
  }
  columnFilterSelectionDraft.value = [...columnFilterSelectionDraft.value, value];
}

function selectAllDraftValues(): void {
  columnFilterSelectionDraft.value = [...activeColumnFilteredOptions.value];
}

function clearDraftValues(): void {
  columnFilterSelectionDraft.value = [];
}

function clearAllColumnFilters(): void {
  const defaults = buildEmptyColumnFilters();
  for (const column of tableColumns) {
    columnFilters[column.key] = defaults[column.key];
  }
  closeColumnMenu();
}

function optionMatchesSearch(column: ColumnKey, option: string, search: string): boolean {
  const normalizedSearch = normalizeText(search);
  if (!normalizedSearch) return true;

  if (column === 'attachmentCount') {
    const searchDigits = normalizeDigits(search);
    if (searchDigits && normalizeDigits(option).includes(searchDigits)) return true;
  }

  return normalizeText(option).includes(normalizedSearch);
}

function onViewportChange(): void {
  if (!activeColumnMenu.value) return;
  updateColumnMenuPosition();
}

onMounted(() => {
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange);
});
</script>

<template>
  <div class="import-preview-toolbar">
    <div class="import-preview-toolbar__count">
      {{ visibleRows.length }} / {{ rows.length }} rows
    </div>
    <button
      type="button"
      class="button button--secondary"
      data-testid="import-clear-filters"
      @click="clearAllColumnFilters"
    >
      Clear filters
    </button>
  </div>

  <div class="import-preview">
    <table class="import-preview-table" role="grid" aria-label="Import preview">
      <thead>
        <tr>
          <th
            v-for="column in tableColumns"
            :key="column.key"
            :class="`relative ${getColumnWidthClass(column.key)}`"
            scope="col"
          >
            <button
              type="button"
              :data-testid="`column-menu-${column.key}`"
              class="import-preview-table__column-menu-button"
              @click.stop="toggleColumnMenu(column.key, $event)"
            >
              <span>{{ column.label }}</span>
              <span v-if="sortState.by === column.key">
                {{ sortState.dir === 'asc' ? '↑' : '↓' }}
              </span>
              <span v-if="hasActiveFilter(column.key)" class="import-preview-table__filter-dot">●</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="visibleRows.length === 0">
          <td :colspan="tableColumns.length" class="import-preview-table__empty">
            No rows found for active filters.
          </td>
        </tr>
        <tr
          v-for="row in visibleRows"
          :key="`${row.sourceRef}:${row.rowIndex}`"
        >
          <td class="import-preview-table__cell-ellipsis" :title="row.sourceFormat">{{ row.sourceFormat }}</td>
          <td class="import-preview-table__cell-ellipsis" :title="row.itemType">{{ row.itemType }}</td>
          <td>
            <span class="import-status-badge" :data-status="row.status">
              {{ statusLabel(row.status) }}
            </span>
          </td>
          <td class="import-preview-table__cell-ellipsis" :title="row.title || '—'">{{ row.title || '—' }}</td>
          <td class="import-preview-table__cell-ellipsis" :title="row.account || '—'">{{ row.account || '—' }}</td>
          <td class="import-preview-table__cell-ellipsis" :title="String(row.attachmentCount)">
            {{ row.attachmentCount }}
          </td>
          <td class="import-preview-table__cell-ellipsis" :title="row.reasonText || '—'">{{ row.reasonText || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <Teleport to="body">
    <div
      v-if="activeColumnMenu"
      class="import-column-menu-overlay"
      data-testid="column-menu-overlay"
      @click.self="closeColumnMenu"
    >
      <div
        ref="activeColumnMenuPanel"
        :style="columnMenuStyle"
        class="import-column-menu"
        @click.stop
        @mousedown.stop
        @wheel.stop
      >
        <div class="import-column-menu__body">
          <div class="import-column-menu__sort-row">
            <button
              type="button"
              class="button button--secondary"
              :data-testid="`column-sort-asc-${activeColumnMenu}`"
              @click="setSort(activeColumnMenu, 'asc')"
            >
              {{ getColumnSortLabel(activeColumnMenu, 'asc') }}
            </button>
            <button
              type="button"
              class="button button--secondary"
              :data-testid="`column-sort-desc-${activeColumnMenu}`"
              @click="setSort(activeColumnMenu, 'desc')"
            >
              {{ getColumnSortLabel(activeColumnMenu, 'desc') }}
            </button>
          </div>

          <label class="field">
            <input
              v-model="columnFilterDraft"
              :data-testid="`column-filter-input-${activeColumnMenu}`"
              placeholder="Search value"
            >
          </label>

          <div class="import-column-menu__helper-actions">
            <button
              type="button"
              class="button button--secondary"
              :data-testid="`column-filter-select-all-${activeColumnMenu}`"
              @click="selectAllDraftValues"
            >
              Select all
            </button>
            <button
              type="button"
              class="button button--secondary"
              :data-testid="`column-filter-clear-draft-${activeColumnMenu}`"
              @click="clearDraftValues"
            >
              Clear selection
            </button>
          </div>

          <div class="import-column-menu__options">
            <label
              v-for="(value, optionIndex) in activeColumnFilteredOptions"
              :key="value"
              class="import-column-menu__option"
              :data-testid="`column-filter-option-${activeColumnMenu}-${optionIndex}`"
            >
              <input
                type="checkbox"
                :data-testid="`column-filter-option-checkbox-${activeColumnMenu}-${optionIndex}`"
                :checked="isDraftValueSelected(value)"
                @change="toggleDraftValue(value)"
              >
              <span :title="value">{{ value || '—' }}</span>
            </label>
            <p v-if="activeColumnFilteredOptions.length === 0" class="module-empty-hint">
              No options found.
            </p>
          </div>

          <div class="import-column-menu__footer">
            <button
              type="button"
              class="button button--secondary"
              :data-testid="`column-filter-clear-${activeColumnMenu}`"
              @click="clearActiveColumnFilter"
            >
              Clear filter
            </button>
            <button
              type="button"
              class="button button--secondary"
              :data-testid="`column-filter-cancel-${activeColumnMenu}`"
              @click="closeColumnMenu"
            >
              Cancel
            </button>
            <button
              type="button"
              class="button button--primary"
              :data-testid="`column-filter-apply-${activeColumnMenu}`"
              @click="applyActiveColumnFilter"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
