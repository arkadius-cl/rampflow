# Tasks

Prerequisite: 01, 02 and 03 are merged and archived, so `platform-tenant-list` and `tenant-lifecycle` exist in `openspec/specs/`, and `contract/list.ts`, `kernel/list.ts`, `tenant-status.ts`, `tax-id.ts`, the core value sets of 01 to 03 (`TenantSortKey`, `TenantStatus`, `TaxIdType`, `TaxIdStatus`, `EuCountry` in `packages/shared/src/modules/core/values.ts`), `Access.tenantStatus` and `core/onboarding/onboarding.ts` exist in the code. New value sets go into the same `values.ts` (ADR-0019).

## 1. Data model: suspension column and tenant notes

- [ ] 1.1 Add `suspendedAt: instant('suspended_at')` with the check `org_suspended_tenant_only` (`suspended_at is null or kind = 'tenant'`) to `org` in `apps/api/src/modules/core/schema.ts`. Verify with a test in `platform.test.ts` that writing `suspended_at` on a carrier org as the owner fails with a check violation.
- [ ] 1.2 Add `tenantNote` to `core/schema.ts`:
  - the value set `TenantNoteKind` (`note`, `suspended`, `reactivated`) in `packages/shared/src/modules/core/values.ts`;
  - columns `id`, `tenant_id` (FK `org` on delete cascade), `kind` with its check `oneOf(t.kind, values(TenantNoteKind))`, `body` with the check of 1 to 2,000 characters after trimming, `author_id` (FK `app_user` on delete set null) and `created_at`;
  - index `(tenant_id, created_at)`;
  - policies `allow(ScopeParty.platform, PolicyCommand.select, always)` and `allow(ScopeParty.platform, PolicyCommand.insert, always)` only.

  Run `pnpm db:generate --name 04-platform-tenant-views`. Verify the migration adds one column, one check, one table with its checks, index, FKs and two policies, and nothing else.
- [ ] 1.3 Add the ORACLE rule `tenant_note: (c) => is(c, ScopeParty.platform)` to `apps/api/src/db/rls.test.ts` and one note per world tenant to `apps/api/test/model.ts`. Verify `rls.test.ts` passes, and that it fails when the rule is removed.
- [ ] 1.4 Add to `apps/api/src/db/policies.test.ts` that an `update` and a `delete` of a note under the platform party change 0 rows, and that deleting the tenant org as the owner removes its notes. Verify the test passes.
- [ ] 1.5 Update `docs/reference/data-model.md`:
  - `org.suspended_at` with its check;
  - `org.country` notes "carriers (CR-02) and tenants (registration, editable by the platform)";
  - the `tenant_note` section with RLS and PD marking;
  - `tenant_note` in "Tables by module";
  - `org ||--o{ tenant_note` in the ER diagram;
  - a Retention line: notes are deleted with their tenant.

  Verify `pnpm docs:check` passes.

## 2. Tenant status and last activity

- [ ] 2.1 Add the member `suspended` to `TenantStatus` in `packages/shared/src/modules/core/values.ts`, and make `tenantStatus({ activatedAt, suspendedAt })` in `packages/shared/src/modules/core/tenant-status.ts` return `TenantStatus.suspended` first. Verify with its unit test: suspended with and without activation, onboarding, active.
- [ ] 2.2 Make `loadAccess` (`apps/api/src/kernel/access.ts`) select `suspended_at` in the org read that 03 added, and pass it to `tenantStatus`. Verify `access.test.ts` reads `suspended` for tenant, carrier-at-tenant, driver and public scopes of a suspended tenant, and that 03's `requireActiveTenant` still answers 409 for `onboarding`.
- [ ] 2.3 In `sessionUser` (`apps/api/src/kernel/scopes.ts`), select `app_user.last_seen_at` with `disabled_at`. When it is null or older than 5 minutes, update it to `now` in the same `asScope(user)` block. Verify with `scoped.test.ts`:
  - the first request after sign-in sets it;
  - a request 2 minutes later leaves it;
  - a request 6 minutes later moves it (injected clock).
- [ ] 2.4 Add to `apps/api/src/modules/privacy/jobs/retention.test.ts` a carrier user created 400 days ago who made a request 10 days ago. Verify the retention run sends that user no inactivity notice. Update the `app_user.last_seen_at` note in `docs/reference/data-model.md` ("written by the session check at most every 5 minutes").

