# Design

## Context

See proposal.md for the motivation. The inventory of the current code (2026-10-20) found:

- **Forms in use:**
  - `[...] as const` arrays with `(typeof X)[number]`: 27 sets in `packages/shared`, 11 in `apps/api` schema files (5 of them duplicates of shared sets).
  - Two `as const` objects keyed by the set: `ERROR_STATUS`, `RATE_LIMITS`.
  - Union-only types: `TokenPurpose`, `DriverChannel` (defined twice), `EmailCategory`, `KpiUnit`, ...
  - About 100 inline unions in signatures, zod `z.enum([...])` and Drizzle `enum: [...]`.
  - No set at all: conflict reasons (free `details.reason` strings, 32 values), job names (`JobName = string`), booking event types (a zod union of `z.literal`s, free-text column), email templates (an interface filled by declaration merging, free-text column).
- **Manifest keys:** permission, feature, limit and setting keys are object keys inside `defineModule({...})`. `registry.ts` derives `PermissionKey`, `FeatureKey`, `SettingKey`, ... as types only.
- **Database:** no `pgEnum`. Closed columns are `text('c', { enum: ARR })` plus `check(name, oneOf(t.c, ARR))`. `oneOf` (`db/ids.ts`) accepts only `/^[a-z0-9_]+$/`. `booking_event.type`, `booking_acknowledgement.linked_by_party` and `outbox.template` have no check.
- **i18n:** catalogs are keyed by the values (`status.no_show`). The web indexes them with `$.lifecycle.status[status]` (83 sites); 16 sites build template-literal keys.
- **Tooling:** Biome 2.5.15 supports GritQL plugins. A spike confirmed rules for literal comparisons (with `typeof` exempt), `case` labels (`JsCaseClause(test=$v)`), `z.enum([...])`, `z.literal(...)`, `[...] as const` string arrays and discriminant properties (excluding objects under `as const`). `apps/api` already depends on `typescript-6` and has a TS 6 program for `api:docs` (`scripts/openapi/static.ts`).
- **Constraint:** `erasableSyntaxOnly: true` rules out TypeScript `enum`.

## Goals / Non-Goals

**Goals:**

- Exactly one form and one place for every value set, enforced by `pnpm verify` without relying on review.
- A migration that a tool performs and a reviewer can rerun, not 1,500 hand edits.
- The codebase shows only the new pattern once this change lands, including tests, scripts and e2e.

**Non-Goals:**

- Renaming any value, merging sets that differ in meaning (`ActorParty` with `tenant` and `BookingParty` with `staff` stay two sets), or changing stored data.
- Free text, i18n texts, route paths, CSS classes, test names, log messages, `''`, and `typeof` results. These are not closed sets.
- Restructuring the i18n catalogs.

## Decisions

### D1. The form: a self-keyed `as const` object, its value type, and two helpers

```ts
// packages/shared/src/modules/booking/values.ts
export const BookingStatus = {
  requested: 'requested',
  confirmed: 'confirmed',
  no_show: 'no_show',
  // ...
} as const;
export type BookingStatus = ValueOf<typeof BookingStatus>;

// subsets reference the parent, so a rename moves them too
export const FinalBookingStatus = {
  departed: BookingStatus.departed,
  cancelled: BookingStatus.cancelled,
} as const;
export type FinalBookingStatus = ValueOf<typeof FinalBookingStatus>;
```

`packages/shared/src/values/define.ts` exports `ValueOf<T>` and `values(set)`. `values(set)` returns `Object.values` typed as a non-empty tuple `[V, ...V[]]`, which Drizzle's `enum` and `oneOf` need. zod 4's `z.enum(set)` takes the object directly. Keys equal values whenever the value is an identifier. Otherwise the key is a descriptive name, for example `LogoContentType = { png: 'image/png', jpeg: 'image/jpeg' }`.

- *Why the object and not an array:* use sites read `BookingStatus.no_show`, so find-references and rename work, and nobody retypes a value.
- *Alternative:* a helper `defineValues(['a', 'b'])` that builds the object. Rejected: the product owner asked for the plain `{...} as const` form, and the literal is readable without knowing a helper. The key-equals-value rule is checked by a test instead (D7).

### D2. Location: `values.ts` files in `packages/shared`, nowhere else

