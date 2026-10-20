# Tasks

## 1. UI preferences: data model and API

- [x] 1.1 Add `packages/shared/src/modules/core/ui-prefs.ts` with `UI_PREFS` (`platform.packages.openModules`, `platform.tenant.openModules`), `UiPrefs`, `UiPrefKey` and a `parseStoredUiPrefs` that drops unknown or invalid keys; verify with a unit test next to it (unknown key dropped, invalid module id dropped, duplicate ids rejected by the strict schema).
- [x] 1.2 Add `uiPrefs` to `MePatchBody` (optional, strict) and to `MeResponse` in `api.auth.ts`; verify `pnpm typecheck` passes.
- [x] 1.3 Add `uiPrefs: jsonb('ui_prefs').notNull().default({})` with the check `jsonb_typeof(ui_prefs) = 'object'` to `appUser` in `apps/api/src/modules/core/schema.ts`, run `pnpm db:generate --name group-entitlements-by-module`; verify the migration adds one column and one check, and `rls.test.ts` stays green.
- [x] 1.4 In `core/me/routes.user.ts` select `ui_prefs` and return it through `parseStoredUiPrefs`; on `PATCH` write `ui_prefs = ui_prefs || $patch::jsonb` in the same update as `name` and `locale`; update the `op` descriptions; verify with `me.test.ts` cases for each scenario of `specs/user-ui-preferences/spec.md` (new user `{}`, merge of two keys from two sessions, name-only patch keeps prefs, unknown key 422 with path, invalid value 422, stale stored key dropped, user B's write leaves user A unchanged).
- [x] 1.5 Clear `ui_prefs` to `{}` where `privacy/jobs/retention.ts` anonymizes a user; verify with an assertion in `retention.test.ts`.
- [x] 1.6 Run `pnpm api:docs`; verify `openapi.gen.json` and the `/api/me` rows in `docs/reference/api-routes.md` show `uiPrefs`.

## 2. Module names

- [x] 2.1 Add the part `module` with key `name` for every catalog module to `scripts/i18n-derive.ts`, run `pnpm i18n:derive`; verify every `packages/i18n/locales/<locale>/<module>/module.json` exists and `pnpm i18n:derive --check` passes.
- [x] 2.2 Write the English module names in `en/<module>/module.json` and translate them in every locale of the module's set; verify `packages/i18n/src/catalogs.test.ts` passes.
- [x] 2.3 Add "Expand all" / "Collapse all" and the group header label ("{{module}}, {{count}} entitlements") to `core/platform.json` in every staff locale; verify `packages/i18n/src/catalogs.test.ts` passes.

## 3. Web: preference hook and group table

- [x] 3.1 Add `useUiPref(key)` next to `meQuery` in `apps/web/src/lib/access.ts`: optimistic `setQueryData`, `PATCH /api/me` debounced 400 ms per key, toast and invalidate on error; verify by toggling in `pnpm dev` and seeing one request per pause in the network log.
- [x] 3.2 Add `apps/web/src/modules/core/entitlement-groups.tsx` with `groupByModule` (catalog order, manifest row order, no empty groups), `useModuleGroups(prefKey, modules)` (missing pref = all collapsed) and `ModuleGroupTable` (header row as `<button aria-expanded>` of at least 44 px with chevron icon, module name and count; per-column `on/total` feature summary when collapsed, empty for limits only; "Expand all / Collapse all" button above the table); verify `pnpm typecheck` and `pnpm lint` pass.
- [x] 3.3 Use `ModuleGroupTable` on `routes/platform/packages/index.tsx` with key `platform.packages.openModules`, replacing the sort-and-deduplicate row list; verify in `pnpm dev` that the page starts collapsed with summaries and a group expands by click and by Enter.
- [x] 3.4 Use `ModuleGroupTable` in `EntitlementsCard` of `routes/platform/tenants/$tenantId.tsx` with key `platform.tenant.openModules` (summary: `value` column and `packageValue` column, none for source); keep `data-testid="entitlement-<key>"` on rows; verify in `pnpm dev` that an override turning on `brand.logo` counts in the value summary only.
- [x] 3.5 Extend `e2e/core/PL-02.spec.ts`: expand "Safety" before reading the `safety.quiz` row; check the collapsed summary of one group per package; "Expand all" then "Collapse all"; expanding "Yard" survives a new browser context; the tenant page starts collapsed; expand the group before each override assertion; run axe on both screens with groups collapsed and expanded; verify with `pnpm test:e2e e2e/core/PL-02.spec.ts`.

## 4. Seed

- [x] 4.1 In `apps/api/scripts/seed/core.ts` set `ui_prefs` of `admin@rampflow.local` (found by email) to include `{ "platform.packages.openModules": ["booking", "yard"] }` with the per-key merge; extend `core.test.ts` so two seed runs converge and keep a key set by hand.
- [x] 4.2 On a fresh database run `pnpm db:seed` then `pnpm dev`, sign in as the platform admin; verify `/platform/packages` shows Booking and Yard open and the rest collapsed with summaries, and a tenant page shows every group collapsed.

## 5. Docs

- [x] 5.1 Write `docs/decisions/ADR-0014-user-ui-preferences.md` (type `explanation`, tag `adr`): storage in `app_user.ui_prefs`, per-key merge, per-key zod schemas, drop-on-read, visibility through the user row so UI state only, the path to a private table.
- [x] 5.2 Update `docs/decisions/ADR-0009-i18n-catalogs.md` point 5 to list `module.json` as a derived part.
- [x] 5.3 Add `ui_prefs` to the `app_user` section of `docs/reference/data-model.md`.
- [x] 5.4 Check the `/api/me` text in `docs/reference/api-routes.md` around the generated tables mentions `uiPrefs` and links ADR-0014.
- [x] 5.5 Add `module.json` to the derived parts in `docs/reference/module-contract.md` (step 5) and `docs/how-to/add-a-module-or-entitlement.md` (i18n namespace step).
- [x] 5.6 Mention the grouped, collapsible view in PL-02 of `docs/explanation/mvp-scope.md`.
- [x] 5.7 Run `pnpm docs:index` and `pnpm docs:check`; verify both pass.

## 6. Integration

- [x] 6.1 Run `pnpm verify` and `pnpm test:e2e e2e/core`; verify both are green.
- [x] 6.2 Write the report's deviations from the contract: the new `app_user` column, the `/api/me` body and response fields, the new derived i18n part, ADR-0014.
