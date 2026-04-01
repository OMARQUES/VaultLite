# P13-C03 Form Metadata Capture and Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `P13-C03` end-to-end so the extension can capture, persist, sync, and reuse non-sensitive form metadata across devices to improve future credential detection and autofill quality.

**Architecture:** Add a per-user form-metadata pipeline with strong-signal capture only. The content script detects candidate login forms and emits normalized observations to the background. The background applies confidence rules, persists metadata through a new API/storage contract, caches the result locally, and reconciles changes via realtime. Metadata remains non-secret, selector-based, versioned, and replaceable when the site layout changes.

**Tech Stack:** Chrome MV3 extension (`content-script.js`, `background.js`, `fill-engine.ts`), Cloudflare Workers API (`app.ts`, `realtime.ts`), D1 storage adapter, shared Zod contracts, Vitest.

---

## Locked decisions for this card

- Metadata is **shareable at the deployment level** for future reuse across users of the same server.
- V1 persistence still writes with enough provenance to support trust/confidence filtering before broad reuse.
- V1 supports **top-level documents + same-origin iframes** only.
- Metadata is captured only from **strong signals**:
  - successful manual fill initiated by the extension,
  - confirmed submit after fill,
  - user-corrected resubmission after selector failure.
- No fixed time TTL. Replacement is driven by:
  - stronger confidence,
  - selector failure,
  - explicit supersession.
- Stored payload must be **non-sensitive**:
  - never persist typed username/password/OTP values,
  - persist only structure, selectors, roles, normalized labels/hints, confidence, and linkage metadata.
- Keep a bounded count of **50 records per origin** instead of time expiry.
- Allow `itemId = null` for early heuristic/site-level capture before a credential is explicitly linked.
- Store `labelTextNormalized`, but only in sanitized, normalized, and length-limited form.

## Contract target

Introduce a canonical metadata model shaped like:

```ts
type VaultFormFieldRole =
  | 'username'
  | 'email'
  | 'password_current'
  | 'password_new'
  | 'password_confirmation'
  | 'otp'
  | 'unknown';

type VaultFormMetadataConfidence =
  | 'heuristic'
  | 'filled'
  | 'submitted_confirmed'
  | 'user_corrected';

interface VaultFormMetadataRecord {
  metadataId: string;
  ownerUserId: string | null;
  itemId: string | null;
  origin: string;
  formFingerprint: string;
  fieldFingerprint: string;
  frameScope: 'top' | 'same_origin_iframe';
  fieldRole: VaultFormFieldRole;
  selectorCss: string;
  selectorFallbacks: string[];
  autocompleteToken: string | null;
  inputType: string | null;
  fieldName: string | null;
  fieldId: string | null;
  labelTextNormalized: string | null;
  placeholderNormalized: string | null;
  confidence: VaultFormMetadataConfidence;
  selectorStatus: 'active' | 'suspect' | 'retired';
  sourceDeviceId: string | null;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string | null;
}
```

Normalization rules:
- `origin` must be `scheme + host + port`, never full URL path/query.
- `formFingerprint` must be deterministic from structural hints, not DOM instance ids.
- `fieldFingerprint` must be deterministic within the form.
- `selectorCss` must prefer stable selectors and avoid position-only selectors unless no better option exists.
- `labelTextNormalized` must be sanitized, trimmed, normalized for whitespace/case, and truncated to a fixed safe max length.

---

### Task 1: Freeze the contract and test vocabulary first

**Files:**
- Modify: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/schemas.test.ts`
- Modify: `packages/storage-abstractions/src/index.ts`
- Modify: `status-card.md`

**Step 1: Write the failing contract tests**

Add failing Zod/schema coverage for:
- `VaultFormFieldRoleSchema`
- `VaultFormMetadataConfidenceSchema`
- `VaultFormMetadataRecordSchema`
- `VaultFormMetadataUpsertInputSchema`
- `VaultFormMetadataListOutputSchema`
- `RealtimeFormMetadataUpsertedPayloadSchema`

Also add storage-abstraction type coverage for:
- `VaultFormMetadataRecord`
- `VaultFormMetadataRepository`

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/contracts test -- src/schemas.test.ts`
- `npm run -w @vaultlite/storage-abstractions test -- src/storage.test.ts`

