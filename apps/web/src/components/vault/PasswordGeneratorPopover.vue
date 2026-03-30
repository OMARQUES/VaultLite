<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '../ui/AppIcon.vue';
import {
  addGeneratorHistoryEntry,
  filterGeneratorHistoryEntries,
  groupGeneratorHistoryByDay,
  type PasswordGeneratorHistoryEntry,
} from '../../lib/password-generator-history';
import {
  getPasswordGeneratorHistoryCache,
  markPasswordGeneratorHistoryCacheStale,
  runPasswordGeneratorHistoryCacheSync,
  setPasswordGeneratorHistoryCache,
  shouldSyncPasswordGeneratorHistoryCache,
} from '../../lib/password-generator-history-cache';
import {
  createDefaultGeneratorState,
  generatePassword,
  normalizeGeneratorState,
  PASSWORD_GENERATOR_MODES,
  type PasswordGeneratorState,
} from '../../lib/password-generator';
import { decryptVaultItemPayload, encryptVaultItemPayload } from '../../lib/browser-crypto';
import { sessionStoreKey } from '../../app-context';
import type { SessionStore } from '../../lib/session-store';

const props = withDefaults(
  defineProps<{
    contextUrl?: string | null;
    showFill?: boolean;
  }>(),
  {
    contextUrl: '',
    showFill: false,
  },
);

const emit = defineEmits<{
  close: [];
  fill: [password: string];
}>();

const PASSWORD_HISTORY_REALTIME_EVENT = 'vaultlite.password_history.updated';

const rootRef = ref<HTMLElement | null>(null);
const state = ref<PasswordGeneratorState>(createDefaultGeneratorState());
const generatedValue = ref(generatePassword(state.value));
const copyLabel = ref('Copy');
const copyFeedbackTimer = ref<number | null>(null);
const historyOpen = ref(false);
const historyQuery = ref('');
const history = ref<PasswordGeneratorHistoryEntry[]>([]);
const visibleEntryIds = ref<Set<string>>(new Set());
const sessionStore = inject<SessionStore | null>(sessionStoreKey, null);

const historyEntries = computed(() => {
  const filtered = filterGeneratorHistoryEntries(history.value, historyQuery.value);
  return groupGeneratorHistoryByDay(filtered);
});

const historyIsEmpty = computed(() => historyEntries.value.length === 0);

const historyEmptyText = computed(() => {
  if (history.value.length > 0 && historyQuery.value.trim().length > 0) {
    return 'No results for this URL search.';
  }
  return 'No generated passwords yet.';
});

function parseContextUrl() {
  try {
    const parsed = new URL(String(props.contextUrl ?? ''));
    return {
      pageUrl: parsed.toString(),
      pageHost: parsed.host,
    };
  } catch {
    return {
      pageUrl: '',
      pageHost: '',
    };
  }
}

function regenerate() {
  generatedValue.value = generatePassword(state.value);
  copyLabel.value = 'Copy';
}

function updateState(next: Partial<PasswordGeneratorState>, regeneratePassword = false) {
  state.value = normalizeGeneratorState({
    ...state.value,
    ...next,
  });
  if (regeneratePassword) {
    regenerate();
  }
}

async function addHistoryEntry(password: string) {
  const context = parseContextUrl();
  const nextHistory = addGeneratorHistoryEntry(history.value, {
    password,
    pageUrl: context.pageUrl,
    pageHost: context.pageHost,
    createdAt: Date.now(),
  });
  history.value = nextHistory;
  setPasswordGeneratorHistoryCache(nextHistory);
  const newest = nextHistory[0] ?? null;
  if (!newest) {
    return;
  }
  await upsertHistoryEntryRemote(newest);
}

function normalizeHistoryEntry(rawEntry: unknown): PasswordGeneratorHistoryEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null;
  }
  const candidate = rawEntry as Partial<PasswordGeneratorHistoryEntry>;
  if (typeof candidate.id !== 'string' || candidate.id.length < 8) {
    return null;
  }
  const createdAt = Number(candidate.createdAt);
  if (!Number.isFinite(createdAt)) {
    return null;
  }
  if (typeof candidate.password !== 'string' || candidate.password.length === 0) {
    return null;
  }
  return {
    id: candidate.id,
    createdAt,
    password: candidate.password,
    pageUrl: typeof candidate.pageUrl === 'string' ? candidate.pageUrl : '',
    pageHost: typeof candidate.pageHost === 'string' ? candidate.pageHost : 'unknown',
  };
}

