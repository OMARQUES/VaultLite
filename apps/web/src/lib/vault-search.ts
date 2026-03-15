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
  return [
    typeof item.payload.title === 'string' ? item.payload.title : '',
    typeof item.payload.content === 'string' ? item.payload.content : '',
  ];
}

function buildHaystack(item: VaultWorkspaceItem): string {
  const sourceValues =
    item.itemType === 'login' ? extractLoginFields(item) : extractDocumentFields(item);

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
