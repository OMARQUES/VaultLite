# VaultLite Web UI Execution Rules

Status: `active implementation source`
Scope: `web redesign round`

This document is the coercive implementation source for the current web UI round.
It exists to stop implementation drift.
If this doc conflicts with archived plans, archived plans lose.

## Scope

Included:
- `/`
- `/onboarding`
- `/auth`
- `/unlock`
- `/vault`
- `/settings`

Excluded:
- extension implementation
- future nav surfaces
- future item types without CRUD

## Route model

Canonical public routes:
- `/`
- `/onboarding`
- `/auth`
- `/unlock`

Canonical authenticated routes:
- `/vault`
- `/vault/item/:itemId`
- `/vault/new/login`
- `/vault/new/document`
- `/vault/item/:itemId/edit`
- `/settings`

Route rules:
- routes govern detail/create/edit surfaces
- query governs scope/type/folder/search
- do not move detail/create/edit state into query

Allowed query keys:
- `scope`
- `type`
- `folder`
- `q`

## Public shell enforcement

For:
- `/onboarding`
- `/auth`
- `/unlock`

Rules:
- simple public topbar
- no authenticated sidebar
- no authenticated app chrome
- no extra structural noise unrelated to the active task

## Authenticated navigation for this round

Visible authenticated navigation is limited to:
- `Vault`
- `Settings`

Do not add:
- `Devices`
- `Import / Export`
- `Admin`

in current active navigation.

## Vault rules

### Structural rules
- `/vault` is the authenticated landing page
- no operational panel in `/vault`
- no `Reissue Account Kit` in `/vault`
- no phase, device, or user summary blocks in the main vault content
- no layout-explaining microcopy

### Sidebar structure
- `All`
- `Favorites`
- `Trash`
- `Login`
- `Documents`
- `Folders`
- `New folder`

Do not show `Cards` or `Notes` in nav this round.

### List rules
- search at top
- compact action to create item
- `New` opens a short menu with only:
  - `New login`
  - `New document`
- dense rows
- one short subtitle max
- no secret preview

### Detail rules
- clean header
- compact actions
- `SecretField` for secret values
- no inflated cards

### Dirty state
Applies to create and edit.

- if no unsaved change exists, leaving closes immediately
- if unsaved change exists, `Cancel`, `Esc`, route leave, or selection change triggers discard confirmation
- pending navigation waits for the decision
- `Discard changes` applies pending leave
- `Keep editing` returns to editor intact

### Favorites
- primary favorite toggle in detail header
- desktop list affordance only on hover/focus/selected item
- mobile favorite action only in detail
- `Favorites` never includes trashed items

### Trash
- visually distinct list context
- read-only detail
- no `Edit`
- `Restore` is primary
- `Delete permanently` only in destructive context
- no `Open URL`, reveal, or copy in trash context

### Folders
- `New folder` lives in the folders block header
- discrete action only
- desktop/tablet: inline or simple dialog
- mobile: simple dialog or short dedicated surface
- never a full page

### Empty states
Use only:
- empty vault: `Your vault is empty` / `Create your first item`
- empty search: `No results` / `Reset filters`

No tutorial copy.

## Settings rules

`/settings` opens directly with `Security` as the initial active view and page heading.
Do not render a vague generic settings page.

Order:
- `Session`
- `Account Kit`
- `Password`
- `DangerZone`

Sensitive actions stay here.
They do not drift back into `/vault`.

Settings whitelist baseline for this round:
- `Security`
- `Session`
- `Lock now`
- `Account Kit`
- `Store exported kits outside the browser.`
- `Reissue Account Kit`
- `Password`
- `DangerZone`

Allowed additional text in `Password` section:
- only labels and CTAs strictly required for password-rotation flow steps
- no explanatory paragraphs or decorative copy

## Auth rules

- `SegmentedControl` is mandatory
- one active mode at a time
- modes:
  - `Trusted device`
  - `Add device`
- Account Kit upload is primary in `Add device`
- manual JSON fallback is collapsed by default
- manual fallback never competes with upload at equal prominence

Upload minimum:
- accepted file types: `.json`, `application/json`
- show selected filename
- support `Replace file`
- support `Remove file`

## Onboarding rules

- one card
- one column
- short real warning
- post-kit remains in the same flow
- no second parallel card
- no JSON as focal UI

## Unlock rules

- simplest page in product
- static username line
- password field with initial focus
- one primary CTA
- no extra sections

## Home rules

- public shell only
- short content
- no analytics, score, or dashboard behavior
- no technical explainer content

## Microcopy enforcement

Only use:
- page titles
- labels
- CTAs
- real warnings
- real errors
- explicit empty-state copy
- minimal feedback like `Copied`

Do not add:
- architecture explanations
- flow explanations
- layout explanations
- decorative marketing language
- internal implementation commentary

## Responsive enforcement

### Mobile narrow
- one surface at a time
- list is the primary vault surface
- detail/create/edit on dedicated route surfaces
- no side-by-side vault panes
- no full editor in `sheet`

### Tablet
- deliberate decision for this round: one primary surface at a time
- list remains primary
- detail/editor stays route-exclusive in tablet
- no side-by-side vault panes in tablet

### Desktop
- stable three-region vault layout
- navigation/organization
- list/search
- detail/editor

## Interface and contract impact

This round constrains operational behavior, not backend contract activation for new capabilities.

Locked in this round:
- route-governed detail/create/edit surfaces
- query-governed list context (`scope`, `type`, `folder`, `q`)
- active item types in navigation: `login`, `document`
- IA support for `Favorites`, `Trash`, and `Folders` without claiming cross-device persistence capability

Not activated in this round:
- future nav item types without CRUD
- persistence guarantees beyond currently approved contracts

## Validation checklist

Before calling the step done, verify:
- no dead authenticated nav
- no account-kit action in vault
- no operational summary in vault
- no future item types in nav
- no explanatory microcopy outside strict need
- mobile does not render two vault panes side by side
- settings opens in security-first mode
