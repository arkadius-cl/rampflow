---
title: Add a module or an entitlement
description: The checklist for a new entitlement key or a new module, from the manifest, registry and packages through derived i18n labels, API gates, route cases, RLS rules and screens to the regenerated docs, with the command that checks each step.
type: how-to
audience: [developer, agent]
tags: [modules, entitlements, permissions, packages, i18n, rls, testing, docs]
status: stable
updated: 2026-10-20
related: [docs/reference/module-contract.md, docs/tutorials/first-module-change.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md, docs/decisions/ADR-0009-i18n-catalogs.md]
---

# Add a module or an entitlement

Manifests in `packages/shared` are the contract ([ADR-0006](../decisions/ADR-0006-module-manifest-entitlements-permissions.md)). Every list that names keys, from the docs catalog to the i18n labels, derives from them. This guide lists what to change after a manifest edit, in order, with the command that tells you when a step is done. For a guided first run, follow [Your first module change](../tutorials/first-module-change.md).

## Add an entitlement to an existing module

1. **Manifest.** Add the key to `entitlements` in `packages/shared/src/modules/<id>/manifest.ts`, with the module's prefix:
   - a boolean: `'<id>.<name>': { kind: 'feature' }`,
   - a number: `{ kind: 'limit' }`, or `{ kind: 'limit', soft: true }` for a limit that warns but never blocks,
   - a key you announce but do not build yet: add `reserved: true`. A reserved key resolves to off and cannot appear in packages or overrides.

   ```sh
   pnpm --filter @rampflow/shared test
   ```

2. **Packages.** Add the key to the packages that sell it in `packages/shared/src/packages.ts`. Pro spreads Start and Enterprise spreads Pro, so add it to the cheapest package that includes it. A key that no package holds is off for every tenant without an override.

3. **Labels.** Write the derived label parts, then replace the placeholders in every locale of the module's set (`de`, `en` and `pl` for staff modules, the 12 driver locales for `driver`):

   ```sh
   pnpm i18n:derive
   # translate packages/i18n/locales/<locale>/<id>/entitlements.json
   pnpm i18n:derive --check
   ```

   The script keeps existing labels and drops keys that the manifests no longer have.

4. **API gate.** Choose by the kind of key:
   - A feature finer than the module: add `requireEntitlement('<id>.<name>')` after `requirePermission` on every route that serves the feature.
   - A hard limit: call `withinLimit(tx, tenantId, entitlements, '<id>.<name>', count)` in the handler before the insert. It answers 409 `limit_reached`.
   - A soft limit: read it from `c.var.access.entitlements` and flag the excess. Never block on it.
   - A setting that only makes sense with the feature: set `requires: '<id>.<name>'` on the setting in the manifest. The settings API then hides it and rejects writes while the feature is off.

5. **Route cases.** Set `entitlement: '<id>.<name>'` on the route case of every gated route in the `route-cases.ts` next to its router. The harness then turns the feature off and expects 403 `entitlement_required`. Without that field, the harness never tests the gate.

   ```sh
   pnpm --filter @rampflow/api test route-cases
   ```

6. **Web.** Gate what the user sees:
   - A nav item: set `entitlement: '<id>.<name>'` on the item in the manifest. Only tenant nav items take one, because carrier and platform users have no package.
   - A screen: `beforeLoad: guard({ permission, entitlement: '<id>.<name>' })`.
   - A button or a section: `useAccess().has('<id>.<name>')`.

7. **Docs.** Regenerate the index and the catalog tables in [Module contract](../reference/module-contract.md), then update the entitlement tables of [MVP scope](../explanation/mvp-scope.md) by hand.

   ```sh
   pnpm docs:index
   pnpm docs:check
   ```

8. **Everything.**

   ```sh
   pnpm verify
   ```

## Add a module

Do the steps of the previous section for each of the module's keys, plus these.

