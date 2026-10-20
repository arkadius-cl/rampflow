# Design

## Context

What 04 builds on, from the code today and from the three earlier changes:

- **Tenant list after 01:**
  - `GET /api/platform/tenants` validates `TenantListQuery.query` (`defineList` in `packages/shared/src/contract/list.ts`). It answers `TenantList extends ListPage<TenantSummary>` with `facets`.
  - `listTenants` in `core/platform/tenants.ts` composes the fragments of `apps/api/src/kernel/list.ts` (`contains`, `orderBy`, `pageWindow`, `facetCounts`, `pageOf`). It calls `usageOf` (`core/platform/usage.ts`) for the page rows only.
  - The web renders `components/data-table/` with `use-list-state.ts`. `/platform/tenants/$tenantId` has a loader, so an unknown id shows `NoAccess`.
  - ADR-0015: every managed entity has a view, detail tabs are child routes, and the first tab is the index.
- **02:**
  - New `org` columns: `tax_id_type`, `tax_id_value` (normalized), `tax_id_status` (`pending`, `verified`, `unverified`, `unavailable`), `tax_id_checked_at`, `possible_duplicate` and `activated_at`. Each has a check that ties it to `kind = 'tenant'`.
  - New `app_user` columns: `given_name`, `family_name`, `salutation`.
  - Registration stores the company's `country` (EU-27) in the existing `org.country`.
  - `packages/shared/src/modules/core/tenant-status.ts` has `TENANT_STATUSES = ['onboarding', 'active']` and `tenantStatus({ activatedAt })`, with the note "04 adds `suspended`".
  - 02 adds the status facet to `TenantListQuery`, the greeting helper `core/emails/greeting.ts`, and the seed tenants Nordhafen Kühllogistik, Acme Logistik Süd and Wisła Magazyny.
- **03:**
  - `Access.tenantStatus` in `kernel/access.ts`, with `requireActiveTenant` (409 `onboarding_incomplete`).
  - `core/onboarding/onboarding.ts` computes the three steps (site with hours, hall, dock) under a tenant scope. `GET /api/t/:orgId/onboarding` returns them (`api.onboarding.ts`).
  - Activation writes `org.activated_at` in the dock transaction.
- **ADR-0002:** the platform party reads `org`, `app_user`, `membership`, `invitation`, `tenant_subscription` and `entitlement_override`. It has no policy on `site`, `hall`, `dock` or `booking`. `usage.ts` is the only platform file that may switch scope (`biome.json`), with actor `system:usage`, and it returns counts only.
- **`app_user.last_seen_at`** exists and drives `privacy.retention.carrier_inactive_days` (`privacy/jobs/retention.ts` reads `coalesce(last_seen_at, created_at)`). No code writes it. `sessionUser` (`kernel/scopes.ts`) only touches `session.last_seen_at` every 5 minutes.
- **`org` rows are readable** by the tenant, its linked carriers, `carrier_at_tenant`, `driver` and `public` (data model, `org` RLS). Any column on `org` is therefore visible to those parties, whatever the API selects.
- **Request path:**
  - `scoped()` (`kernel/scoped.ts`) resolves the scope, opens the transaction and runs `loadAccess`, once per area (`modules/index.ts`).
  - Public link routes open their own `withScope(publicScope(link))` and go through `openPublicLink` (`booking/registration/public-links.ts`).
  - Jobs iterate tenants with `forEachTenant` (`kernel/jobs.ts`). It is used by `reminders`, `no_show`, `holiday_import` and `retention`.
- **The driver PWA** (`apps/driver/src/lib/session.ts`) shows the `invalid` phase only for 401. It treats any other failed poll as network trouble and keeps the last state on screen.

## Goals / Non-Goals

**Goals:**
- One query per list page plus one usage statement per row of the page. No per-tenant fan-out to sort or filter.
- Suspension enforced in one kernel place per path (request, public link, job), not per route.
- Reuse 01's list contract and components for all four lists (tenants, members, sites, notes) and 02's and 03's status, tax id and onboarding code. Nothing is redefined.

