# Proposal

## Why

With self-registration (02) tenants appear without the platform admin creating them, and onboarding (03) gives each one a lifecycle. The platform admin now needs to find a tenant among many, see at a glance which ones are stuck in onboarding, unverified or possibly duplicated, look into one tenant (members, sites, entitlements, history), and stop a tenant that abuses the service. Today `/platform/tenants` shows name, package and usage only, `/platform/tenants/$tenantId` is one page of entitlement cards, and nothing can suspend a tenant.

## What Changes

- **Tenant list columns, filters, search and sort** on 01's data table and list contract (`contract/list.ts`, `kernel/list.ts`, `components/data-table/`), as new sort keys and facets of `TenantListQuery`. Columns: name, status (`onboarding`, `active`, `suspended`), package, country, tax id with its check status, admin email, created, last activity, and the four usage meters of PL-04. Facets with counts: status, package (01), country, flags (possible duplicate, tax id unverified). Search: name (01), tax id, admin email. Sort: name (01, still the default), created (01), status, package, country, last activity. All of it runs on the server and lives in the URL, as 01 defines.
- **Tenant country** is `org.country`, which 02 fills from the registration form (EU-27). The platform admin can now edit it, for example for tenants created through PL-01. It is not derived from the tenant's sites.
- **Last activity** is the latest `app_user.last_seen_at` among the tenant's members. That column exists but nothing writes it today. The session touch (every 5 minutes) and sign-in now write it too. This also fixes the retention job, which reads the same column for inactive carrier users.
- **Tenant hub with tab routes** under `/platform/tenants/$tenantId`: Overview (index), `members`, `sites`, `entitlements`, `notes`. Overview shows status, onboarding progress (from 03), usage, tax id and VIES status, flags, admin contacts, and the name, country and package form. Members, Sites and Notes are data tables with their own `defineList` specs. The tabs follow 01's entity-view rules: child routes, the first tab is the index, and an unknown id shows "no access". Member and site rows link nowhere, because the platform does not manage them (ADR-0015). Entitlements holds the existing PL-02 cards (overrides, grouped entitlements, admin invitations), moved and not rewritten. A code comment marks where 05 adds the Billing tab.
- **Suspend and reactivate** with a required reason. New column `org.suspended_at`. While it is set:
  - Tenant staff and carriers acting at the tenant get 403 `tenant_suspended`.
  - Driver links answer 401 like a revoked link.
  - The tenant's public booking links answer 404.
  - The reminder, no-show and holiday-import jobs skip the tenant. The retention job and the outbox still run.
  - Carriers keep read access to their own bookings there. Their context marks the tenant as suspended.
  - The platform is not affected.
  - Each tenant admin gets an email on suspension (with the reason) and on reactivation.
- **Tenant notes**: new table `tenant_note`, readable and writable by the platform party only, append-only. The platform admin adds notes with author and time. Suspension and reactivation write a note of their own kind, which holds the reason. The Notes tab shows the history.
- **BREAKING** (internal API): `GET /api/platform/tenants` returns more fields per row and more facets, and takes new facet and sort values on 01's paged contract. `/platform/tenants/$tenantId` becomes a layout route with child routes, and the entitlement cards move to `/platform/tenants/$tenantId/entitlements`.
- Stories in `docs/explanation/mvp-scope.md`: PL-04 is amended with the new columns and facets, and PL-06 (tenant hub), PL-07 (suspend and reactivate) and PL-08 (notes) are new. PL-05 is already the retention job, so the brief's "PL-05.." starts at PL-06.

## Capabilities

### New Capabilities

- `platform-tenant-detail`: the tenant hub with its tab routes, and what the Overview, Members and Sites tabs show.
- `tenant-suspension`: suspending and reactivating a tenant, what each party can still do while it is suspended, the jobs that skip it, and the emails to its admins.
- `tenant-notes`: the platform's internal, append-only notes on a tenant, including the suspension history.

### Modified Capabilities

- `platform-tenant-list` (created by 01): new columns (status, country, tax id, admin email, last activity), the facets status, country and flags, search by tax id and admin email, and sort by status, package, country and last activity. The requirements for columns, search, status (02) and sort are modified. The country and flags facets and the definitions of country, tax id, admin email and last activity are added.
- `tenant-lifecycle` (created by 02): the derived status gains `suspended`, which wins over `onboarding` and `active`, and only tenants can carry a suspension time.
- `entitlement-overview`: the tenant entitlements card moves from `/platform/tenants/$tenantId` to the Entitlements tab `/platform/tenants/$tenantId/entitlements`. Grouping, summaries and stored open groups stay the same.

## Impact

