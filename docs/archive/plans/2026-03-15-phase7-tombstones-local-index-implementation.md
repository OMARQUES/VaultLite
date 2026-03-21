clecle# Phase 7 Tombstones and Local Index Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `P7-C03` tombstones and `P7-C04` local decrypted index so delete semantics become sync-safe and search becomes local-only, deterministic, and aligned with the zero-knowledge boundary.

**Architecture:** Tombstones should be persisted server-side as explicit deletion records instead of hard-deleting without trace. The local decrypted index should remain client-only and in-memory for the unlocked session, built from decrypted payloads fetched after `local unlock` and updated incrementally on CRUD and tombstone events.

**Tech Stack:** TypeScript, Vitest, Hono, Cloudflare D1, Vue 3 with `<script setup>`, existing `@vaultlite/contracts`, `@vaultlite/domain`, `@vaultlite/storage-abstractions`, `@vaultlite/cloudflare-storage`, and `@vaultlite/web`.

---

## Implementation constraints

- Follow `ADR 0004 - Search Model`: local-only decrypted index, no server-side plaintext search, no blind indexes in V1.
- Follow `ADR 0005 - Sync Conflict Policy`: deletions must create tombstones and keep deterministic per-item semantics for later sync work.
- Do not mix `remote authentication`, `local unlock`, and `session restoration` terminology.
- Do not persist the decrypted search index in LocalStorage. Default to in-memory-only for the unlocked session.
- Do not index secret material that has no search value. Do not index password fields.
- Do not change Phase 8 attachment scope or Phase 9 sync algorithms in this package.

## Proposed execution order

1. Lock tombstone domain/contracts first.
2. Add storage support and tests for tombstone creation and visibility rules.
3. Update API delete/list/detail semantics to respect tombstones.
4. Update web vault workspace to handle deleted records safely.
5. Lock the local index contract and searchable field allowlist.
6. Implement in-memory index and search query helpers.
7. Wire the vault UI to local search.
8. Run focused tests, then full regression validation.

---

### Task 1: Define tombstone domain and contract types

**Files:**
- Modify: `packages/domain/src/entities.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/entities.test.ts`
- Modify: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/schemas.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- `VaultItemTombstoneRecord` shape in `packages/domain/src/entities.test.ts`
- zod schema validation for tombstone records and tombstone-aware list output in `packages/contracts/src/schemas.test.ts`

Example test targets:
```ts
expect(tombstone.deletedAt).toBe('2026-03-15T12:00:00.000Z');
expect(VaultItemTombstoneRecordSchema.safeParse(validInput).success).toBe(true);
expect(VaultItemTombstoneRecordSchema.safeParse({ itemId: '' }).success).toBe(false);
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/domain -- --run src/entities.test.ts
npm test --workspace @vaultlite/contracts -- --run src/schemas.test.ts
```
Expected: FAIL because tombstone types and schemas do not exist yet.

**Step 3: Write minimal implementation**

Add:
- `VaultItemTombstoneRecord` in `packages/domain/src/entities.ts`
- export from `packages/domain/src/index.ts`
- `VaultItemTombstoneRecordSchema` in `packages/contracts/src/api.ts`
- export from `packages/contracts/src/index.ts`

Suggested shape:
```ts
export interface VaultItemTombstoneRecord {
  itemId: string;
  ownerUserId: string;
  itemType: VaultItemType;
  revision: number;
  deletedAt: string;
}
```

**Step 4: Run tests to verify pass**

