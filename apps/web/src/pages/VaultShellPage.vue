<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  type RouteLocationRaw,
  useRoute,
  useRouter,
} from 'vue-router';

import DangerButton from '../components/ui/DangerButton.vue';
import DialogModal from '../components/ui/DialogModal.vue';
import DropdownMenu from '../components/ui/DropdownMenu.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import AppIcon from '../components/ui/AppIcon.vue';
import IconButton from '../components/ui/IconButton.vue';
import InlineAlert from '../components/ui/InlineAlert.vue';
import KeyValueList from '../components/ui/KeyValueList.vue';
import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SearchField from '../components/ui/SearchField.vue';
import SecretField from '../components/ui/SecretField.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';
import TextField from '../components/ui/TextField.vue';
import TextareaField from '../components/ui/TextareaField.vue';
import ToastMessage from '../components/ui/ToastMessage.vue';
import PasswordGeneratorPopover from '../components/vault/PasswordGeneratorPopover.vue';
import { useSessionStore } from '../composables/useSessionStore';
import {
  loadVaultUiState,
  onVaultUiStateUpdated,
  saveVaultUiState,
  type VaultUiState,
} from '../lib/vault-ui-state';
import {
  importManualSiteIconFromFile,
  listManualSiteIcons,
  sanitizeIconHost,
  type ManualSiteIconMap,
} from '../lib/manual-site-icons';
import { encryptAttachmentBlobPayload } from '../lib/browser-crypto';
import { createVaultLiteVaultClient } from '../lib/vault-client';
import {
  type CardVaultItemPayload,
  createVaultWorkspace,
  type DocumentVaultItemPayload,
  type LoginVaultItemPayload,
  type SecureNoteVaultItemPayload,
  type VaultCustomField,
  type VaultWorkspaceItem,
  type VaultWorkspaceTombstone,
} from '../lib/vault-workspace';
import { toHumanErrorMessage } from '../lib/human-error';

type VaultScope = 'all' | 'favorites' | 'trash';
type VaultTypeFilter = 'all' | 'login' | 'document' | 'card' | 'secure_note';
type AttachmentUploadState = 'pending' | 'uploaded' | 'attached' | 'deleted' | 'orphaned';

interface AttachmentUploadView {
  uploadId: string;
  itemId: string;
  lifecycleState: AttachmentUploadState;
  contentType: string;
  size: number;
  expiresAt: string;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PendingAttachmentDraft {
  id: string;
  file: File;
  name: string;
  size: number;
  contentType: string;
  lastModified: number;
  previewUrl: string | null;
  downloadUrl: string;
}

interface LocalAttachmentAsset {
  name: string;
  contentType: string;
  size: number;
  previewUrl: string | null;
  downloadUrl: string;
}

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();
const vaultClient = createVaultLiteVaultClient();
const workspace = createVaultWorkspace({
  sessionStore,
  vaultClient,
});

const searchInputRef = ref<InstanceType<typeof SearchField> | null>(null);
const detailIconFileInput = ref<HTMLInputElement | null>(null);
const loginPasswordFieldWrapRef = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const errorMessage = ref<string | null>(null);
const toastMessage = ref('');
const busyAction = ref<null | 'load' | 'save' | 'trash'>(null);
const discardDialogOpen = ref(false);
const pendingNavigation = ref<string | null>(null);
const dirty = ref(false);
const baseRevisionAtEditStart = ref<number | null>(null);
const hasExternalUpdate = ref(false);
const activeEditorKey = ref<string | null>(null);
const loginDraftFolderId = ref('');
const documentDraftFolderId = ref('');
const cardDraftFolderId = ref('');
const secureNoteDraftFolderId = ref('');
const uiState = ref<VaultUiState>(loadVaultUiState(sessionStore.state.username));
const attachmentInputRef = ref<HTMLInputElement | null>(null);
const attachmentsByItemId = ref<Record<string, AttachmentUploadView[]>>({});
const pendingDraftAttachments = ref<PendingAttachmentDraft[]>([]);
const localAttachmentAssetsByUploadId = ref<Record<string, LocalAttachmentAsset>>({});
const attachmentBusy = ref(false);
const attachmentError = ref<string | null>(null);
const faviconSourceIndexByItemAndHost = ref<Record<string, number>>({});
const manualSiteIconsByHost = ref<ManualSiteIconMap>({});
const canonicalSiteIconsByHost = ref<
  Record<string, { dataUrl: string; source: 'manual' | 'automatic'; sourceUrl: string | null; updatedAt: string }>
>({});
const iconDiscoveryCooldownByHost = ref<Record<string, number>>({});
const detailIconUploadBusy = ref(false);
const toolbarPasswordGeneratorOpen = ref(false);
const loginPasswordGeneratorOpen = ref(false);
const loginPasswordFieldFocused = ref(false);
let iconHydrationNonce = 0;
let manualIconRemoteRefreshInFlight: Promise<void> | null = null;
let lastManualIconRemoteRefreshAt = 0;
const MANUAL_ICON_REMOTE_REFRESH_COOLDOWN_MS = 12_000;
const attachmentObjectUrls = new Set<string>();

const loginDraft = reactive<LoginVaultItemPayload>({
  title: '',
  username: '',
  password: '',
  urls: [],
  notes: '',
  customFields: [],
});

const documentDraft = reactive<DocumentVaultItemPayload>({
  title: '',
  content: '',
  customFields: [],
});

const cardDraft = reactive<CardVaultItemPayload>({
  title: '',
  cardholderName: '',
  brand: '',
  number: '',
  expiryMonth: '',
  expiryYear: '',
  securityCode: '',
  notes: '',
  customFields: [],
});

const secureNoteDraft = reactive<SecureNoteVaultItemPayload>({
  title: '',
  content: '',
  customFields: [],
});

const createOptions = [
  { label: 'New login', value: 'new-login', icon: 'login' },
  { label: 'New document', value: 'new-document', icon: 'document' },
  { label: 'New card', value: 'new-card', icon: 'card' },
  { label: 'New secure note', value: 'new-secure-note', icon: 'secure_note' },
] as const;

const createOptionByType = {
  login: 'new-login',
  document: 'new-document',
  card: 'new-card',
  secure_note: 'new-secure-note',
} as const;

const isMobileViewport = ref(false);
const isCompactDesktopViewport = ref(false);
const mobileFilterSheetOpen = ref(false);
const mobileCreateSheetOpen = ref(false);
const mobileAccountSheetOpen = ref(false);
const mobileDetailActionSheetOpen = ref(false);
let mobileQuery: MediaQueryList | null = null;
let compactDesktopQuery: MediaQueryList | null = null;

const scopeLabelMap: Record<VaultScope, string> = {
  all: 'All items',
  favorites: 'Favorites',
  trash: 'Trash',
};

const typeLabelMap: Record<VaultTypeFilter, string> = {
  all: 'All types',
  login: 'Login',
  document: 'Documents',
  card: 'Cards',
  secure_note: 'Secure Notes',
};

function normalizeScope(value: unknown): VaultScope {
  if (value === 'favorites' || value === 'trash') {
    return value;
  }

  return 'all';
}

function normalizeType(value: unknown): VaultTypeFilter {
  if (value === 'login' || value === 'document' || value === 'card' || value === 'secure_note') {
    return value;
  }

  return 'all';
}

function normalizeFolder(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return 'all';
}

function normalizeSearch(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

const scope = computed<VaultScope>(() => normalizeScope(route.query.scope));
const typeFilter = computed<VaultTypeFilter>(() => normalizeType(route.query.type));
const folderFilter = computed(() => normalizeFolder(route.query.folder));
const searchFilter = computed(() => normalizeSearch(route.query.q));

function cloneUiState(state: VaultUiState): VaultUiState {
  return {
    favorites: [...state.favorites],
    folderAssignments: { ...state.folderAssignments },
    folders: state.folders.map((folder) => ({ ...folder })),
  };
}

function refreshUiState() {
  uiState.value = loadVaultUiState(sessionStore.state.username);
}

function refreshManualSiteIcons() {
  manualSiteIconsByHost.value = listManualSiteIcons(sessionStore.state.username);
}

function mergeManualIconsIntoCanonicalCache(manualIcons: ManualSiteIconMap) {
  const nextCanonical = { ...canonicalSiteIconsByHost.value };
  for (const [host, entry] of Object.entries(manualIcons)) {
    nextCanonical[host] = {
      dataUrl: entry.dataUrl,
      source: 'manual',
      sourceUrl: null,
      updatedAt: entry.updatedAt,
    };
  }
  canonicalSiteIconsByHost.value = nextCanonical;
}

async function refreshManualSiteIconsFromServer(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && now - lastManualIconRemoteRefreshAt < MANUAL_ICON_REMOTE_REFRESH_COOLDOWN_MS) {
    return;
  }
  if (manualIconRemoteRefreshInFlight) {
    return manualIconRemoteRefreshInFlight;
  }

  manualIconRemoteRefreshInFlight = (async () => {
    try {
      const response = await sessionStore.listManualSiteIcons();
      const nextManualMap: ManualSiteIconMap = {};
      for (const entry of response.icons ?? []) {
        const safeHost = sanitizeIconHost(String(entry.domain ?? ''));
        const dataUrl = typeof entry.dataUrl === 'string' ? entry.dataUrl : '';
        if (!safeHost || !dataUrl) {
          continue;
        }
        nextManualMap[safeHost] = {
          dataUrl,
          source: entry.source === 'url' ? 'url' : 'file',
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
        };
      }
      manualSiteIconsByHost.value = nextManualMap;
      mergeManualIconsIntoCanonicalCache(nextManualMap);
      faviconSourceIndexByItemAndHost.value = {};
      lastManualIconRemoteRefreshAt = Date.now();
    } catch {
      // Best effort to avoid UX regressions when network/session is unstable.
    } finally {
      manualIconRemoteRefreshInFlight = null;
    }
  })();

  return manualIconRemoteRefreshInFlight;
}

function handleManualIconRefreshOnFocus() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  void refreshManualSiteIconsFromServer({ force: true });
}

function handleManualIconRefreshOnVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    void refreshManualSiteIconsFromServer({ force: true });
  }
}

function commitUiState(updater: (draft: VaultUiState) => void) {
  const next = cloneUiState(uiState.value);
  updater(next);
  saveVaultUiState(sessionStore.state.username, next);
  uiState.value = next;
}

function isFavorite(itemId: string): boolean {
  return uiState.value.favorites.includes(itemId);
}

function currentTombstones(): VaultWorkspaceTombstone[] {
  return workspace.state.tombstones ?? [];
}

function isTrashed(itemId: string): boolean {
  return currentTombstones().some((entry) => entry.itemId === itemId);
}

function folderFor(itemId: string): string | null {
  return uiState.value.folderAssignments[itemId] ?? null;
}

function folderName(folderId: string | null): string {
  if (!folderId) {
    return '—';
  }

  return uiState.value.folders.find((folder) => folder.id === folderId)?.name ?? '—';
}

const folders = computed(() => uiState.value.folders);

const allItems = computed(() => workspace.state.items);
const activeItems = computed(() => allItems.value);
const allTombstones = computed(() => currentTombstones());

function itemMatchesCurrentContext(item: VaultWorkspaceItem): boolean {
  if (scope.value === 'trash') {
    return false;
  }

  if (scope.value === 'favorites' && !isFavorite(item.itemId)) {
    return false;
  }

  if (typeFilter.value !== 'all' && item.itemType !== typeFilter.value) {
    return false;
  }

  if (scope.value === 'all' && folderFilter.value !== 'all' && folderFor(item.itemId) !== folderFilter.value) {
    return false;
  }

  return true;
}

const filteredItems = computed(() => workspace.filteredItems.value.filter(itemMatchesCurrentContext));
const filteredTrashEntries = computed(() =>
  allTombstones.value.filter((entry) => {
    if (typeFilter.value !== 'all' && entry.itemType !== typeFilter.value) {
      return false;
    }
    if (searchQuery.value.trim().length === 0) {
      return true;
    }
    const needle = searchQuery.value.trim().toLowerCase();
    return (
      entry.itemId.toLowerCase().includes(needle) ||
      entry.itemType.toLowerCase().includes(needle)
    );
  }),
);

const selectedItemId = computed(() => {
  const raw = route.params.itemId;
  return typeof raw === 'string' ? raw : null;
});

const selectedItem = computed(
  () => allItems.value.find((item) => item.itemId === selectedItemId.value) ?? null,
);
const selectedTrashEntry = computed(
  () => allTombstones.value.find((entry) => entry.itemId === selectedItemId.value) ?? null,
);
const iconHydrationItems = computed(() => {
  const seen = new Set<string>();
  const items: VaultWorkspaceItem[] = [];
  for (const entry of filteredItems.value) {
    if (seen.has(entry.itemId)) {
      continue;
    }
    seen.add(entry.itemId);
    items.push(entry);
  }
  if (selectedItem.value && !seen.has(selectedItem.value.itemId)) {
    items.push(selectedItem.value);
  }
  return items;
});
const iconHydrationHosts = computed(() => loginHostsForItems(iconHydrationItems.value));

const selectedItemInContext = computed(() => {
  const current = selectedItem.value;
  if (!current) {
    return null;
  }

  return itemMatchesCurrentContext(current) ? current : null;
});
const detailIconEditableHost = computed(() => {
  const item = selectedItemInContext.value;
  if (!item || item.itemType !== 'login') {
    return null;
  }
  return sanitizeIconHost(item.payload.urls[0] ?? '');
});
const canEditDetailIcon = computed(
  () => Boolean(detailIconEditableHost.value) && !isTrashContext.value,
);
const selectedAttachmentItem = computed(() => selectedItemInContext.value);
const selectedItemUploads = computed(
  () => (selectedAttachmentItem.value ? attachmentsByItemId.value[selectedAttachmentItem.value.itemId] : []) ?? [],
);