1. **Manifest.** Create `packages/shared/src/modules/<id>/manifest.ts` with `defineModule({ id, dependsOn, enabledBy, locales, entitlements, permissions, settings, nav })`.
   - `enabledBy` names the feature that switches the module on, or `null` for a module that is always on.
   - `dependsOn` lists the modules that must be on. A module turns off with any of them.
   - A permission lists the lowest roles that hold it. `ROLE_INCLUDES` adds the higher roles.
   - A nav `to` lies inside its area: `/t/$orgId/`, `/c/$orgId/` or `/platform/`.

2. **Registry.** Import the manifest in `packages/shared/src/registry.ts` and add it to `catalog` after every module in its `dependsOn`. The key types (`FeatureKey`, `PermissionKey`, `SettingKey`, ...) derive from `catalog`.

   ```sh
   pnpm --filter @rampflow/shared test
   pnpm --filter @rampflow/shared typecheck
   ```

3. **i18n namespace.** Create `packages/i18n/locales/<locale>/<id>/` for each locale of the module's set, with the part files of your screens, for example `<id>/<screen>.json`. Then derive the label parts (`module.json`, `nav.json`, `entitlements.json`, `settings.json`), translate the module's name in `module.json`, and the typed web resources in `apps/web/src/lib/i18n-resources.gen.ts`:

   ```sh
   pnpm i18n:derive
   pnpm --filter @rampflow/i18n test
   ```

4. **Tables.** Write the tables, indexes, checks and policies in `apps/api/src/modules/<id>/schema*.ts`, with policies from `apps/api/src/db/rls.ts`. Generate the migration and apply it:

   ```sh
   pnpm db:generate --name u13
   pnpm db:migrate
   ```

   The name must start with `u` and a number. One branch holds one migration. Run `pnpm db:regen --name <same name>` after a rebase onto `main`, then `pnpm db:reset`.

5. **RLS rules.** In `apps/api/src/db/rls.test.ts`, import the schema module into `TABLES` and add one `ORACLE` entry per table: the rule that says which party reads which row. Add rows for the new tables to `seedModel` in `apps/api/test/model.ts`, because the test fails for a table without rows.

   ```sh
   pnpm --filter @rampflow/api test rls
   ```

6. **Routes.** Write one router per party in `apps/api/src/modules/<id>/<area>/routes.<party>.ts` and mount it in `apps/api/src/modules/index.ts`. Wrap a router of a module that can be off in `withModule('<id>', router)`, at a prefix other than the root. Routers of `core`, `booking` and `privacy` need no wrapper.

7. **Route cases.** Next to each router, export `cases` from `route-cases.ts` with `defineRouteCases`, one case per route. Routes under `/api/me`, `/api/auth` and `/api/public` export `accountCases` with `defineAccountCases` instead. `route-coverage.test.ts` fails for a route without a case.

   ```sh
   pnpm --filter @rampflow/api test route-cases route-coverage
   ```

8. **Emails and jobs.** An email template is `apps/api/src/modules/<id>/emails/<name>.tsx` and exports `category` (`account` or `booking`), `render` and `example`. A job is `apps/api/src/modules/<id>/jobs/<name>.ts` and exports `job`. The outbox and the job runner find both by file name ([ADR-0010](../decisions/ADR-0010-email-outbox-job-runner.md)).

9. **Screens.** Add routes under `apps/web/src/routes/<area>/` with `guard({ permission, entitlement? })`, and components under `apps/web/src/modules/<id>/`. The Vite dev server regenerates `apps/web/src/routeTree.gen.ts`. Without it running:

   ```sh
   pnpm --filter @rampflow/web routes:gen
   ```

10. **Seed.** If the demo needs data, add `apps/api/scripts/seed/<id>.ts` with an idempotent `seed(ctx)`, and add its name to `SEEDS` in `apps/api/scripts/seed-dev.ts` after the modules whose data it reads. Run `pnpm db:seed` twice. The second run must change nothing.

11. **Docs.** Add the module's sections to [Data model](../reference/data-model.md) and [API routes](../reference/api-routes.md). Then regenerate and check everything:

    ```sh
    pnpm docs:index
    pnpm verify
    ```