- Module sets go in `packages/shared/src/modules/<id>/values.ts`.
- Cross-cutting sets go in `packages/shared/src/values/` (`roles.ts`, `locales.ts`, `errors.ts`, `env.ts`, `http.ts`, ...), re-exported from `@rampflow/shared/values`.
- This includes API-internal sets (`RateLimitBucket`, `JobName`, `TokenPurpose`, `OrgKind`). One place to look outweighs keeping a few names out of the web bundle, and tree shaking drops what the web does not import.
- The existing `api*.ts`, `lifecycle.ts` and `manifest.ts` files import their sets from `values.ts`.
- The lint plugin flags a self-keyed string object under `as const` outside `**/values.ts` and `**/values/*.ts` (D6).

### D3. Manifest keys as runtime objects derived from the registry

`packages/shared/src/values/keys.ts` builds nested objects from `catalog` at module load:

```ts
export const Permission = keyTree(catalog, 'permissions');   // Permission.booking.view === 'booking.view'
export const Feature = keyTree(catalog, 'features');          // Feature.booking.pools
export const Limit = keyTree(catalog, 'limits');              // Limit.core.max_sites
export const Setting = keyTree(catalog, 'settings');          // Setting.booking.lead_time
export const Module = moduleIds(catalog);                     // Module.yard === 'yard'
```

The type is a mapped type over the existing key unions. It splits each key at its first `.` into module and name, so `Permission.booking.view` has the literal type `'booking.view'` and `PermissionKey` stays the parameter type of `requirePermission`. No code generation is needed, because the manifests are already `as const` and the registry is the single source. A type test asserts that `ValueOf` of each tree equals the corresponding key union.

- *Alternative:* generate a `keys.gen.ts` with `i18n:derive`. Rejected: one more generated file and staleness check for what a mapped type gives exactly.

### D4. Sets that do not exist yet

- **`ErrorCode`:** moves to `values/errors.ts`. `ERROR_STATUS` in `kernel/errors.ts` becomes `satisfies Record<ErrorCode, number>`, and the web's hand copy is deleted.
- **`ConflictReason`:** collects the 32 reasons. `ApiError` gets an overload so that `conflict` takes `details: { reason: ConflictReason } & Record<string, unknown>`, and the web reads `details.reason` as `ConflictReason | undefined`.
- **`BookingEventType`:** a set. The zod union keeps its `z.literal(BookingEventType.x)` members, which the lint allows because they are not string literals.
- **`EmailTemplate`:** a set. Declaration merging stays for the payload types, keyed by `EmailTemplate` values, and a type test checks that both cover the same names.
- **`JobName`, `SystemActorName`, `TokenPurpose`, `DriverChannel`, `EmailCategory`, `KpiUnit`, `AckChannel`, `SafetyStatus` and the remaining inline unions** from the inventory become sets.
- **Web-local sets** (search-param tabs, views, modes, wizard steps, dialog outcomes) go into `packages/shared/src/modules/<id>/values.ts`, because the rule is one place. They are imported by the route's `validateSearch` through `z.enum(Tab)`.
- **Standard strings that are closed sets in practice:**
  - `NodeEnv` (`development`, `test`, `production`);
  - `HttpMethod`;
  - `SqlState` (the four codes we test);
  - `KeyboardKey` (`Enter`, `Escape`, ...);
  - `VisibilityState`.

  All of them go to `values/`. That way the comparison rule needs no exemption besides `typeof` and `''`.

### D5. Database: `values()` everywhere, `oneOf` widened, three new checks

- Every `text('c', { enum: ARR })` and `oneOf(t.c, ARR)` takes `values(Set)`.
- `oneOf`'s guard widens to `/^[a-z0-9_.]+$/`, so dotted names (`booking.confirmed`, `booking.holiday_import`) pass. The dot cannot break the quoted SQL literal.
- New checks:
  - `booking_event_type_check` with `values(BookingEventType)`;
  - `booking_acknowledgement_linked_by_party_check` with `values(ActorParty)`;
  - `outbox_template_check` with `values(EmailTemplate)`.
- `membershipRoleCheck` keeps its shape and takes the role sets.
- The MIME check in `brand/schema.ts` stays hand-written (`/` and `+` fail the guard), fed by `values(LogoContentType)`.
- The migration is `pnpm db:generate --name 00-central-value-sets`. A precheck query (Migration Plan) proves that existing rows comply.

### D6. Fast layer: Biome GritQL plugin

`lint/value-literals.grit` is registered in `biome.json` `plugins`. It applies to every linted file, including tests and e2e. The rules:

- `$a === $b`, `!==`, `==` and `!=` where either side is a string literal, except the operand of `typeof` and the empty string;
- `case` labels with a string literal (`JsCaseClause(test=$v)`);
- `z.enum([...])` containing a string literal, and `z.literal('...')`;
- `[...] as const` containing a string literal;
- object members named `kind`, `status`, `type`, `as`, `reason`, `role`, `code`, `party`, `state`, `source`, `channel`, `mode`, `direction`, `via`, `tab`, `view`, `step` with a string literal value, unless the object is under `as const`;
- a self-keyed `{...} as const` of string literals outside `values.ts` or `values/`.