Expected:
- FAIL because the new schemas and repository interfaces do not exist yet.

**Step 3: Implement the minimal contract surface**

Add:
- new Zod schemas in `packages/contracts/src/api.ts`
- exports in `packages/contracts/src/index.ts`
- repository interface in `packages/storage-abstractions/src/index.ts`
- new card note in `status-card.md` only if execution status needs to move to `in_progress`

Use these API shapes:

```ts
const VaultFormMetadataUpsertInputSchema = z.object({
  itemId: z.string().min(1).nullable(),
  origin: z.string().url(),
  formFingerprint: z.string().min(1),
  fieldFingerprint: z.string().min(1),
  frameScope: z.enum(['top', 'same_origin_iframe']),
  fieldRole: VaultFormFieldRoleSchema,
  selectorCss: z.string().min(1),
  selectorFallbacks: z.array(z.string().min(1)).max(5),
  autocompleteToken: z.string().min(1).nullable(),
  inputType: z.string().min(1).nullable(),
  fieldName: z.string().min(1).nullable(),
  fieldId: z.string().min(1).nullable(),
  labelTextNormalized: z.string().min(1).max(120).nullable(),
  placeholderNormalized: z.string().min(1).nullable(),
  confidence: VaultFormMetadataConfidenceSchema,
  selectorStatus: z.enum(['active', 'suspect', 'retired']),
}).strict();
```

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/contracts test -- src/schemas.test.ts`
- `npm run -w @vaultlite/storage-abstractions test -- src/storage.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add packages/contracts/src/api.ts packages/contracts/src/index.ts packages/contracts/src/schemas.test.ts packages/storage-abstractions/src/index.ts status-card.md
git commit -m "feat(contracts): add form metadata schemas and repository contracts"
```

---

### Task 2: Add D1 schema and storage adapter support

**Files:**
- Create: `infrastructure/migrations/0021_vault_form_metadata.sql`
- Modify: `adapters/cloudflare-storage/src/index.ts`
- Modify: `adapters/cloudflare-storage/src/storage.test.ts`
- Modify: `adapters/cloudflare-storage/src/migrations.test.ts`
- Modify: `packages/storage-abstractions/src/storage.test.ts`

**Step 1: Write failing storage tests**

Add tests for:
- upsert insert on first write,
- stronger-confidence replacement,
- selector failure demotion to `suspect`,
- list by origin for shared reuse,
- bounded pruning by count,
- item-linked lookup by `(itemId, origin)`,
- provenance-aware filtering when multiple users contribute metadata for the same origin.

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/cloudflare-storage test -- src/storage.test.ts src/migrations.test.ts`
- `npm run -w @vaultlite/storage-abstractions test -- src/storage.test.ts`

Expected:
- FAIL because the table and repository implementation do not exist.

**Step 3: Implement the migration and repository**

Create a table with stable indexes:

```sql
CREATE TABLE IF NOT EXISTS vault_form_metadata (
  metadata_id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  item_id TEXT,
  origin TEXT NOT NULL,
  form_fingerprint TEXT NOT NULL,
  field_fingerprint TEXT NOT NULL,
  frame_scope TEXT NOT NULL,
  field_role TEXT NOT NULL,
  selector_css TEXT NOT NULL,
  selector_fallbacks_json TEXT NOT NULL,
  autocomplete_token TEXT,
  input_type TEXT,
  field_name TEXT,
  field_id TEXT,
  label_text_normalized TEXT,
  placeholder_normalized TEXT,
  confidence TEXT NOT NULL,
  selector_status TEXT NOT NULL,
  source_device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_confirmed_at TEXT,
  UNIQUE(origin, form_fingerprint, field_fingerprint, field_role, IFNULL(item_id, ''))
);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_origin
  ON vault_form_metadata (origin, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_item_origin
  ON vault_form_metadata (item_id, origin, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_origin_confidence
  ON vault_form_metadata (origin, confidence, updated_at DESC);
```

