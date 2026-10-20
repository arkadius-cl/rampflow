---
title: Your first module change
description: A guided first change to the module contract. Add the boolean entitlement safety.register to the safety manifest, put it in the Pro package, gate an API route and a nav item with it, and watch the generated docs, the i18n check and the route-case test react.
type: tutorial
audience: [developer, agent]
tags: [tutorial, modules, entitlements, packages, navigation, i18n, testing]
status: stable
updated: 2026-10-20
related: [docs/reference/module-contract.md, docs/how-to/add-a-module-or-entitlement.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md]
---

# Your first module change

In this tutorial we add a paid feature to rampflow. The safety module gets a new entitlement, `safety.register`, that switches the acknowledgement register on or off per tenant. We put it in the Pro package and gate two things with it: the API route that searches the register, and the **Acknowledgements** item in the sidebar. On the way, we watch each check in the repository tell us what to do next.

The change is a practice run. We make it on a scratch branch and throw it away at the end.

You need a checkout that runs: Postgres and Mailpit up, the database migrated and seeded, as in [Run rampflow locally](../how-to/run-locally.md).

## Create a scratch branch

```sh
git switch -c scratch-safety-register
```

## Declare the entitlement

Every key of a module lives in its manifest. Open `packages/shared/src/modules/safety/manifest.ts` and add the key to `entitlements`, after `safety.gate_enforcement`:

```ts
  entitlements: {
    'safety.briefings': { kind: EntitlementKind.feature },
    'safety.validity': { kind: EntitlementKind.feature },
    'safety.quiz': { kind: EntitlementKind.feature },
    'safety.gate_enforcement': { kind: EntitlementKind.feature },
    'safety.register': { kind: EntitlementKind.feature },
    'safety.max_briefing_templates': { kind: EntitlementKind.limit },
    'safety.media': { kind: EntitlementKind.feature, reserved: true },
  },
```

`EntitlementKind.feature` makes it a boolean. The compiler now knows `safety.register` as an `ImplementedFeatureKey`.

Run the contract tests of the shared package:

```sh
pnpm --filter @rampflow/shared test
```

They pass. `validateCatalog` accepts the key, because it carries the module's prefix.

## Watch the docs and the i18n check fail

Two generated artifacts depend on the manifests. Run both checks:

```sh
pnpm docs:check
pnpm i18n:derive --check
```

Both fail:

```text
docs/reference/module-contract.md has stale catalog tables. Run `pnpm docs:index`.
```

```text
Derived i18n files out of date; run pnpm i18n:derive:
  packages/i18n/locales/de/safety/entitlements.json
  packages/i18n/locales/en/safety/entitlements.json
  packages/i18n/locales/pl/safety/entitlements.json
```

The catalog tables in the module contract are generated from the manifests, and every entitlement needs a label in each locale of its module.

## Generate the label and translate it

1. Write the derived label files:

   ```sh
   pnpm i18n:derive
   ```

   Each of the three files gets a new line `"register": "Register"`. The script makes a label from the key in English and copies it into German and Polish as a placeholder.

2. Replace the placeholders with real labels:

   | File | Line |
   |---|---|
   | `packages/i18n/locales/en/safety/entitlements.json` | `"register": "Acknowledgement register",` |
   | `packages/i18n/locales/de/safety/entitlements.json` | `"register": "Register der Bestätigungen",` |
   | `packages/i18n/locales/pl/safety/entitlements.json` | `"register": "Rejestr potwierdzeń",` |

3. Run `pnpm i18n:derive --check` again. It prints `Derived i18n files are current`. The script keeps labels that exist, so your translations stay.

## Put the entitlement in a package

A feature that no package holds is off for every tenant. Open `packages/shared/src/packages.ts` and add the key to `pro`:

```ts
const pro = {
  ...start,
  // ...
  'safety.quiz': true,
  'safety.gate_enforcement': true,
  'safety.register': true,
} as const satisfies PackageValues;
```

`enterprise` spreads `pro`, so Enterprise gets the feature too. Start does not.

## Gate the nav item

In the same manifest, find the nav item `acknowledgements` and add the entitlement:

```ts
    {
      id: 'acknowledgements',
      area: OrgKind.tenant,
      to: '/t/$orgId/safety/acknowledgements',
      icon: 'clipboard-check',
      permission: 'safety.view_register',
      entitlement: 'safety.register',
    },
```

