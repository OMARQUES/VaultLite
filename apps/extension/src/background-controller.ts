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

export interface InlineAssistLoginProjection {
  itemId: string;
  itemType: 'login';
  title: string;
  subtitle: string;
  urls: string[];
}

export interface InlineAssistTargetProjection {
  contextGroupKey: string;
  frameScope: 'top' | 'same_origin_iframe';
  mode: 'full_login' | 'identifier_step' | 'password_step';
  fieldRole: 'username' | 'email' | 'password_current';
  formFingerprint: string;
  fieldFingerprint: string;
}

export interface InlineAssistMetadataProjection {
  itemId: string | null;
  ownerUserId?: string | null;
  origin: string;
  formFingerprint: string;
  fieldFingerprint: string;
  fieldRole: string;
  confidence: string;
  selectorStatus: string;
}

export interface InlineAssistPrefetchGroup {
  status: 'ready' | 'no_match' | 'unsupported' | 'error';
  bestItemId: string | null;
  bestTitle: string | null;
  bestSubtitle: string | null;
  matchKind: 'exact_origin' | 'metadata_confirmed' | 'domain_match' | 'metadata_heuristic' | 'none';
  candidateCount: number;
  fillMode: 'fill' | 'open-and-fill' | 'open-url' | null;
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

function normalizeInlineAssistTargets(
  targets: InlineAssistTargetProjection[],
): InlineAssistTargetProjection[] {
  return Array.from(
    new Map(
      (Array.isArray(targets) ? targets : [])
        .filter(
          (target) =>
            target &&
            typeof target.contextGroupKey === 'string' &&
            target.contextGroupKey.length > 0 &&
            typeof target.formFingerprint === 'string' &&
            target.formFingerprint.length > 0 &&
            typeof target.fieldFingerprint === 'string' &&
            target.fieldFingerprint.length > 0 &&
            (target.fieldRole === 'username' || target.fieldRole === 'email' || target.fieldRole === 'password_current') &&
            (target.mode === 'full_login' || target.mode === 'identifier_step' || target.mode === 'password_step') &&
            (target.frameScope === 'top' || target.frameScope === 'same_origin_iframe'),
        )
        .map((target) => [`${target.contextGroupKey}::${target.fieldRole}`, target]),
    ).values(),
  );
}

function inlineAssistMetadataMatchKind(input: {
  target: InlineAssistTargetProjection;
  itemId: string;
  pageOrigin: string | null;
  records: InlineAssistMetadataProjection[];
}): 'metadata_confirmed' | 'metadata_heuristic' | 'none' {
  const relevantRecords = (Array.isArray(input.records) ? input.records : []).filter(
    (record) =>
      record &&
      record.selectorStatus === 'active' &&
      record.itemId === input.itemId &&
      record.origin === input.pageOrigin &&
      record.formFingerprint === input.target.formFingerprint &&
      record.fieldFingerprint === input.target.fieldFingerprint &&
      record.fieldRole === input.target.fieldRole,
  );
  if (relevantRecords.some((record) => record.confidence === 'submitted_confirmed' || record.confidence === 'user_corrected')) {
    return 'metadata_confirmed';
  }
  if (relevantRecords.some((record) => record.confidence === 'filled' || record.confidence === 'heuristic')) {
    return 'metadata_heuristic';
  }
  return 'none';
}

function inlineAssistMatchRank(matchKind: InlineAssistPrefetchGroup['matchKind']): number {
  switch (matchKind) {
    case 'metadata_confirmed':
      return 4;
    case 'exact_origin':
      return 3;
    case 'domain_match':
      return 2;
    case 'metadata_heuristic':
      return 1;
    default:
      return 0;
  }
}

function resolveInlineAssistFillMode(input: {
  pageUrl: string;
  candidateUrls: string[];
  isDevelopment: boolean;
  siteAutomationPermissionGranted: boolean;
}): InlineAssistPrefetchGroup['fillMode'] {
  if (
    isPageUrlEligibleForFill(input.pageUrl, { isDevelopment: input.isDevelopment }) &&
    isCredentialAllowedForSite({
      pageUrl: input.pageUrl,
      credentialUrls: input.candidateUrls,
      options: { isDevelopment: input.isDevelopment },
    })
  ) {
    return 'fill';
  }
  if (input.siteAutomationPermissionGranted) {
    return 'open-and-fill';
  }
  return input.candidateUrls.length > 0 ? 'open-url' : null;
}

export function resolveInlineAssistPrefetch(input: {
  targets: InlineAssistTargetProjection[];
  items: InlineAssistLoginProjection[];
  formMetadataRecords: InlineAssistMetadataProjection[];
  pageUrl: string;
  isDevelopment: boolean;
  siteAutomationPermissionGranted: boolean;
}): Record<string, InlineAssistPrefetchGroup> {
  let pageOrigin: string | null = null;
  try {
    pageOrigin = new URL(input.pageUrl).origin;
  } catch {
    pageOrigin = null;
  }
  const groups: Record<string, InlineAssistPrefetchGroup> = {};
  for (const target of normalizeInlineAssistTargets(input.targets)) {
    const candidates = (Array.isArray(input.items) ? input.items : [])
      .filter((item) => item?.itemType === 'login' && Array.isArray(item.urls))
      .map((item) => {
        const metadataMatchKind = inlineAssistMetadataMatchKind({
          target,
          itemId: item.itemId,
          pageOrigin,
          records: input.formMetadataRecords,
        });
        const exactOrigin = isCredentialAllowedForSite({
          pageUrl: input.pageUrl,
          credentialUrls: item.urls,
          options: { isDevelopment: input.isDevelopment },
        });
        const domainScore = scoreDomainMatch({
          pageUrl: input.pageUrl,
          candidateUrls: item.urls,
        });
        const matchKind: InlineAssistPrefetchGroup['matchKind'] =
          metadataMatchKind === 'metadata_confirmed'
            ? 'metadata_confirmed'
            : exactOrigin
              ? 'exact_origin'
              : domainScore > 0
                ? 'domain_match'
                : metadataMatchKind === 'metadata_heuristic'
                  ? 'metadata_heuristic'
                  : 'none';
        return {
          itemId: item.itemId,
          title: item.title,
          subtitle: item.subtitle,
          urls: item.urls,
          matchKind,
          domainScore,
          exactOrigin,
        };
      })
      .filter((candidate) => candidate.matchKind !== 'none');

    if (candidates.length === 0) {
      groups[target.contextGroupKey] = {
        status: 'no_match',
        bestItemId: null,
        bestTitle: null,
        bestSubtitle: null,
        matchKind: 'none',
        candidateCount: 0,
        fillMode: null,
      };
      continue;
    }

    candidates.sort((left, right) => {
      const rankDelta = inlineAssistMatchRank(right.matchKind) - inlineAssistMatchRank(left.matchKind);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      const exactDelta = Number(right.exactOrigin) - Number(left.exactOrigin);
      if (exactDelta !== 0) {
        return exactDelta;
      }
      if (right.domainScore !== left.domainScore) {
        return right.domainScore - left.domainScore;
      }
      return left.title.localeCompare(right.title);
    });

    const bestCandidate = candidates[0];
    groups[target.contextGroupKey] = {
      status: 'ready',
      bestItemId: bestCandidate.itemId,
      bestTitle: bestCandidate.title,
      bestSubtitle: bestCandidate.subtitle,
      matchKind: bestCandidate.matchKind,
      candidateCount: candidates.length,
      fillMode: resolveInlineAssistFillMode({
        pageUrl: input.pageUrl,
        candidateUrls: bestCandidate.urls,
        isDevelopment: input.isDevelopment,
        siteAutomationPermissionGranted: input.siteAutomationPermissionGranted,
      }),
    };
  }
  return groups;
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