Run the same commands from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/domain/src/entities.ts packages/domain/src/index.ts packages/domain/src/entities.test.ts packages/contracts/src/api.ts packages/contracts/src/index.ts packages/contracts/src/schemas.test.ts
git commit -m "feat: add vault tombstone domain contracts"
```

---

### Task 2: Add tombstone storage abstractions and in-memory behavior

**Files:**
- Modify: `packages/storage-abstractions/src/index.ts`
- Modify: `packages/storage-abstractions/src/storage.test.ts`

**Step 1: Write the failing tests**

Add storage tests covering:
- delete converts a live item into a tombstone
- list/find no longer return tombstoned live items
- tombstones are queryable for future sync work

Example assertions:
```ts
await storage.vaultItems.delete('item_1', 'user_1');
expect(await storage.vaultItems.findByItemId('item_1', 'user_1')).toBeNull();
expect(await storage.vaultItems.listTombstonesByOwnerUserId('user_1')).toEqual([
  expect.objectContaining({ itemId: 'item_1' }),
]);
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/storage-abstractions -- --run src/storage.test.ts
```
Expected: FAIL because tombstone-aware repository methods do not exist.

**Step 3: Write minimal implementation**

Extend `VaultItemRepository` with methods like:
```ts
listTombstonesByOwnerUserId(ownerUserId: string): Promise<VaultItemTombstoneRecord[]>;
findTombstoneByItemId(itemId: string, ownerUserId: string): Promise<VaultItemTombstoneRecord | null>;
```

Update the in-memory implementation so `delete()`:
- loads the live record
- creates a tombstone with incremented revision or current revision according to chosen invariant
- removes the live record from the active map
- stores the tombstone in a dedicated tombstone map
- returns `true` only when a live owned record existed

**Step 4: Run tests to verify pass**

Run the same command from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/storage-abstractions/src/index.ts packages/storage-abstractions/src/storage.test.ts
git commit -m "feat: add tombstone-aware storage abstractions"
```

---

### Task 3: Add D1 tombstone persistence and migration

**Files:**
- Create: `infrastructure/migrations/0003_vault_item_tombstones.sql`
- Modify: `infrastructure/scripts/validate-migrations.mjs`
- Modify: `adapters/cloudflare-storage/src/index.ts`
- Modify: `adapters/cloudflare-storage/src/storage.test.ts`
- Modify: `adapters/cloudflare-storage/src/migrations.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- migration loader sees `0003_vault_item_tombstones.sql`
- delete against the Cloudflare adapter removes the live row and creates a tombstone row
- list/find hide tombstoned items

Example assertions:
```ts
expect(migrations.map((migration) => migration.id)).toContain('0003_vault_item_tombstones');
expect(await storage.vaultItems.listTombstonesByOwnerUserId('user_1')).toHaveLength(1);
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/cloudflare-storage -- --run src/migrations.test.ts
npm test --workspace @vaultlite/cloudflare-storage -- --run src/storage.test.ts
npm run validate:migrations
```
Expected: FAIL because the table and repository behavior do not exist yet.

**Step 3: Write minimal implementation**

Add migration `0003_vault_item_tombstones.sql` with a dedicated table and indexes, for example:
```sql
CREATE TABLE IF NOT EXISTS vault_item_tombstones (
  item_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (item_id, owner_user_id)
);
```

Update `CloudflareVaultItemRepository` so `delete()` becomes an atomic sequence:
1. read live record by owner
2. insert or replace tombstone
3. delete live item row
4. return `true`

Keep list/detail methods scoped to live items only.

**Step 4: Run tests to verify pass**

Run the same commands from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add infrastructure/migrations/0003_vault_item_tombstones.sql infrastructure/scripts/validate-migrations.mjs adapters/cloudflare-storage/src/index.ts adapters/cloudflare-storage/src/storage.test.ts adapters/cloudflare-storage/src/migrations.test.ts
git commit -m "feat: persist vault item tombstones"
```

---

### Task 4: Make API delete semantics tombstone-aware

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/vault.test.ts`

**Step 1: Write the failing tests**

Add API tests covering:
- delete returns `204`
- deleted item no longer appears in list/detail
- tombstone exists in storage after delete
- cross-user delete still returns `404`

Example assertions:
```ts
expect(deleteResponse.status).toBe(204);
expect(await storage.vaultItems.findByItemId(itemId, ownerUserId)).toBeNull();
expect(await storage.vaultItems.findTombstoneByItemId(itemId, ownerUserId)).not.toBeNull();
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/api -- --run src/vault.test.ts
```
Expected: FAIL because delete still hard-deletes without explicit tombstone assertions.

**Step 3: Write minimal implementation**

Keep the current external contract stable:
- `DELETE /api/vault/items/:itemId` still returns `204`
- `GET /api/vault/items` and `GET /api/vault/items/:itemId` remain live-item only

But change the internals so delete always routes through tombstone-aware storage and no longer relies on temporary hard delete semantics.

**Step 4: Run tests to verify pass**

Run the same command from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/vault.test.ts
git commit -m "feat: make vault delete semantics tombstone-aware"
```

