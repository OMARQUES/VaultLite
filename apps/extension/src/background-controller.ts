import { isCredentialAllowedForSite, isPageUrlEligibleForFill, scoreDomainMatch } from './origin-policy';

export type VaultItemType = 'login' | 'card' | 'document' | 'secure_note';

export interface DecryptedLoginProjection {
  itemId: string;
  itemType: 'login';
  title: string;
  username: string;
  password: string;
  urls: string[];
}

export interface DecryptedCardProjection {
  itemId: string;
  itemType: 'card';
  title: string;
  cardholderName: string;
  number: string;
  securityCode: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  notes: string;
}

export interface DecryptedDocumentProjection {
  itemId: string;
  itemType: 'document';
  title: string;
  content: string;
}

export interface DecryptedSecureNoteProjection {
  itemId: string;
  itemType: 'secure_note';
  title: string;
  content: string;
}

export type DecryptedVaultProjection =
  | DecryptedLoginProjection
  | DecryptedCardProjection
  | DecryptedDocumentProjection
  | DecryptedSecureNoteProjection;

export interface PopupItemProjection {
  itemId: string;
  itemType: VaultItemType;
  title: string;
  subtitle: string;
  searchText: string;
  firstUrl: string;
  urlHostSummary: string;
  matchFlags: {
    exactOrigin: boolean;
    domainScore: number;
  };
}

function toHostSummary(urls: string[]): string {
  for (const rawUrl of urls) {
    try {
      return new URL(rawUrl).hostname;
    } catch {
      // Continue
    }
  }
  return 'No URL';
}

export function projectForPopup(input: {
  items: DecryptedVaultProjection[];
  pageUrl: string;
  isDevelopment: boolean;
}): PopupItemProjection[] {
  const projections = input.items.map((item) => {
    const itemUrls = item.itemType === 'login' ? item.urls : [];
    const exactOrigin =
      item.itemType === 'login'
        ? isCredentialAllowedForSite({
            pageUrl: input.pageUrl,
            credentialUrls: itemUrls,
            options: { isDevelopment: input.isDevelopment },
          })
        : false;
    const domainScore =
      item.itemType === 'login'
        ? scoreDomainMatch({
            pageUrl: input.pageUrl,
            candidateUrls: itemUrls,
          })
        : 0;

    const subtitle =
      item.itemType === 'login'
        ? item.username
        : item.itemType === 'card'
          ? maskCardNumber(item.number)
          : item.itemType === 'document'
            ? truncate(item.content)
            : truncate(item.content);
    const firstUrl = item.itemType === 'login' ? itemUrls[0] ?? '' : '';
    const urlHostSummary = item.itemType === 'login' ? toHostSummary(itemUrls) : item.itemType;
    return {
      itemId: item.itemId,
      itemType: item.itemType,
      title: item.title,
      subtitle,
      searchText: buildSearchText(item),
      firstUrl,
      urlHostSummary,
      matchFlags: {
        exactOrigin,
        domainScore,
      },
    };
  });

  return projections.sort((left, right) => {
    const leftScore = (left.matchFlags.exactOrigin ? 10 : 0) + left.matchFlags.domainScore;
    const rightScore = (right.matchFlags.exactOrigin ? 10 : 0) + right.matchFlags.domainScore;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return left.title.localeCompare(right.title);
  });
}

export function filterProjectedItems(input: {
  items: PopupItemProjection[];
  query: string;
  typeFilter: 'all' | VaultItemType;
  suggestedOnly: boolean;
}): PopupItemProjection[] {
  const query = input.query.trim().toLowerCase();
  return input.items.filter((item) => {
    if (input.typeFilter !== 'all' && item.itemType !== input.typeFilter) {
      return false;
    }
    if (input.suggestedOnly && !item.matchFlags.exactOrigin && item.matchFlags.domainScore === 0) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = `${item.title} ${item.subtitle} ${item.searchText} ${item.urlHostSummary}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function canAttemptFill(input: {
  pageUrl: string;
  credentialUrls: string[];
  isDevelopment: boolean;
  topLevel: boolean;
}): 'allowed' | 'manual_fill_unavailable' | 'credential_not_allowed_for_site' {
  if (!input.topLevel) {
    return 'manual_fill_unavailable';
  }
  if (!isPageUrlEligibleForFill(input.pageUrl, { isDevelopment: input.isDevelopment })) {
    return 'manual_fill_unavailable';
  }
  if (
    !isCredentialAllowedForSite({
      pageUrl: input.pageUrl,
      credentialUrls: input.credentialUrls,
      options: { isDevelopment: input.isDevelopment },
    })
  ) {
    return 'credential_not_allowed_for_site';
  }
  return 'allowed';
}

function buildSearchText(item: DecryptedVaultProjection): string {
  if (item.itemType === 'login') {
    return `${item.title} ${item.username} ${(item.urls ?? []).join(' ')}`;
  }
  if (item.itemType === 'card') {
    return `${item.title} ${item.cardholderName} ${item.notes}`;
  }
  return `${item.title} ${item.content}`;
}

function truncate(value: string, max = 80): string {
  if (!value) {
    return '—';
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function maskCardNumber(value: string): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 4) {
    return '••••';
  }
  return `•••• ${digits.slice(-4)}`;
}
