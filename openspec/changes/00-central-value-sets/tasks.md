# Tasks

## 1. Foundations

- [x] 1.1 Add `packages/shared/src/values/define.ts` with `ValueOf<T>` and `values(set)` (typed non-empty tuple), and the `@rampflow/shared/values` export. Verify with type tests that `values(BookingStatus)` is accepted by `z.enum`, Drizzle `text(..., { enum })` and `oneOf`, and with `pnpm typecheck`.
- [x] 1.2 Add `packages/shared/src/values/keys.ts` with `Permission`, `Feature`, `Limit`, `Setting` and `Module` built from `catalog` (design D3). Verify with type tests that `ValueOf` of each tree equals `PermissionKey`, `ImplementedFeatureKey`, `LimitKey`, `SettingKey` and `ModuleId`, and that a unit test finds `Permission.booking.view === 'booking.view'`. Record `pnpm typecheck` time before and after in design.md (Risks).
- [x] 1.3 Convert every existing value set in `packages/shared` (the 27 arrays, `ROLES`, `SETTING_SCOPES`, `PTS`, the locales, `PACKAGE_IDS`, `STORY_IDS` from `apps/api/src/kernel/describe.ts`) into self-keyed objects in `values.ts` files per design D1 and D2, with subsets that reference their parent. Keep the old `UPPER_CASE` exports as `values(...)` aliases for this group only. Verify `pnpm typecheck` and `pnpm test` are green.
- [x] 1.4 Add `packages/shared/src/values/values.test.ts`: it imports every `values.ts`, checks key equals value for identifier values, no two equal sets, and no empty set. Verify it passes, and that it fails when one member is changed to `confirmed: 'Confirmed'` or a set is duplicated.

## 2. Missing value sets

- [x] 2.1 Move `ErrorCode` to `values/errors.ts`, make `ERROR_STATUS` and `DEFAULT_MESSAGE` in `kernel/errors.ts` `satisfies Record<ErrorCode, ...>`, and delete the web's copy in `apps/web/src/lib/api.ts`. Verify `pnpm typecheck` and `apps/api/src/kernel/errors` tests pass.
- [x] 2.2 Add `ConflictReason` with the 32 reasons used in `apps/api/src`, type `details.reason` of `conflict` through an `ApiError` overload, and type the web's reason as `ConflictReason | undefined`. Add an i18n test that every `ConflictReason` has `core:errors.conflict.<reason>` in de, en and pl. Verify the test passes and fails for a reason without a string.
- [x] 2.3 Add `BookingEventType`, `EmailTemplate`, `JobName`, `SystemActorName`, `TokenPurpose` (merging `AuthTokenKind`), `DriverChannel` (one definition instead of two), `EmailCategory`, `KpiUnit`, `AckChannel`, `SafetyStatus`, `ActorParty`, `ClosureSource`, `PrivacyRequestKind`, `OrgKind` and `RateLimitBucket` per design D4. Replace the union-only types and the API schema duplicates with them. Verify with a type test that `EmailTemplate` and the `EmailTemplates` interface cover the same names, and with `pnpm typecheck` and `pnpm test`.
- [x] 2.4 Add `NodeEnv`, `HttpMethod`, `SqlState`, `KeyboardKey` and `VisibilityState` to `packages/shared/src/values/`, and make `kernel/env.ts` use `z.enum(NodeEnv)`. Verify `pnpm typecheck`.

## 3. Type-aware check and fixer

- [x] 3.1 Write `scripts/values-check.ts` with `typescript-6` per design D7: programs for `apps/api`, `apps/web`, `apps/driver`, `packages/shared`, `packages/i18n` and `e2e`; contextual-type detection for unions declared in project source; resolution to the declaring value set; report with file, line and `X.member` or "create a value set"; `// values-check-ignore: <reason>` counted and printed; run time printed. Verify with fixture tests: a comparison, an argument, a property, a JSX prop and a return value are reported with the right set; Hono's `sameSite: 'Lax'` and a shadcn `variant` are not; an inline union is reported as "create a value set".
- [x] 3.2 Add `--fix`: rewrite reported literals that have a set to `X.member` and add the import (relative inside `packages/shared`, package path elsewhere). Verify with fixture tests that a fixed file type-checks and that a second `--fix` run changes nothing.
- [x] 3.3 Add the root script `pnpm values:check` (and `--fix`). Verify it runs on the whole repo and prints counts per package.

## 4. Migration of the use sites