- **API:** `apps/api/src/modules/core/platform/` (`routes.platform.ts`, `tenants.ts`, `usage.ts`, `route-cases.ts`, `platform.test.ts`, new `tenant-reads.ts`, `members.ts`, `suspension.ts`, `notes.ts` and their tests), `core/schema.ts`, `core/emails/tenant-suspended.tsx` and `tenant-reactivated.tsx`, `core/context/routes.carrier.ts`.
- **Kernel and shared files (coordinator rule):**
  - `kernel/scopes.ts` (write `app_user.last_seen_at`) and `core/auth/sessions.ts`.
  - `kernel/access.ts` (tenant status in `Access`), `kernel/scoped.ts` (suspension check) and `kernel/errors.ts` (`tenant_suspended`).
  - `kernel/jobs.ts` (`forEachTenant` skips suspended tenants), `privacy/jobs/retention.ts` (includes them), and `booking/registration/public-links.ts` (404).
  - `biome.json`: `platform/tenant-reads.ts` may use `asScope`.
- **Shared:** `packages/shared/src/modules/core/api.platform.ts` (list query, summary, detail, members, sites, notes, suspension types), `api.context.ts` (`CarrierContextTenant.suspended`), and `tenant-status.ts` (02) with `suspended`. Value sets per ADR-0019 in `packages/shared/src/modules/core/values.ts` (`TenantStatus.suspended`, `TenantFlag`, `TenantCountryFacet`, the sort key, member, site and note sets, `SuspendedTenants`), and new members of `ErrorCode`, `ConflictReason`, `SystemActorName`, `EmailTemplate` and `StoryId` in `packages/shared/src/values/`.
- **Web:**
  - `apps/web/src/routes/platform/tenants/index.tsx`.
  - `$tenantId.tsx` becomes `$tenantId/route.tsx` plus `index.tsx`, `members.tsx`, `sites.tsx`, `entitlements.tsx` and `notes.tsx`.
  - `apps/web/src/modules/core/queries.ts` and new `apps/web/src/modules/core/tenant-*.tsx` components.
  - `components/app-shell/route-states.tsx` (suspended page) and `routes/t/$orgId/route.tsx`.
  - The carrier warehouses page `routes/c/$orgId/tenants/` and the booking wizard's tenant choice.
- **i18n:**
  - `core/platform.json`, `core/errors.json`, `core/shell.json` and `core/auth.json` (emails) in de, en and pl.
  - The carrier "temporarily unavailable" label in `booking/portal.json`.
  - No driver strings: drivers see the existing invalid-link screen.
- **Tests:**
  - New `ORACLE` rule for `tenant_note` in `apps/api/src/db/rls.test.ts` and model rows in `apps/api/test/model.ts`. `policies.test.ts` checks that notes are append-only.
  - Route cases for every new route.
  - E2E: new `e2e/core/PL-06.spec.ts`, `PL-07.spec.ts` and `PL-08.spec.ts`. `PL-04.spec.ts` gets the new columns and facets, and `PL-02.spec.ts` the new entitlements path.
- **Data model:** yes.
  - New column `org.suspended_at` (check: tenants only).
  - New table `tenant_note` (kinds `note`, `suspended`, `reactivated`; RLS platform select and insert only).
  - No new column for country or last activity: `org.country` and `app_user.last_seen_at` exist and are now written.
  - The brief's `org.suspend_reason` is not added: the reason lives in the `tenant_note` row, because `org` rows are readable by carriers, drivers and public visitors.
  - One migration: `pnpm db:generate --name 04-platform-tenant-views`.
  - Seed: new `apps/api/scripts/seed/platform.ts` with `platform.test.ts`, registered after `core` and after the seeds of 02 and 03.
- **Docs:**
  - `docs/decisions/ADR-0018-tenant-suspension.md` (new): suspension is enforced in the request scope and the job runner, with the effect per party.
  - `docs/decisions/ADR-0002-tenancy-isolation-rls.md`: the platform reads tenant master data (sites, onboarding progress) through `asScope` in `platform/tenant-reads.ts`. A suspended tenant is refused after scope resolution. `forEachTenant` skips suspended tenants.
  - `docs/decisions/ADR-0011-frontend-routes-and-org-context.md`: route map rows for the tenant hub tabs.
  - `docs/reference/data-model.md`: `org.suspended_at`, `org.country` for tenants, the `app_user.last_seen_at` writer, `tenant_note`, the ER diagram and retention.
  - `docs/reference/api-routes.md`: the `tenant_suspended` error, the platform section prose and the regenerated tables.
  - `docs/reference/module-contract.md`: `loadAccess` reads the tenant status.
  - `docs/explanation/mvp-scope.md`: PL-04 amended, and PL-06 to PL-08.
  - `docs/explanation/architecture-overview.md`: the suspension step in the request path.
  - `docs/explanation/ux-concept.md`: the screen inventory row.
  - `docs/explanation/domain-glossary.md`: tenant status, suspension.
  - `docs/how-to/onboard-a-tenant.md`: find, inspect, suspend and annotate tenants.
  - `docs/how-to/run-locally.md`: the demo account of the suspended demo tenant.
- **Not in scope:** Billing tab and Stripe status (05), impersonation, a platform view of a single user or site, editing or deleting notes.