function sortHistoryEntries(entries: PasswordGeneratorHistoryEntry[]): PasswordGeneratorHistoryEntry[] {
  return [...entries].sort((left, right) => right.createdAt - left.createdAt);
}

async function upsertHistoryEntryRemote(entry: PasswordGeneratorHistoryEntry) {
  if (!sessionStore || sessionStore.state.phase !== 'ready') {
    return;
  }
  let accountKey = '';
  try {
    accountKey = sessionStore.getUnlockedVaultContext().accountKey;
  } catch {
    return;
  }
  if (!accountKey) {
    return;
  }
  try {
    const encryptedPayload = await encryptVaultItemPayload({
      accountKey,
      itemType: 'secure_note',
      payload: {
        password: entry.password,
        pageUrl: entry.pageUrl,
        pageHost: entry.pageHost,
        createdAt: entry.createdAt,
      },
    });
    await sessionStore.upsertPasswordGeneratorHistoryEntry({
      entryId: entry.id,
      encryptedPayload,
      createdAt: new Date(entry.createdAt).toISOString(),
    });
  } catch {
    // Keep local history even when remote sync fails.
  }
}

async function loadHistoryFromRemote(options: { force?: boolean } = {}) {
  if (!sessionStore || sessionStore.state.phase !== 'ready') {
    return;
  }
  let accountKey = '';
  try {
    accountKey = sessionStore.getUnlockedVaultContext().accountKey;
  } catch {
    return;
  }
  if (!accountKey) {
    return;
  }
  const force = options.force === true;
  const cachedEntries = getPasswordGeneratorHistoryCache();
  if (cachedEntries.length > 0) {
    history.value = cachedEntries;
  }
  if (!force && !shouldSyncPasswordGeneratorHistoryCache()) {
    return;
  }
  try {
    const nextEntries = await runPasswordGeneratorHistoryCacheSync(
      async () => {
        const response = await sessionStore.listPasswordGeneratorHistory();
        const decryptedEntries: PasswordGeneratorHistoryEntry[] = [];
        for (const entry of response.entries) {
          try {
            const decrypted = await decryptVaultItemPayload<{
              password?: string;
              pageUrl?: string;
              pageHost?: string;
              createdAt?: number;
            }>({
              accountKey,
              encryptedPayload: entry.encryptedPayload,
            });
            const normalized = normalizeHistoryEntry({
              id: entry.entryId,
              createdAt:
                Number.isFinite(Number(decrypted.createdAt)) && Number(decrypted.createdAt) > 0
                  ? Number(decrypted.createdAt)
                  : Date.parse(entry.createdAt),
              password: typeof decrypted.password === 'string' ? decrypted.password : '',
              pageUrl: typeof decrypted.pageUrl === 'string' ? decrypted.pageUrl : '',
              pageHost: typeof decrypted.pageHost === 'string' ? decrypted.pageHost : '',
            });
            if (normalized) {
              decryptedEntries.push(normalized);
            }
          } catch {
            // Skip malformed/decrypt-failed entry.
          }
        }
        return sortHistoryEntries(decryptedEntries);
      },
      {
        force,
      },
    );
    const nextHistory = Array.isArray(nextEntries) ? nextEntries : getPasswordGeneratorHistoryCache();
    if (nextHistory.length > 0) {
      history.value = nextHistory;
    }
  } catch {
    // Keep local-only history when remote fetch fails.
  }
}

function handlePasswordHistoryRealtimeUpdate() {
  markPasswordGeneratorHistoryCacheStale();
  void loadHistoryFromRemote({ force: true });
}

async function copyPassword(password: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(password);
    }
    copyLabel.value = 'Copied';
    if (copyFeedbackTimer.value !== null) {
      window.clearTimeout(copyFeedbackTimer.value);
    }
    copyFeedbackTimer.value = window.setTimeout(() => {
      copyLabel.value = 'Copy';
      copyFeedbackTimer.value = null;
    }, 1200);
  } catch {
    copyLabel.value = 'Copy';
  }
}

async function onCopyCurrentPassword() {
  const currentValue = generatedValue.value;
  if (!currentValue) {
    return;
  }
  await addHistoryEntry(currentValue);
  await copyPassword(currentValue);
}

