# Unified UX + Extension Unlock + 1PUX Fidelity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corrigir, em uma execução única, os 3 problemas reportados: truncamento/tooltip do título no detalhe web, skeleton desnecessário no unlock da extensão, e import `.1pux` com mapeamento fiel de campos/categorias.

**Architecture:** Aplicar abordagem cache-first e stale-while-revalidate na extensão para remover loading agressivo, manter layout resiliente no detalhe web com truncamento sem deslocar ações, e refatorar parser `.1pux` para converter estrutura tipada do 1Password em payload nativo do VaultLite (login/card/document/secure_note + custom fields). Toda mudança guiada por testes focados.

**Tech Stack:** Vue 3 + Vite + Vitest (web), Chrome extension JS + Vitest (extension), TypeScript parser de import (`vault-import.ts`), contratos VaultLite.

---

### Task 1: Baseline de regressão e fixtures dos 3 problemas

**Files:**
- Modify: `apps/web/src/pages/VaultShellPage.test.ts`
- Modify: `apps/web/src/lib/vault-import.test.ts`
- Modify: `apps/extension/src/popup-view-model.test.js`
- Create: `apps/web/src/lib/__fixtures__/1password-identity-card-minimal.json`

**Step 1: Write failing tests**

Adicionar testes que validam:
- Título longo no detalhe web não desloca ações e expõe tooltip completo.
- Import `.1pux` de cartão não cai como login.
- Import `.1pux` de identidade não vira “blob de metadados” em notes.
- Unlock da extensão com snapshot/projection existente não entra em skeleton.

**Step 2: Run tests to verify failures**

Run:
- `npm run test --workspace @vaultlite/web -- VaultShellPage.test.ts vault-import.test.ts`
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js`

Expected:
- FAIL nos novos asserts.

**Step 3: Add minimal fixture data**

Criar fixture `.json` com shape mínimo de item 1Password (card + identity) contendo:
- `categoryUuid`, `overview.title`, `overview.urls`, `overview.tags`
- `details.sections.fields` com valores reais e metadados ruidosos (`id`, `inputTraits`) para garantir que parser descarte ruído.

**Step 4: Re-run tests**

Run:
- mesmos comandos do passo 2

Expected:
- Ainda FAIL (agora com fixture estável pronta para implementação).

**Step 5: Commit**

```bash
git add apps/web/src/pages/VaultShellPage.test.ts apps/web/src/lib/vault-import.test.ts apps/extension/src/popup-view-model.test.js apps/web/src/lib/__fixtures__/1password-identity-card-minimal.json
git commit -m "test: add regression baseline for header unlock and 1pux parsing"
```

---

### Task 2: Web detalhe com título truncado + tooltip sem mover ações

**Files:**
- Modify: `apps/web/src/pages/VaultShellPage.vue:4055-4128`
- Modify: `apps/web/src/styles.css:1791-1888`
- Test: `apps/web/src/pages/VaultShellPage.test.ts`

**Step 1: Write failing DOM assertion**

No teste do detalhe:
- Garantir que título longo recebe classe dedicada de truncamento.
- Garantir `title` (tooltip nativo) com texto completo.
- Garantir presença do grupo de ações sem alteração de ordem.

**Step 2: Run test to verify failure**

Run:
- `npm run test --workspace @vaultlite/web -- VaultShellPage.test.ts`

Expected:
- FAIL: classe/atributo ainda ausente.

**Step 3: Implement minimal UI fix**

Implementar:
- Envolver `h2` em container com `min-width: 0`.
- Aplicar em `h2`:
  - `white-space: nowrap`
  - `overflow: hidden`
  - `text-overflow: ellipsis`
- Em `h2`, adicionar `:title="selectedItemInContext.payload.title"`.
- Manter ações com largura fixa e sem wrap em desktop.

**Step 4: Run test and quick style suite**

Run:
- `npm run test --workspace @vaultlite/web -- VaultShellPage.test.ts`
- `npm run typecheck --workspace @vaultlite/web`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/web/src/pages/VaultShellPage.vue apps/web/src/styles.css apps/web/src/pages/VaultShellPage.test.ts
git commit -m "fix(web): truncate detail title with tooltip and keep header actions stable"
```

---

### Task 3: Extensão unlock cache-first sem skeleton desnecessário

**Files:**
- Modify: `apps/extension/popup.js:1748-1915,2202-2610`
- Modify: `apps/extension/background.js:45,1743-1765,4956-5045`
- Test: `apps/extension/src/popup-view-model.test.js`
- Test: `apps/extension/src/background-controller.test.ts` (ou teste existente equivalente)

**Step 1: Write failing behavior tests**

Cobrir:
- Com projection/snapshot disponível, unlock não rende skeleton.
- `refreshStateAndMaybeList(showLoading:false)` mantém lista atual enquanto revalida.
- `list_credentials` retorna projection imediatamente quando `credentialsCache` está vazio.