## 3. Tenant list API

- [ ] 3.1 Add the option `nullsLast` to `orderBy` in `apps/api/src/kernel/list.ts`, so listed sort keys put nulls last in both directions. Verify with a unit test in `kernel/list.test.ts`.
- [ ] 3.2 In `packages/shared/src/modules/core/api.platform.ts`:
  - add the members `status`, `package`, `country` and `lastActivityAt` to `TenantSortKey`, and the value sets `TenantCountryFacet` (`EuCountry` plus `none`) and `TenantFlag` (`possible_duplicate`, `tax_id_unverified`) to `packages/shared/src/modules/core/values.ts`;
  - extend `TenantListQuery` with the facets `country: TenantCountryFacet` and `flag: TenantFlag`;
  - the status facet gains `suspended` through `TenantStatus` (task 2.1);
  - add the optional `duplicateOf` (tenant id) to `TenantListQuery` (design decision 6);
  - extend `TenantSummary` with `country`, `taxId`, `admin`, `lastActivityAt` and `possibleDuplicate`, and `TenantList.facets` with the new facets.

  Verify `pnpm typecheck` passes.
- [ ] 3.3 Extend `listTenants` in `core/platform/tenants.ts` as in design decision 1:
  - the status `case`;
  - the activity subquery;
  - the lateral admin subquery;
  - the search over name, normalized tax id and admin emails;
  - the facet counts;
  - the sort by `array_position` for status and package;
  - `nullsLast` for country and last activity.

  Verify with `platform.test.ts` cases for every scenario of `specs/platform-tenant-list/spec.md` that the API owns (use a unique name prefix through the world fixture):
  - status `suspended` wins;
  - two statuses;
  - country `none`;
  - package with country;
  - both flags;
  - search `de 123 456`, a second admin's email, an invited admin's email;
  - `duplicateOf` (after splitting `duplicateMatch(identity)` out of 02's `core/signup/duplicates.redeem.ts`, with 02's duplicate tests still green): same tax id, `pl_nip` against its `eu_vat` form, a shared admin domain with different tax ids, and a shared free-mail domain that does not match;
  - admin email of the first admin and of an open invitation;
  - last activity "never" and its sort last in both directions;
  - 422 for `status=paused`.
- [ ] 3.4 Run `pnpm api:docs`. Verify `openapi.gen.json` and the platform table in `docs/reference/api-routes.md` show the new query parameters and fields, and update the `op()` description of `core.platform.listTenants` (stories `StoryId.PL_01`, `StoryId.PL_04`).

## 4. Tenant list web

- [ ] 4.1 In `apps/web/src/routes/platform/tenants/index.tsx`, add these columns:
  - Status, with `modules/core/tenant-status.tsx` (text and icon);
  - Country ("Not set");
  - Tax id, with a status badge per label;
  - Admin email, with an "Invited" badge;
  - Last activity: relative time in a `time` element, with the exact instant and zone in a `Tooltip` reachable by focus.

  Add the facets Country (hide zero counts except selected values) and Flags. Add the labels to `core/platform.json` in de, en and pl. Verify `pnpm typecheck`, `pnpm lint` and `packages/i18n/src/catalogs.test.ts` pass.
- [ ] 4.2 Extend `e2e/core/PL-04.spec.ts`:
  - a suspended, an onboarding and an active tenant with a unique prefix: the status cells by text, and `status=onboarding,suspended` in the URL;
  - `country=none`;
  - the flag "Tax id unverified";
  - search by tax id with spaces;
  - sort by last activity ascending with "Never" last;
  - `expectAccessible` with the Country filter open.

  Verify with `pnpm test:e2e e2e/core/PL-04.spec.ts`.

## 5. Tenant hub API

- [ ] 5.1 Extend `TenantDetail` in `api.platform.ts` with the summary fields, `activatedAt`, `taxId.checkedAt`, `suspension`, `admins` and `onboarding`. Add `country: z.enum(EuCountry).nullable()` to `UpdateTenant`, and make `updateTenant` answer the country conflict with `ConflictReason.tax_id_country`. Extend `tenantDetail` and `updateTenant` in `tenants.ts`. Verify with `platform.test.ts`:
  - a detail of an onboarding tenant carries 03's steps;
  - an active tenant has `onboarding: null`;
  - `PATCH { country: 'Germany' }` answers 422 at `["country"]`;
  - `country: null` clears it for a tenant without a tax id;
  - for a tenant with `eu_vat` `DE123456789`, `country: 'AT'` and `country: null` answer 409 `conflict` with reason `tax_id_country` and change nothing, and `country: 'DE'` saves with the tax id and its status unchanged (design decision 2).

  Add the member `tax_id_country` to `ConflictReason` in `packages/shared/src/values/errors.ts`, its string to `packages/i18n/locales/{de,en,pl}/core/errors.json` (`conflict.tax_id_country`), and the reason to the 409 reasons in `docs/reference/api-routes.md` if 02 has not added it there yet. Verify `packages/i18n/src/catalogs.test.ts` and the `ConflictReason` string test pass.