Repository methods to add:
- `upsert(record)`
- `listByOrigin(input)`
- `listByOrigins(input)` for batch sync without N+1
- `listByItem(input)`
- `markSelectorsSuspect(input)`
- `pruneExcessByOrigin(input)`

Conflict rules:
- same key + stronger confidence => overwrite structural metadata
- same key + equal confidence + newer confirmation => overwrite
- same key + weaker confidence => keep existing
- shared records must retain provenance fields so ranking can later prefer local-user-confirmed entries over globally learned heuristic entries.

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/cloudflare-storage test -- src/storage.test.ts src/migrations.test.ts`
- `npm run -w @vaultlite/storage-abstractions test -- src/storage.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add infrastructure/migrations/0021_vault_form_metadata.sql adapters/cloudflare-storage/src/index.ts adapters/cloudflare-storage/src/storage.test.ts adapters/cloudflare-storage/src/migrations.test.ts packages/storage-abstractions/src/storage.test.ts
git commit -m "feat(storage): add D1-backed vault form metadata repository"
```

---

### Task 3: Add API read/write endpoints and realtime propagation

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/realtime.ts`
- Modify: `apps/api/src/realtime.test.ts`
- Modify: `packages/contracts/src/api.ts`

**Step 1: Write failing API and realtime tests**

Add tests covering:
- extension-authenticated metadata upsert,
- rejection of malformed payloads,
- metadata list by origin batch,
- realtime event shape with no sensitive values,
- no loop-causing broad resync event,
- `sourceDeviceId` preserved in event envelope.

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/api test -- src/app.test.ts src/realtime.test.ts`

Expected:
- FAIL because endpoints and topic are missing.

**Step 3: Implement minimal API and realtime support**

Add:
- `POST /api/extension/form-metadata/upsert`
- `POST /api/extension/form-metadata/query`

Use `allowExtensionBearer: true` only. Do not reuse cookie+CSRF mutation paths.

Add a new realtime topic:

```ts
'vault.form_metadata.upserted'
```

Realtime payload should stay structural:

```ts
{
  metadataId,
  ownerUserId,
  itemId,
  origin,
  formFingerprint,
  fieldFingerprint,
  fieldRole,
  confidence,
  selectorStatus,
  updatedAt
}
```

Important invariants:
- never emit selector fallback arrays if they contain noisy unstable values not needed by listeners
- never emit label text if it can leak user-entered content
- do not publish on no-op writes
- shared-storage mode must still require authenticated writes and authenticated reads; “shared” here means reusable across users inside the deployment contract, not public.

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/api test -- src/app.test.ts src/realtime.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/realtime.ts apps/api/src/realtime.test.ts packages/contracts/src/api.ts
git commit -m "feat(api): add form metadata endpoints and realtime propagation"
```

---

### Task 4: Add background cache and reconciliation flow in the extension

**Files:**
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/runtime-api.js`
- Modify: `apps/extension/src/background-controller.test.ts`
- Modify: `apps/extension/src/runtime-api.test.js`

**Step 1: Write failing extension background tests**

Add tests for:
- local cache keyed by `(origin, itemId?)`,
- query batch dedupe,
- upsert single-flight,
- ignore echo events from same `sourceDeviceId`,
- apply realtime delta without forcing broad fetch,
- fallback to cached metadata when API is offline.

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/extension test -- src/background-controller.test.ts src/runtime-api.test.js`

Expected:
- FAIL.

**Step 3: Implement background-side metadata state**

Add:
- session/local cache key for form metadata
- `vaultlite.form_metadata_query`
- `vaultlite.form_metadata_upsert`
- `vaultlite.form_metadata_mark_suspect`

Cache rules:
- `storage.session` for hot runtime view
- `storage.local` for carry-over across popup/service-worker restarts because MV3 service workers terminate
- bounded LRU by origin count
- local ranking should preserve enough provenance to prefer:
  1. current-user confirmed metadata,
  2. shared confirmed metadata,
  3. heuristic metadata

Reconciliation rules:
- on realtime `vault.form_metadata.upserted`, patch cache directly if event is newer
- if realtime is unhealthy, allow on-demand query batch
- do not poll on popup open

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/extension test -- src/background-controller.test.ts src/runtime-api.test.js`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/background.js apps/extension/runtime-api.js apps/extension/src/background-controller.test.ts apps/extension/src/runtime-api.test.js
git commit -m "feat(extension): add background cache and realtime reconciliation for form metadata"
```