**Non-Goals:**
- A platform view of one user or one site. Both stay rows: the platform manages neither (ADR-0015 classifies by "users manage on its own"). The platform user view joins ADR-0015's backlog.
- Editing or deleting notes, attachments on notes, mentions.
- Revoking sessions, driver links or public links on suspension.
- Billing status and the Billing tab (05). Impersonation.
- Usage meters as sort keys or facets: they need every tenant's per-tenant statement (see decision 1).

## Decisions

### 1. The tenant list extends 01's `TenantListQuery`; status, admin and activity are SQL expressions

`api.platform.ts`:

```ts
export const TENANT_FLAGS = ['possible_duplicate', 'tax_id_unverified'] as const;
export const TenantListQuery = defineList({
  sort: ['name', 'createdAt', 'status', 'package', 'country', 'lastActivityAt'],
  defaultSort: 'name', defaultOrder: 'asc',
  facets: { status: TENANT_STATUSES, package: PACKAGE_IDS, country: TENANT_COUNTRY_FACET, flag: TENANT_FLAGS },
});
// TENANT_COUNTRY_FACET = [...EU_COUNTRIES (02's EU-27 list), 'none']
export interface TenantSummary {
  id: string; name: string; package: PackageId; createdAt: string; status: TenantStatus;
  country: string | null;
  taxId: { type: TaxIdType; value: string; status: TaxIdStatus } | null;
  admin: { email: string; invited: boolean } | null;
  lastActivityAt: string | null;
  possibleDuplicate: boolean;
  usage: TenantUsage;
}
export interface TenantList extends ListPage<TenantSummary> {
  facets: { status: Record<TenantStatus, number>; package: Record<PackageId, number>;
            country: Record<TenantCountryFacet, number>; flag: Record<TenantFlag, number> };
}
```

`listTenants` builds one `from org join tenant_subscription` with these expressions:

- `status`: `case when suspended_at is not null then 'suspended' when activated_at is null then 'onboarding' else 'active' end`. It serves the filter, the facet count and the sort. The sort uses the order of `TENANT_STATUSES` (`onboarding`, `active`, `suspended`) through `array_position`. `package` sorts in the order of `PACKAGE_IDS` the same way.
- `lastActivityAt`: a grouped subquery `select m.org_id, max(u.last_seen_at) from membership m join app_user u ... where m.org_kind = 'tenant' group by m.org_id`, left-joined.
- `admin`: a lateral subquery. It takes the email of the earliest `tenant_admin` membership (`order by membership.created_at, membership.id`). Without one, it takes the email of the newest open `tenant_admin` invitation, with `invited = true`.
- `flag`: `possible_duplicate` and `tax_id_status = 'unverified'`, OR-ed within the facet.
- `country`: `none` maps to `org.country is null`.
- **Search.** The search is one OR of three parts:
  - `contains(q, org.name)`;
  - `contains(normalizeSearchTaxId(q), org.taxIdValue)`, where the term drops spaces, `.`, `-` and `/` and is upper-cased. The stored value is already normalized by 02.
  - An `exists` over `membership ⨝ app_user` with role `tenant_admin`, and over open `tenant_admin` invitations, whose email `contains(q)`.
- **Facet counts.** One grouped query per facet, without that facet's own condition (01, decision 4). The Country facet's zero-count values are hidden in the web, except selected ones.
- **Null placement.** 01's `orderBy` gains an option `nullsLast: readonly S[]`, so `country` and `lastActivityAt` sort empty values last in both directions. Postgres puts nulls first on `desc` by default.

`usageOf` still runs only for the page rows. Sorting or filtering by usage would need every tenant's per-tenant statement, so it stays out (non-goal).