- [ ] 5.2 Add the member `platform_read` to `SystemActorName`, and create `apps/api/src/modules/core/platform/tenant-reads.ts` with `siteList` and `onboardingOf` under `asScope` as the tenant with `systemActor(SystemActorName.platform_read)` (design decision 4). Add the file to the `asScope` and `system.ts` allowances in `biome.json`. Verify `pnpm lint` passes, and that importing `asScope` in another platform file still fails lint.
- [ ] 5.3 Add the members `PL_06` to `PL_08` to `StoryId` in `packages/shared/src/values/stories.ts`, the value sets `PlatformSiteSortKey` and `ActiveFacet` to `packages/shared/src/modules/core/values.ts`, and `PlatformSiteListQuery`, `PlatformSiteList` and `GET /api/platform/tenants/:tenantId/sites` (op `core.platform.listTenantSites`, story `StoryId.PL_06`), with a route case in `core/platform/route-cases.ts`. Verify with `platform.test.ts` (new file `tenant-hub.test.ts` if `platform.test.ts` grows past one story):
  - 2 halls and 8 active, 1 maintenance and 1 inactive docks count 2 and 9;
  - search by city;
  - `active=no`;
  - a carrier org id answers 404;
  - the response holds no booking or carrier field.
- [ ] 5.4 Add the value sets `PlatformMemberSortKey`, `PlatformMemberState` and `PlatformMemberKind` to `packages/shared/src/modules/core/values.ts`, and `core/platform/members.ts` with the `union all` of members and open invitations, `PlatformMemberListQuery`, `PlatformMemberList` (row union discriminated by `PlatformMemberKind`) and `GET /api/platform/tenants/:tenantId/members` (op `core.platform.listTenantMembers`, `StoryId.PL_06`), with a route case. Verify with tests:
  - a member and an invitation in one page;
  - an expired invitation has state `expired`;
  - revoked and accepted invitations are absent;
  - `role=tenant_admin` keeps admins and admin invitations;
  - a disabled user has state `disabled`;
  - sort by last activity puts nulls last.
- [ ] 5.5 Run `pnpm api:docs` and check the new rows in `docs/reference/api-routes.md`. Verify `route-coverage.test.ts` and the route-case harness pass with `pnpm --filter @rampflow/api test src/modules/core/platform src/kernel`.

## 6. Tenant hub web

- [ ] 6.1 Replace `apps/web/src/routes/platform/tenants/$tenantId.tsx` with `$tenantId/route.tsx`:
  - the loader from 01;
  - the header with name, status, package and the suspend or reactivate button;
  - the tab links with `aria-current="page"`, following `t/$orgId/sites/$siteId/route.tsx`;
  - a comment where 05's Billing tab goes.

  Also create `entitlements.tsx`, holding the existing `OverridesCard`, `EntitlementsCard`, `AddOverrideCard` and `AdminInvitationsCard` unchanged. Run `pnpm --filter @rampflow/web routes:gen`. Verify `pnpm typecheck` passes and that `/platform/tenants/<id>/entitlements` shows the cards in `pnpm dev`.
- [ ] 6.2 Create `$tenantId/index.tsx` (Overview) with `modules/core/tenant-overview.tsx`:
  - status and suspension;
  - onboarding steps or activation time;
  - usage meters;
  - tax id with type, status and check time;
  - flags, with the "Show matching tenants" link built by `TenantListQuery.toQuery({ duplicateOf })`, and the removable "Matching <tenant name>" chip on the list;
  - admins and open admin invitations;
  - country, created and last activity;
  - `TenantForm` with the country `NativeSelect`.

  Verify in `pnpm dev` with Acme Logistik Süd that the duplicate link lists both Acme tenants.