---

### Task 5: Extract deterministic fingerprinting and selector generation in the content script

**Files:**
- Modify: `apps/extension/content-script.js`
- Modify: `apps/extension/src/fill-engine.ts`
- Modify: `apps/extension/src/fill-engine.test.ts`

**Step 1: Write failing unit tests for structural capture**

Add tests covering:
- top-level login form fingerprint generation,
- same-origin iframe fingerprint generation,
- role assignment from `autocomplete`, `type`, `name`, `id`, `placeholder`, associated label text,
- selector generation preference order,
- exclusion of cross-origin iframe targets in V1,
- normalization that strips user-entered values.

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/extension test -- src/fill-engine.test.ts`

Expected:
- FAIL.

**Step 3: Implement deterministic capture helpers**

Refactor `fill-engine.ts` to expose pure helpers such as:
- `detectFormContext(document, activeElement)`
- `buildFormFingerprint(context)`
- `inferFieldRole(input)`
- `buildStableSelector(input)`
- `buildSelectorFallbacks(input)`

Selector priority:
1. `id` when stable and not generated/noisy
2. `name`
3. `autocomplete`
4. associated label text + input type + form context
5. bounded structural fallback

Do not:
- use full CSS paths with volatile nth-child chains as primary selector
- use text content from user values
- persist full raw labels without sanitation/truncation

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/extension test -- src/fill-engine.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/content-script.js apps/extension/src/fill-engine.ts apps/extension/src/fill-engine.test.ts
git commit -m "feat(forms): add deterministic fingerprint and selector capture helpers"
```

---

### Task 6: Capture strong signals only and upsert metadata asynchronously

**Files:**
- Modify: `apps/extension/content-script.js`
- Modify: `apps/extension/background.js`
- Modify: `apps/extension/src/fill-engine.test.ts`
- Modify: `apps/extension/src/background-controller.test.ts`

**Step 1: Write failing behavior tests**

Add tests for:
- manual fill success queues metadata candidate at confidence `filled`
- successful submit after fill promotes to `submitted_confirmed`
- selector mismatch on next visit marks record `suspect`
- user-corrected successful re-fill promotes replacement
- no capture on plain page focus or passive observation alone
- heuristic records with `itemId = null` can later be promoted into item-linked records when a credential is explicitly used

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/extension test -- src/fill-engine.test.ts src/background-controller.test.ts`

Expected:
- FAIL.

**Step 3: Implement capture orchestration**

Content script responsibilities:
- observe extension-initiated fill result
- register submit listener on the resolved form
- emit non-sensitive observation payload to background

Background responsibilities:
- merge with cache
- apply confidence promotion rules
- debounce duplicate writes for same structural key
- call API asynchronously

Promotion matrix:

```text
heuristic -> filled -> submitted_confirmed -> user_corrected
```

Failure matrix:
- selector lookup misses once => `suspect`
- repeated miss with newer successful replacement => old record `retired`

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/extension test -- src/fill-engine.test.ts src/background-controller.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/content-script.js apps/extension/background.js apps/extension/src/fill-engine.test.ts apps/extension/src/background-controller.test.ts
git commit -m "feat(forms): capture strong form metadata signals and confidence promotion"
```

---

### Task 7: Wire selector-failure recovery and sync behavior without loops

**Files:**
- Modify: `apps/extension/background.js`
- Modify: `apps/api/src/realtime.ts`
- Modify: `apps/api/src/realtime.test.ts`
- Modify: `apps/extension/src/background-controller.test.ts`

**Step 1: Write failing loop/regression tests**

Add tests for:
- realtime echo from same device ignored,
- selector failure marks metadata suspect once, not in a loop,
- reconnect does not trigger full metadata re-upload,
- batch query by origin avoids N+1 calls.

**Step 2: Run tests to verify they fail**

Run:
- `npm run -w @vaultlite/api test -- src/realtime.test.ts`
- `npm run -w @vaultlite/extension test -- src/background-controller.test.ts`

