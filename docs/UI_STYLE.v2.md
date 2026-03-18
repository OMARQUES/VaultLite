# VaultLite UI Style Guide

Status: `active baseline`
Scope: `web app`

This document defines the standing visual baseline for the current web product.
It does not replace product, security, or architecture docs.
It does not describe extension implementation.
It does not authorize future-scope navigation.

## Product direction

VaultLite UI follows `Calm Utility`.

Meaning:
- reliable
- direct
- quiet
- low-noise
- mature
- never theatrical

The product must not look like:
- security cosplay
- a demo dashboard
- a component showroom
- an internal tool
- a startup landing page disguised as an app

## Current authenticated product structure

The active authenticated product for this round has only:
- `Vault`
- `Settings`

Do not surface dead navigation for unfinished areas.
Do not add `Devices`, `Import / Export`, or `Admin` to active navigation in this round.

## Current shell model

### Public shell
Used for:
- `Home`
- `Onboarding`
- `Auth`
- `Unlock`

Rules:
- one task per screen
- one dominant primary action
- minimal supporting copy
- no authenticated app chrome

### Authenticated shell
Used for:
- `Vault`
- `Settings`

Rules:
- persistent app shell on tablet/desktop where appropriate
- no dead nav
- no sensitive actions in the primary vault workspace
- no operational status panel in the vault

## Theme strategy

- `dual parity`
- validate dark first if useful
- accept only with real light/dark parity
- first load follows `prefers-color-scheme`
- explicit user preference overrides the system default

## Typography

- UI font: `Manrope`
- mono/technical display: `IBM Plex Mono`

Use typography to create hierarchy, not decoration.
Do not oversize headings inside the authenticated app.

## Core semantic tokens

Required tokens:
- `background`
- `surface`
- `surface-2`
- `surface-3`
- `text`
- `text-muted`
- `primary`
- `primary-hover`
- `border`
- `focus`
- `success`
- `warning`
- `warning-surface`
- `warning-text`
- `warning-border`
- `danger`
- `overlay`
- `shadow-sm`
- `shadow-md`
- `radius-sm`
- `radius-md`
- `radius-lg`

Spacing scale:
- `4`
- `8`
- `12`
- `16`
- `20`
- `24`
- `32`
- `40`

## Palette baseline

### Light
- background: `#F7F8F5`
- surface: `#FCFCF9`
- surface-2: `#EEF1EC`
- surface-3: `#E5E9E2`
- text: `#16211D`
- text-muted: `#5C6661`
- primary: `#1E5A4E`
- primary-hover: `#17483F`
- border: `#D6DBD2`
- focus: `#2E7D69`
- success: `#2F7A57`
- warning: `#A86B1F`
- warning-surface: `#F6E7C9`
- warning-text: `#6E4A12`
- warning-border: `#D9B067`
- danger: `#B44A2D`

### Dark
- background: `#101714`
- surface: `#17211D`
- surface-2: `#22302A`
- surface-3: `#2B3B34`
- text: `#F4F6F2`
- text-muted: `#B5BDB8`
- primary: `#4FA08B`
- primary-hover: `#63B69F`
- border: `#2F3E38`
- focus: `#76C9B3`
- success: `#63B980`
- warning: `#D3A24C`
- warning-surface: `#3B2D14`
- warning-text: `#F2D79A`
- warning-border: `#8B6830`
- danger: `#D26A52`

## Mobile-first layout rules

### Mobile narrow
- one main surface at a time
- list is the default vault surface
- detail, create, and edit are route-driven exclusive surfaces
- no full editor in `sheet`
- no two-pane authenticated vault layout

### Tablet
- list remains primary
- detail may coexist only when width stays usable
- otherwise detail/editor becomes exclusive

### Desktop
- stable three-region vault composition
- navigation/organization
- list/search
- detail/editor

## Vault-specific visual rules

The vault must feel like a product workspace, not a dashboard.

### Structure
- left region: navigation and organization
- center region: search and list
- right region: detail/editor

### Sidebar
- low-noise section labels
- no decorative badges
- no admin-panel look
- current round blocks:
  - `All`, `Favorites`, `Trash`
  - `Login`, `Documents`
  - `Folders` + `New folder`

### List
- compact search at top
- dense rows
- one title + one short subtitle max
- no secret preview
- no oversized list cards

### Detail
- title and actions at top
- `SecretField` for secret values
- thin separators, not inflated panels
- actions compact and controlled

## Sensitive vs destructive actions

### Sensitive actions
Examples:
- Account Kit reissue
- export/import
- password rotation
- device revoke

Rules:
- not in primary vault flow
- not in primary navigation
- belong in `Settings` or explicit sensitive sections
- do not use red by default

### Destructive actions
Use `DangerZone` for destructive or irreversible actions.
Always visually separate it from routine actions.

## Microcopy rules

Only keep text that helps an immediate decision.

Allowed categories:
- titles
- labels
- CTAs
- empty states
- real warnings
- real validation/errors
- minimal interaction feedback like `Copied`

Forbidden:
- architecture explanations
- workflow explanations
- layout explanations
- decorative marketing copy
- internal-tool commentary

## Accessibility baseline

- `focus-visible` is mandatory
- states must not depend only on color
- keyboard interaction must work for search, list, detail, dialog, and dirty-state confirmation
- contrast must hold in dark and light
- search shortcut and escape behavior must remain explicit in vault flows