- [ ] 6.3 Create `members.tsx` and `sites.tsx` on `components/data-table/`, with `validateSearch` from their list queries, the empty states, and rows without links. Add the strings to `core/platform.json` in de, en and pl. Verify the catalog test passes, and that a copied `members?role=tenant_admin` URL opens the same state.
- [ ] 6.4 Update `e2e/core/PL-02.spec.ts` to open `/platform/tenants/<id>/entitlements`. Verify with `pnpm test:e2e e2e/core/PL-02.spec.ts`.
- [ ] 6.5 Write `e2e/core/PL-06.spec.ts` with `describe('PL-06 Tenant hub')`:
  - deep link to `/sites`, with the tab selected and `aria-current`;
  - the tab change pushes history, and back returns;
  - an unknown id shows no access;
  - an onboarding tenant's Overview names the open dock step;
  - the Members tab lists a member and an invitation;
  - the role filter in the URL;
  - the Sites tab counts docks;
  - the duplicate link;
  - `expectAccessible` on Overview, Members and Sites.

  Verify with `pnpm test:e2e e2e/core/PL-06.spec.ts`.
- [ ] 6.6 Update the platform rows of the route map in `docs/decisions/ADR-0011-frontend-routes-and-org-context.md` (`/platform/tenants/$tenantId` Overview, and `/members`, `/sites`, `/entitlements`, `/notes` reached from the tab bar, with their search params), bump `updated`, and update the platform row of the screen inventory in `docs/explanation/ux-concept.md`. Verify `pnpm docs:check` passes.

## 7. Suspension

- [ ] 7.1 Add the member `tenant_suspended` to `ErrorCode` in `packages/shared/src/values/errors.ts`, and map it to 403 with its default message in `ERROR_STATUS` and `DEFAULT_MESSAGE` in `apps/api/src/kernel/errors.ts`. Add `core:errors.tenant_suspended` in de, en and pl, and the error row and the "Areas and parties" sentence to `docs/reference/api-routes.md`. Verify the catalog test and `pnpm docs:check` pass.
- [ ] 7.2 Add the members `core_tenant_suspended` and `core_tenant_reactivated` to `EmailTemplate`, and `core/emails/tenant-suspended.tsx` and `tenant-reactivated.tsx`: category `EmailCategory.account`, 02's greeting, an `example` payload, and strings under `auth.email.tenant_suspended` and `auth.email.tenant_reactivated` in `core/auth.json` (de, en, pl). Verify `core/emails/emails.test.ts` renders both in every staff locale.
- [ ] 7.3 Add `core/platform/suspension.ts` with `suspendTenant` and `reactivateTenant` (guarded updates, note, one email per admin who is not disabled, locale fallback to the platform default). Add `SuspensionBody` and the routes `POST /tenants/:tenantId/suspend` and `/reactivate` (ops `core.platform.suspendTenant` and `reactivateTenant`, `StoryId.PL_07`) with route cases. Verify with `suspension.test.ts`:
  - the note with reason and author;
  - two outbox rows for two admins, none for the dispatcher;
  - a second suspend writes no note and no email and keeps the time;
  - two concurrent suspends on two connections write one note;
  - reactivate returns `onboarding` or `active`;
  - reactivating an active tenant is a no-op;
  - an empty reason answers 422 at `["reason"]`;
  - a tenant without admin members queues no email;
  - bookings, links and members are unchanged.
- [ ] 7.4 In `kernel/scoped.ts`, refuse a suspended tenant after `loadAccess`:
  - `tenant` with a user actor and `carrier_at_tenant` → `ErrorCode.tenant_suspended`;
  - `driver` → `ErrorCode.unauthorized`.

  Verify with `scoped.test.ts` and `suspension.test.ts`:
  - staff context 403;
  - a gate check-in 403 with the booking unchanged;
  - the same session works after reactivation;
  - a member of a second tenant is unaffected;
  - a carrier-at-tenant availability request 403;
  - the carrier's cross-tenant booking list still lists the booking;
  - a driver booking poll 401, then 200 after reactivation;
  - platform routes work on the suspended tenant.