Expected:
- FAIL.

**Step 3: Implement loop-safe sync**

Rules:
- every upsert carries `sourceDeviceId`
- background ignores identical newer-or-equal event from same device
- reconnect only requests metadata if local cache for the origin is absent or stale by version marker, not on every popup open
- selector failure path uses `mark_suspect` and waits for a strong new success before replacing

**Step 4: Run tests again**

Run:
- `npm run -w @vaultlite/api test -- src/realtime.test.ts`
- `npm run -w @vaultlite/extension test -- src/background-controller.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/background.js apps/api/src/realtime.ts apps/api/src/realtime.test.ts apps/extension/src/background-controller.test.ts
git commit -m "fix(forms): make form metadata sync loop-safe and failure-aware"
```

---

### Task 8: End-to-end validation, docs, and acceptance evidence

**Files:**
- Modify: `status-card.md`
- Modify: `docs/plans/2026-03-30-extension-intelligent-assist-and-autofill.md`
- Optional modify: `docs/ARCHITECTURE.md`
- Optional modify: `docs/SECURITY.md`

**Step 1: Run the full targeted validation matrix**

Run:
- `npm run -w @vaultlite/contracts test`
- `npm run -w @vaultlite/storage-abstractions test`
- `npm run -w @vaultlite/cloudflare-storage test`
- `npm run -w @vaultlite/api test -- src/app.test.ts src/realtime.test.ts`
- `npm run -w @vaultlite/extension test -- src/fill-engine.test.ts src/background-controller.test.ts src/runtime-api.test.js`
- `npm run -w @vaultlite/api typecheck`
- `npm run -w @vaultlite/extension typecheck`

Expected:
- PASS.

**Step 2: Run manual validation**

Manual cases:
- fill login on a supported top-level page -> metadata saved
- reopen same site on another trusted device -> metadata reused
- same-origin iframe login -> metadata saved and reused
- mutate the page DOM to break selector -> fallback heuristics still work, metadata becomes `suspect`
- perform successful corrected fill -> metadata replaced/promoted

**Step 3: Update docs and card status**

Set `P13-C03` to `review_needed` or `done` only after:
- automated tests pass,
- manual cases are captured,
- payload inspection confirms no sensitive values are stored or emitted.

**Step 4: Commit**

```bash
git add status-card.md docs/plans/2026-03-30-extension-intelligent-assist-and-autofill.md docs/ARCHITECTURE.md docs/SECURITY.md
git commit -m "docs(forms): record P13-C03 acceptance evidence and architecture notes"
```

---

## Security and data-minimization guardrails

- Do not store raw field values, submitted credentials, OTP codes, or freeform user text.
- Treat label and placeholder capture as optional and normalized; discard if they look like live user content.
- Never key metadata by full URL query string or path that may contain secrets.
- Keep same-origin iframe support explicit and reject cross-origin iframe capture in V1.
- Ensure realtime payloads are delta-shaped and non-sensitive.
- Apply bounded per-origin record caps to avoid metadata spam and D1 growth.

## Why this plan is grounded this way

- Chrome MV3 service workers are ephemeral, so metadata state must not rely only on globals.
- Content scripts run in isolated worlds, so selector capture and DOM interaction must stay inside the content script and communicate through extension messaging.
- HTML `autocomplete` tokens provide the strongest standards-based signal for roles like `username`, `current-password`, `new-password`, and `one-time-code`, so they should outrank heuristic hints.
- Cloudflare D1 has practical statement and bind-size limits, so the query API should support batched origin lookups and bounded writes instead of chatty per-field requests.

## Execution note

Even with the decisions locked, this card should still be implemented in stages, not as one blind patch:
- contracts and storage first,
- API/realtime second,
- background cache third,
- content-script capture and promotion logic last.

The dependency chain is tight and regressions will be subtle, especially around:
- selector stability,
- cross-device reuse,
- realtime loop prevention,
- noisy shared metadata.

## References used

- Chrome Extensions content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome Extensions messaging: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome Extensions service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome Extensions storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- MDN `autocomplete` attribute reference: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