- [x] 4.1 Run `pnpm values:check --fix` on `packages/shared` and `packages/i18n`, then fix the remaining reports and the 26 `z.literal` / 8 `z.enum([...])` by hand. Verify `pnpm typecheck`, `pnpm test`, and that `pnpm values:check` reports nothing for both packages.
- [x] 4.2 Same for `apps/api` (`src`, `test`, `scripts`): include `requirePermission(Permission...)`, `requireEntitlement(Feature...)`, `withModule(Module...)`, `ApiError` codes, conflict reasons, `systemActor` and job names. Verify `pnpm typecheck`, `pnpm --filter @rampflow/api test`, no reports for `apps/api`, and that `pnpm api:docs --check` passes with `openapi.gen.json` unchanged.
- [x] 4.3 Same for `apps/web`: comparisons, properties, JSX props, `validateSearch` schemas with `z.enum(<Set>)` from `values.ts`, and the i18n index sites. Delete the stale sets and unions in `apps/web/src/lib/domain.ts`. Verify `pnpm typecheck`, the web tests, and no reports for `apps/web`.
- [x] 4.4 Same for `apps/driver` and `e2e`. Verify `pnpm typecheck` and no reports, and that `pnpm test:e2e` passes unchanged.
- [x] 4.5 Delete the `UPPER_CASE` aliases from task 1.3 and every duplicate set (API schema copies, the manifest `PTS` copies, the web copies). Verify `pnpm typecheck`, and that `grep -rE "export const [A-Z_]+ = \[" packages apps --include=*.ts` outside node_modules finds no string-array value set.

## 5. Database

- [ ] 5.1 Build every closed column and check from `values(Set)`, widen `oneOf`'s guard to `/^[a-z0-9_.]+$/`, and add the checks `booking_event_type_check`, `booking_acknowledgement_linked_by_party_check` and `outbox_template_check` (design D5). Feed the brand MIME check from `values(LogoContentType)`. Verify `pnpm typecheck` and a unit test for `oneOf` with a dotted value.
- [ ] 5.2 Run the precheck queries from design.md (Migration Plan) on the dev database and record the result in the report, then `pnpm db:generate --name 00-central-value-sets`. Verify the migration contains only the three new checks (no existing check changes, because the values are identical), that `pnpm db:migrate` passes on the seeded database, and with `rls.test.ts`-style tests that an insert with an unknown `booking_event.type`, `linked_by_party` or `outbox.template` fails with SQLSTATE 23514.

## 6. Lint plugin and verify

- [x] 6.1 Add `lint/value-literals.grit` with the rules of design D6 and register it in `biome.json` `plugins`. Each diagnostic names the fix and points to AGENTS.md. Verify with `lint/fixtures/` files (excluded from the normal lint run) and a test that runs Biome on them: every rule fires on its bad sample, nothing fires on the good samples (`typeof`, `''`, `{...} as const` in a `values.ts`, `z.literal(X.a)`).
- [ ] 6.2 Add `pnpm values:check` to `pnpm verify` after `typecheck`. Verify `pnpm verify` is green on the migrated repo, and that adding `if (b.status === 'no_show')` to a web file makes `pnpm lint` fail, and that adding `requirePermission('booking.view')` makes `pnpm values:check` fail.

## 7. Docs and agent guidance

- [x] 7.1 Write `docs/decisions/ADR-0019-central-value-sets.md` (frontmatter per `docs/CONVENTIONS.md`, tag `adr`): the self-keyed `as const` object, the location in `values.ts`, manifest key trees, the two enforcement layers, and the alternatives (TS `enum`, arrays, a helper, lint only). Verify with `pnpm docs:check`.
- [ ] 7.2 `AGENTS.md`, code conventions: a **Value sets** rule. It states the form with a three-line example, the one place, the reuse in zod, Drizzle, search params and tests, the ban on literals with the two checks that enforce it, and that a missing set is created in `values.ts` and never inlined. Add `pnpm values:check` to the commands table and to the `pnpm verify` description. Verify `pnpm verify` is green.
- [ ] 7.3 Update the code examples in `docs/reference/module-contract.md` ("A route", "Directory layout" with `values.ts`, "Derived types"), `docs/tutorials/first-module-change.md` and `docs/how-to/add-a-module-or-entitlement.md` (new keys appear as `Permission.<module>.<name>`). Verify the tutorial's code compiles by following it on a scratch branch, and `pnpm docs:check`.
- [ ] 7.4 Run `pnpm docs:index`. Verify `docs/INDEX.md` lists ADR-0019 and `pnpm docs:check` passes.

## 8. Re-plan 01 to 04

- [x] 8.1 Rewrite every planned value set and literal in the artifacts of `01-data-table`, `02-tenant-self-registration`, `03-tenant-onboarding` and `04-platform-tenant-views` to the new form, for example `TenantStatus`, `TenantFlag`, `OnboardingStep`, `TaxIdType`, `TaxIdStatus`, `HoursTemplate`, the new conflict reasons as `ConflictReason` members, and guards as `Permission...` and `Feature...`. Each set goes in its module's `values.ts`. Verify `openspec validate --all` passes, and that `grep -nE "\] as const|=== '" openspec/changes/0[1-4]-*/*.md openspec/changes/0[1-4]-*/specs -r` finds no planned array value set or literal comparison.

## 9. Integration

- [ ] 9.1 On a clean checkout, run `pnpm verify`, `pnpm test:e2e` and `scripts/test-at-date.sh +40d`. Verify all are green, that `openapi.gen.json` is byte-identical to `main` before this change, and that `pnpm values:check` reports zero findings and zero ignores.