- [ ] 7.5 Make `openPublicLink` (`booking/registration/public-links.ts`) answer 404 for a suspended tenant. Leave the `ErrorCode.not_found` → 401 mapping in `verifyRegistration` (`booking/registration/verify.redeem.ts`) unchanged. Verify in `registration.test.ts`: while suspended, `GET /api/public/links/:slug` and `POST /api/public/links/:slug/registrations` answer 404; `POST /api/public/registrations/verify` for a registration sent before the suspension answers 401, creates no carrier org, user or link, and leaves the registration pending; after reactivation, all three work and the same verification succeeds.
- [ ] 7.6 Add `suspended` to `CarrierContextTenant` (`api.context.ts`), and set `carrierPortal: false` for suspended tenants in `core/context/routes.carrier.ts`. Verify with `context.test.ts`.
- [ ] 7.7 Add the value set `SuspendedTenants` (`skip`, `include`) to `packages/shared/src/modules/core/values.ts`. Give `forEachTenant` (`kernel/jobs.ts`) the option `{ suspended: SuspendedTenants }` with default `SuspendedTenants.skip`, and pass `SuspendedTenants.include` in `privacy/jobs/retention.ts`. Verify:
  - in `reminders.test.ts`, no reminder for a booking of a suspended tenant;
  - in `no-show.test.ts`, the booking stays `confirmed`;
  - in `retention.test.ts`, a suspended tenant's expired driver data is removed;
  - in `jobs.test.ts`, the default skips.
- [ ] 7.8 Web:
  - add `TenantSuspended` to `components/app-shell/route-states.tsx` and render it from the `errorComponent` of `routes/t/$orgId/route.tsx`;
  - in `lib/api.ts` `call`, invalidate the area context and the router on `ErrorCode.tenant_suspended`;
  - add the suspend and reactivate dialog (`modules/core/tenant-suspension.tsx`: required reason `Textarea` with `Field`, `zodResolver(SuspensionBody)`);
  - add "Temporarily unavailable" with an icon on `routes/c/$orgId/tenants/` and drop suspended tenants from the booking wizard's choice;
  - add the strings to `core/shell.json`, `core/platform.json` and `booking/portal.json` in de, en and pl.

  Verify `pnpm typecheck`, `pnpm lint` and the catalog test pass.
- [ ] 7.9 Write `e2e/core/PL-07.spec.ts` with `describe('PL-07 Suspend and reactivate')`:
  - suspend with a reason from the hub;
  - the status in the header and the list;
  - the Mailpit email to the tenant admin with the reason;
  - the dispatcher sees the suspended page on `/t/<id>/plan`;
  - the carrier's warehouse list shows "Temporarily unavailable";
  - the driver link shows the invalid-link screen (Pixel project);
  - the public link shows not available;
  - reactivate, then the dispatcher's plan board loads with the same session, and the reactivation email arrives;
  - `expectAccessible` on the dialog and the suspended page.

  Verify with `pnpm test:e2e e2e/core/PL-07.spec.ts`.
- [ ] 7.10 Write `docs/decisions/ADR-0018-tenant-suspension.md` (type `explanation`, tag `adr`) per design decision 12. In `docs/decisions/ADR-0002-tenancy-isolation-rls.md`:
  - point to ADR-0018 from "How each context works";
  - name `platform/tenant-reads.ts` next to `usage.ts` in the `asScope` list and in "Platform admins do not read tenant operations";
  - note that `forEachTenant` skips suspended tenants unless a job includes them.

  Verify `pnpm docs:check` passes.

## 8. Tenant notes

- [ ] 8.1 Add the value set `TenantNoteSortKey` (`createdAt`) to `packages/shared/src/modules/core/values.ts`, and `NewTenantNote`, `TenantNoteView`, `TenantNoteListQuery` and `TenantNoteList` to `api.platform.ts`. Add `core/platform/notes.ts` and the routes `GET` and `POST /api/platform/tenants/:tenantId/notes` (ops `core.platform.listTenantNotes` and `createTenantNote`, `StoryId.PL_08`) with route cases. Verify with `notes.test.ts`:
  - 201 with author and kind `note`;
  - a body of only spaces answers 422 at `["body"]`;
  - newest first;
  - `kind=suspended`;
  - search in the body;
  - a deleted author reads as `author: null`;
  - a carrier org id answers 404.
