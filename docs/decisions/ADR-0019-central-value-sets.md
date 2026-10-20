---
title: ADR-0019 Central value sets as self-keyed as-const objects
description: Why every closed set of string values (statuses, kinds, roles, reasons, error codes, manifest keys) is one `as const` object in a `values.ts` in packages/shared, how zod, Drizzle and the web reuse it, and how lint and a type-aware check reject string literals at use sites.
type: explanation
audience: [agent, developer]
tags: [adr, conventions, value-sets, typescript, lint, data-model]
status: stable
updated: 2026-10-20
related: [AGENTS.md, docs/reference/module-contract.md, docs/reference/data-model.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md]
---

# ADR-0019: Central value sets as self-keyed `as const` objects

Status: accepted, 2026-10-20.

## Context

The product owner set a binding rule: no magic strings. Each value of a closed set (a status, kind, role, reason, error code, party, channel or key) is defined once, and every use refers to that definition.

The MVP code did the opposite. It had about 600 comparisons and `case` labels against string literals and about 400 discriminant properties written as literals. Its 27 sets were `[...] as const` arrays, so every use site retyped the value. About 100 unions were written inline, some sets existed twice (`DOOR_TYPES` in `shared` and in `core/schema.ts`, `ErrorCode` copied by hand into the web), and some had no definition at all: conflict reasons, job names, booking event types and email templates.

Agents copy the patterns they see. A rule written only in prose loses against 1,500 counterexamples in the code, so the existing code was migrated in full and the rule is enforced by tools.

## Options considered

| Option | Verdict |
|---|---|
| TypeScript `enum` | Not allowed with `erasableSyntaxOnly`, and its runtime shape is not plain data. |
| `[...] as const` arrays with `(typeof X)[number]` | The status quo. Use sites can only retype the value, so find-references and rename do not work. |
| A helper `defineValues(['a', 'b'])` that builds the object | Works, but a reader has to know the helper, and the product owner asked for the plain object. |
| Lint only | Fast, but it cannot see types. It misses arguments such as `systemActor('capacity')` and JSX props such as `status="confirmed"`. |
| **A self-keyed `as const` object in a `values.ts`, checked by a lint plugin and a type-aware check** | One readable form. Use sites read `BookingStatus.no_show`. The two checks together cover syntax and types. |

## Decision

- **Form.** A value set is an exported `as const` object with a type of the same name:

  ```ts
  export const BookingStatus = { requested: 'requested', no_show: 'no_show' /* ... */ } as const;
  export type BookingStatus = ValueOf<typeof BookingStatus>;
  ```

  A key equals its value when the value is an identifier. Otherwise the key is a descriptive name (`LogoContentType.png = 'image/png'`, `StoryId.BK_04 = 'BK-04'`). A subset is its own object whose members reference the parent (`LoadStatus.confirmed = BookingStatus.confirmed`), so renaming a parent member updates the subset too.
- **Location.** Module sets live in `packages/shared/src/modules/<id>/values.ts`. Cross-cutting sets live in `packages/shared/src/values/<topic>.ts` and are exported from `@rampflow/shared/values`. API-internal sets live there too (`JobName`, `RateLimitBucket`), because one place to look matters more than the few names the web bundle tree-shakes away. Files inside `packages/shared` import the specific file and never the index, which would create an import cycle through the registry.
- **Reuse.**
  - zod: `z.enum(BookingStatus)`, and `z.literal(BookingEventType.created)` in discriminated unions;
  - Drizzle: `text('status', { enum: values(BookingStatus) })` and `check(..., oneOf(t.status, values(BookingStatus)))`;
  - router search params: `z.enum(Tab)`;
  - i18n: catalogs stay keyed by the value, and the web indexes them with the value as before.

  `values(set)` returns the members as a non-empty tuple, which is what Drizzle needs.
- **Manifest keys.** `Permission`, `Feature`, `Limit`, `Setting` and `Module` in `packages/shared/src/values/keys.ts` are built from the registry at module load. Each dot of a key opens one level (`Permission.booking.view === 'booking.view'`, `Setting.privacy.retention.visit_days`), and the types are exactly the manifest keys. Removing a key from a manifest therefore fails type checking at every use. No generated file is needed, because the manifests are already `as const`.
- **Database.** Closed columns stay `text` with a check constraint. The column enum and the check take `values(Set)`, so a new member changes the zod schema, the column type and the check together. `oneOf` accepts dotted values. `booking_event.type`, `booking_acknowledgement.linked_by_party` and `outbox.template` got the checks they lacked.
- **Enforcement, two layers, both in `pnpm verify`.**
  1. `lint/value-literals.grit`, a Biome plugin, gives instant feedback in the editor. It flags string literals in comparisons, `case` labels, `z.enum([...])`, `z.literal(...)`, `[...] as const` and discriminant properties, and value-set objects defined outside a values file.
  2. `pnpm values:check` (`scripts/values-check.ts`, a TypeScript 6 program per tsconfig) flags any string literal whose contextual type is a literal union declared in project source: arguments, properties, JSX props and return values. It names the set member to use (`AckChannel.link`), or says to create a set when the union is inline. With `--fix` it rewrites the literal and adds the import. A true false positive takes `// values-check-ignore: <reason>`, and the check prints how many ignores exist.

  Unions from libraries (Hono's `sameSite`, shadcn `variant`, Playwright options) are not project source and stay silent. Free text, i18n keys, route paths, CSS classes, test names, `''` and `typeof` results are not closed sets.

## Consequences

- Adding a member is a one-line change in `values.ts` plus a regenerated migration when a column check uses the set.
- A missing set is created in the `values.ts` of its module, never inlined. Both checks reject the inline form.
- Renaming a member is a rename refactoring, but the stored and wire values are unchanged unless the value changes too.
- `pnpm verify` gains the `values:check` run. It must stay under 30 s; above that it caches by source hash, as `api:docs` does.
- The web bundle imports the shared sets it uses; API-only sets are tree-shaken.