Inside a manifest, keys stay strings: the manifest declares them, and `Permission`, `Feature` and `Setting` in `@rampflow/shared/values` are built from it ([ADR-0019](../decisions/ADR-0019-central-value-sets.md)). Everywhere else the new key is `Feature.safety.register`. The compiler checks the key. Misspell it as `'safety.registr'` and run `pnpm --filter @rampflow/shared typecheck`:

```text
error TS2820: Type '"safety.registr"' is not assignable to type 'ImplementedFeatureIn<...>'. Did you mean '"safety.register"'?
```

Fix the spelling before you go on.

## Regenerate the docs

```sh
pnpm docs:index
```

It prints a line that starts with `wrote docs/INDEX.md`. Run `git diff docs/reference/module-contract.md` and look at three changed rows:

- **Modules**: the `safety` row lists `safety.register` among its implemented entitlements.
- **Navigation**: `safety:nav.acknowledgements` has `safety.register` in the **Entitlement** column.
- **Packages**: a new row `safety.register` is empty for start and `true` for pro and enterprise.

`pnpm docs:check` now passes.

## Write the route case first

Every guarded route has a route case that the test harness runs from all sides: foreign tenant, rival carrier, foreign site, missing permission, entitlement off. Open `apps/api/src/modules/safety/register/route-cases.ts` and declare the entitlement on the search route. Add `Feature` to the file's import from `@rampflow/shared/values`:

```ts
  {
    ...base,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/safety/acknowledgements/search',
    entitlement: Feature.safety.register,
  },
```

Run the route cases of the register:

```sh
pnpm --filter @rampflow/api test route-cases -t acknowledgements
```

The search case fails:

```text
FAIL  test/route-cases.test.ts > route cases of every module > POST /api/t/:orgId/safety/acknowledgements/search
+   {
+     "check": "entitlement",
+     "detail": "expected 403 entitlement_required, got 200 {\"items\":[...
```

The harness turned the entitlement off for the test tenant and still got the register back. The route does not check the entitlement yet.

## Gate the API route

Open `apps/api/src/modules/safety/register/routes.tenant.ts`. Import `requireEntitlement` next to `requirePermission` and `Feature` from `@rampflow/shared/values`, and add the guard to the search route after the permission check:

```ts
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
```

```ts
  .post(
    '/acknowledgements/search',
    op({ id: 'safety.register.searchAcknowledgements', ... }),
    view,
    requireEntitlement(Feature.safety.register),
    validate(ValidationTarget.json, RegisterSearchBody),
```

The `op()` call stays first and unchanged. The API description reads the entitlement from the guard, so the description text does not need to mention it.

Run the route cases again:

```sh
pnpm --filter @rampflow/api test route-cases -t acknowledgements
```

All four acknowledgement cases pass.

## See it in the app

`pnpm dev` picks up the change: the API restarts, and the web app reloads.

1. Sign in at <http://localhost:5173> as `admin@rampflow.local` with the password `rampflow-demo`.
2. Select **Tenants**, then **Acme Logistics**. The **Entitlements** table has a row **Acknowledgement register** `safety.register` with the value **On** from the package Pro.
3. Under **Add override**, select **Acknowledgement register (safety.register)**, set **Value** to **Off**, enter the note `Tutorial`, and select **Add override**.
4. In a private window, sign in as `dispatch@acme.local`. The sidebar has no **Acknowledgements** item.
5. Open `/t/<org id>/safety/acknowledgements` directly, with the org id from the address bar. The page loads, but its search fails with the message **Your package does not include this.** The API answered 403 `entitlement_required`.
6. Back as the platform admin, select **Remove the override of safety.register**. The item returns to the dispatcher's sidebar on the next page load.

A real feature would also pass the entitlement to the screen's `guard()`, so the page shows "no access" instead of an empty register, and gate every route that serves the feature. [Add a module or an entitlement](../how-to/add-a-module-or-entitlement.md) lists every step.

## Throw the change away

Remove the override in step 6 first. Then reset the branch and delete it:

```sh
git checkout -- .
git switch -
git branch -D scratch-safety-register
```

## What we did

- We declared `safety.register` in the safety manifest, and the compiler checked every reference to it.
- `pnpm i18n:derive` and `pnpm docs:index` turned the manifest change into labels and catalog tables, and their `--check` and `docs:check` modes told us when they were stale.
- We wrote the route case first, saw the harness catch the missing gate, then added `requireEntitlement`.
- The platform admin's override showed the gate from the user's side: the nav item disappeared and the API answered 403.

The reasons behind this design are in [ADR-0006](../decisions/ADR-0006-module-manifest-entitlements-permissions.md). The facts are in [Module contract](../reference/module-contract.md).