Alternatives: compute status, admin and activity in TypeScript after loading all tenants. Rejected: paging and sorting must run in SQL (01). A database view `tenant_overview`. Rejected: views need custom SQL, which unit branches cannot ship (ADR-0001), and RLS on views needs `security_invoker` handling.

### 2. Country is `org.country`; the platform admin edits it within the EU-27

02 fills `org.country` from the registration form, and its tax id rules force the tax id to match it. Tenants created through PL-01 have no country, so `UpdateTenant` gains `country: z.enum(EU_COUNTRIES).nullable()`. The Overview form edits it next to name and package. The country is the tenant's legal seat. 05 hands it to Stripe for tax.

The country must stay consistent with the stored tax id, by the same rule the registration enforces (02, `checkTaxId(type, value, country)`):
- A tenant without a tax id may change or clear its country freely.
- A tenant with a tax id may change the country only to one that `checkTaxId` accepts for the stored type and value. For example, a W-IdNr or `de_stn` only with `DE`, `pl_nip` only with `PL`, and an `eu_vat` only with the country of its prefix. Otherwise `updateTenant` answers 409 `conflict` with reason `tax_id_country`, and nothing changes.
- Clearing the country of a tenant with a tax id answers the same 409.
- The tax id and its check status stay untouched in every case.

This is 409 and not 422, because the rule needs the stored row (api-routes.md, "Validation"). Editing the tax id itself is out of scope for 04. A move of the legal seat to another country therefore means a new tax id, which a later change handles together with the re-check of its status. The form shows the 409 at the country field with `core:errors.conflict.tax_id_country`.

Alternative: change the country and reset the tax id status to `unverified`. Rejected: the stored id would then contradict its own country, the record would be one that the registration rejects, and 05 would send it to Stripe.

Alternative: the country of the first site. Rejected for these reasons:
- Onboarding tenants have no site, and they are exactly the tenants the admin filters most.
- Sites can be in several countries.
- Sites are not readable by the platform party, so the list could not filter or sort by it without a per-tenant scope switch.

### 3. Last activity from `app_user.last_seen_at`, which `sessionUser` now writes

`sessionUser` already reads the user row under `asScope(user)` to check `disabled_at`. It also selects `last_seen_at`, and when that value is null or older than 5 minutes, it updates it to `now` in the same block. The `user` party may update its own row. Every signed-in request therefore keeps it at most 5 minutes behind, and the first request after a sign-in (the web calls `/api/me` right away) records the sign-in. This is decoupled from the session touch, so a new session does not delay it.

A tenant's last activity is `max(last_seen_at)` over its members. It is one grouped query under the platform party, so the list sorts and pages by it in SQL.

Side effect, intended: the retention job's "carrier users without sign-in" now measures from real activity instead of `created_at`, as data-model.md already describes. `retention.test.ts` gets a case where a recent request keeps a carrier user.

Alternatives:
- `max(session.last_seen_at)`. Rejected: `session` is restricted to `auth/` and `kernel/` (biome.json), and sign-out deletes the row, so the activity disappears.
- The latest booking `created_at`. Rejected: `booking` has no platform policy, so sorting would need a per-tenant scope switch for every tenant.
- A new activity table. Rejected: the brief prefers existing data, and the column exists.

### 4. Platform reads of tenant master data go through `platform/tenant-reads.ts`

The Sites tab and the Overview's onboarding progress read `site`, `hall`, `dock` and `opening_hours`. These tables have no platform policy. Like `usage.ts`, `tenant-reads.ts` switches with `asScope` to `{ party: 'tenant', tenantId, siteIds: 'all', actor: systemActor('platform_read') }`. It exports two reads:

- `siteList(tx, tenantId, state)`: the sites data table, with hall and counted dock numbers from grouped subqueries.
- `onboardingOf(tx, tenantId)`: it calls 03's step function from `core/onboarding/onboarding.ts`.