async function onFillCurrentPassword() {
  const currentValue = generatedValue.value;
  if (!currentValue) {
    return;
  }
  await addHistoryEntry(currentValue);
  emit('fill', currentValue);
}

async function onRegeneratePassword() {
  await addHistoryEntry(generatedValue.value);
  regenerate();
}

function formatHistoryDate(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dayKey;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function isEntryVisible(entryId: string) {
  return visibleEntryIds.value.has(entryId);
}

function toggleEntryVisibility(entryId: string) {
  const next = new Set(visibleEntryIds.value);
  if (next.has(entryId)) {
    next.delete(entryId);
  } else {
    next.add(entryId);
  }
  visibleEntryIds.value = next;
}

function closePanel() {
  historyOpen.value = false;
  historyQuery.value = '';
  emit('close');
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!rootRef.value) {
    return;
  }
  const target = event.target as Node | null;
  if (target && !rootRef.value.contains(target)) {
    closePanel();
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePanel();
  }
}

watch(
  () => state.value.mode,
  (mode) => {
    if (mode === PASSWORD_GENERATOR_MODES.PIN) {
      return;
    }
    if (!state.value.randomIncludeNumbers && !state.value.randomIncludeSymbols) {
      updateState({ randomIncludeNumbers: true }, false);
    }
  },
);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleWindowKeydown);
  history.value = getPasswordGeneratorHistoryCache();
  window.addEventListener(PASSWORD_HISTORY_REALTIME_EVENT, handlePasswordHistoryRealtimeUpdate);
  void loadHistoryFromRemote({ force: history.value.length === 0 });
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener(PASSWORD_HISTORY_REALTIME_EVENT, handlePasswordHistoryRealtimeUpdate);
  if (copyFeedbackTimer.value !== null) {
    window.clearTimeout(copyFeedbackTimer.value);
    copyFeedbackTimer.value = null;
  }
});
</script>