- [ ] 8.2 Create `$tenantId/notes.tsx` with `modules/core/tenant-notes.tsx`: the add form (`Textarea`, `Field`, `zodResolver(NewTenantNote)`) above the data table (time with zone, kind with icon and text, author or "Deleted user", body). Add the strings to `core/platform.json` in de, en and pl. Verify `pnpm typecheck` and the catalog test pass.
- [ ] 8.3 Write `e2e/core/PL-08.spec.ts` with `describe('PL-08 Tenant notes')`:
  - add a note, which is listed first with the author;
  - suspend and reactivate, then filter `kind=suspended` in the URL;
  - an empty note shows the field error;
  - `expectAccessible`.

  Verify with `pnpm test:e2e e2e/core/PL-08.spec.ts`.

## 9. Seed

- [ ] 9.1 Create `apps/api/scripts/seed/platform.ts` per the design's "Seed data":
  - Rhein Lager GmbH, suspended, with its admin `admin@rhein-lager.local` and two notes;
  - Elbe Cold Store GmbH, with only an invitation and no country;
  - two notes on Acme;
  - `last_seen_at` for Acme's users and Nordhafen's admin.

  It finds orgs by name and users by email, and sets times relative to the run. Register it in `SEEDS` in `apps/api/scripts/seed-dev.ts` after `core`, `signups` and 03's seed. Verify with `apps/api/scripts/seed/platform.test.ts`: two runs converge (same notes, one invitation, one membership), and a missing Nordhafen is skipped without error.
- [ ] 9.2 Add `admin@rhein-lager.local` (Rhein Lager GmbH, suspended tenant, `tenant_admin`) to the account table in `docs/how-to/run-locally.md`. Verify `pnpm docs:check` passes.
- [ ] 9.3 On a fresh database, run `pnpm db:seed` and then `pnpm dev`, and sign in as `admin@rampflow.local`. Verify:
  - the list shows all three statuses, "Not set", "Invited", "Never" and both flags;
  - Rhein Lager's Overview shows the reason, and its Notes show both entries;
  - signing in as `admin@rhein-lager.local` shows the suspended page.

## 10. Docs

- [ ] 10.1 In `docs/explanation/mvp-scope.md`:
  - amend PL-04 with status, country, tax id, admin email, last activity and the facets;
  - add PL-06 Tenant hub, PL-07 Suspend and reactivate, and PL-08 Tenant notes under "Platform admin";
  - keep billing and impersonation in "Out of scope".
- [ ] 10.2 Rewrite `docs/how-to/onboard-a-tenant.md`:
  - step 1 notes self-registration (02) next to "Create tenant";
  - a new "Find a tenant" step: facets, search, sort and shareable URL;
  - step 2 points to the Entitlements tab;
  - step 4 reads usage and activity on the list and the Overview;
  - new steps "Suspend or reactivate a tenant" (effects per party, emails) and "Keep notes";
  - bump `updated`.
- [ ] 10.3 Add "Tenant status" (onboarding, active, suspended) and "Suspension" to `docs/explanation/domain-glossary.md`, or extend 02's and 03's entries if they exist.
- [ ] 10.4 Add the suspension check to the request path in `docs/explanation/architecture-overview.md` ("Every request runs in one scoped transaction"), and the tenant status to `loadAccess` in `docs/reference/module-contract.md` ("Request environment").
- [ ] 10.5 Run `pnpm docs:screens` against `pnpm dev` with the dev seed to refresh `platform-tenants`. Verify the screenshot shows the new columns at 1920 × 1080.
- [ ] 10.6 Run `pnpm docs:index` and `pnpm docs:check`. Verify both pass and `docs/INDEX.md` lists ADR-0018.

## 11. Integration

- [ ] 11.1 Run `pnpm verify`, and `pnpm test:e2e e2e/core e2e/booking e2e/driver`. Verify all are green.
- [ ] 11.2 Run `scripts/test-at-date.sh +40d` for `src/modules/core/platform`, `src/kernel` and `src/modules/privacy`. Verify the last-activity, suspension and retention tests do not depend on today's date.
- [ ] 11.3 Check the diff:
  - the schema change comes with seed changes;
  - every doc in the proposal's Impact changed;
  - `grep -rn "platform/tenants/\$tenantId\b" docs e2e` finds no stale reference to the entitlement cards on the hub root;
  - no doc says that nothing writes `app_user.last_seen_at`.

  Write the report's deviations:
  - no `org.suspend_reason`;
  - stories PL-06 to PL-08;
  - the `nullsLast` option in 01's `kernel/list.ts`;
  - `biome.json`, `kernel/scoped.ts`, `kernel/jobs.ts` and `kernel/scopes.ts` edits;
  - `CarrierContextTenant.suspended`;
  - the driver 401.