**Step 2: Run tests to verify failure**

Run:
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js background-controller.test.ts`

Expected:
- FAIL em cenários de unlock.

**Step 3: Implement cache-first and no-flicker policy**

Implementar:
- No popup: quando `currentItems` ou snapshot persistido existir, nunca zerar lista no unlock.
- No popup: skeleton apenas quando não existir nenhum fallback local.
- No background: manter projection como primeira fonte e evitar transição visual vazia durante `cacheWarmupState`.
- Revisar gatilho de refresh pós-unlock para não forçar ciclo agressivo quando sessão ainda válida.

**Step 4: Run extension tests**

Run:
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js background-controller.test.ts`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/extension/popup.js apps/extension/background.js apps/extension/src/popup-view-model.test.js apps/extension/src/background-controller.test.ts
git commit -m "fix(extension): cache-first unlock flow to avoid unnecessary skeleton flicker"
```

---

### Task 4: Parser 1PUX fiel (categorias, campos, tags, vault)

**Files:**
- Modify: `apps/web/src/lib/vault-import.ts:53-90,510-530,1159-1275,1514-1535`
- Modify: `apps/web/src/lib/vault-import.test.ts`
- Modify: `apps/web/src/lib/data-portability.ts` (somente se tipagem/preview exigir)

**Step 1: Write failing parser tests**

Adicionar casos:
- `categoryUuid=004` mapeia para `card`.
- `categoryUuid=006` mapeia para `secure_note` estruturado (ou mapeamento decidido no PR) sem metadados ruidosos.
- `overview.tags` preservadas em `customFields` (ex.: `Imported tags`).
- Nome do vault de origem preservado via contexto do container `accounts[].vaults[]`.
- `flattenStructuredValues` não serializa chaves técnicas (`id`, `guarded`, `inputTraits`, etc.).

**Step 2: Run tests to verify failure**

Run:
- `npm run test --workspace @vaultlite/web -- vault-import.test.ts`

Expected:
- FAIL nos novos cenários.

**Step 3: Implement parser refactor**

Implementar:
- Expandir `ParsedImportCandidate.itemType` para incluir `card`.
- Substituir `find1PasswordItems` por coleta contextual que retorne item + `vaultName`.
- Criar mapeador por categoria:
  - login -> `login`
  - card -> `card`
  - document -> `document`
  - identity/unknown -> `secure_note` estruturado sem ruído
- Extrair campos de seções por `field.id/title/value`, ignorando metadados técnicos.
- Popular `customFields` com tags e campos extras úteis.
- Evitar concatenar dump de objeto em `notes`.

**Step 4: Run parser and web tests**

Run:
- `npm run test --workspace @vaultlite/web -- vault-import.test.ts`
- `npm run test --workspace @vaultlite/web -- data-portability.test.ts`
- `npm run typecheck --workspace @vaultlite/web`

Expected:
- PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/vault-import.ts apps/web/src/lib/vault-import.test.ts apps/web/src/lib/data-portability.ts
git commit -m "fix(import): map 1pux categories and fields without metadata noise"
```

---

### Task 5: Validação E2E local e critérios de aceite

**Files:**
- Modify: `docs/quick-commands.md` (se precisar acrescentar comandos de validação)
- Create: `docs/plans/2026-03-29-unified-web-extension-1pux-fixes-validation.md`

**Step 1: Define acceptance checks**

Checklist:
- Header web: título longo truncado com tooltip; ações fixas.
- Unlock extensão: sem skeleton quando existe cache local.
- Import 1PUX: card/identity renderizam de forma legível sem dump de metadados.

**Step 2: Run full targeted suite**

Run:
- `npm run test --workspace @vaultlite/web -- VaultShellPage.test.ts vault-import.test.ts`
- `npm run test --workspace @vaultlite/extension -- popup-view-model.test.js`
- `npm run typecheck --workspace @vaultlite/web`
- `npm run typecheck --workspace @vaultlite/extension`

Expected:
- PASS.

**Step 3: Manual smoke**

Fluxo manual:
1. Abrir item com título muito longo no web.
2. Lock/unlock extensão sem fechar navegador.
3. Importar `.1pux` com item de cartão e identidade.

**Step 4: Document outcomes**

Registrar resultado objetivo (pass/fail + observações) no arquivo de validação.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-29-unified-web-extension-1pux-fixes-validation.md docs/quick-commands.md
git commit -m "docs: add validation protocol for unified ux unlock and 1pux fixes"
```

---

## Official references (for implementation decisions)
- 1Password `.1pux` format: https://support.1password.com/1pux-format/
- 1Password item categories: https://support.1password.com/item-categories/
- MDN text truncation (`text-overflow`): https://developer.mozilla.org/docs/Web/CSS/text-overflow