const isCreateLogin = computed(() => route.path === '/vault/new/login');
const isCreateDocument = computed(() => route.path === '/vault/new/document');
const isCreateCard = computed(() => route.path === '/vault/new/card');
const isCreateSecureNote = computed(() => route.path === '/vault/new/secure-note');
const isCreateRoute = computed(
  () => isCreateLogin.value || isCreateDocument.value || isCreateCard.value || isCreateSecureNote.value,
);
const isEditing = computed(() => route.path.endsWith('/edit'));
const isListRoute = computed(() => route.path === '/vault');
const isDetailRoute = computed(
  () =>
    !isEditing.value &&
    !isCreateLogin.value &&
    !isCreateDocument.value &&
    !isCreateCard.value &&
    !isCreateSecureNote.value &&
    route.path.startsWith('/vault/item/'),
);
const surfaceError = computed(() => errorMessage.value ?? workspace.state.lastError);
const emptyVault = computed(() => !workspace.state.isLoading && activeItems.value.length === 0);
const listPaneEmpty = computed(
  () =>
    !workspace.state.isLoading &&
    (scope.value === 'trash' ? filteredTrashEntries.value.length === 0 : filteredItems.value.length === 0),
);
const contextualCreateOptions = computed(() => {
  if (typeFilter.value === 'all') {
    return createOptions;
  }

  const expectedValue = createOptionByType[typeFilter.value];
  return createOptions.filter((option) => option.value === expectedValue);
});
const listPaneEmptyTitle = computed(() =>
  searchQuery.value.trim().length > 0 ? 'No matches found' : 'No items yet',
);
const listPaneEmptyDescription = computed(() => {
  if (searchQuery.value.trim().length > 0) {
    return 'Create a new item or adjust your search and filters.';
  }

  return 'Create your first login, document, card, or secure note.';
});
const pageModeClass = computed(() => {
  if (isCreateRoute.value) return 'vault-page--create';
  if (isEditing.value) return 'vault-page--edit';
  if (isDetailRoute.value) return 'vault-page--detail';
  return 'vault-page--list';
});
const detailTitle = computed(() => {
  if (isCreateLogin.value) return 'New login';
  if (isCreateDocument.value) return 'New document';
  if (isCreateCard.value) return 'New card';
  if (isCreateSecureNote.value) return 'New secure note';
  if (isEditing.value) return 'Edit item';
  if (selectedItemInContext.value?.itemType === 'document') return 'Document';
  if (selectedItemInContext.value?.itemType === 'card') return 'Card';
  if (selectedItemInContext.value?.itemType === 'secure_note') return 'Secure note';
  return 'Login';
});
const detailMetaType = computed(() => {
  if (!selectedItemInContext.value) {
    return '';
  }

  if (scope.value === 'trash') {
    return 'Trash';
  }

  if (selectedItemInContext.value.itemType === 'login') return 'Login';
  if (selectedItemInContext.value.itemType === 'document') return 'Document';
  if (selectedItemInContext.value.itemType === 'card') return 'Card';
  return 'Secure note';
});
const isTrashContext = computed(() => scope.value === 'trash');
const maskKey = computed(() => `${route.fullPath}:${sessionStore.state.phase}`);
const scopeSummaryLabel = computed(() => scopeLabelMap[scope.value]);
const typeSummaryLabel = computed(() => typeLabelMap[typeFilter.value]);
const folderSummaryLabel = computed(() => {
  if (folderFilter.value === 'all') {
    return 'All folders';
  }

  return folderName(folderFilter.value);
});
const activeFiltersSummary = computed(() => {
  const segments: string[] = [];
  const hasExplicitFilter =
    scope.value !== 'all' ||
    typeFilter.value !== 'all' ||
    folderFilter.value !== 'all' ||
    searchQuery.value.trim().length > 0;

  if (!hasExplicitFilter) {
    return segments;
  }

  segments.push(scopeSummaryLabel.value);

  if (typeFilter.value !== 'all') {
    segments.push(`Type: ${typeSummaryLabel.value}`);
  }
  if (scope.value === 'all' && folderFilter.value !== 'all') {
    segments.push(`Folder: ${folderSummaryLabel.value}`);
  }
  if (searchQuery.value.trim().length > 0) {
    segments.push(`Search: "${searchQuery.value.trim()}"`);
  }

  return segments;
});
const showCompactBackToList = computed(
  () => isCompactDesktopViewport.value && !isMobileViewport.value && !isListRoute.value,
);
const editorHeaderFaviconUrl = computed(() => {
  if (isEditing.value && selectedItem.value && selectedItem.value.itemType === 'login') {
    return itemFaviconUrl(selectedItem.value);
  }

  if (isCreateLogin.value) {
    const candidates = loginFaviconCandidates(loginDraft.urls[0]);
    return candidates[0] ?? null;
  }

  return null;
});
const editorHeaderMonogram = computed(() => {
  if (isEditing.value && selectedItem.value) {
    return itemMonogram(selectedItem.value);
  }

  if (isCreateLogin.value) return monogramFromText(editorTitle.value || 'Login', 'L');
  if (isCreateDocument.value) return monogramFromText(editorTitle.value || 'Document', 'D');
  if (isCreateCard.value) return monogramFromText(editorTitle.value || 'Card', 'C');
  if (isCreateSecureNote.value) return monogramFromText(editorTitle.value || 'Secure note', 'S');

  return monogramFromText(editorTitle.value || detailTitle.value, '•');
});
const canOpenAdminFromVault = computed(() => sessionStore.state.role === 'owner');
const passwordGeneratorContextUrl = computed(() => {
  if (isCreateLogin.value) {
    return loginDraft.urls[0] ?? '';
  }
  if (selectedItemInContext.value?.itemType === 'login') {
    return selectedItemInContext.value.payload.urls[0] ?? '';
  }
  if (typeof window !== 'undefined') {
    return window.location.href;
  }
  return '';
});
const isLoginEditorMode = computed(
  () => isCreateLogin.value || (isEditing.value && selectedItem.value?.itemType === 'login'),
);
const showLoginPasswordGeneratorTrigger = computed(
  () => isLoginEditorMode.value && loginPasswordFieldFocused.value && !loginPasswordGeneratorOpen.value,
);
const showLoginPasswordGeneratorPanel = computed(
  () => isLoginEditorMode.value && loginPasswordGeneratorOpen.value,
);

function toggleToolbarPasswordGenerator() {
  toolbarPasswordGeneratorOpen.value = !toolbarPasswordGeneratorOpen.value;
  if (toolbarPasswordGeneratorOpen.value) {
    loginPasswordGeneratorOpen.value = false;
  }
}

function closeToolbarPasswordGenerator() {
  toolbarPasswordGeneratorOpen.value = false;
}

function openLoginPasswordGenerator() {
  loginPasswordGeneratorOpen.value = true;
  toolbarPasswordGeneratorOpen.value = false;
}

function closeLoginPasswordGenerator() {
  loginPasswordGeneratorOpen.value = false;
}

function onFillGeneratedPassword(password: string) {
  loginDraft.password = password;
  setDirty();
  closeLoginPasswordGenerator();
}

function onLoginPasswordFieldFocusIn() {
  if (!isLoginEditorMode.value) {
    return;
  }
  loginPasswordFieldFocused.value = true;
}

function onLoginPasswordFieldFocusOut() {
  window.setTimeout(() => {
    const activeElement = document.activeElement;
    loginPasswordFieldFocused.value = Boolean(
      loginPasswordFieldWrapRef.value && activeElement && loginPasswordFieldWrapRef.value.contains(activeElement),
    );
  }, 0);
}

function attachmentStatusLabel(state: AttachmentUploadState): string {
  if (state === 'pending') {
    return 'Pending upload';
  }
  if (state === 'uploaded') {
    return 'Uploaded';
  }
  if (state === 'attached') {
    return 'Attached';
  }
  if (state === 'deleted') {
    return 'Deleted';
  }
  return 'Orphaned';
}

function attachmentMetaLine(upload: AttachmentUploadView): string {
  const sizeKb = Math.max(1, Math.round(upload.size / 1024));
  return `${upload.contentType} · ${sizeKb} KB`;
}

function queuedAttachmentMetaLine(attachment: PendingAttachmentDraft): string {
  const sizeKb = Math.max(1, Math.round(attachment.size / 1024));
  return `${attachment.contentType} · ${sizeKb} KB`;
}

function createTrackedObjectUrl(file: File): string {
  const objectUrl = URL.createObjectURL(file);
  attachmentObjectUrls.add(objectUrl);
  return objectUrl;
}

function previewUrlForContentType(contentType: string, sourceUrl: string): string | null {
  if (contentType.startsWith('image/')) {
    return sourceUrl;
  }

  return null;
}

function attachmentDisplayName(upload: AttachmentUploadView): string {
  return localAttachmentAssetsByUploadId.value[upload.uploadId]?.name ?? upload.uploadId;
}

function attachmentPreviewUrl(upload: AttachmentUploadView): string | null {
  return localAttachmentAssetsByUploadId.value[upload.uploadId]?.previewUrl ?? null;
}

function attachmentDownloadLabel(upload: AttachmentUploadView): string {
  return `Download ${attachmentDisplayName(upload)}`;
}

function attachmentHasDownload(upload: AttachmentUploadView): boolean {
  return Boolean(localAttachmentAssetsByUploadId.value[upload.uploadId]?.downloadUrl);
}

function attachmentPreviewKind(contentType: string): 'image' | 'pdf' | 'file' {
  if (contentType.startsWith('image/')) {
    return 'image';
  }

  if (contentType === 'application/pdf') {
    return 'pdf';
  }

  return 'file';
}