Both select master data only: no booking, carrier, visit or personal data. `biome.json` adds the file to the `asScope` and `systemActor` allowance. ADR-0002 replaces "PL-04 usage counts switch per tenant" with "PL-04 usage counts and the tenant hub's site list and onboarding progress switch per tenant", and keeps the rule that the platform does not read tenant operations.

Alternative: a `platform` select policy on `site`, `hall` and `dock`. Rejected for these reasons:
- It widens the platform's database rights for every future query.
- It changes three ORACLE rules.
- It contradicts ADR-0002's "no policy on operational tenant tables" for a read-only list that one function serves.

### 5. Members, sites and notes are data tables with their own `defineList`

Each list gets its own named query and response type in `api.platform.ts` (01, decision 3):

| List | Route | Sort | Facets | Search |
|---|---|---|---|---|
| `PlatformMemberListQuery` → `PlatformMemberList` | `GET /tenants/:tenantId/members` | `name`, `email`, `role`, `lastActivityAt`, `since` (default `name`) | `role` (`TENANT_ROLES`), `state` (`member`, `disabled`, `invited`, `expired`) | name, email |
| `PlatformSiteListQuery` → `PlatformSiteList` | `GET /tenants/:tenantId/sites` | `name`, `city`, `createdAt` (default `name`) | `active` (`yes`, `no`) | name, city |
| `TenantNoteListQuery` → `TenantNoteList` | `GET /tenants/:tenantId/notes` | `createdAt` (default `desc`) | `kind` (`note`, `suspended`, `reactivated`) | body |

- **Members** is a `union all` under the platform party of two parts: `membership ⨝ app_user` (rows with kind `member`), and open invitations (`accepted_at is null and revoked_at is null`, kind `invitation`, `expired` when `expires_at <= now`). Count, facets and page run over the union as a subquery. A member row reads its name through `app_user.name` (the display name; 02 keeps it). The row type is a discriminated union `{ kind: 'member', ... } | { kind: 'invitation', ... }`, so the web renders state without optional-field guessing.
- **Sites** runs inside `tenant-reads.ts` (decision 4).
- **Notes** reads `tenant_note ⨝ app_user` (author) under the platform party.

The name `MemberList` already exists in `api.staff.ts`, hence the `Platform` prefix.

### 6. The hub is a layout route with five child routes

```
apps/web/src/routes/platform/tenants/$tenantId/
  route.tsx         loader ensureQueryData(tenantQuery), header (name, status, package, suspend/reactivate), tab links, <Outlet/>
  index.tsx         Overview
  members.tsx       validateSearch: PlatformMemberListQuery.search
  sites.tsx         validateSearch: PlatformSiteListQuery.search
  entitlements.tsx  OverridesCard, EntitlementsCard, AddOverrideCard, AdminInvitationsCard (moved from $tenantId.tsx)
  notes.tsx         add-note form + data table; validateSearch: TenantNoteListQuery.search
```

- **Tab bar.** It follows the existing `t/$orgId/sites/$siteId/route.tsx`: `Link`s with `activeProps` that set `aria-current="page"`. A comment in `route.tsx` marks where 05 inserts `billing.tsx` between Entitlements and Notes.
- **Loader.** The loader moves from 01's `$tenantId.tsx` into `route.tsx`. An unknown id reaches the platform layout's `errorComponent` (`NoAccess`).
- **Entitlements.** The existing cards move into `entitlements.tsx` unchanged. Only `TenantForm` leaves them: it moves to the Overview and gains the country field.
- **Queries.** `tenantQuery` stays the one detail read. The member, site and note lists use keys `['platform', 'tenants', id, '<list>', 'list', toQuery(state)]`. Suspend, reactivate and add-note invalidate the tenant key prefix and `['platform', 'tenants', 'list']`.
- **Components** live in `apps/web/src/modules/core/`: `tenant-status.tsx` (badge with icon), `tenant-overview.tsx`, `tenant-suspension.tsx` (dialog), `tenant-notes.tsx`.