---

### Task 5: Make web workspace resilient to tombstoned items

**Files:**
- Modify: `apps/web/src/lib/vault-workspace.ts`
- Modify: `apps/web/src/lib/vault-workspace.test.ts`
- Modify: `apps/web/src/pages/VaultShellPage.vue`

**Step 1: Write the failing tests**

Add web workspace tests covering:
- deleted items disappear from the local workspace state after successful delete
- a deleted item cannot be edited from stale UI state
- empty-state rendering works when the last item is deleted

Example assertions:
```ts
await workspace.deleteItem('item_1');
expect(workspace.items.value).toEqual([]);
expect(workspace.error.value).toBeNull();
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/web -- --run src/lib/vault-workspace.test.ts
```
Expected: FAIL if stale live-item assumptions remain.

**Step 3: Write minimal implementation**

Update `vault-workspace.ts` so the local state:
- removes deleted items immediately after confirmed delete
- clears any selected editor state pointing to a deleted item
- treats `404` after delete as a stale-state condition with recoverable UI messaging if needed

Keep this task limited to delete correctness, not search UI.

**Step 4: Run tests to verify pass**

Run the same command from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/vault-workspace.ts apps/web/src/lib/vault-workspace.test.ts apps/web/src/pages/VaultShellPage.vue
git commit -m "fix: align vault workspace with tombstone deletes"
```

---

### Task 6: Define the local decrypted index contract and allowlist

**Files:**
- Modify: `packages/domain/src/entities.ts`
- Modify: `packages/domain/src/entities.test.ts`
- Create: `apps/web/src/lib/vault-search.ts`
- Create: `apps/web/src/lib/vault-search.test.ts`

**Step 1: Write the failing tests**

Add search tests covering the exact allowlist:
- `login`: `title`, `username`, `urls`, `notes`
- `document`: `title`, `content`
- password is never indexed
- tombstoned items are excluded from the index input set

Example assertions:
```ts
expect(extractSearchTerms(loginPayload)).toContain('github.com');
expect(extractSearchTerms(loginPayload)).not.toContain('SuperSecretPassword123');
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/web -- --run src/lib/vault-search.test.ts
npm test --workspace @vaultlite/domain -- --run src/entities.test.ts
```
Expected: FAIL because the search helper and allowlist do not exist.

**Step 3: Write minimal implementation**

Create `apps/web/src/lib/vault-search.ts` with pure functions:
- `extractSearchTerms(item)`
- `buildVaultSearchIndex(items)`
- `queryVaultSearchIndex(index, query)`

Keep the index in-memory-only. Use normalized lowercase token matching. Start simple; do not add fuzzy search now.

**Step 4: Run tests to verify pass**

Run the same commands from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/domain/src/entities.ts packages/domain/src/entities.test.ts apps/web/src/lib/vault-search.ts apps/web/src/lib/vault-search.test.ts
git commit -m "feat: add local vault search allowlist and helpers"
```

---

### Task 7: Wire the search index into the vault workspace

**Files:**
- Modify: `apps/web/src/lib/vault-workspace.ts`
- Modify: `apps/web/src/lib/vault-workspace.test.ts`

**Step 1: Write the failing tests**

Add workspace tests covering:
- index is built from fetched decrypted items on load
- index updates after create
- index updates after update
- index removes items after delete
- search query returns only matching items

Example assertions:
```ts
await workspace.load();
workspace.setSearchQuery('github');
expect(workspace.filteredItems.value).toHaveLength(1);
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/web -- --run src/lib/vault-workspace.test.ts
```
Expected: FAIL because no searchable index or filtered state exists.

**Step 3: Write minimal implementation**

Extend `vault-workspace.ts` with:
- `searchQuery`
- `filteredItems`
- index rebuild/update hooks on load/create/update/delete
- a narrow public API like `setSearchQuery(query: string)`

