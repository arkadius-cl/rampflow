# Design

## Context

- Both tables already get the module of each row from the API: `PackageView.values[].module` and `EntitlementView.module` (`packages/shared/src/modules/core/api.platform.ts`). Reserved keys are filtered out by the API (`core/platform/tenants.ts`), so `core` shows only its three limits.
- The packages page builds its row list by sorting packages by length and deduplicating, which happens to keep catalog order. The tenant card renders `tenant.entitlements` as returned.
- Labels come from the derived part `<module>:entitlements.<rest>` (`useEntitlementLabel`). No part names a module; `core/settings-ui.json` has topical section titles ("Buchungsregeln") that do not fit a module header.
- `app_user` holds `name` and `locale`; `PATCH /api/me` takes `{ name?, locale? }` and returns `MeResponse` (zod, `api.auth.ts`). The web reads it through `meQuery` (`apps/web/src/lib/access.ts`, `staleTime` 60 s). Browser-only state today: last org, last site (localStorage) and the sidebar (cookie).
- `app_user` rows are readable by the user, by members of shared orgs (`shares_org`) and by the platform.

## Goals / Non-Goals

**Goals:**
- One group table component used by both platform screens.
- A general, typed place for per-user UI state that later screens can add keys to without a migration.

**Non-Goals:**
- Grouping other tables (settings, staff) or moving the sidebar and last-org state to the server.
- A preferences screen. Preferences are set only by using the UI.
- Hiding preferences from org admins (see ADR decision below).

## Decisions

### 1. Store preferences in `app_user.ui_prefs jsonb`, merged per key

Column `ui_prefs jsonb not null default '{}'::jsonb` on `app_user`, with a check `jsonb_typeof(ui_prefs) = 'object'`. `PATCH /api/me` writes `set ui_prefs = ui_prefs || $patch::jsonb` in the same statement as `name` and `locale`, so a write touches only its own keys and two browsers writing different keys never lose an update. The same key written twice is last-writer-wins, which is fine for UI state.

Alternatives: a `user_pref(user_id, key, value)` table with RLS limited to the user. It keeps preferences private and needs no merge, but adds a table, an ORACLE rule, model rows and route cases for a new endpoint. The user chose the column for now; the ADR records that a move to a table stays possible because the API shape (`uiPrefs` on `/api/me`) does not change.

Alternative: replace the whole object on write. Rejected: a second computer would wipe the keys the first one wrote.

### 2. One zod schema per key in `packages/shared/src/modules/core/ui-prefs.ts`

```ts
const ModuleId = z.enum(catalog.map((m) => m.id));
const OpenModules = z.array(ModuleId).max(catalog.length).refine(unique);
export const UI_PREFS = {
  'platform.packages.openModules': OpenModules,
  'platform.tenant.openModules': OpenModules,
} as const;
export const UiPrefs = z.strictObject(UI_PREFS).partial();
export type UiPrefKey = keyof typeof UI_PREFS;
export type UiPrefs = z.infer<typeof UiPrefs>;
```

`MePatchBody` gains `uiPrefs: UiPrefs` (strict, so an unknown key is a 422 with its path). `MeResponse` gains `uiPrefs: UiPrefs`. On read, the server parses each stored key on its own with `UI_PREFS[key].safeParse` and drops unknown or invalid keys, so a renamed module or a removed key never breaks `/api/me`. Keys are `<area>.<screen>.<what>`; a new key is one line plus its schema.

### 3. Web: a hook over `meQuery` with optimistic update and debounce

`useUiPref(key)` returns `[value, set]`. `set` writes the new value into the `meQuery` cache immediately (`setQueryData`) and sends `PATCH /api/me { uiPrefs: { [key]: value } }` after 400 ms of quiet, one request per key. On error it shows the standard toast and invalidates `meQuery`. Reading from `meQuery` means the stored state is there on first render of a platform page, because the shell already loaded `/api/me`.