<template>
  <section ref="rootRef" class="vl-generator-panel" aria-label="Password generator">
    <div v-if="!historyOpen" class="vl-generator-main">
      <header class="vl-generator-head">
        <h2 class="vl-generator-title">Password Generator</h2>
        <button type="button" class="vl-generator-close" aria-label="Close password generator" @click="closePanel">
          <AppIcon name="close" :size="16" />
        </button>
      </header>

      <div class="vl-generator-actions" :class="{ 'vl-generator-actions--with-fill': props.showFill }">
        <button type="button" class="vl-generator-copy" @click="onCopyCurrentPassword">{{ copyLabel }}</button>
        <button
          type="button"
          class="vl-generator-regenerate"
          aria-label="Regenerate password"
          title="Regenerate password"
          @click="onRegeneratePassword"
        >
          <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
        </button>
        <button v-if="props.showFill" type="button" class="vl-generator-fill" @click="onFillCurrentPassword">Fill</button>
      </div>

      <input :value="generatedValue" class="vl-generator-output" readonly />
      <hr class="vl-generator-divider" />

      <div class="vl-generator-row">
        <p class="vl-generator-label">Type</p>
        <select
          :value="state.mode"
          class="vl-generator-select"
          aria-label="Password type"
          @change="
            updateState({ mode: ($event.target as HTMLSelectElement).value as PasswordGeneratorState['mode'] }, true)
          "
        >
          <option value="smart">Smart Password</option>
          <option value="random">Random Password</option>
          <option value="pin">PIN Code</option>
        </select>
      </div>

      <div v-if="state.mode !== PASSWORD_GENERATOR_MODES.PIN">
        <div v-if="state.mode === PASSWORD_GENERATOR_MODES.RANDOM" class="vl-generator-row">
          <p class="vl-generator-label">Characters</p>
          <div class="vl-generator-range-wrap">
            <input
              :value="state.randomLength"
              class="vl-generator-range"
              type="range"
              min="8"
              max="64"
              step="1"
              @input="
                updateState(
                  { randomLength: Number.parseInt(($event.target as HTMLInputElement).value, 10) || state.randomLength },
                  true,
                )
              "
            />
            <input
              :value="state.randomLength"
              class="vl-generator-number"
              type="number"
              min="8"
              max="64"
              @change="
                updateState(
                  { randomLength: Number.parseInt(($event.target as HTMLInputElement).value, 10) || state.randomLength },
                  true,
                )
              "
            />
          </div>
        </div>
        <div v-if="state.mode === PASSWORD_GENERATOR_MODES.RANDOM" class="vl-generator-row">
          <p class="vl-generator-label">Numbers</p>
          <button
            type="button"
            class="vl-generator-switch"
            :aria-pressed="state.randomIncludeNumbers ? 'true' : 'false'"
            aria-label="Toggle numbers"
            @click="updateState({ randomIncludeNumbers: !state.randomIncludeNumbers }, true)"
          />
        </div>
        <div v-if="state.mode === PASSWORD_GENERATOR_MODES.RANDOM" class="vl-generator-row">
          <p class="vl-generator-label">Symbols</p>
          <button
            type="button"
            class="vl-generator-switch"
            :aria-pressed="state.randomIncludeSymbols ? 'true' : 'false'"
            aria-label="Toggle symbols"
            @click="updateState({ randomIncludeSymbols: !state.randomIncludeSymbols }, true)"
          />
        </div>
      </div>

      <div v-else class="vl-generator-row">
        <p class="vl-generator-label">Numbers</p>
        <div class="vl-generator-range-wrap">
          <input
            :value="state.pinLength"
            class="vl-generator-range"
            type="range"
            min="4"
            max="12"
            step="1"
            @input="
              updateState(
                { pinLength: Number.parseInt(($event.target as HTMLInputElement).value, 10) || state.pinLength },
                true,
              )
            "
          />
          <input
            :value="state.pinLength"
            class="vl-generator-number"
            type="number"
            min="4"
            max="12"
            @change="
              updateState(
                { pinLength: Number.parseInt(($event.target as HTMLInputElement).value, 10) || state.pinLength },
                true,
              )
            "
          />
        </div>
      </div>

      <button type="button" class="vl-generator-history-btn" title="Password generator history" @click="historyOpen = true">
        <span class="vl-generator-history-btn__left">
          <span class="material-symbols-rounded" aria-hidden="true">history</span>
          <span>Password Generator History</span>
        </span>
        <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
      </button>
    </div>

    <div v-else class="vl-generator-history">
      <header class="vl-generator-history__head">
        <button type="button" class="vl-generator-close" aria-label="Back to password generator" @click="historyOpen = false">
          <AppIcon name="chevron_left" :size="16" />
        </button>
        <h2 class="vl-generator-title">Generator History</h2>
      </header>
      <label class="vl-generator-history__search">
        <AppIcon name="search" :size="16" />
        <input v-model="historyQuery" type="search" placeholder="Search History" />
      </label>
      <div v-if="historyIsEmpty" class="vl-generator-history__empty">{{ historyEmptyText }}</div>
      <div v-else class="vl-generator-history__list">
        <section v-for="group in historyEntries" :key="group.dayKey" class="vl-generator-history__group">
          <p class="vl-generator-history__day">{{ formatHistoryDate(group.dayKey) }}</p>
          <article
            v-for="entry in group.entries"
            :key="entry.id"
            class="vl-generator-history__entry"
          >
            <div class="vl-generator-history__meta">
              {{ formatHistoryTime(entry.createdAt) }} - {{ entry.pageHost || 'Unknown page' }}
            </div>
            <div class="vl-generator-history__password">
              {{ isEntryVisible(entry.id) ? entry.password : '••••••••••••' }}
            </div>
            <div class="vl-generator-history__actions">
              <button
                type="button"
                class="vl-generator-history__icon"
                :aria-label="isEntryVisible(entry.id) ? 'Hide password' : 'Show password'"
                @click="toggleEntryVisibility(entry.id)"
              >
                <AppIcon name="eye" :size="16" />
              </button>
              <button
                type="button"
                class="vl-generator-history__icon"
                aria-label="Copy password"
                @click="copyPassword(entry.password)"
              >
                <AppIcon name="copy" :size="16" />
              </button>
            </div>
          </article>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.vl-generator-panel {
  width: min(332px, calc(100vw - 24px));
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vl-surface-2) 95%, #111319);
  box-shadow: var(--vl-shadow-md);
  padding: 10px;
  display: grid;
  gap: 10px;
  z-index: 40;
}

.vl-generator-main,
.vl-generator-history {
  display: grid;
  gap: 10px;
}