Keep this in-memory for the unlocked session only.

**Step 4: Run tests to verify pass**

Run the same command from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/vault-workspace.ts apps/web/src/lib/vault-workspace.test.ts
git commit -m "feat: wire local decrypted search index into workspace"
```

---

### Task 8: Add minimal search UI to the vault shell

**Files:**
- Modify: `apps/web/src/pages/VaultShellPage.vue`
- Modify: `apps/web/src/lib/vault-workspace.test.ts`
- Optionally modify: `apps/web/src/router.test.ts`

**Step 1: Write the failing tests**

Add UI-level tests or interaction tests covering:
- search input updates `filteredItems`
- empty-state changes when search has no matches
- deleting a matching item removes it from the filtered results

Example assertions:
```ts
await wrapper.find('[data-testid="vault-search-input"]').setValue('bank');
expect(wrapper.text()).toContain('Bank account');
expect(wrapper.text()).not.toContain('Personal note');
```

**Step 2: Run tests to verify failure**

Run:
```bash
npm test --workspace @vaultlite/web -- --run src/lib/vault-workspace.test.ts
```
Expected: FAIL because the UI is not wired to the search query yet.

**Step 3: Write minimal implementation**

Add a simple search input to `VaultShellPage.vue`.
Do not build the full visual design pass yet. Keep the UI functional and consistent with current shell constraints.

**Step 4: Run tests to verify pass**

Run the same command from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/pages/VaultShellPage.vue apps/web/src/lib/vault-workspace.test.ts apps/web/src/router.test.ts
git commit -m "feat: add minimal local vault search UI"
```

---

### Task 9: Full regression and local verification

**Files:**
- Modify if needed: `status-card.md`
- Modify if needed: `docs/plans/2026-03-14-vaultlite-v1-corrected-plan-v2.2.1.md` only if implementation uncovers a real contradiction that must be documented

**Step 1: Run focused package tests**

Run:
```bash
npm test --workspace @vaultlite/domain -- --run src/entities.test.ts
npm test --workspace @vaultlite/contracts -- --run src/schemas.test.ts
npm test --workspace @vaultlite/storage-abstractions -- --run src/storage.test.ts
npm test --workspace @vaultlite/cloudflare-storage -- --run src/storage.test.ts src/migrations.test.ts
npm test --workspace @vaultlite/api -- --run src/vault.test.ts
npm test --workspace @vaultlite/web -- --run src/lib/vault-search.test.ts src/lib/vault-workspace.test.ts
```
Expected: PASS.

**Step 2: Run repo-wide validation**

Run:
```bash
npm run validate:migrations
npm test
npm run typecheck
npm run build
```
Expected: PASS.

**Step 3: Run local manual verification**

Run:
```bash
npm run dev:api
npm run dev:web
```

Manual checks:
- create a login item
- search by title and username
- create a document item
- search by title and content
- delete one item and verify it disappears from the live list
- reload the page and verify deleted items do not come back into the live list

**Step 4: Update execution tracking**

Set `P7-C03` and `P7-C04` in `status-card.md` to `done` only if:
- acceptance criteria are met
- tests above pass
- manual search and delete verification succeed

Then move `Current Focus` to `P75-C01`.

**Step 5: Commit**

```bash
git add status-card.md
git commit -m "docs: close phase 7 tombstones and local index cards"
```

---

## Expected post-implementation state

- Delete operations no longer rely on temporary hard delete semantics.
- Live vault item APIs remain simple while server-side tombstones exist for later sync work.
- The unlocked web session has a local-only decrypted search index with an explicit allowlist.
- No plaintext search capability is added to the server.
- `Phase 7.5` can start with more stable vault semantics and less UX rework risk.

## Final validation checklist

- `P7-C03` acceptance: delete creates tombstones and live item reads no longer surface deleted records.
- `P7-C04` acceptance: local search works on approved fields only and never indexes passwords.
- Repo validation passes: `validate:migrations`, `test`, `typecheck`, `build`.
- Local manual verification passes with `dev:api` and `dev:web`.
