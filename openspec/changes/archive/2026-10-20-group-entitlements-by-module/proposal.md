# Proposal

## Why

The platform screens list entitlements as one flat table: about 40 rows from 9 modules on `/platform/packages` (PL-02), and the same rows again in the entitlements card of `/platform/tenants/$tenantId`. To compare packages or check a tenant you scroll and read the key prefix (`core.`, `yard.`, `safety.`) to know where a module starts. Grouping the rows by module and letting the admin fold the groups turns the table into a short list of modules. A collapsed group still shows what each package grants. The admin often works on several office computers, so the open groups are stored in the user's profile and not in the browser.

## What Changes

- **Module groups on both platform entitlement tables.** Rows are grouped by the module that declares the key, in catalog order. Each group has a header row that expands and collapses it. The packages page and the tenant entitlements card use the same component, so the same elements look and behave the same.
- **Summary on collapsed groups.** A collapsed group shows per package (packages page) or per value column (tenant card) how many of the group's features are on, as `on/total`. Limits do not count. A group with limits only shows an empty summary cell.
- **Collapsed by default, one toggle for all.** Without a stored state every group is collapsed. A button above the table expands all groups, or collapses all when every group is open.
- **Module names.** A new derived label part `module.json` with `{ "name": ... }` for every module, written by `pnpm i18n:derive` and translated in every locale of the module's set.
- **UI preferences in the user profile.** A new column `app_user.ui_prefs` (jsonb, default `{}`). `GET /api/me` returns `uiPrefs`. `PATCH /api/me` accepts `uiPrefs` and merges it key by key into the stored object. Each key has a zod schema in `packages/shared`. The first two keys hold the open groups of the two tables. Unknown or invalid stored keys are dropped on read.
- Reserved entitlements stay out of both tables, as today: the API already filters them out.

No breaking change: `uiPrefs` is a new optional field in the `PATCH /api/me` body and a new field in its response.

## Capabilities

### New Capabilities

- `entitlement-overview`: how the platform screens present entitlements: grouping by module, group summaries, expand and collapse, and that the packages page and the tenant page present them the same way.
- `user-ui-preferences`: per-user UI state stored on the server: which keys exist, how they are read and merged, and who can read and write them.

### Modified Capabilities

None. The only existing capability, `api-description`, keeps its requirements; the new field only changes the generated description.

## Impact

- **Code:** `apps/web/src/routes/platform/packages/index.tsx`, `apps/web/src/routes/platform/tenants/$tenantId.tsx` (entitlements card), a new shared group table component and hook under `apps/web/src/modules/core/`, `apps/web/src/lib/access.ts` (`meQuery` cache update). API: `apps/api/src/modules/core/schema.ts`, `core/me/routes.user.ts`, `core/me/me.test.ts`, and `privacy/jobs/retention.ts` (anonymizing a user also clears `ui_prefs`). Shared: `packages/shared/src/modules/core/api.auth.ts` and a new `ui-prefs.ts`. `scripts/i18n-derive.ts` (new `module` part). shadcn `collapsible` is not needed; the group header is a button row in the existing table.
- **i18n:** new `packages/i18n/locales/<locale>/<module>/module.json` for every module and locale; `platform.json` gets the toggle labels.
- **API description:** `pnpm api:docs` regenerates `apps/api/openapi.gen.json` and the `/api/me` rows in `docs/reference/api-routes.md`.
- **Tests:** `me.test.ts` (merge, validation, read), `e2e/core/PL-02.spec.ts` (expands a group before reading a row, checks the summary, checks the state survives a new browser context).
- **Data model:** yes. New column `app_user.ui_prefs jsonb not null default '{}'`, one migration `pnpm db:generate --name group-entitlements-by-module`. Seed: `apps/api/scripts/seed/core.ts` stores open groups for the platform admin.
- **Docs:**
  - `docs/decisions/ADR-0014-user-ui-preferences.md` (new): UI state lives in `app_user.ui_prefs`, merged per key, typed per key, readable by everyone who can read the user row.
  - `docs/decisions/ADR-0009-i18n-catalogs.md`: point 5 lists `module.json` as a derived part.
  - `docs/reference/data-model.md`: `app_user.ui_prefs`.
  - `docs/reference/api-routes.md`: `/api/me` description text (route tables regenerate).
  - `docs/reference/module-contract.md` and `docs/how-to/add-a-module-or-entitlement.md`: a new module gets a derived `module.json`.
  - `docs/explanation/mvp-scope.md`: PL-02 mentions the grouped view.