.vl-generator-head,
.vl-generator-history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.vl-generator-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.vl-generator-close {
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 90%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vl-surface-3) 88%, transparent);
  color: var(--vl-text-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.vl-generator-close:hover {
  color: var(--vl-text);
}

.vl-generator-actions {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.vl-generator-actions--with-fill {
  grid-template-columns: auto 1fr auto;
}

.vl-generator-copy,
.vl-generator-regenerate,
.vl-generator-fill {
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--vl-surface-3) 84%, transparent);
  color: var(--vl-text);
  cursor: pointer;
}

.vl-generator-copy {
  min-width: 74px;
  padding: 0 10px;
  font-size: 15px;
  line-height: 1;
}

.vl-generator-regenerate {
  width: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.vl-generator-actions--with-fill .vl-generator-regenerate {
  justify-self: center;
}

.vl-generator-regenerate .material-symbols-rounded {
  font-size: 19px;
  line-height: 1;
}

.vl-generator-fill {
  min-width: 72px;
  padding: 0 10px;
  border-color: color-mix(in srgb, var(--vl-primary) 80%, transparent);
  background: color-mix(in srgb, var(--vl-primary) 88%, transparent);
  color: #f6f8ff;
  font-size: 15px;
  line-height: 1;
}

.vl-generator-output {
  width: 100%;
  height: 42px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vl-surface-3) 74%, #0f1218);
  color: var(--vl-text);
  font-size: clamp(16px, 2.1vw, 22px);
  line-height: 1;
  letter-spacing: 0.01em;
  padding: 0 10px;
}

.vl-generator-divider {
  border: 0;
  margin: 0;
  height: 2px;
  background: #26d100;
}

.vl-generator-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 0 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--vl-divider) 95%, transparent);
}

.vl-generator-label {
  margin: 0;
  color: var(--vl-text-muted);
  font-size: 13px;
}

.vl-generator-select,
.vl-generator-number {
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vl-surface-3) 82%, transparent);
  color: var(--vl-text);
  padding: 0 8px;
  font-size: 13px;
}

.vl-generator-range-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.vl-generator-range {
  width: 136px;
}

.vl-generator-number {
  width: 56px;
  text-align: center;
}

.vl-generator-switch {
  width: 40px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vl-surface-3) 78%, transparent);
  cursor: pointer;
  position: relative;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.vl-generator-switch::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #f6f8fb;
  transition: transform 160ms ease;
}

.vl-generator-switch[aria-pressed='true'] {
  background: var(--vl-primary);
  border-color: var(--vl-primary);
}

.vl-generator-switch[aria-pressed='true']::before {
  transform: translateX(16px);
}

.vl-generator-history-btn {
  width: 100%;
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vl-surface-3) 76%, transparent);
  color: var(--vl-text);
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.vl-generator-history-btn__left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.vl-generator-history__search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 36px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vl-surface-3) 76%, transparent);
  padding: 0 8px;
  color: var(--vl-text-soft);
}

.vl-generator-history__search input {
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--vl-text);
  font-size: 14px;
}

.vl-generator-history__list {
  display: grid;
  gap: 10px;
  max-height: 300px;
  overflow: auto;
}

.vl-generator-history__day {
  margin: 0;
  color: var(--vl-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.vl-generator-history__group {
  display: grid;
  gap: 6px;
}

.vl-generator-history__entry {
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vl-surface-3) 74%, transparent);
  padding: 8px;
  display: grid;
  gap: 8px;
}

.vl-generator-history__meta {
  color: color-mix(in srgb, var(--vl-text) 92%, #a1a8b6);
  font-size: 12px;
  line-height: 1.3;
  word-break: break-word;
}

.vl-generator-history__password {
  color: var(--vl-text);
  font-size: 14px;
  line-height: 1.2;
}

.vl-generator-history__actions {
  display: inline-flex;
  justify-content: flex-end;
  gap: 8px;
}

.vl-generator-history__icon {
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--vl-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vl-surface-2) 86%, transparent);
  color: var(--vl-text-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.vl-generator-history__empty {
  margin: 0;
  color: var(--vl-text-muted);
  text-align: center;
  padding: 24px 10px;
}

@media (max-width: 760px) {
  .vl-generator-panel {
    width: min(100vw - 18px, 332px);
  }
}
</style>