Alternative: a separate query for preferences. Rejected: one more request and a second cache for data `/api/me` already returns.

### 4. Shared group table: `ModuleGroupTable` + `useModuleGroups`

Under `apps/web/src/modules/core/entitlement-groups.tsx`:

- `groupByModule(rows)` returns `{ module, rows }[]` in catalog order, rows in manifest order (index from `catalog`), skipping empty modules. Pure function, used by both pages; it also replaces the sort-and-deduplicate trick on the packages page.
- `useModuleGroups(prefKey, modules)` wraps `useUiPref` and returns `isOpen(m)`, `toggle(m)`, `allOpen`, `toggleAll()`. Missing preference = all collapsed.
- `ModuleGroupTable` takes the columns (header cells), the groups, a `renderRow(row)` and a `summary(group, columnIndex)`, and renders per group a header row: a full-width `<button aria-expanded>` inside the first cell with a chevron icon (`ChevronRight`/`ChevronDown`), the module name and the row count, then one summary cell per value column. The "Expand all / Collapse all" button sits above the table.
- Summary: `features = rows.filter(kind === 'feature')`; empty when none, else `${on}/${features.length}`, where "on" is `value === true` for the column's value. On the tenant card the value column uses `value`, the package column `packageValue`, the source column shows nothing.

A shadcn `Collapsible` per group is not used: a collapsible cannot wrap table rows without breaking the table semantics, and a button row with `aria-expanded` gives the same behaviour.

### 5. Module names as a derived label part `module.json`

`scripts/i18n-derive.ts` gains a part `module` with the key `name` for every module in the catalog, written like the other parts (placeholder = humanized id in `en`, the `en` text in other locales). The web reads `t('<module>:module.name')`. Deriving it for every module, not only those with entitlements, keeps the rule simple and gives later screens (settings, audit) a module name.

### 6. ADR-0014 for user UI preferences

UI preferences are a new pattern other units will reuse, with a visibility trade-off. ADR-0014 records: storage in `app_user.ui_prefs`, per-key merge, per-key zod schemas in `packages/shared`, drop-on-read for stale keys, visible to everyone who can read the user row and therefore UI state only, and the path to a private table if that changes. ADR-0009 point 5 is updated for the new derived part.

## Risks / Trade-offs

- [Preferences are readable by org admins through RLS on `app_user`] → only UI state goes there; ADR-0014 says so, and `GET` routes that list users keep selecting explicit columns, so the column does not leak into staff responses.
- [Fast toggling sends many writes] → 400 ms debounce per key and the optimistic cache; the last state wins.
- [Collapsed by default hides rows the PL-02 e2e reads] → the e2e expands the group first. `pnpm docs:screens` captures only `/platform/tenants`, not the packages or tenant detail page, so no screenshot changes.
- [Anonymized users keep UI state] → the retention job (`privacy/jobs/retention.ts`) already resets `name` and `locale` when it anonymizes a user; it also resets `ui_prefs` to `{}`.
- [A module id is renamed or removed] → stored lists hold an invalid id; the read drops the key, so the user sees all collapsed once.
- [`ui_prefs` grows without bound] → strict schema with known keys only and a bounded list per key.

## Migration Plan

One generated migration (`pnpm db:generate --name group-entitlements-by-module`) adds the column with its default, so existing rows get `{}` and no backfill is needed. Rollback: drop the column; the web treats a missing `uiPrefs` as `{}`.

## Seed data

`apps/api/scripts/seed/core.ts` sets `ui_prefs` for the platform admin `admin@rampflow.local` to `{ "platform.packages.openModules": ["booking", "yard"] }`. A fresh `pnpm db:seed` + `pnpm dev` then shows the packages page with two groups open and the rest collapsed with summaries, and a tenant page fully collapsed, so both the stored state and the default are visible. The seed finds the user by email and writes the value with the same per-key merge, so a second run converges and keeps other keys the admin set by hand.