`TenantDetail` gains the summary fields of decision 1 and these:

- `activatedAt`;
- `taxId.checkedAt`;
- `suspension: { at, reason, by } | null`, read from the latest `suspended` note;
- `admins: { name, email }[]`;
- `onboarding: OnboardingProgress | null` (03's type), set only while the status is `onboarding`.

The possible-duplicate link navigates to `/platform/tenants` with `toQuery({ duplicateOf: tenantId })`. A text search on the tax id would miss two kinds of matches that 02's detection finds: an equivalent id in another form (`pl_nip` `N` and `eu_vat` `PLN`, a W-IdNr and its `eu_vat`) and a shared admin email domain with different tax ids. So the list uses the detection itself:

- 02's `core/signup/duplicates.redeem.ts` is split. `duplicateMatch(identity)` builds the SQL condition over `org` from one identity `{ taxIdType, taxIdValue, emailDomains }`: the `taxIdEquivalents`, the W-IdNr prefix rule and the domain rule with the free-mail list. `possibleDuplicate` (02) keeps calling it with the registration's identity.
- `TenantListQuery` gains `duplicateOf: TenantId` (optional, not a facet). `listTenants` reads that tenant's identity (its tax id, and the email domains of its `tenant_admin` members) and filters `org.id = $duplicateOf or duplicateMatch(identity)`, combined with the other filters as usual. The platform party already reads `org`, `membership` and `app_user`, so no scope switch is needed.
- The list shows the filter as a removable chip "Matching <tenant name>" next to the search. An unknown or non-tenant `duplicateOf` gives an empty list, not an error, like any filter that matches nothing.

This also finds matches that appeared after the registration, which is what support needs when it follows the flag.

Alternative: keep one detail page with cards. Rejected by the product owner's decision 2 and ADR-0015.

### 7. Suspension state: `org.suspended_at`; the reason lives in `tenant_note`

`org.suspended_at timestamptz null`, with check `org_suspended_tenant_only`: `suspended_at is null or kind = 'tenant'`. The brief's `org.suspend_reason` is not added. `org` rows are readable by linked carriers, carriers at the tenant, drivers and public visitors (Context). A reason such as "fake bookings reported by Trans-Pol" would then sit one careless `select` away from a carrier, with RLS unable to stop it. The reason is the body of the `suspended` note, which only the platform reads. The Overview shows the latest one.

The commands live in `core/platform/suspension.ts`:

- **`suspendTenant(tx, tenantId, reason, userId, locale, now)`.** A guarded update `update org set suspended_at = $now where id = $1 and kind = 'tenant' and suspended_at is null returning id`. With a row, it inserts the `suspended` note and enqueues one email per admin. Without one, it calls `requireTenant` (404 for a non-tenant), and a suspended tenant is a no-op. Two concurrent suspensions therefore write one note and one email set.
- **`reactivateTenant`.** The mirror: `set suspended_at = null where ... and suspended_at is not null`, then the `reactivated` note and emails.
- **Routes.** `POST /api/platform/tenants/:tenantId/suspend` and `/reactivate` with body `SuspensionBody = { reason: z.string().trim().min(1).max(500) }`. Both answer 200 with `TenantDetail`. They are command routes, like `.../publish` in safety. A repeated command answers 200 (api-routes.md "Idempotency").

### 8. Enforcement: the tenant status in `Access`, the refusal in `scoped()`

- **Status.** 02's `tenant-status.ts` gets `TENANT_STATUSES = ['onboarding', 'active', 'suspended']`, and `tenantStatus({ activatedAt, suspendedAt })` with `suspended` first. 03's `loadAccess` already reads the tenant org for `Access.tenantStatus`, and it now also selects `suspended_at`. That is the same single-row read, with no extra statement. 03's `requireActiveTenant` keeps treating anything but `active` as blocked.
- **`scoped()`**, after `loadAccess`, when `access.tenantStatus === 'suspended'`:
  - `tenant` scope with a user actor, and `carrier_at_tenant` → `throw new ApiError('tenant_suspended')` (403).
  - `driver` → `throw new ApiError('unauthorized')` (401).
  - Platform, user, carrier (cross-tenant), token and anonymous scopes have no `tenantStatus` and pass.
- **Public links.** `openPublicLink` already loads `Access` for the public scope. It answers 404 when the status is `suspended`, next to its existing feature and site checks. Registration verification goes through `assertLinkOpen` → `openPublicLink` as well, but `verifyRegistration` (`booking/registration/verify.redeem.ts`) deliberately turns that `not_found` into 401 `unauthorized`, like any invalid or expired link. It throws before redeeming, so the registration stays pending and verifies after reactivation. The spec follows this mapping (404 for the link and the form, 401 for verification) instead of changing the service. The link page and the verify page already handle exactly these two answers. Logos stay served: they carry no data and appear in old emails.
- **Carrier context.** `core/context/routes.carrier.ts` already calls `loadAccess` per linked tenant. `CarrierContextTenant` gains `suspended: boolean`, and `carrierPortal` is `false` when suspended. The booking wizard filters on `carrierPortal`. The warehouse list (`routes/c/$orgId/tenants/`) shows "Temporarily unavailable" with an icon.
- **Jobs.** `forEachTenant(ctx, job, step, { suspended: 'skip' | 'include' })`, with `'skip'` as the default, lists tenants with `suspended_at is null` under the system scope (which reads `org`). `retention.ts` passes `'include'`. Reminders, no-show and holiday import use the default. The outbox drains as before.

Why `scoped()` and not the scope resolvers:
- The resolvers run in their own short transactions before the request transaction.
- `loadAccess` already reads the org row inside the request transaction under the party's own RLS.
- One check after it covers every router of every area, including routers added later.

Why 401 for drivers: the PWA shows its invalid-link screen only for 401. A 403 would keep the last booking state on screen as "offline" (Context), which tells a driver at the gate something false. 401 needs no new string in 12 driver locales. Links are not revoked, so they work again after reactivation.

Why 404 for public links: a prospective carrier must not learn that the operator is suspended. A suspended link reads like a closed one, as `openPublicLink` already does for a disabled feature.

Why carriers keep read access: their bookings are their own delivery schedule. A carrier needs to see what was booked at a tenant that stopped answering.

**Web.** `t/$orgId/route.tsx`'s `errorComponent` renders a new `TenantSuspended` page (`route-states.tsx`) for `isFailure(error, 'tenant_suspended')`. The page has a title, a sentence to contact the organisation's admin, and a link to `/`. `lib/api.ts` `call` invalidates the area context query and the router on a `tenant_suspended` failure, so a screen that was open when the suspension happened switches to that page on the next action.

Alternative: revoke sessions and driver links on suspension. Rejected: reactivation would then need new invitations and links, and a tenant user with other memberships would be signed out of all of them.

### 9. `tenant_note`: platform-only, append-only

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | `uuidv7()` |
| `tenant_id` | uuid | no | FK `org` on delete cascade; index `(tenant_id, created_at)` |
| `kind` | text | no | `note`, `suspended`, `reactivated` (check) |
| `body` | text | no | 1 to 2,000 characters (check on `char_length(trim(body))`); **PD** possible |
| `author_id` | uuid | yes | FK `app_user` on delete set null |
| `created_at` | timestamptz | no | |

- **RLS.** `allow('platform', 'select', always)` and `allow('platform', 'insert', always)`. No update or delete policy, so the app role cannot change notes. The FK cascade on tenant deletion is a referential action and is not subject to RLS. ORACLE: `tenant_note: (c) => is(c, 'platform')`. `test/model.ts` inserts one note per world tenant. `policies.test.ts` checks that an update and a delete under the platform party touch 0 rows.
- **Routes.** `POST /api/platform/tenants/:tenantId/notes` with `NewTenantNote = { body }` answers 201 with `TenantNoteView` (`{ id, kind, body, author: { id, name } | null, createdAt }`). The suspension notes are written by the commands of decision 7, never through this route.

Alternative: a generic audit table. Rejected: `core.audit_log` is reserved for later, and notes are free text written by people, not an event log.

### 10. Emails to tenant admins

`core/emails/tenant-suspended.tsx` (`{ orgName, reason }`) and `tenant-reactivated.tsx` (`{ orgName }`):

- Category `account`, so they always send.
- `tenantId: null`, because the platform enqueues tenant-less, as PL-01's invitation does.
- `dedupeKey`: `tenant-suspension:<note id>:<user id>`.
- Recipients: `membership ⨝ app_user` with role `tenant_admin` and `disabled_at is null`.
- Locale: the user's, else `i18n.default_locale` (`platformLocale` in `routes.platform.ts`).
- Greeting: 02's `greeting.ts`, from salutation and names.
- Strings: `auth.email.tenant_suspended.*` and `auth.email.tenant_reactivated.*` in `core/auth.json` (de, en, pl), next to the other account emails.

The payloads carry no personal data beyond the org name and the reason the platform admin wrote for the tenant.

### 11. Error code and API description

- `ERROR_STATUS.tenant_suspended = 403`, with the default message "The organisation is suspended".
- `core:errors.tenant_suspended` in de, en and pl.
- One row in api-routes.md's error table. One sentence in "Areas and parties": a suspended tenant's tenant and carrier-at-tenant requests answer 403, driver requests 401 and public links 404 (ADR-0018).
- `pnpm api:docs` adds the new operations. Their stories are PL-04, PL-06, PL-07 and PL-08.
- Route cases: every new route gets a platform case (`as: 'platform_admin'`, `permission: 'core.manage_tenants'`, `foreign: 'not_found'`). The `suspend` control call suspends world A of its own fresh world. `reactivate` on an active tenant is a 200 no-op.

### 12. ADR-0018 records the suspension rule

Suspension is a rule every later party, route and job must follow, so it needs an ADR. `docs/decisions/ADR-0018-tenant-suspension.md` decides:

- The state lives in `org.suspended_at`, and the reason in the platform-only notes.
- The effect per party, and where each is enforced: `scoped()`, `openPublicLink`, `forEachTenant`.
- The 401 for drivers and the 404 for public links.
- What is not revoked.
- A new job chooses `skip` or `include`. A new party states its suspension effect.

ADR-0002 points to it from "How each context works".

### 13. Stories

- **PL-04** (amended): the columns status, country, tax id, admin email and last activity, and the facets status, country and flags.
- **PL-06 Tenant hub:** tabs, Overview, Members and Sites.
- **PL-07 Suspend and reactivate:** effects, emails and jobs.
- **PL-08 Tenant notes.**

PL-05 stays the retention job. Each new story has `e2e/core/PL-0x.spec.ts` with one `describe`.

## Risks / Trade-offs

- [The `MODIFIED` deltas on `platform-tenant-list` and `tenant-lifecycle` target capabilities that 01 and 02 create] → archive 01, 02 and 03 before 04. `openspec validate` reports this as information until then.
- [One more column read in `loadAccess` per request] → it is the org row 03 already reads by primary key. There is no new statement.
- [A request that started before the suspension committed still finishes] → acceptable. The next request is refused. The suspension is not a security boundary for in-flight requests.
- [The `last_seen_at` write adds an `update app_user` per user every 5 minutes] → at 5,000 named users that is at most about 17 writes per second, usually far fewer. It runs inside the existing scope-resolution transaction.
- [The retention job now spares active carrier users that it would have warned before] → this is the documented behavior. The release notes say carrier inactivity counts from the last request from now on.
- [Members union and lateral admin subqueries scan a tenant's memberships] → at most 75 members on Pro, with indexes on `membership(org_id)` and `invitation(org_id)`.
- [Bookings whose no-show deadline passed during a suspension are marked `no_show` (with the carrier email) on the first run after reactivation] → see Open Questions. The default keeps the job's rule unchanged.
- [A tenant admin of a suspended tenant cannot read the reason in the app] → it is in the email. The suspended page says to contact the platform or the org's admin.

## Migration Plan

1. `pnpm db:generate --name 04-platform-tenant-views` adds `org.suspended_at` with its check, and `tenant_note` with checks, index, FKs and the two platform policies. There is no backfill: every tenant starts unsuspended, and no other column changes.
2. API, web and docs ship together. The SPA is the only client of the changed platform routes.
3. Rollback: revert the code and drop the column and the table. Tenants suspended in the meantime become active again, so suspend them again after the redeploy if the rollback is partial.

## Seed data

New `apps/api/scripts/seed/platform.ts` with `platform.test.ts`, registered in `SEEDS` after `core`, `signups` (02) and the onboarding seed of 03. It finds every org by `findOrg(ctx.db, 'tenant', name)` and every user by email. It writes with `on conflict` or `update ... where`, so a second run converges.

| Rows | Why it shows the feature |
|---|---|
| Tenant "Rhein Lager GmbH" (DE, `start`, `eu_vat` `DE811569869` `verified`, `activated_at` 60 days before the run, `suspended_at` 3 days before), admin `admin@rhein-lager.local` "Mara Engel" (locale `de`, `last_seen_at` 40 days before) | A suspended tenant in the list, with the Suspended status, the oldest last activity and the status facet. Signing in as its admin shows the suspended page. |
| Its notes: a `note` "Several carriers reported bookings nobody delivered." (author `admin@rampflow.local`, 5 days before) and a `suspended` note "Fake bookings reported by carriers; paused until the operator confirms its sites." (3 days before) | The Notes tab with both kinds, and the reason on the Overview. |
| Tenant "Elbe Cold Store GmbH" (no country, `pro`, no tax id) with only an open `tenant_admin` invitation to `ops@elbe-cold.local` | A PL-01-style tenant: "Not set" country, admin marked "Invited", last activity "Never", the Country facet "Not set". |
| Acme Logistics: two notes by the platform admin ("Pilot started with Lager Hamburg.", "Moved to Pro after the pilot.") | History on the main demo tenant. |
| `last_seen_at` of Acme's users set to the run time minus 10 to 90 minutes, of Nordhafen's admin (02) to 2 days before | Varied last activity, so sorting by it is visible. If 02's tenants are missing, the seed skips them. |

Existing seeded tenants already cover the other states: Acme active and verified, Nordhafen onboarding with `unverified`, Acme Logistik Süd `possible_duplicate`, Wisła `unavailable` (02). So `pnpm db:seed` and `pnpm dev` show every status and both flags. The times are reset on each run, relative to the run's clock. The new demo account `admin@rhein-lager.local` (password `rampflow-demo`) goes into `docs/how-to/run-locally.md`.

## Open Questions

- Bookings whose no-show deadline fell inside a suspension: after reactivation the no-show job marks them as usual. Default: keep it; suspensions are rare and short. If the product owner wants otherwise, a later change can let the job skip bookings that started while the tenant was suspended (that needs the suspension history in a queryable form, which `tenant_note` has).
- Self-registered tenants that never onboard: kept without automatic deletion (shared brief). The list's status facet and last activity sort make them findable. A clean-up rule waits for real numbers.
- A platform view of one user (all memberships, sign-in state, disable) for support: default later, added to ADR-0015's backlog together with impersonation.
- Should tenant staff see the suspension reason on the suspended page? Default no: the reason goes to the admins by email only, because tenant staff can be large teams and the reason can name a carrier.