function registerUploadAsset(uploadId: string, file: File) {
  const downloadUrl = createTrackedObjectUrl(file);
  const nextAsset: LocalAttachmentAsset = {
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    previewUrl: previewUrlForContentType(file.type || 'application/octet-stream', downloadUrl),
    downloadUrl,
  };

  localAttachmentAssetsByUploadId.value = {
    ...localAttachmentAssetsByUploadId.value,
    [uploadId]: nextAsset,
  };
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.target = '_blank';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function downloadQueuedAttachment(attachment: PendingAttachmentDraft) {
  triggerDownload(attachment.downloadUrl, attachment.name);
}

function downloadUpload(upload: AttachmentUploadView) {
  const asset = localAttachmentAssetsByUploadId.value[upload.uploadId];
  if (!asset?.downloadUrl) {
    showToast('Download unavailable for this attachment');
    return;
  }

  triggerDownload(asset.downloadUrl, asset.name);
}

function queuedAttachmentDraft(file: File): PendingAttachmentDraft {
  const downloadUrl = createTrackedObjectUrl(file);
  return {
    id: `${file.name}:${file.size}:${file.lastModified}:${Date.now()}`,
    file,
    name: file.name,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
    previewUrl: previewUrlForContentType(file.type || 'application/octet-stream', downloadUrl),
    downloadUrl,
  };
}

function normalizedVaultQuery(overrides: {
  scope?: VaultScope;
  type?: VaultTypeFilter;
  folder?: string;
  q?: string;
}) {
  const nextScope = overrides.scope ?? scope.value;
  const nextType = overrides.type ?? typeFilter.value;
  const nextFolder = nextScope === 'all' ? (overrides.folder ?? folderFilter.value) : 'all';
  const nextSearch = (overrides.q ?? searchFilter.value).trim();

  return {
    scope: nextScope,
    type: nextType,
    folder: nextFolder,
    q: nextSearch.length > 0 ? nextSearch : undefined,
  };
}

function vaultRoute(
  path: string,
  overrides: { scope?: VaultScope; type?: VaultTypeFilter; folder?: string; q?: string } = {},
) {
  return {
    path,
    query: normalizedVaultQuery(overrides),
  };
}

function syncViewport() {
  isMobileViewport.value = mobileQuery?.matches ?? false;
  isCompactDesktopViewport.value = compactDesktopQuery?.matches ?? false;
  if (!isMobileViewport.value) {
    mobileFilterSheetOpen.value = false;
    mobileCreateSheetOpen.value = false;
    mobileAccountSheetOpen.value = false;
    mobileDetailActionSheetOpen.value = false;
  }
}

function closeMobileSheets() {
  mobileFilterSheetOpen.value = false;
  mobileCreateSheetOpen.value = false;
  mobileAccountSheetOpen.value = false;
  mobileDetailActionSheetOpen.value = false;
}

function openMobileFilterSheet() {
  mobileCreateSheetOpen.value = false;
  mobileAccountSheetOpen.value = false;
  mobileDetailActionSheetOpen.value = false;
  mobileFilterSheetOpen.value = true;
}

function openMobileCreateSheet() {
  mobileFilterSheetOpen.value = false;
  mobileAccountSheetOpen.value = false;
  mobileDetailActionSheetOpen.value = false;
  mobileCreateSheetOpen.value = true;
}

function openMobileAccountSheet() {
  mobileFilterSheetOpen.value = false;
  mobileCreateSheetOpen.value = false;
  mobileDetailActionSheetOpen.value = false;
  mobileAccountSheetOpen.value = true;
}

function applyScopeFilter(nextScope: VaultScope) {
  void navigateTo(vaultRoute('/vault', { scope: nextScope }));
}

function applyTypeFilter(nextType: VaultTypeFilter) {
  void navigateTo(vaultRoute('/vault', { type: nextType }));
}

function applyFolderFilter(nextFolder: string) {
  void navigateTo(vaultRoute('/vault', { folder: nextFolder }));
}

function clearFiltersAndSearch(options: { closeSheets?: boolean } = {}) {
  void navigateTo(
    vaultRoute('/vault', {
      scope: 'all',
      type: 'all',
      folder: 'all',
      q: '',
    }),
  );
  if (options.closeSheets ?? true) {
    closeMobileSheets();
  }
}

async function lockNowFromVault() {
  sessionStore.lock();
  closeMobileSheets();
  await router.push(sessionStore.state.username ? '/unlock' : '/auth');
}

async function openSettingsFromVault() {
  closeMobileSheets();
  await router.push('/settings');
}

async function openAdminFromVault() {
  closeMobileSheets();
  await router.push('/admin/overview');
}

function openMobileDetailActionSheet() {
  mobileFilterSheetOpen.value = false;
  mobileCreateSheetOpen.value = false;
  mobileAccountSheetOpen.value = false;
  mobileDetailActionSheetOpen.value = true;
}

async function moveCurrentToTrashFromSheet() {
  closeMobileSheets();
  await moveCurrentToTrash();
}

async function openCurrentEditorFromSheet() {
  if (!selectedItemInContext.value) {
    return;
  }

  closeMobileSheets();
  await navigateTo(vaultRoute(`/vault/item/${selectedItemInContext.value.itemId}/edit`));
}

function blankLoginDraft(): LoginVaultItemPayload {
  return {
    title: '',
    username: '',
    password: '',
    urls: [],
    notes: '',
    customFields: [],
  };
}

function blankDocumentDraft(): DocumentVaultItemPayload {
  return {
    title: '',
    content: '',
    customFields: [],
  };
}

function blankCardDraft(): CardVaultItemPayload {
  return {
    title: '',
    cardholderName: '',
    brand: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    securityCode: '',
    notes: '',
    customFields: [],
  };
}

function blankSecureNoteDraft(): SecureNoteVaultItemPayload {
  return {
    title: '',
    content: '',
    customFields: [],
  };
}

function normalizeCustomFields(fields: unknown): VaultCustomField[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.map((field) => {
    const candidate = field as Partial<VaultCustomField>;
    return {
      label: typeof candidate.label === 'string' ? candidate.label : '',
      value: typeof candidate.value === 'string' ? candidate.value : '',
    };
  });
}

function compactCustomFields(fields: unknown): VaultCustomField[] {
  return normalizeCustomFields(fields).filter(
    (field) => field.label.trim().length > 0 || field.value.trim().length > 0,
  );
}

function assignLoginDraft(payload: LoginVaultItemPayload) {
  loginDraft.title = payload.title;
  loginDraft.username = payload.username;
  loginDraft.password = payload.password;
  loginDraft.urls = [...payload.urls];
  loginDraft.notes = payload.notes;
  loginDraft.customFields = normalizeCustomFields(payload.customFields);
}

function assignDocumentDraft(payload: DocumentVaultItemPayload) {
  documentDraft.title = payload.title;
  documentDraft.content = payload.content;
  documentDraft.customFields = normalizeCustomFields(payload.customFields);
}

function assignCardDraft(payload: CardVaultItemPayload) {
  cardDraft.title = payload.title;
  cardDraft.cardholderName = payload.cardholderName;
  cardDraft.brand = payload.brand;
  cardDraft.number = payload.number;
  cardDraft.expiryMonth = payload.expiryMonth;
  cardDraft.expiryYear = payload.expiryYear;
  cardDraft.securityCode = payload.securityCode;
  cardDraft.notes = payload.notes;
  cardDraft.customFields = normalizeCustomFields(payload.customFields);
}

function assignSecureNoteDraft(payload: SecureNoteVaultItemPayload) {
  secureNoteDraft.title = payload.title;
  secureNoteDraft.content = payload.content;
  secureNoteDraft.customFields = normalizeCustomFields(payload.customFields);
}

function buildLoginPayloadForSave(): LoginVaultItemPayload {
  return {
    title: loginDraft.title,
    username: loginDraft.username,
    password: loginDraft.password,
    urls: [...loginDraft.urls],
    notes: loginDraft.notes,
    customFields: compactCustomFields(loginDraft.customFields),
  };
}

function buildDocumentPayloadForSave(): DocumentVaultItemPayload {
  return {
    title: documentDraft.title,
    content: documentDraft.content,
    customFields: compactCustomFields(documentDraft.customFields),
  };
}

function buildCardPayloadForSave(): CardVaultItemPayload {
  return {
    title: cardDraft.title,
    cardholderName: cardDraft.cardholderName,
    brand: cardDraft.brand,
    number: cardDraft.number,
    expiryMonth: cardDraft.expiryMonth,
    expiryYear: cardDraft.expiryYear,
    securityCode: cardDraft.securityCode,
    notes: cardDraft.notes,
    customFields: compactCustomFields(cardDraft.customFields),
  };
}

function buildSecureNotePayloadForSave(): SecureNoteVaultItemPayload {
  return {
    title: secureNoteDraft.title,
    content: secureNoteDraft.content,
    customFields: compactCustomFields(secureNoteDraft.customFields),
  };
}

function activeEditorItemType(): VaultTypeFilter | null {
  if (isCreateLogin.value) return 'login';
  if (isCreateDocument.value) return 'document';
  if (isCreateCard.value) return 'card';
  if (isCreateSecureNote.value) return 'secure_note';
  if (isEditing.value && selectedItem.value) return selectedItem.value.itemType;
  return null;
}

function getEditorTitle(): string {
  const type = activeEditorItemType();
  if (type === 'login') return loginDraft.title;
  if (type === 'document') return documentDraft.title;
  if (type === 'card') return cardDraft.title;
  if (type === 'secure_note') return secureNoteDraft.title;
  return '';
}

function setEditorTitle(value: string) {
  const type = activeEditorItemType();
  if (type === 'login') {
    loginDraft.title = value;
  } else if (type === 'document') {
    documentDraft.title = value;
  } else if (type === 'card') {
    cardDraft.title = value;
  } else if (type === 'secure_note') {
    secureNoteDraft.title = value;
  }
  setDirty();
}

function getEditorCustomFields(): VaultCustomField[] {
  const type = activeEditorItemType();
  if (type === 'login') return loginDraft.customFields;
  if (type === 'document') return documentDraft.customFields;
  if (type === 'card') return cardDraft.customFields;
  if (type === 'secure_note') return secureNoteDraft.customFields;
  return [];
}

function setEditorCustomFields(fields: VaultCustomField[]) {
  const normalized = normalizeCustomFields(fields);
  const type = activeEditorItemType();
  if (type === 'login') {
    loginDraft.customFields = normalized;
  } else if (type === 'document') {
    documentDraft.customFields = normalized;
  } else if (type === 'card') {
    cardDraft.customFields = normalized;
  } else if (type === 'secure_note') {
    secureNoteDraft.customFields = normalized;
  }
}

const editorCustomFields = computed(() => getEditorCustomFields());
const editorTitle = computed({
  get: getEditorTitle,
  set: setEditorTitle,
});

function addEditorCustomField() {
  const fields = [...getEditorCustomFields(), { label: '', value: '' }];
  setEditorCustomFields(fields);
  setDirty();
}

function updateEditorCustomField(index: number, key: keyof VaultCustomField, value: string) {
  const fields = getEditorCustomFields().map((field, fieldIndex) =>
    fieldIndex === index
      ? {
          ...field,
          [key]: value,
        }
      : field,
  );
  setEditorCustomFields(fields);
  setDirty();
}

function removeEditorCustomField(index: number) {
  const fields = getEditorCustomFields().filter((_, fieldIndex) => fieldIndex !== index);
  setEditorCustomFields(fields);
  setDirty();
}

function resolveDraftFolder(itemId: string | null): string {
  if (!itemId) {
    return folderFilter.value === 'all' ? '' : folderFilter.value;
  }

  return folderFor(itemId) ?? '';
}

function syncDraftFromRoute() {
  if (isCreateLogin.value) {
    const key = 'new-login';
    if (activeEditorKey.value !== key) {
      assignLoginDraft(blankLoginDraft());
      loginDraftFolderId.value = resolveDraftFolder(null);
      pendingDraftAttachments.value = [];
      attachmentError.value = null;
      dirty.value = false;
      baseRevisionAtEditStart.value = null;
      hasExternalUpdate.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  if (isCreateDocument.value) {
    const key = 'new-document';
    if (activeEditorKey.value !== key) {
      assignDocumentDraft(blankDocumentDraft());
      documentDraftFolderId.value = resolveDraftFolder(null);
      pendingDraftAttachments.value = [];
      attachmentError.value = null;
      dirty.value = false;
      baseRevisionAtEditStart.value = null;
      hasExternalUpdate.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  if (isCreateCard.value) {
    const key = 'new-card';
    if (activeEditorKey.value !== key) {
      assignCardDraft(blankCardDraft());
      cardDraftFolderId.value = resolveDraftFolder(null);
      pendingDraftAttachments.value = [];
      attachmentError.value = null;
      dirty.value = false;
      baseRevisionAtEditStart.value = null;
      hasExternalUpdate.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  if (isCreateSecureNote.value) {
    const key = 'new-secure-note';
    if (activeEditorKey.value !== key) {
      assignSecureNoteDraft(blankSecureNoteDraft());
      secureNoteDraftFolderId.value = resolveDraftFolder(null);
      pendingDraftAttachments.value = [];
      attachmentError.value = null;
      dirty.value = false;
      baseRevisionAtEditStart.value = null;
      hasExternalUpdate.value = false;
      activeEditorKey.value = key;
    }
    return;
  }

  if (isEditing.value && selectedItem.value) {
    const key = `edit:${selectedItem.value.itemId}`;
    if (activeEditorKey.value !== key) {
      if (selectedItem.value.itemType === 'login') {
        assignLoginDraft(selectedItem.value.payload);
        loginDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else if (selectedItem.value.itemType === 'document') {
        assignDocumentDraft(selectedItem.value.payload);
        documentDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else if (selectedItem.value.itemType === 'card') {
        assignCardDraft(selectedItem.value.payload);
        cardDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else {
        assignSecureNoteDraft(selectedItem.value.payload);
        secureNoteDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      }
      pendingDraftAttachments.value = [];
      attachmentError.value = null;
      dirty.value = false;
      baseRevisionAtEditStart.value = selectedItem.value.revision;
      hasExternalUpdate.value = false;
      activeEditorKey.value = key;
      return;
    }

    if (
      baseRevisionAtEditStart.value !== null &&
      baseRevisionAtEditStart.value !== selectedItem.value.revision
    ) {
      if (dirty.value) {
        hasExternalUpdate.value = true;
        return;
      }

      if (selectedItem.value.itemType === 'login') {
        assignLoginDraft(selectedItem.value.payload);
        loginDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else if (selectedItem.value.itemType === 'document') {
        assignDocumentDraft(selectedItem.value.payload);
        documentDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else if (selectedItem.value.itemType === 'card') {
        assignCardDraft(selectedItem.value.payload);
        cardDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      } else {
        assignSecureNoteDraft(selectedItem.value.payload);
        secureNoteDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
      }
      baseRevisionAtEditStart.value = selectedItem.value.revision;
      hasExternalUpdate.value = false;
    }
    return;
  }

  if (isEditing.value && !selectedItem.value && dirty.value) {
    hasExternalUpdate.value = true;
    return;
  }

  activeEditorKey.value = null;
  dirty.value = false;
  baseRevisionAtEditStart.value = null;
  hasExternalUpdate.value = false;
}

watch(
  () => [route.fullPath, selectedItem.value?.revision] as const,
  () => {
    syncDraftFromRoute();
  },
  { immediate: true },
);

watch(
  () => sessionStore.state.username,
  () => {
    refreshUiState();
    refreshManualSiteIcons();
  },
  { immediate: true },
);

watch(
  () => searchFilter.value,
  (value) => {
    if (searchQuery.value !== value) {
      searchQuery.value = value;
    }
    workspace.setSearchQuery(value);
  },
  { immediate: true },
);

watch(
  () => route.path,
  () => {
    closeMobileSheets();
    closeToolbarPasswordGenerator();
    closeLoginPasswordGenerator();
    loginPasswordFieldFocused.value = false;
  },
);

watch(
  () => iconHydrationHosts.value,
  (hosts) => {
    void hydrateCanonicalSiteIconsForHosts(hosts);
  },
  { immediate: true },
);

watch(
  () => [selectedAttachmentItem.value?.itemId ?? null, isTrashContext.value] as const,
  async ([itemId, trash]) => {
    if (!itemId || trash) {
      attachmentError.value = null;
      return;
    }
    await loadAttachmentUploads(itemId);
  },
  { immediate: true },
);

let unsubscribeUiState: (() => void) | null = null;

function setDirty() {
  if (isCreateRoute.value || isEditing.value) {
    dirty.value = true;
  }
}

function reloadLatestAfterConflict() {
  if (!isEditing.value || !selectedItem.value) {
    return;
  }
  if (selectedItem.value.itemType === 'login') {
    assignLoginDraft(selectedItem.value.payload);
    loginDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
  } else if (selectedItem.value.itemType === 'document') {
    assignDocumentDraft(selectedItem.value.payload);
    documentDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
  } else if (selectedItem.value.itemType === 'card') {
    assignCardDraft(selectedItem.value.payload);
    cardDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
  } else {
    assignSecureNoteDraft(selectedItem.value.payload);
    secureNoteDraftFolderId.value = resolveDraftFolder(selectedItem.value.itemId);
  }
  dirty.value = false;
  hasExternalUpdate.value = false;
  baseRevisionAtEditStart.value = selectedItem.value.revision;
  errorMessage.value = null;
}

function setSearchQuery(value: string) {
  searchQuery.value = value;
  workspace.setSearchQuery(value);
  const target = {
    path: route.path,
    query: normalizedVaultQuery({ q: value }),
  };
  const current = router.resolve({
    path: route.path,
    query: route.query,
  }).fullPath;
  const next = router.resolve(target).fullPath;
  if (next !== current) {
    void router.replace(target);
  }
}

function showToast(message: string) {
  toastMessage.value = message;
  window.setTimeout(() => {
    if (toastMessage.value === message) {
      toastMessage.value = '';
    }
  }, 1400);
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    }
    showToast('Copied');
  } catch {
    showToast('Copied');
  }
}

function toggleFavorite(itemId: string) {
  commitUiState((draft) => {
    const exists = draft.favorites.includes(itemId);
    draft.favorites = exists
      ? draft.favorites.filter((current) => current !== itemId)
      : [...draft.favorites, itemId];
  });
}

function assignItemFolder(itemId: string, folderId: string | null) {
  commitUiState((draft) => {
    draft.folderAssignments[itemId] = folderId;
  });
}

function clearItemFromUiState(itemId: string) {
  commitUiState((draft) => {
    draft.favorites = draft.favorites.filter((current) => current !== itemId);
    delete draft.folderAssignments[itemId];
  });
}

function openUrl(url: string | undefined) {
  if (!url) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    showToast('Invalid or unsafe URL');
    return;
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    showToast('Invalid or unsafe URL');
    return;
  }

  window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
}

function manualIconErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'icon_host_invalid':
      return 'Host is invalid. Use a valid domain URL.';
    case 'icon_mime_not_allowed':
      return 'Icon format is not allowed. Use PNG, JPG, WEBP, or ICO.';
    case 'icon_size_limit_exceeded':
      return 'Icon is too large. Maximum is 1MB.';
    case 'icon_image_decode_failed':
      return 'Could not read this image file.';
    case 'icon_data_invalid':
      return 'Icon data is invalid after normalization.';
    default:
      return toHumanErrorMessage(error);
  }
}

function openDetailIconPicker() {
  if (!canEditDetailIcon.value || detailIconUploadBusy.value) {
    return;
  }
  detailIconFileInput.value?.click();
}

function clearDetailIconPickerInput() {
  if (detailIconFileInput.value) {
    detailIconFileInput.value.value = '';
  }
}

async function onDetailIconFileSelected(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0] ?? null;
  if (!file) {
    return;
  }
  const host = detailIconEditableHost.value;
  if (!host) {
    clearDetailIconPickerInput();
    showToast('Icon editing is only available for login items with URL.');
    return;
  }

  detailIconUploadBusy.value = true;
  errorMessage.value = null;
  try {
    const dataUrl = await importManualSiteIconFromFile(file);
    const updatedAt = new Date().toISOString();
    await sessionStore.upsertManualSiteIcon({
      domain: host,
      dataUrl,
      source: 'file',
    });

    manualSiteIconsByHost.value = {
      ...manualSiteIconsByHost.value,
      [host]: {
        dataUrl,
        source: 'file',
        updatedAt,
      },
    };
    canonicalSiteIconsByHost.value = {
      ...canonicalSiteIconsByHost.value,
      [host]: {
        dataUrl,
        source: 'manual',
        sourceUrl: null,
        updatedAt,
      },
    };
    faviconSourceIndexByItemAndHost.value = {};
    showToast(`Icon updated for ${host}`);
  } catch (error) {
    errorMessage.value = manualIconErrorMessage(error);
  } finally {
    detailIconUploadBusy.value = false;
    clearDetailIconPickerInput();
  }
}

function pendingEditorExitTarget(): RouteLocationRaw {
  if (isEditing.value && selectedItemId.value) {
    return vaultRoute(`/vault/item/${selectedItemId.value}`);
  }

  return vaultRoute('/vault');
}

function isEditorRoute(path: string) {
  return (
    path === '/vault/new/login' ||
    path === '/vault/new/document' ||
    path === '/vault/new/card' ||
    path === '/vault/new/secure-note' ||
    path.endsWith('/edit')
  );
}

function queueDiscard(target: string) {
  pendingNavigation.value = target;
  discardDialogOpen.value = true;
}

async function navigateTo(target: RouteLocationRaw) {
  const targetPath = router.resolve(target).fullPath;

  if ((isCreateRoute.value || isEditing.value) && dirty.value) {
    queueDiscard(targetPath);
    return;
  }

  await router.push(target);
}

async function cancelEditor() {
  await navigateTo(pendingEditorExitTarget());
}

function closeDiscardDialog() {
  discardDialogOpen.value = false;
  pendingNavigation.value = null;
}

async function discardChanges() {
  const target = pendingNavigation.value ?? router.resolve(pendingEditorExitTarget()).fullPath;
  discardDialogOpen.value = false;
  pendingNavigation.value = null;
  dirty.value = false;
  await router.push(target);
}

function onDropdownSelect(value: string) {
  const safeScope: VaultScope = scope.value === 'trash' ? 'all' : scope.value;
  let path = '/vault/new/login';
  if (value === 'new-document') {
    path = '/vault/new/document';
  } else if (value === 'new-card') {
    path = '/vault/new/card';
  } else if (value === 'new-secure-note') {
    path = '/vault/new/secure-note';
  }

  void navigateTo(
    vaultRoute(path, {
      scope: safeScope,
    }),
  );
  closeMobileSheets();
}

function metaLine(item: VaultWorkspaceItem) {
  if (item.itemType === 'login') {
    return item.payload.username || item.payload.urls[0] || 'Login';
  }
  if (item.itemType === 'card') {
    const last4 = item.payload.number.trim().slice(-4);
    return `${item.payload.brand || 'Card'}${last4 ? ` •••• ${last4}` : ''}`;
  }

  const preview = item.payload.content.replace(/\s+/g, ' ').trim();
  if (preview.length === 0) {
    return item.itemType === 'document' ? 'Document' : 'Secure note';
  }

  return preview.length > 44 ? `${preview.slice(0, 44)}...` : preview;
}

function trashTitle(itemType: VaultWorkspaceTombstone['itemType']): string {
  if (itemType === 'login') return 'Deleted login item';
  if (itemType === 'document') return 'Deleted document';
  if (itemType === 'card') return 'Deleted card';
  return 'Deleted secure note';
}

function trashMonogram(itemType: VaultWorkspaceTombstone['itemType']): string {
  if (itemType === 'login') return 'L';
  if (itemType === 'document') return 'D';
  if (itemType === 'card') return 'C';
  return 'S';
}

function trashMetaLine(input: {
  itemType: VaultWorkspaceTombstone['itemType'];
  itemId: string;
  deletedAt: string;
}): string {
  const deletedLabel = trashDeletedAtLabel(input.deletedAt);
  return `${input.itemId} · Deleted ${deletedLabel}`;
}

function trashDeletedAtLabel(deletedAtIso: string): string {
  const deletedAt = new Date(deletedAtIso);
  return Number.isNaN(deletedAt.getTime())
    ? deletedAtIso
    : deletedAt.toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function rowRoute(itemId: string) {
  return vaultRoute(`/vault/item/${itemId}`);
}

function onItemRowClick(itemId: string) {
  if (isDetailRoute.value && selectedItemId.value === itemId) {
    void navigateTo(vaultRoute('/vault'));
    return;
  }

  void navigateTo(rowRoute(itemId));
}

function onTrashRowClick(itemId: string) {
  if (isDetailRoute.value && selectedItemId.value === itemId) {
    void navigateTo(vaultRoute('/vault', { scope: 'trash' }));
    return;
  }

  void navigateTo(vaultRoute(`/vault/item/${itemId}`, { scope: 'trash' }));
}

function itemMonogram(item: VaultWorkspaceItem): string {
  const title = item.payload.title.trim();
  if (title.length === 0) {
    if (item.itemType === 'login') return 'L';
    if (item.itemType === 'document') return 'D';
    if (item.itemType === 'card') return 'C';
    return 'S';
  }

  const [first, second] = title.split(/\s+/);
  if (second) {
    return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
  }

  return (first[0] ?? '•').toUpperCase();
}

function monogramFromText(value: string, fallback: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fallback;
  }

  const [first, second] = normalized.split(/\s+/);
  if (second) {
    return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
  }

  return (first[0] ?? fallback).toUpperCase();
}

function normalizeUrlForFavicon(url: string): string | null {
  if (!url || url.trim().length === 0) {
    return null;
  }

  try {
    const clean = url.trim();
    const parsed = new URL(clean.includes('://') ? clean : `https://${clean}`);
    if (!parsed.hostname) {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
}

function setCanonicalSiteIcons(
  icons: Array<{ domain: string; dataUrl: string; source: 'manual' | 'automatic'; sourceUrl: string | null; updatedAt: string }>,
) {
  if (!Array.isArray(icons) || icons.length === 0) {
    return;
  }
  const next = { ...canonicalSiteIconsByHost.value };
  for (const icon of icons) {
    const safeHost = normalizeUrlForFavicon(icon.domain);
    if (!safeHost || typeof icon.dataUrl !== 'string' || icon.dataUrl.length < 32) {
      continue;
    }
    next[safeHost] = {
      dataUrl: icon.dataUrl,
      source: icon.source,
      sourceUrl: icon.sourceUrl,
      updatedAt: icon.updatedAt,
    };
  }
  canonicalSiteIconsByHost.value = next;
}

function loginHostsForItems(items: VaultWorkspaceItem[]): string[] {
  const hosts = new Set<string>();
  for (const item of items) {
    if (item.itemType !== 'login') {
      continue;
    }
    const host = normalizeUrlForFavicon(item.payload.urls[0] ?? '');
    if (host) {
      hosts.add(host);
    }
  }
  return Array.from(hosts).sort((left, right) => left.localeCompare(right));
}

async function hydrateCanonicalSiteIconsForHosts(hosts: string[]) {
  if (hosts.length === 0) {
    return;
  }
  const requestNonce = ++iconHydrationNonce;
  try {
    const resolved = await sessionStore.resolveSiteIcons({
      domains: hosts,
    });
    if (requestNonce !== iconHydrationNonce) {
      return;
    }
    setCanonicalSiteIcons(resolved.icons);

    const knownHosts = new Set(resolved.icons.map((entry) => normalizeUrlForFavicon(entry.domain)).filter((entry): entry is string => Boolean(entry)));
    const now = Date.now();
    const discoverTargets = hosts.filter((host) => {
      if (knownHosts.has(host)) {
        return false;
      }
      const lastAttempt = iconDiscoveryCooldownByHost.value[host] ?? 0;
      return now - lastAttempt > 15 * 60 * 1000;
    });
    if (discoverTargets.length === 0) {
      return;
    }

    iconDiscoveryCooldownByHost.value = {
      ...iconDiscoveryCooldownByHost.value,
      ...Object.fromEntries(discoverTargets.map((host) => [host, now])),
    };
    const discovered = await sessionStore.discoverSiteIcons({
      domains: discoverTargets,
      forceRefresh: false,
    });
    if (requestNonce !== iconHydrationNonce) {
      return;
    }
    setCanonicalSiteIcons(discovered.icons);
  } catch {
    // Keep placeholder/legacy fallback when icon resolution fails.
  }
}

function loginFaviconCandidates(url: string | undefined): string[] {
  const hostname = normalizeUrlForFavicon(url ?? '');
  if (!hostname) {
    return [];
  }
  const canonicalIcon = canonicalSiteIconsByHost.value[hostname]?.dataUrl ?? null;
  if (canonicalIcon) {
    return [canonicalIcon];
  }
  const manualIcon = manualSiteIconsByHost.value[hostname]?.dataUrl ?? null;
  return manualIcon ? [manualIcon] : [];
}

function faviconKey(itemId: string, url: string | undefined): string | null {
  const hostname = normalizeUrlForFavicon(url ?? '');
  if (!hostname) {
    return null;
  }

  return `${itemId}:${hostname}`;
}

function itemFaviconUrl(item: VaultWorkspaceItem): string | null {
  if (item.itemType !== 'login') {
    return null;
  }
  const candidates = loginFaviconCandidates(item.payload.urls[0]);
  if (candidates.length === 0) {
    return null;
  }
  const key = faviconKey(item.itemId, item.payload.urls[0]);
  if (!key) {
    return null;
  }

  const currentIndex = faviconSourceIndexByItemAndHost.value[key] ?? 0;
  if (currentIndex >= candidates.length) {
    return null;
  }
  return candidates[currentIndex] ?? null;
}

function markFaviconError(item: VaultWorkspaceItem) {
  if (item.itemType !== 'login') {
    return;
  }

  const key = faviconKey(item.itemId, item.payload.urls[0]);
  if (!key) {
    return;
  }

  faviconSourceIndexByItemAndHost.value = {
    ...faviconSourceIndexByItemAndHost.value,
    [key]: (faviconSourceIndexByItemAndHost.value[key] ?? 0) + 1,
  };
}

function hasValue(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function filledCustomFields(fields: VaultCustomField[] | undefined): VaultCustomField[] {
  return (fields ?? []).filter((field) => hasValue(field.value));
}

function detailCustomFields(item: VaultWorkspaceItem | null): VaultCustomField[] {
  if (!item) {
    return [];
  }

  return filledCustomFields(item.payload.customFields);
}

async function uploadQueuedDraftAttachments(itemId: string, itemLabel: string) {
  attachmentBusy.value = true;
  let failedUploads = 0;
  let firstUploadError: string | null = null;
  const queuedAttachments = [...pendingDraftAttachments.value];
  pendingDraftAttachments.value = [];

  for (const attachment of queuedAttachments) {
    try {
      await uploadAttachmentFile(attachment.file, itemId);
    } catch (error) {
      failedUploads += 1;
      if (!firstUploadError) {
        firstUploadError = toHumanErrorMessage(error);
      }
    }
  }

  attachmentBusy.value = false;

  if (failedUploads > 0) {
    attachmentError.value = `${itemLabel} saved, but attachment upload failed: ${firstUploadError}`;
  } else if (queuedAttachments.length > 0) {
    showToast('Attachment uploaded');
  }

  await loadAttachmentUploads(itemId);
}

async function saveCurrent() {
  errorMessage.value = null;
  busyAction.value = 'save';

  try {
    if (isCreateLogin.value) {
      await workspace.createLogin(buildLoginPayloadForSave());
      const createdItemId = workspace.state.items.at(-1)?.itemId;
      if (createdItemId) {
        assignItemFolder(createdItemId, loginDraftFolderId.value || null);
      }
      dirty.value = false;
      if (createdItemId) {
        if (pendingDraftAttachments.value.length > 0) {
          await uploadQueuedDraftAttachments(createdItemId, 'Login');
        }
        await router.push(vaultRoute(`/vault/item/${createdItemId}`));
      } else {
        await router.push(vaultRoute('/vault'));
      }
      return;
    }

    if (isCreateDocument.value) {
      const documentPayload = buildDocumentPayloadForSave();
      await workspace.createDocument(documentPayload);
      const createdItemId = workspace.state.items.at(-1)?.itemId;
      if (createdItemId) {
        assignItemFolder(createdItemId, documentDraftFolderId.value || null);
      }
      dirty.value = false;
      if (createdItemId) {
        if (pendingDraftAttachments.value.length > 0) {
          await uploadQueuedDraftAttachments(createdItemId, 'Document');
        }
        await router.push(vaultRoute(`/vault/item/${createdItemId}`));
      } else {
        await router.push(vaultRoute('/vault'));
      }
      return;
    }

    if (isCreateCard.value) {
      await workspace.createCard(buildCardPayloadForSave());
      const createdItemId = workspace.state.items.at(-1)?.itemId;
      if (createdItemId) {
        assignItemFolder(createdItemId, cardDraftFolderId.value || null);
      }
      dirty.value = false;
      if (createdItemId) {
        if (pendingDraftAttachments.value.length > 0) {
          await uploadQueuedDraftAttachments(createdItemId, 'Card');
        }
        await router.push(vaultRoute(`/vault/item/${createdItemId}`));
      } else {
        await router.push(vaultRoute('/vault'));
      }
      return;
    }

    if (isCreateSecureNote.value) {
      await workspace.createSecureNote(buildSecureNotePayloadForSave());
      const createdItemId = workspace.state.items.at(-1)?.itemId;
      if (createdItemId) {
        assignItemFolder(createdItemId, secureNoteDraftFolderId.value || null);
      }
      dirty.value = false;
      if (createdItemId) {
        if (pendingDraftAttachments.value.length > 0) {
          await uploadQueuedDraftAttachments(createdItemId, 'Secure note');
        }
        await router.push(vaultRoute(`/vault/item/${createdItemId}`));
      } else {
        await router.push(vaultRoute('/vault'));
      }
      return;
    }

    if (isEditing.value && selectedItem.value) {
      const expectedRevision = baseRevisionAtEditStart.value ?? selectedItem.value.revision;
      let nextItem: VaultWorkspaceItem;
      let targetFolder: string | null = null;
      if (selectedItem.value.itemType === 'login') {
        nextItem = {
          ...selectedItem.value,
          revision: expectedRevision,
          payload: buildLoginPayloadForSave(),
        };
        targetFolder = loginDraftFolderId.value || null;
      } else if (selectedItem.value.itemType === 'document') {
        nextItem = {
          ...selectedItem.value,
          revision: expectedRevision,
          payload: buildDocumentPayloadForSave(),
        };
        targetFolder = documentDraftFolderId.value || null;
      } else if (selectedItem.value.itemType === 'card') {
        nextItem = {
          ...selectedItem.value,
          revision: expectedRevision,
          payload: buildCardPayloadForSave(),
        };
        targetFolder = cardDraftFolderId.value || null;
      } else {
        nextItem = {
          ...selectedItem.value,
          revision: expectedRevision,
          payload: buildSecureNotePayloadForSave(),
        };
        targetFolder = secureNoteDraftFolderId.value || null;
      }
      await workspace.updateItem(nextItem);
      assignItemFolder(selectedItem.value.itemId, targetFolder);
      if (pendingDraftAttachments.value.length > 0) {
        await uploadQueuedDraftAttachments(selectedItem.value.itemId, 'Item');
      }
      dirty.value = false;
      await router.push(vaultRoute(`/vault/item/${selectedItem.value.itemId}`));
    }
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
    const message = errorMessage.value.toLowerCase();
    if (message.includes('revision_conflict')) {
      hasExternalUpdate.value = true;
      void workspace.triggerSync('conflict_reconcile').catch(() => undefined);
    }
    if (message.includes('item_deleted_conflict')) {
      hasExternalUpdate.value = true;
      void workspace.triggerSync('conflict_reconcile').catch(() => undefined);
      void router.push(vaultRoute('/vault', { scope: 'trash' }));
    }
  } finally {
    busyAction.value = null;
  }
}

async function moveCurrentToTrash() {
  if (!selectedItem.value) {
    return;
  }

  busyAction.value = 'trash';

  try {
    await workspace.deleteItem(selectedItem.value.itemId);
    clearItemFromUiState(selectedItem.value.itemId);
    showToast('Moved to Trash');
    dirty.value = false;
    await router.push(vaultRoute('/vault', { scope: 'trash' }));
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function restoreCurrentItem() {
  if (!selectedTrashEntry.value) {
    return;
  }

  busyAction.value = 'trash';
  try {
    await workspace.restoreItem(selectedTrashEntry.value.itemId);
    showToast('Restored');
    await router.push(vaultRoute(`/vault/item/${selectedTrashEntry.value.itemId}`, { scope: 'all' }));
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function restoreFromRow(itemId: string) {
  busyAction.value = 'trash';
  try {
    await workspace.restoreItem(itemId);
    showToast('Restored');
    if (selectedItemId.value === itemId) {
      await router.push(vaultRoute(`/vault/item/${itemId}`, { scope: 'all' }));
    }
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function loadAttachmentUploads(itemId: string) {
  attachmentError.value = null;
  try {
    const response = await vaultClient.listAttachmentUploads(itemId);
    attachmentsByItemId.value = {
      ...attachmentsByItemId.value,
      [itemId]: response.uploads.map((upload) => ({ ...upload })),
    };
  } catch (error) {
    attachmentError.value = toHumanErrorMessage(error);
  }
}

function openAttachmentFilePicker() {
  if (isTrashContext.value) {
    return;
  }

  if (!isCreateRoute.value && !selectedAttachmentItem.value) {
    return;
  }

  attachmentInputRef.value?.click();
}

function buildAttachmentIdempotencyKey(file: File, itemId: string): string {
  return [
    'item-attachment',
    itemId,
    file.type || 'application/octet-stream',
    String(file.size),
    String(file.lastModified),
  ].join(':');
}

async function onAttachmentSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  if (isCreateRoute.value) {
    pendingDraftAttachments.value = [...pendingDraftAttachments.value, queuedAttachmentDraft(file)];
    setDirty();
    showToast('Attachment queued');
    target.value = '';
    return;
  }

  if (!selectedAttachmentItem.value || isTrashContext.value) {
    target.value = '';
    return;
  }

  attachmentBusy.value = true;
  attachmentError.value = null;
  const itemId = selectedAttachmentItem.value.itemId;

  try {
    await uploadAttachmentFile(file, itemId);
    await loadAttachmentUploads(itemId);
    showToast('Attachment uploaded');
  } catch (error) {
    attachmentError.value = toHumanErrorMessage(error);
  } finally {
    attachmentBusy.value = false;
    target.value = '';
  }
}

async function uploadAttachmentFile(file: File, itemId: string) {
  const initResponse = await vaultClient.initAttachmentUpload({
    itemId,
    fileName: file.name || `${itemId}.bin`,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    idempotencyKey: buildAttachmentIdempotencyKey(file, itemId),
  });
  const context = sessionStore.getUnlockedVaultContext();
  const encryptedEnvelope = await encryptAttachmentBlobPayload({
    accountKey: context.accountKey,
    plaintext: await file.arrayBuffer(),
    contentType: file.type || 'application/octet-stream',
  });
  await vaultClient.uploadAttachmentContent(initResponse.uploadId, {
    uploadToken: initResponse.uploadToken,
    encryptedEnvelope,
  });
  await vaultClient.finalizeAttachmentUpload(initResponse.uploadId, itemId);
  registerUploadAsset(initResponse.uploadId, file);
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const isEditableTarget =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);

  const focusSearchShortcut =
    (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget) ||
    ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey));

  if (focusSearchShortcut) {
    event.preventDefault();
    searchInputRef.value?.focus();
    return;
  }

  if (event.key === 'Escape') {
    if (
      mobileFilterSheetOpen.value ||
      mobileCreateSheetOpen.value ||
      mobileAccountSheetOpen.value ||
      mobileDetailActionSheetOpen.value
    ) {
      closeMobileSheets();
      return;
    }

    if (discardDialogOpen.value) {
      closeDiscardDialog();
      return;
    }

    if (isCreateRoute.value || isEditing.value) {
      event.preventDefault();
      void cancelEditor();
    }
  }
}

onBeforeRouteLeave((to) => {
  if ((isCreateRoute.value || isEditing.value) && dirty.value) {
    queueDiscard(to.fullPath);
    return false;
  }
  return undefined;
});

onBeforeRouteUpdate((to) => {
  if (
    (isCreateRoute.value || isEditing.value) &&
    dirty.value &&
    route.path !== to.path &&
    (isEditorRoute(route.path) || isEditorRoute(to.path) || to.path.startsWith('/vault'))
  ) {
    queueDiscard(to.fullPath);
    return false;
  }
  return undefined;
});

async function loadVault() {
  errorMessage.value = null;
  busyAction.value = 'load';
  try {
    await workspace.load();
  } catch (error) {
    errorMessage.value = toHumanErrorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

onMounted(() => {
  unsubscribeUiState = onVaultUiStateUpdated((detail) => {
    if (detail.username === (sessionStore.state.username ?? null)) {
      refreshUiState();
    }
  });

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mobileQuery = window.matchMedia('(max-width: 760px)');
    compactDesktopQuery = window.matchMedia('(max-width: 1365px)');
    syncViewport();
    mobileQuery.addEventListener('change', syncViewport);
    compactDesktopQuery.addEventListener('change', syncViewport);
  }

  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('focus', handleManualIconRefreshOnFocus);
  document.addEventListener('visibilitychange', handleManualIconRefreshOnVisibilityChange);
  refreshManualSiteIcons();
  void refreshManualSiteIconsFromServer({ force: true });
  void loadVault();
  workspace.startSync();
});

onBeforeUnmount(() => {
  workspace.stopSync();
  unsubscribeUiState?.();
  unsubscribeUiState = null;
  mobileQuery?.removeEventListener('change', syncViewport);
  compactDesktopQuery?.removeEventListener('change', syncViewport);
  mobileQuery = null;
  compactDesktopQuery = null;
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('focus', handleManualIconRefreshOnFocus);
  document.removeEventListener('visibilitychange', handleManualIconRefreshOnVisibilityChange);
  for (const objectUrl of attachmentObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  attachmentObjectUrls.clear();
});
</script>

<template>
  <section class="vault-page" :class="pageModeClass">
    <section class="vault-list-pane">
      <div v-if="isMobileViewport" class="mobile-vault-header" data-testid="vault-mobile-header">
        <h1>Vault</h1>
        <div class="mobile-vault-header__actions">
          <IconButton
            data-testid="vault-mobile-filter-button"
            type="button"
            label="Filters"
            @click="openMobileFilterSheet"
          >
            <AppIcon name="filter" :size="17" />
          </IconButton>
          <IconButton
            data-testid="vault-mobile-create-button"
            type="button"
            label="Create item"
            @click="openMobileCreateSheet"
          >
            <AppIcon name="plus" :size="17" />
          </IconButton>
          <IconButton
            data-testid="vault-mobile-password-generator-button"
            type="button"
            label="Password generator"
            @pointerdown.stop
            @click.stop="toggleToolbarPasswordGenerator"
          >
            <AppIcon name="login" :size="17" />
          </IconButton>
          <IconButton
            data-testid="vault-mobile-account-button"
            type="button"
            label="Account and session"
            @click="openMobileAccountSheet"
          >
            <AppIcon name="user" :size="17" />
          </IconButton>
        </div>
      </div>

      <div class="vault-list-toolbar">
        <SearchField
          ref="searchInputRef"
          v-model="searchQuery"
          test-id="vault-search-input"
          label="Search vault"
          placeholder="Search vault"
          @update:model-value="setSearchQuery"
        />
        <div v-if="!isMobileViewport" class="vault-list-toolbar__actions">
          <div class="vault-password-generator-toolbar">
            <IconButton
              type="button"
              label="Password generator"
              @pointerdown.stop
              @click.stop="toggleToolbarPasswordGenerator"
            >
              <AppIcon name="login" :size="17" />
            </IconButton>
          </div>
          <DropdownMenu
            label="New"
            icon-only
            :items="createOptions"
            @select="onDropdownSelect"
          />
        </div>
      </div>
      <PasswordGeneratorPopover
        v-if="toolbarPasswordGeneratorOpen"
        :class="[
          'vault-password-generator-toolbar__panel',
          { 'vault-password-generator-toolbar__panel--mobile': isMobileViewport },
        ]"
        :context-url="passwordGeneratorContextUrl"
        @close="closeToolbarPasswordGenerator"
      />

      <div
        v-if="activeFiltersSummary.length > 0"
        class="vault-active-summary"
        role="status"
        aria-live="polite"
      >
        <span v-for="segment in activeFiltersSummary" :key="segment" class="vault-active-summary__chip">
          {{ segment }}
        </span>
      </div>

      <InlineAlert v-if="surfaceError" tone="danger">
        {{ surfaceError }}
      </InlineAlert>

      <EmptyState
        v-if="listPaneEmpty"
        :title="listPaneEmptyTitle"
        :description="listPaneEmptyDescription"
      >
        <template #actions>
          <div class="vault-empty-create-grid">
            <button
              v-for="option in contextualCreateOptions"
              :key="`empty-create-${option.value}`"
              class="vault-empty-create-card"
              type="button"
              @click="onDropdownSelect(option.value)"
            >
              <span class="vault-empty-create-card__icon" aria-hidden="true">
                <AppIcon :name="option.icon" :size="18" />
              </span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </template>
      </EmptyState>

      <div v-else-if="isTrashContext" class="vault-list">
        <article
          v-for="entry in filteredTrashEntries"
          :key="entry.itemId"
          class="vault-list-row is-trash-row"
          :class="{ 'is-active': entry.itemId === selectedItemId }"
        >
          <button class="vault-list-row__main" type="button" @click="onTrashRowClick(entry.itemId)">
            <span class="vault-list-row__avatar" aria-hidden="true">
              {{ trashMonogram(entry.itemType) }}
            </span>
            <span class="vault-list-row__content">
              <span class="vault-list-row__title-line">
                <span class="vault-list-row__title">{{ trashTitle(entry.itemType) }}</span>
              </span>
              <span class="vault-list-row__meta">
                {{ trashMetaLine({ itemType: entry.itemType, itemId: entry.itemId, deletedAt: entry.deletedAt }) }}
              </span>
            </span>
          </button>
          <SecondaryButton type="button" :disabled="busyAction === 'trash'" @click="restoreFromRow(entry.itemId)">
            Restore
          </SecondaryButton>
        </article>
      </div>

      <div v-else class="vault-list">
        <article
          v-for="item in filteredItems"
          :key="item.itemId"
          class="vault-list-row"
          :class="{
            'is-active': item.itemId === selectedItemId,
            'is-document-row': item.itemType === 'document',
          }"
        >
          <button class="vault-list-row__main" type="button" @click="onItemRowClick(item.itemId)">
            <span class="vault-list-row__avatar" aria-hidden="true">
              <img
                v-if="itemFaviconUrl(item)"
                :src="itemFaviconUrl(item) ?? ''"
                :alt="`${item.payload.title} favicon`"
                loading="lazy"
                @error="markFaviconError(item)"
              />
              <template v-else>{{ itemMonogram(item) }}</template>
            </span>
            <span class="vault-list-row__content">
              <span class="vault-list-row__title-line">
                <span class="vault-list-row__title">{{ item.payload.title }}</span>
                <span
                  v-if="isMobileViewport && isFavorite(item.itemId)"
                  :data-testid="`vault-mobile-favorite-indicator-${item.itemId}`"
                  class="vault-list-row__favorite-indicator"
                  aria-label="Favorite item"
                >
                  <AppIcon name="favorites" :size="14" />
                </span>
              </span>
              <span class="vault-list-row__meta">{{ metaLine(item) }}</span>
            </span>
          </button>
          <IconButton
            class="vault-list-row__favorite"
            :class="{ 'is-favorited': isFavorite(item.itemId) }"
            type="button"
            :label="isFavorite(item.itemId) ? 'Remove favorite' : 'Add favorite'"
            @click="toggleFavorite(item.itemId)"
          >
            <AppIcon name="favorites" :size="18" />
          </IconButton>
        </article>
      </div>
    </section>

    <section class="vault-detail-pane">
      <div v-if="isMobileViewport && !isListRoute" class="mobile-surface-header">
        <SecondaryButton
          data-testid="vault-mobile-surface-back"
          type="button"
          @click="
            navigateTo(
              isCreateRoute || isEditing ? pendingEditorExitTarget() : vaultRoute('/vault'),
            )
          "
        >
          Back
        </SecondaryButton>
        <div v-if="isCreateRoute || isEditing" class="mobile-surface-header__actions">
          <PrimaryButton
            data-testid="vault-mobile-editor-save"
            type="button"
            :disabled="busyAction === 'save'"
            @click="saveCurrent"
          >
            {{ busyAction === 'save' ? 'Saving...' : 'Save' }}
          </PrimaryButton>
        </div>
        <div
          v-else-if="selectedItemInContext && !isTrashContext"
          class="mobile-surface-header__actions"
          data-testid="vault-mobile-detail-actions"
        >
          <IconButton
            data-testid="vault-mobile-detail-favorite"
            :class="{ 'is-favorited': isFavorite(selectedItemInContext.itemId) }"
            type="button"
            :label="isFavorite(selectedItemInContext.itemId) ? 'Remove favorite' : 'Add favorite'"
            @click="toggleFavorite(selectedItemInContext.itemId)"
          >
            <AppIcon name="favorites" :size="20" />
          </IconButton>
          <IconButton
            data-testid="vault-mobile-detail-edit"
            type="button"
            label="Edit item"
            @click="navigateTo(vaultRoute(`/vault/item/${selectedItemInContext.itemId}/edit`))"
          >
            <AppIcon name="edit" :size="17" />
          </IconButton>
          <IconButton
            data-testid="vault-mobile-detail-overflow"
            type="button"
            label="Item actions"
            @click="openMobileDetailActionSheet"
          >
            <AppIcon name="more" :size="17" />
          </IconButton>
        </div>
      </div>

      <EmptyState
        v-if="isListRoute && emptyVault"
        title="Vault ready"
        description="Create an item to start building your vault."
      />
      <EmptyState
        v-else-if="isListRoute"
        title="Select an item to view details"
        description="Choose an item from the list to inspect credentials and metadata."
      />

      <section v-else-if="isCreateRoute || isEditing" class="detail-card detail-card--editor">
        <div class="detail-card__header detail-card__header--split">
          <div class="detail-card__editor-title-wrap">
            <span class="detail-card__editor-avatar" aria-hidden="true">
              <img
                v-if="editorHeaderFaviconUrl"
                :src="editorHeaderFaviconUrl"
                alt="Item favicon"
                loading="lazy"
                @error="selectedItem ? markFaviconError(selectedItem) : undefined"
              />
              <template v-else>{{ editorHeaderMonogram }}</template>
            </span>
            <label class="detail-card__title-edit">
              <span class="sr-only">Title</span>
              <input
                v-model="editorTitle"
                class="detail-card__title-input"
                :placeholder="detailTitle"
                autocomplete="off"
              />
            </label>
          </div>
          <div class="detail-card__header-actions">
            <IconButton
              v-if="showCompactBackToList"
              data-testid="vault-compact-back-button"
              type="button"
              label="Close item"
              @click="
                navigateTo(
                  isCreateRoute || isEditing ? pendingEditorExitTarget() : vaultRoute('/vault'),
                )
              "
            >
              <AppIcon name="close" :size="16" />
            </IconButton>
            <IconButton
              v-if="isEditing && selectedItem"
              class="detail-card__trash-action"
              type="button"
              label="Move item to trash"
              :disabled="busyAction === 'trash'"
              @click="moveCurrentToTrash"
            >
              <AppIcon name="trash" :size="17" />
            </IconButton>
          </div>
        </div>

        <InlineAlert v-if="isEditing && hasExternalUpdate" tone="danger">
          <span>This item changed in another tab or device. Reload latest to continue safely.</span>
          <SecondaryButton type="button" @click="reloadLatestAfterConflict">
            Reload latest
          </SecondaryButton>
        </InlineAlert>

        <form class="form-stack" @submit.prevent="saveCurrent">
          <template v-if="isCreateLogin || (isEditing && selectedItem?.itemType === 'login')">
            <section class="editor-section">
              <h3>Credentials</h3>
              <div class="editor-section__body">
                <TextField
                  v-model="loginDraft.username"
                  label="Username"
                  autocomplete="username"
                  required
                  @update:model-value="setDirty"
                />
                <div
                  ref="loginPasswordFieldWrapRef"
                  class="vault-password-generator-field"
                  @focusin="onLoginPasswordFieldFocusIn"
                  @focusout="onLoginPasswordFieldFocusOut"
                >
                  <SecretField
                    v-model="loginDraft.password"
                    label="Password"
                    autocomplete="current-password"
                    required
                    :mask-key="maskKey"
                    @update:model-value="setDirty"
                  />
                  <button
                    v-if="showLoginPasswordGeneratorTrigger"
                    type="button"
                    class="vault-password-generator-field__trigger"
                    @pointerdown.stop
                    @click.stop="openLoginPasswordGenerator"
                  >
                    <AppIcon name="login" :size="16" />
                    <span>Criar nova senha</span>
                  </button>
                  <PasswordGeneratorPopover
                    v-if="showLoginPasswordGeneratorPanel"
                    class="vault-password-generator-field__panel"
                    :context-url="loginDraft.urls[0] || passwordGeneratorContextUrl"
                    :show-fill="true"
                    @fill="onFillGeneratedPassword"
                    @close="closeLoginPasswordGenerator"
                  />
                </div>
                <TextField
                  :model-value="loginDraft.urls[0] ?? ''"
                  label="URL"
                  @update:model-value="
                    (value) => {
                      loginDraft.urls = value ? [value] : [];
                      setDirty();
                    }
                  "
                />
              </div>
            </section>

            <section class="editor-section">
              <h3>Organization</h3>
              <div class="editor-section__body">
                <label class="field">
                  <span class="field__label">Folder</span>
                  <select
                    v-model="loginDraftFolderId"
                    class="field__select"
                    @change="setDirty"
                  >
                    <option value="">No folder</option>
                    <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                      {{ folder.name }}
                    </option>
                  </select>
                </label>
              </div>
            </section>

            <section class="editor-section">
              <h3>Notes</h3>
              <div class="editor-section__body">
                <TextareaField v-model="loginDraft.notes" label="Notes" :rows="5" @update:model-value="setDirty" />
              </div>
            </section>
          </template>

          <template v-else-if="isCreateDocument || (isEditing && selectedItem?.itemType === 'document')">
            <section class="editor-section">
              <h3>Organization</h3>
              <div class="editor-section__body">
                <label class="field">
                  <span class="field__label">Folder</span>
                  <select
                    v-model="documentDraftFolderId"
                    class="field__select"
                    @change="setDirty"
                  >
                    <option value="">No folder</option>
                    <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                      {{ folder.name }}
                    </option>
                  </select>
                </label>
              </div>
            </section>
            <section class="editor-section">
              <h3>Content</h3>
              <div class="editor-section__body">
                <TextareaField
                  v-model="documentDraft.content"
                  label="Content"
                  :rows="10"
                  @update:model-value="setDirty"
                />
              </div>
            </section>
          </template>

          <template v-else-if="isCreateCard || (isEditing && selectedItem?.itemType === 'card')">
            <section class="editor-section">
              <h3>Card details</h3>
              <div class="editor-section__body">
                <TextField
                  v-model="cardDraft.cardholderName"
                  label="Cardholder name"
                  required
                  @update:model-value="setDirty"
                />
                <TextField v-model="cardDraft.brand" label="Brand" required @update:model-value="setDirty" />
                <SecretField
                  v-model="cardDraft.number"
                  label="Card number"
                  required
                  :mask-key="maskKey"
                  @update:model-value="setDirty"
                />
                <div class="custom-field-row">
                  <TextField
                    v-model="cardDraft.expiryMonth"
                    label="Expiry month"
                    required
                    @update:model-value="setDirty"
                  />
                  <TextField
                    v-model="cardDraft.expiryYear"
                    label="Expiry year"
                    required
                    @update:model-value="setDirty"
                  />
                  <SecretField
                    v-model="cardDraft.securityCode"
                    label="Security code"
                    required
                    :mask-key="maskKey"
                    @update:model-value="setDirty"
                  />
                </div>
              </div>
            </section>

            <section class="editor-section">
              <h3>Organization</h3>
              <div class="editor-section__body">
                <label class="field">
                  <span class="field__label">Folder</span>
                  <select
                    v-model="cardDraftFolderId"
                    class="field__select"
                    @change="setDirty"
                  >
                    <option value="">No folder</option>
                    <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                      {{ folder.name }}
                    </option>
                  </select>
                </label>
              </div>
            </section>

            <section class="editor-section">
              <h3>Notes</h3>
              <div class="editor-section__body">
                <TextareaField v-model="cardDraft.notes" label="Notes" :rows="5" @update:model-value="setDirty" />
              </div>
            </section>
          </template>

          <template v-else-if="isCreateSecureNote || (isEditing && selectedItem?.itemType === 'secure_note')">
            <section class="editor-section">
              <h3>Organization</h3>
              <div class="editor-section__body">
                <label class="field">
                  <span class="field__label">Folder</span>
                  <select
                    v-model="secureNoteDraftFolderId"
                    class="field__select"
                    @change="setDirty"
                  >
                    <option value="">No folder</option>
                    <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                      {{ folder.name }}
                    </option>
                  </select>
                </label>
              </div>
            </section>
            <section class="editor-section">
              <h3>Content</h3>
              <div class="editor-section__body">
                <TextareaField
                  v-model="secureNoteDraft.content"
                  label="Content"
                  :rows="10"
                  @update:model-value="setDirty"
                />
              </div>
            </section>
          </template>

          <section class="custom-fields-section editor-section">
            <div class="custom-fields-section__header">
              <h3>Custom fields</h3>
              <SecondaryButton
                type="button"
                class="module-action-button"
                aria-label="Add custom field"
                :disabled="busyAction === 'save'"
                @click="addEditorCustomField"
              >
                <AppIcon name="plus" :size="16" />
                <span>Add custom field</span>
              </SecondaryButton>
            </div>

            <div v-if="editorCustomFields.length > 0" class="custom-fields-list editor-section__body">
              <div
                v-for="(field, fieldIndex) in editorCustomFields"
                :key="`custom-field-${fieldIndex}`"
                class="custom-field-row"
              >
                <input
                  name="custom-field-label"
                  type="text"
                  class="custom-field-inline custom-field-inline--label"
                  placeholder="Field name"
                  :value="field.label"
                  @input="
                    updateEditorCustomField(
                      fieldIndex,
                      'label',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
                <input
                  name="custom-field-value"
                  type="text"
                  class="custom-field-inline custom-field-inline--value"
                  placeholder="Field value"
                  :value="field.value"
                  @input="
                    updateEditorCustomField(
                      fieldIndex,
                      'value',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
                <IconButton
                  class="custom-field-row__remove"
                  type="button"
                  label="Remove custom field"
                  :disabled="busyAction === 'save'"
                  @click="removeEditorCustomField(fieldIndex)"
                >
                  <AppIcon name="trash" :size="16" />
                </IconButton>
              </div>
            </div>
            <p v-else class="module-empty-hint">No custom fields yet.</p>
          </section>

          <section class="attachment-section attachment-section--editor editor-section">
            <div class="attachment-section__header">
              <h3>Attachments</h3>
              <SecondaryButton
                type="button"
                class="module-action-button"
                :aria-label="attachmentBusy || busyAction === 'save' ? 'Uploading attachment' : 'Add attachment'"
                :disabled="attachmentBusy || busyAction === 'save'"
                @click="openAttachmentFilePicker"
              >
                <AppIcon name="attachment" :size="17" />
                <span>Add attachment</span>
              </SecondaryButton>
              <input
                ref="attachmentInputRef"
                class="sr-only"
                type="file"
                @change="onAttachmentSelected"
              />
            </div>

            <InlineAlert v-if="attachmentError" tone="danger">
              {{ attachmentError }}
            </InlineAlert>

            <div v-if="isCreateRoute && pendingDraftAttachments.length > 0" class="attachment-list">
              <article
                v-for="attachment in pendingDraftAttachments"
                :key="attachment.id"
                class="attachment-row is-queued"
              >
                <span class="attachment-row__preview" :class="`is-${attachmentPreviewKind(attachment.contentType)}`">
                  <img
                    v-if="attachment.previewUrl"
                    :src="attachment.previewUrl"
                    :alt="`${attachment.name} preview`"
                    loading="lazy"
                  />
                  <AppIcon v-else :name="attachment.contentType === 'application/pdf' ? 'document' : 'attachment'" :size="16" />
                </span>
                <div class="attachment-row__main">
                  <p class="attachment-row__name">{{ attachment.name }}</p>
                  <p class="attachment-row__status">Queued</p>
                  <p class="attachment-row__meta">{{ queuedAttachmentMetaLine(attachment) }}</p>
                </div>
                <div class="attachment-row__actions">
                  <IconButton
                    type="button"
                    :label="`Download ${attachment.name}`"
                    @click="downloadQueuedAttachment(attachment)"
                  >
                    <AppIcon name="download" :size="16" />
                  </IconButton>
                </div>
              </article>
            </div>

            <div v-else-if="isEditing && selectedItemUploads.length > 0" class="attachment-list">
              <article
                v-for="upload in selectedItemUploads"
                :key="upload.uploadId"
                class="attachment-row"
                :class="`is-${upload.lifecycleState}`"
              >
                <span class="attachment-row__preview" :class="`is-${attachmentPreviewKind(upload.contentType)}`">
                  <img
                    v-if="attachmentPreviewUrl(upload)"
                    :src="attachmentPreviewUrl(upload) ?? ''"
                    :alt="`${attachmentDisplayName(upload)} preview`"
                    loading="lazy"
                  />
                  <AppIcon v-else :name="upload.contentType === 'application/pdf' ? 'document' : 'attachment'" :size="16" />
                </span>
                <div class="attachment-row__main">
                  <p class="attachment-row__name">{{ attachmentDisplayName(upload) }}</p>
                  <p class="attachment-row__status">{{ attachmentStatusLabel(upload.lifecycleState) }}</p>
                  <p class="attachment-row__meta">{{ attachmentMetaLine(upload) }}</p>
                </div>
                <div class="attachment-row__actions">
                  <IconButton
                    type="button"
                    :label="attachmentDownloadLabel(upload)"
                    :disabled="!attachmentHasDownload(upload)"
                    @click="downloadUpload(upload)"
                  >
                    <AppIcon name="download" :size="16" />
                  </IconButton>
                </div>
              </article>
            </div>
            <p v-else class="module-empty-hint">No attachments yet.</p>
          </section>

          <div v-if="!isMobileViewport" class="form-actions editor-action-bar">
            <PrimaryButton type="submit" :disabled="busyAction === 'save'">
              {{ busyAction === 'save' ? 'Saving...' : 'Save' }}
            </PrimaryButton>
            <SecondaryButton type="button" @click="cancelEditor">Cancel</SecondaryButton>
          </div>
        </form>

      </section>

      <article v-else-if="isTrashContext && selectedTrashEntry" class="detail-card">
        <div class="detail-card__header detail-card__header--split">
          <div class="detail-card__identity">
            <span class="detail-card__avatar" aria-hidden="true">
              {{ trashMonogram(selectedTrashEntry.itemType) }}
            </span>
            <div>
              <p class="eyebrow">Trash</p>
              <h2>{{ trashTitle(selectedTrashEntry.itemType) }}</h2>
            </div>
          </div>
          <div v-if="showCompactBackToList && !isMobileViewport" class="detail-card__actions-layout">
            <IconButton
              data-testid="vault-compact-back-button"
              class="detail-card__close-action"
              type="button"
              label="Close item"
              @click="navigateTo(vaultRoute('/vault', { scope: 'trash' }))"
            >
              <AppIcon name="close" :size="17" />
            </IconButton>
          </div>
        </div>

        <KeyValueList>
          <div class="key-value-row">
            <dt>Item type</dt>
            <dd>{{ trashTitle(selectedTrashEntry.itemType) }}</dd>
          </div>
          <div class="key-value-row">
            <dt>Item ID</dt>
            <dd>{{ selectedTrashEntry.itemId }}</dd>
          </div>
          <div class="key-value-row">
            <dt>Deleted at</dt>
            <dd>{{ trashDeletedAtLabel(selectedTrashEntry.deletedAt) }}</dd>
          </div>
        </KeyValueList>

        <section class="detail-trash-actions">
          <PrimaryButton type="button" :disabled="busyAction === 'trash'" @click="restoreCurrentItem">Restore</PrimaryButton>
          <p class="module-empty-hint">Permanent delete is not available in V1.</p>
        </section>
      </article>

      <article v-else-if="selectedItemInContext" class="detail-card">
        <div class="detail-card__header detail-card__header--split">
          <div class="detail-card__identity">
            <span class="detail-card__avatar-shell" :class="{ 'is-editable': canEditDetailIcon }">
              <span class="detail-card__avatar" aria-hidden="true">
                <img
                  v-if="itemFaviconUrl(selectedItemInContext)"
                  :src="itemFaviconUrl(selectedItemInContext) ?? ''"
                  :alt="`${selectedItemInContext.payload.title} favicon`"
                  loading="lazy"
                  @error="markFaviconError(selectedItemInContext)"
                />
                <template v-else>{{ itemMonogram(selectedItemInContext) }}</template>
              </span>
              <button
                v-if="canEditDetailIcon"
                type="button"
                class="detail-card__avatar-edit"
                :disabled="detailIconUploadBusy"
                :aria-label="`Edit icon for ${detailIconEditableHost}`"
                @click="openDetailIconPicker"
              >
                <AppIcon name="edit" :size="16" />
              </button>
            </span>
            <div>
              <p class="eyebrow">{{ detailMetaType }}</p>
              <h2>{{ selectedItemInContext.payload.title }}</h2>
            </div>
          </div>
          <div v-if="!isMobileViewport" class="detail-card__actions-layout">
            <div class="detail-actions detail-actions--keep-row">
              <IconButton
                v-if="!isTrashContext"
                data-testid="favorite-toggle-detail"
                :class="{ 'is-favorited': isFavorite(selectedItemInContext.itemId) }"
                type="button"
                :label="isFavorite(selectedItemInContext.itemId) ? 'Remove favorite' : 'Add favorite'"
                @click="toggleFavorite(selectedItemInContext.itemId)"
              >
                <AppIcon name="favorites" :size="20" />
              </IconButton>
              <template v-if="!isTrashContext">
                <IconButton
                  type="button"
                  label="Edit item"
                  @click="navigateTo(vaultRoute(`/vault/item/${selectedItemInContext.itemId}/edit`))"
                >
                  <AppIcon name="edit" :size="17" />
                </IconButton>
                <IconButton
                  class="detail-card__trash-action"
                  type="button"
                  label="Move item to trash"
                  :disabled="busyAction === 'trash'"
                  @click="moveCurrentToTrash"
                >
                  <AppIcon name="trash" :size="17" />
                </IconButton>
              </template>
            </div>
            <IconButton
              v-if="showCompactBackToList"
              data-testid="vault-compact-back-button"
              class="detail-card__close-action"
              type="button"
              label="Close item"
              @click="
                navigateTo(
                  isCreateRoute || isEditing ? pendingEditorExitTarget() : vaultRoute('/vault'),
                )
              "
            >
              <AppIcon name="close" :size="17" />
            </IconButton>
          </div>
        </div>

        <KeyValueList>
          <template v-if="selectedItemInContext.itemType === 'login'">
            <div v-if="hasValue(selectedItemInContext.payload.username)" class="key-value-row key-value-row--with-actions">
              <dt>Username</dt>
              <dd>
                <span class="key-value-row__value">{{ selectedItemInContext.payload.username }}</span>
                <span v-if="!isTrashContext && selectedItemInContext.payload.username" class="key-value-row__actions">
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    aria-label="Copy username"
                    @click="copyText(selectedItemInContext.payload.username)"
                  >
                    <AppIcon name="copy" :size="16" />
                    <span class="sr-only">Copy username</span>
                  </button>
                </span>
              </dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.password)" class="key-value-row">
              <dt>Password</dt>
              <dd>
                <SecretField
                  v-if="!isTrashContext"
                  :model-value="selectedItemInContext.payload.password"
                  label="Password"
                  label-hidden
                  readonly
                  allow-copy
                  :mask-key="maskKey"
                  @copied="showToast('Copied')"
                />
                <span v-else>••••••••</span>
              </dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.urls[0])" class="key-value-row key-value-row--with-actions">
              <dt>URL</dt>
              <dd>
                <span class="key-value-row__value">{{ selectedItemInContext.payload.urls[0] }}</span>
                <span v-if="!isTrashContext && selectedItemInContext.payload.urls[0]" class="key-value-row__actions">
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    aria-label="Open URL"
                    @click="openUrl(selectedItemInContext.payload.urls[0])"
                  >
                    <AppIcon name="globe" :size="16" />
                    <span class="sr-only">Open URL</span>
                  </button>
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    aria-label="Copy URL"
                    @click="copyText(selectedItemInContext.payload.urls[0])"
                  >
                    <AppIcon name="copy" :size="16" />
                    <span class="sr-only">Copy URL</span>
                  </button>
                </span>
              </dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.notes)" class="key-value-row">
              <dt>Notes</dt>
              <dd>{{ selectedItemInContext.payload.notes }}</dd>
            </div>
            <div
              v-for="(field, fieldIndex) in filledCustomFields(selectedItemInContext.payload.customFields)"
              :key="`login-field-${fieldIndex}`"
              class="key-value-row key-value-row--with-actions"
            >
              <dt>{{ field.label || 'Field' }}</dt>
              <dd>
                <span class="key-value-row__value">{{ field.value }}</span>
                <span v-if="!isTrashContext && field.value" class="key-value-row__actions">
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    :aria-label="`Copy ${field.label || 'field'}`"
                    @click="copyText(field.value)"
                  >
                    <AppIcon name="copy" :size="16" />
                    <span class="sr-only">Copy {{ field.label || 'field' }}</span>
                  </button>
                </span>
              </dd>
            </div>
          </template>

          <template v-else-if="selectedItemInContext.itemType === 'document'">
            <div v-if="hasValue(selectedItemInContext.payload.content)" class="key-value-row">
              <dt>Document preview</dt>
              <dd class="document-preview">
                {{ selectedItemInContext.payload.content }}
              </dd>
            </div>
            <div
              v-for="(field, fieldIndex) in filledCustomFields(selectedItemInContext.payload.customFields)"
              :key="`document-field-${fieldIndex}`"
              class="key-value-row key-value-row--with-actions"
            >
              <dt>{{ field.label || 'Field' }}</dt>
              <dd>
                <span class="key-value-row__value">{{ field.value }}</span>
                <span v-if="!isTrashContext && field.value" class="key-value-row__actions">
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    :aria-label="`Copy ${field.label || 'field'}`"
                    @click="copyText(field.value)"
                  >
                    <AppIcon name="copy" :size="16" />
                    <span class="sr-only">Copy {{ field.label || 'field' }}</span>
                  </button>
                </span>
              </dd>
            </div>
          </template>

          <template v-else-if="selectedItemInContext.itemType === 'card'">
            <div v-if="hasValue(selectedItemInContext.payload.cardholderName)" class="key-value-row">
              <dt>Cardholder</dt>
              <dd>{{ selectedItemInContext.payload.cardholderName }}</dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.brand)" class="key-value-row">
              <dt>Brand</dt>
              <dd>{{ selectedItemInContext.payload.brand }}</dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.number)" class="key-value-row">
              <dt>Number</dt>
              <dd>
                <SecretField
                  v-if="!isTrashContext"
                  :model-value="selectedItemInContext.payload.number"
                  label="Card number"
                  readonly
                  allow-copy
                  :mask-key="maskKey"
                  @copied="showToast('Copied')"
                />
                <span v-else>••••••••</span>
              </dd>
            </div>
            <div
              v-if="hasValue(selectedItemInContext.payload.expiryMonth) || hasValue(selectedItemInContext.payload.expiryYear)"
              class="key-value-row"
            >
              <dt>Expiry</dt>
              <dd>{{ selectedItemInContext.payload.expiryMonth }}/{{ selectedItemInContext.payload.expiryYear }}</dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.securityCode)" class="key-value-row">
              <dt>Security code</dt>
              <dd>
                <SecretField
                  v-if="!isTrashContext"
                  :model-value="selectedItemInContext.payload.securityCode"
                  label="Security code"
                  readonly
                  allow-copy
                  :mask-key="maskKey"
                  @copied="showToast('Copied')"
                />
                <span v-else>•••</span>
              </dd>
            </div>
            <div v-if="hasValue(selectedItemInContext.payload.notes)" class="key-value-row">
              <dt>Notes</dt>
              <dd>{{ selectedItemInContext.payload.notes }}</dd>
            </div>
            <div
              v-for="(field, fieldIndex) in filledCustomFields(selectedItemInContext.payload.customFields)"
              :key="`card-field-${fieldIndex}`"
              class="key-value-row key-value-row--with-actions"
            >
              <dt>{{ field.label || 'Field' }}</dt>
              <dd>
                <span class="key-value-row__value">{{ field.value }}</span>
                <span v-if="!isTrashContext && field.value" class="key-value-row__actions">
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    :aria-label="`Copy ${field.label || 'field'}`"
                    @click="copyText(field.value)"
                  >
                    <AppIcon name="copy" :size="16" />
                    <span class="sr-only">Copy {{ field.label || 'field' }}</span>
                  </button>
                </span>
              </dd>
            </div>
          </template>

          <template v-else>
            <div v-if="hasValue(selectedItemInContext.payload.content)" class="key-value-row">
              <dt>Secure note</dt>
              <dd class="document-preview">
                {{ selectedItemInContext.payload.content }}
              </dd>
            </div>
            <div
              v-for="(field, fieldIndex) in filledCustomFields(selectedItemInContext.payload.customFields)"
              :key="`secure-note-field-${fieldIndex}`"
              class="key-value-row key-value-row--with-actions"
            >
              <dt>{{ field.label || 'Field' }}</dt>
              <dd>
                <span class="key-value-row__value">{{ field.value }}</span>
                <span v-if="!isTrashContext && field.value" class="key-value-row__actions">
                  <button
                    class="key-value-row__icon-action"
                    type="button"
                    :aria-label="`Copy ${field.label || 'field'}`"
                    @click="copyText(field.value)"
                  >
                    <AppIcon name="copy" :size="16" />
                    <span class="sr-only">Copy {{ field.label || 'field' }}</span>
                  </button>
                </span>
              </dd>
            </div>
          </template>

          <div v-if="folderFor(selectedItemInContext.itemId)" class="key-value-row">
            <dt>Folder</dt>
            <dd>{{ folderName(folderFor(selectedItemInContext.itemId)) }}</dd>
          </div>
        </KeyValueList>

        <section
          v-if="!isTrashContext && detailCustomFields(selectedItemInContext).length === 0"
          class="detail-module"
        >
          <div class="custom-fields-section__header">
            <h3>Custom fields</h3>
            <SecondaryButton
              type="button"
              class="module-action-button"
              @click="navigateTo(vaultRoute(`/vault/item/${selectedItemInContext.itemId}/edit`))"
            >
              <AppIcon name="plus" :size="16" />
              <span>Add custom field</span>
            </SecondaryButton>
          </div>
          <p class="module-empty-hint">No custom fields yet.</p>
        </section>

        <section v-if="!isTrashContext" class="attachment-section">
          <div class="attachment-section__header">
            <h3>Attachments</h3>
            <SecondaryButton
              type="button"
              class="module-action-button"
              :aria-label="attachmentBusy ? 'Uploading attachment' : 'Add attachment'"
              :disabled="attachmentBusy"
              @click="openAttachmentFilePicker"
            >
              <AppIcon name="attachment" :size="17" />
              <span>Add attachment</span>
            </SecondaryButton>
            <input
              ref="attachmentInputRef"
              class="sr-only"
              type="file"
              @change="onAttachmentSelected"
            />
          </div>

          <InlineAlert v-if="attachmentError" tone="danger">
            {{ attachmentError }}
          </InlineAlert>

          <div v-if="selectedItemUploads.length > 0" class="attachment-list">
            <article
              v-for="upload in selectedItemUploads"
              :key="upload.uploadId"
              class="attachment-row"
              :class="`is-${upload.lifecycleState}`"
            >
              <span class="attachment-row__preview" :class="`is-${attachmentPreviewKind(upload.contentType)}`">
                <img
                  v-if="attachmentPreviewUrl(upload)"
                  :src="attachmentPreviewUrl(upload) ?? ''"
                  :alt="`${attachmentDisplayName(upload)} preview`"
                  loading="lazy"
                />
                <AppIcon v-else :name="upload.contentType === 'application/pdf' ? 'document' : 'attachment'" :size="16" />
              </span>
              <div class="attachment-row__main">
                <p class="attachment-row__name">{{ attachmentDisplayName(upload) }}</p>
                <p class="attachment-row__status">{{ attachmentStatusLabel(upload.lifecycleState) }}</p>
                <p class="attachment-row__meta">{{ attachmentMetaLine(upload) }}</p>
              </div>
              <div class="attachment-row__actions">
                <IconButton
                  type="button"
                  :label="attachmentDownloadLabel(upload)"
                  :disabled="!attachmentHasDownload(upload)"
                  @click="downloadUpload(upload)"
                >
                  <AppIcon name="download" :size="16" />
                </IconButton>
              </div>
            </article>
          </div>
          <p v-else class="module-empty-hint">No attachments yet.</p>
        </section>

        <section v-if="isTrashContext" class="detail-trash-actions">
          <PrimaryButton type="button" @click="restoreCurrentItem">Restore</PrimaryButton>
          <p class="module-empty-hint">Permanent delete is not available in V1.</p>
        </section>
      </article>

      <EmptyState
        v-else
        title="Select an item to view details"
        description="Choose an item from the list to inspect credentials and metadata."
      />
    </section>

    <div
      v-if="isMobileViewport && mobileFilterSheetOpen"
      data-testid="vault-mobile-filter-sheet"
      class="mobile-sheet-backdrop"
      role="presentation"
      @click.self="closeMobileSheets"
    >
      <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="Filters">
        <header class="mobile-sheet__header">
          <h2>Filters</h2>
        </header>
        <div class="mobile-sheet__section">
          <p class="mobile-sheet__section-title">Scope</p>
          <div class="mobile-sheet__options">
            <button
              :class="scope === 'all' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyScopeFilter('all')"
            >
              All items
            </button>
            <button
              :class="scope === 'favorites' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyScopeFilter('favorites')"
            >
              Favorites
            </button>
            <button
              :class="scope === 'trash' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyScopeFilter('trash')"
            >
              Trash
            </button>
          </div>
        </div>
        <div class="mobile-sheet__section">
          <p class="mobile-sheet__section-title">Types</p>
          <div class="mobile-sheet__options">
            <button
              :class="typeFilter === 'all' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyTypeFilter('all')"
            >
              All types
            </button>
            <button
              :class="typeFilter === 'login' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyTypeFilter('login')"
            >
              Login
            </button>
            <button
              :class="typeFilter === 'document' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyTypeFilter('document')"
            >
              Documents
            </button>
            <button
              :class="typeFilter === 'card' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyTypeFilter('card')"
            >
              Cards
            </button>
            <button
              :class="typeFilter === 'secure_note' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyTypeFilter('secure_note')"
            >
              Secure Notes
            </button>
          </div>
        </div>
        <div class="mobile-sheet__section">
          <p class="mobile-sheet__section-title">Folders</p>
          <div class="mobile-sheet__options">
            <button
              :class="folderFilter === 'all' ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyFolderFilter('all')"
            >
              All folders
            </button>
            <button
              v-for="folder in folders"
              :key="`mobile-folder-${folder.id}`"
              :class="folderFilter === folder.id ? 'button button--primary' : 'button button--secondary'"
              type="button"
              @click="applyFolderFilter(folder.id)"
            >
              {{ folder.name }}
            </button>
          </div>
        </div>
        <footer class="mobile-sheet__footer">
          <button class="button button--ghost" type="button" @click="clearFiltersAndSearch({ closeSheets: false })">
            Clear all
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="isMobileViewport && mobileCreateSheetOpen"
      data-testid="vault-mobile-create-sheet"
      class="mobile-sheet-backdrop"
      role="presentation"
      @click.self="closeMobileSheets"
    >
      <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="Create item">
        <header class="mobile-sheet__header">
          <h2>Create item</h2>
          <SecondaryButton type="button" @click="closeMobileSheets">Done</SecondaryButton>
        </header>
        <div class="mobile-sheet__options mobile-sheet__options--stack">
          <button
            v-for="item in createOptions"
            :key="`mobile-create-${item.value}`"
            class="button button--secondary mobile-sheet__action"
            type="button"
            @click="onDropdownSelect(item.value)"
          >
            <AppIcon :name="item.icon" :size="16" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="isMobileViewport && mobileAccountSheetOpen"
      data-testid="vault-mobile-account-sheet"
      class="mobile-sheet-backdrop"
      role="presentation"
      @click.self="closeMobileSheets"
    >
      <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="Account and session">
        <header class="mobile-sheet__header">
          <h2>Account</h2>
          <SecondaryButton type="button" @click="closeMobileSheets">Done</SecondaryButton>
        </header>
        <div class="mobile-sheet__section">
          <dl class="mobile-account-meta">
            <div>
              <dt>User</dt>
              <dd>{{ sessionStore.state.username ?? 'Unknown' }}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>{{ sessionStore.state.deviceName ?? 'Unknown' }}</dd>
            </div>
          </dl>
        </div>
        <div class="mobile-sheet__options mobile-sheet__options--stack">
          <button
            v-if="canOpenAdminFromVault"
            data-testid="vault-mobile-admin-button"
            class="button button--secondary mobile-sheet__action"
            type="button"
            @click="openAdminFromVault"
          >
            <AppIcon name="all" :size="16" />
            <span>Admin</span>
          </button>
          <button class="button button--secondary mobile-sheet__action" type="button" @click="openSettingsFromVault">
            <AppIcon name="settings" :size="16" />
            <span>Settings</span>
          </button>
          <button class="button button--secondary mobile-sheet__action" type="button" @click="lockNowFromVault">
            <AppIcon name="lock" :size="16" />
            <span>Lock now</span>
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="isMobileViewport && mobileDetailActionSheetOpen && selectedItemInContext && !isTrashContext"
      data-testid="vault-mobile-detail-action-sheet"
      class="mobile-sheet-backdrop"
      role="presentation"
      @click.self="closeMobileSheets"
    >
      <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="Item actions">
        <header class="mobile-sheet__header">
          <h2>Item actions</h2>
          <SecondaryButton type="button" @click="closeMobileSheets">Done</SecondaryButton>
        </header>
        <div class="mobile-sheet__options mobile-sheet__options--stack">
          <button
            class="button button--secondary mobile-sheet__action"
            type="button"
            @click="openCurrentEditorFromSheet"
          >
            <AppIcon name="edit" :size="16" />
            <span>Edit item</span>
          </button>
          <button
            class="button button--danger mobile-sheet__action"
            type="button"
            :disabled="busyAction === 'trash'"
            @click="moveCurrentToTrashFromSheet"
          >
            <AppIcon name="trash" :size="16" />
            <span>{{ busyAction === 'trash' ? 'Moving to trash...' : 'Move to trash' }}</span>
          </button>
        </div>
      </section>
    </div>

    <DialogModal :open="discardDialogOpen" title="Discard changes?">
      <template #actions>
        <SecondaryButton type="button" @click="closeDiscardDialog">Keep editing</SecondaryButton>
        <DangerButton type="button" @click="discardChanges">Discard changes</DangerButton>
      </template>
    </DialogModal>

    <input
      ref="detailIconFileInput"
      class="sr-only"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon"
      @change="onDetailIconFileSelected"
    />

    <ToastMessage v-if="toastMessage" :message="toastMessage" />
  </section>
</template>
