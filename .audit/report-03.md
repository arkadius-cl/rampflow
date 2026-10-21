# Report: 03-tenant-onboarding

Branch `feat/03-tenant-onboarding`, 67/67 tasks. Integration on 5340e7f: `pnpm verify` green (API 818 passed, 3 skipped), `pnpm test:e2e` 138 passed, `scripts/test-at-date.sh +40d` green. Each stage reviewed by GPT-6.1-Sol (high); every finding fixed or recorded in `decisions.tsv`.

## Deviations from the contract

Planned (task 12.2):

- New error code `ErrorCode.onboarding_incomplete` (409).
- New guard kind `GuardKind.active_tenant` (`requireActiveTenant()`, after permission and entitlement), the `RouteCase.onboarding` field with the value set `OnboardingCase` (`blocked`), and the member `RouteCaseCheck.onboarding`.
- RLS update policy `tenant_update_activate` on `org`. It makes activation one-way on the tenant's own row; it does not restrict other columns in the same statement (accepted risk, design.md Risks; only `activateTenant` writes `org` as the tenant party).
- Profile columns `door_type`, `temperature_zone`, `adr_allowed` on `bookable_resource` and `resource_dock`, with defaults (standard profile), and composite profile FKs.
- `DockBooking` lost its `none` variant; `ConflictReason.dock_in_resource` no longer answers moves, which now move the dock.
- `CreateSite.hours` (required, `WeeklyHours.min(1)`); `UpdateSite` unchanged.
- `TenantContext.status`.
- New i18n part `core/onboarding.json`.
- ADR-0017 (homogeneous pools, dock profile), amending ADR-0004.

Found during implementation:

- `apps/api/scripts/migration-order.ts` in `db:regen`: drizzle-kit emits new FKs before the unique keys they reference, so new unique keys (incl. `NULLS NOT DISTINCT`, schema-qualified) are moved ahead. Shared tooling.
- `DockBookingKind` deleted; identical to `ResourceKind` once `none` was gone.
- New value sets `ResourceDockConstraint`, `ProfileForeignKey` (constraint names).
- Lock order: site capacity lock before the `max_docks` limit lock in `createDock`; ADR-0004 corrected (it stated the opposite).
- A new default pool links every site load type, including inactive ones (spec: "every site load type"); bookability still needs an active one.
- Test world tenants start active (`activatedAt: WORLD_NOW`); `onboardingTenant()` and e2e `createOnboardingTenant()` build onboarding tenants.
- OpenAPI 409 response chosen per operation (`LimitReached`, `OnboardingIncomplete`, or both).
- Signup test fixtures use `SIGNUP_COMPANY` instead of the seed's tenant name (root cause of a flaky seed test).
- Tablet shell gained a `notice` slot; one onboarding explanation is shared by "New booking" and "Walk-in now" on the plan board.
- Conflict toasts list affected dock codes when a 409 carries `dockIds`.