Each diagnostic names the fix: "Use the central value set (`X.member` from `@rampflow/shared/...`); see AGENTS.md, Value sets". The spike confirmed each pattern on Biome 2.5.15. Excluded, as everywhere: `components/ui` (vendored shadcn), `*.gen.ts`, `docs`.

### D7. Complete layer: type-aware `pnpm values:check`, which is also the codemod

`scripts/values-check.ts` (root) uses `typescript-6` to build one program per tsconfig: `apps/api`, `apps/web`, `apps/driver`, `packages/shared`, `packages/i18n`, `e2e`. For each string literal expression it asks the checker for the contextual type. When that type is a union of string literals, or a single literal, declared in project source, it reports the literal. Project source excludes `node_modules`, `components/ui` and `*.gen.ts`. Library unions such as Hono's `sameSite: 'Lax'`, shadcn `variant` or Playwright options are therefore not flagged.

- It resolves which value set declares the literal's type by following the declaration of the union to the `ValueOf<typeof X>` alias in a `values.ts`. When it finds one, the report names `X.member`.
- If the union is not a value set (an inline union), the report says to create one. That is how the 100 inline unions surface.
- `--fix` rewrites each literal to `X.member` and adds the import (a relative path inside `packages/shared`, the package path elsewhere). It does this only where a set was found, and prints the rest for the hand pass.
- `pnpm values:check` joins `pnpm verify` after `typecheck`. It prints its run time; the program setup is shared with `api:docs` code (`scripts/openapi/static.ts` program options).
- The shared test `values.test.ts` imports every `values.ts` and checks three things: each set's keys equal its values where the value is an identifier, no two sets are equal, and each set has at least one member.

*Why two layers:* Biome reports in the editor and in under a second, but it cannot see types. The checker sees every argument, property and JSX prop, but it needs the full program.

- *Alternative:* the checker alone. Rejected: agents and editors get the feedback only at `verify` time.
- *Alternative:* the lint alone. Rejected: it misses arguments such as `systemActor('capacity')` and JSX props such as `status="confirmed"`, which the product owner's rule covers.

### D8. Migration order

1. **Foundations:** `define.ts`, the D3 key trees, `values.ts` files holding the converted existing sets. The old `UPPER_CASE` exports are kept for this step only.
2. **The new sets from D4.**
3. **`values:check --fix` per package:** shared, then api, web, driver, i18n, e2e. Each run is followed by `pnpm typecheck` and `pnpm test`, then a hand pass for the reported inline unions and the literals the fixer could not place.
4. **Cleanup:** delete the old exports and the duplicates, enable the Grit plugin and `values:check` in `verify`, add the migration.

Each step ends green and is its own commit (AGENTS.md). Old and new exports coexist only inside this change and never reach `main` separately.

## Risks / Trade-offs

- [The contextual-type check reports literals whose type is a project union that is not meant as a closed set, such as a test helper's `'GET' | 'POST'`] → those unions become value sets too, which is the rule. A true false positive (none expected) gets a `// values-check-ignore: <reason>` comment, and the check counts and prints the ignores so they stay visible.
- [A mapped type over all permission keys slows type checking] → measured in step 1 against `pnpm typecheck` before and after. Fallback: the D3 alternative, a generated `keys.gen.ts`.
- [The web diff is large (about 600 sites) and conflicts with parallel work] → 00 runs before 01 to 04 with nothing else in flight. The fixer is rerunnable after a rebase, so conflicts are resolved by taking `main` and rerunning `values:check --fix`.
- [`values:check` adds time to `verify`] → it shares the program options with `api:docs`. The target is under 30 s on this machine; above that, cache by a source hash as `api:docs` does.
- [A new check constraint fails on existing rows] → precheck in the Migration Plan. The seed writes only valid values.

## Migration Plan

1. Precheck on the dev database and in the migration test:

   ```sql
   select type from booking_event where type not in (<BookingEventType>);
   select linked_by_party from booking_acknowledgement where linked_by_party not in (<ActorParty>);
   select template from outbox where template not in (<EmailTemplate>);
   ```

   Every query must return no rows. On a dev database that fails, run `pnpm db:reset && pnpm db:seed`.
2. Land the generated migration with the change.

To roll back, revert the change. The checks drop with the migration's revert.
