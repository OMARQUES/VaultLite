import type { VaultWorkspaceItem } from './vault-workspace';

export interface VaultSearchIndexEntry {
  itemId: string;
  haystack: string;
}

export type VaultSearchIndex = Map<string, VaultSearchIndexEntry>;

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function extractLoginFields(item: Extract<VaultWorkspaceItem, { itemType: 'login' }>): string[] {
  const values = [
    typeof item.payload.title === 'string' ? item.payload.title : '',
    typeof item.payload.username === 'string' ? item.payload.username : '',
    typeof item.payload.notes === 'string' ? item.payload.notes : '',
  ];
  const customFields = Array.isArray(item.payload.customFields) ? item.payload.customFields : [];
  for (const field of customFields) {
    if (typeof field.label === 'string') {
      values.push(field.label);
    }
    if (typeof field.value === 'string') {
      values.push(field.value);
    }
  }
  const urls = Array.isArray(item.payload.urls) ? item.payload.urls : [];

  for (const url of urls) {
    const normalizedUrl = normalizeSearchValue(url);
    if (normalizedUrl) {
      values.push(normalizedUrl);
    }

    try {
      values.push(new URL(url).hostname.toLowerCase());
    } catch {
      // Keep the original normalized string only.
    }
  }

  return values;
}

function extractDocumentFields(item: Extract<VaultWorkspaceItem, { itemType: 'document' }>): string[] {
  const values = [
    typeof item.payload.title === 'string' ? item.payload.title : '',
    typeof item.payload.content === 'string' ? item.payload.content : '',
  ];
  const customFields = Array.isArray(item.payload.customFields) ? item.payload.customFields : [];
  for (const field of customFields) {
    if (typeof field.label === 'string') {
      values.push(field.label);
    }
    if (typeof field.value === 'string') {
      values.push(field.value);
    }
  }

  return values;
}

function extractCardFields(item: Extract<VaultWorkspaceItem, { itemType: 'card' }>): string[] {
  const values = [
    typeof item.payload.title === 'string' ? item.payload.title : '',
    typeof item.payload.cardholderName === 'string' ? item.payload.cardholderName : '',
    typeof item.payload.brand === 'string' ? item.payload.brand : '',
    typeof item.payload.number === 'string' ? item.payload.number : '',
    typeof item.payload.expiryMonth === 'string' ? item.payload.expiryMonth : '',
    typeof item.payload.expiryYear === 'string' ? item.payload.expiryYear : '',
    typeof item.payload.notes === 'string' ? item.payload.notes : '',
  ];
  const customFields = Array.isArray(item.payload.customFields) ? item.payload.customFields : [];
  for (const field of customFields) {
    if (typeof field.label === 'string') {
      values.push(field.label);
    }
    if (typeof field.value === 'string') {
      values.push(field.value);
    }
  }

  return values;
}

function extractSecureNoteFields(item: Extract<VaultWorkspaceItem, { itemType: 'secure_note' }>): string[] {
  const values = [
    typeof item.payload.title === 'string' ? item.payload.title : '',
    typeof item.payload.content === 'string' ? item.payload.content : '',
  ];
  const customFields = Array.isArray(item.payload.customFields) ? item.payload.customFields : [];
  for (const field of customFields) {
    if (typeof field.label === 'string') {
      values.push(field.label);
    }
    if (typeof field.value === 'string') {
      values.push(field.value);
    }
  }

  return values;
}

function buildHaystack(item: VaultWorkspaceItem): string {
  let sourceValues: string[];
  if (item.itemType === 'login') {
    sourceValues = extractLoginFields(item);
  } else if (item.itemType === 'document') {
    sourceValues = extractDocumentFields(item);
  } else if (item.itemType === 'card') {
    sourceValues = extractCardFields(item);
  } else {
    sourceValues = extractSecureNoteFields(item);
  }

  return sourceValues
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join(' ');
}

export function buildVaultSearchIndex(items: VaultWorkspaceItem[]): VaultSearchIndex {
  const index: VaultSearchIndex = new Map();

  for (const item of items) {
    index.set(item.itemId, {
      itemId: item.itemId,
      haystack: buildHaystack(item),
    });
  }

  return index;
}

export function queryVaultSearchIndex(index: VaultSearchIndex, query: string): string[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return Array.from(index.keys());
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches: string[] = [];

  for (const entry of index.values()) {
    if (terms.every((term) => entry.haystack.includes(term))) {
      matches.push(entry.itemId);
    }
  }

  return matches;
}
