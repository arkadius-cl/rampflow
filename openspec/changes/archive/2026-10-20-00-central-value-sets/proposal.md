# Proposal

## Why

The product owner set a binding rule: no magic strings. Each value of a closed set (status, kind, role, reason, error code, party, channel, key) is defined once, in a central place, as `const X = { ... } as const`, and every use reuses it. Today the code does the opposite:

- About 600 comparisons and `case` labels against string literals.
- About 400 discriminant properties written as literals.
- 27 value sets in `packages/shared` defined as `[...] as const` arrays, whose use sites retype each value.
- About 100 inline unions with no central definition (`channel: 'link' | 'staff'` in four files, `safety: 'valid' | 'missing' | 'not_required'` in five).
- Duplicate sets: `DOOR_TYPES`, `TEMPERATURE_ZONES` and `DOCK_STATUSES` exist in both `shared` and `core/schema.ts`. `ErrorCode` is copied by hand into the web app, and `apps/web/src/lib/domain.ts` holds a stale `BOOKING_STATUSES`.
- Value sets with no definition at all: 32 conflict reasons, job names, booking event types, email template ids.

Agents copy the patterns they see, so every new change adds more of them. Changes 01 to 04 already plan new arrays (`TENANT_STATUSES`, `TENANT_FLAGS`, `ONBOARDING_STEPS`, ...). The product owner chose a full migration before 01 starts, so that the codebase shows one pattern only, and the rule must be enforced by tooling, not by prose alone.

## What Changes

- **One form for every value set:** `export const BookingStatus = { requested: 'requested', ... } as const` with `export type BookingStatus = ValueOf<typeof BookingStatus>`, in a `values.ts` file in `packages/shared` (one per module, plus one for cross-cutting sets). Subsets are objects that reference the parent's members. TypeScript `enum` stays impossible (`erasableSyntaxOnly`).
- **Reuse everywhere from that one definition:**
  - zod: `z.enum(BookingStatus)`;
  - Drizzle: `text('status', { enum: values(BookingStatus) })` and `oneOf(t.status, values(BookingStatus))`;
  - code: `BookingStatus.no_show`;
  - i18n: indexing by the value, as today;
  - router search params: `z.enum(Tab)`.
- **Manifest keys become runtime objects:** `Permission.booking.view`, `Feature.booking.pools`, `Setting.booking.lead_time`, `Module.yard`, derived from the registry at runtime with exact types, so `requirePermission(Permission.booking.view)` replaces `requirePermission('booking.view')`.
- **Missing sets get defined:** `ErrorCode` moves to `shared` (the API's `ERROR_STATUS` and the web reuse it), `ConflictReason` (typed `details.reason`), `JobName`, `BookingEventType`, `EmailTemplate`, `TokenPurpose`, and every inline union found by the inventory.
- **Duplicates are removed:** the API schema copies, the web `domain.ts` copies and the four `PTS` copies in the manifests.
- **Database checks where a closed column has none:**
  - `booking_event.type`;
  - `safety` `linked_by_party`;
  - `outbox.template`.

  One generated migration for the unit.
- **Enforcement in two layers, both in `pnpm verify`:**
  1. A Biome GritQL plugin (`lint/value-literals.grit`) for instant feedback. It flags string literals in `===`/`!==`, `case` labels, `z.enum([...])`, `z.literal(...)`, `[...] as const` string arrays and discriminant properties (`kind`, `status`, `type`, `reason`, ...), and value-set objects defined outside a `values.ts`.
  2. A type-aware check `pnpm values:check` built on the TS 6 program that `api:docs` already uses. It fails for any string literal whose contextual type is a literal union declared in project source (arguments, properties, JSX props, return values), names the value set to use, and offers `--fix`. The same tool is the migration codemod.
- **Agent guidance:** a rule in `AGENTS.md` (code conventions), ADR-0019, and updates to `module-contract.md`, the tutorial and the docs that show code.
- **Changes 01 to 04 are re-planned in the new form** before any of them starts.

No change to the HTTP API, the wire values, the stored values or the UI. **BREAKING** only for code: every exported `UPPER_CASE` array in `packages/shared` is replaced by its `PascalCase` object.

## Capabilities

### New Capabilities

- `value-sets`: how closed sets of values are defined, reused and enforced across the monorepo. Covers the single definition per set, its reuse by validation, persistence and UI, the database checks derived from it, and the checks that reject string literals at use sites.

### Modified Capabilities

None. `api-description` keeps its requirements; its generator only reads the new names.

## Impact

- **Code:** every package and app.
  - `packages/shared`: new `values.ts` files, `ValueOf`, `values()`, and the manifest key objects.
  - `apps/api/src`: about 190 comparisons, 140 properties, 140 `ApiError`s, 37 reasons, 65 guard calls.
  - `apps/web/src`: about 400 comparisons, 110 properties, 83 i18n index sites.
  - `apps/driver/src`, `packages/i18n/src`, `apps/api/test`, `apps/api/scripts` and `e2e`.

  The migration is mechanical through `values:check --fix`, with a hand pass for what the fixer reports.
- **Database:** three new check constraints in one generated migration `00-central-value-sets`. A precheck query confirms that existing rows comply.
- **Tooling:** a new Biome plugin and `pnpm values:check` in `pnpm verify`. `typescript-6` (already a dev dependency of the API) is also used by `scripts/values-check.ts`.
- **Docs:** `AGENTS.md`, ADR-0019, `docs/reference/module-contract.md`, `docs/tutorials/first-module-change.md`, `docs/how-to/add-a-module-or-entitlement.md`, and `docs/INDEX.md` via `pnpm docs:index`.
- **Planned changes:** the artifacts of 01 to 04 are updated to the new form. 00 lands before 01.
- **Not affected:** HTTP behaviour, stored data, translations, the OpenAPI document's content (only its generator's imports).
