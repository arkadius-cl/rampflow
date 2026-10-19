---
title: Delivery plan
description: The MVP implementation as 12 units in 6 waves, each with goal, stories, owned files, provided and consumed interfaces, required tests, verification commands and dependencies, plus the rules for shared files, merging, and the scope adjustments and risks.
type: explanation
audience: [agent, developer]
tags: [plan, delivery, units, waves, testing, mvp]
status: draft
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/reference/module-contract.md, docs/reference/api-routes.md, docs/reference/data-model.md, docs/reference/booking-lifecycle.md, docs/decisions/ADR-0001-data-access-drizzle-node-postgres.md]
---

# Delivery plan

The MVP is built in 12 units. A unit is one agent session in its own git worktree off `main`, sized at roughly 1,500 to 4,000 changed lines, and it ends with its stories green. Units in the same wave own disjoint files, so they run in parallel; waves run in order.

The contract every unit builds on is already on `main`: the ADRs in `docs/decisions/`, the references in `docs/reference/`, and the typed module contract in `packages/shared` (manifests, packages, resolvers, key types).

## Waves

| Wave | Units in parallel | Starts when |
|---|---|---|
| W1 | U1 Kernel | now |
| W2 | U2 Identity and web shell | U1 merged; the UX concept from the UX work stream merged |
| W3 | U3 Platform and tenant administration, U4 Sites, capacity and availability, U5 Safety authoring and register | U2 merged |
| W4 | U6 Booking engine and plan board, U7 Carrier network | U3, U4, U5 merged |
| W5 | U8 Carrier booking portal, U9 Yard, U10 Driver PWA, U11 Reports, jobs and privacy | U6, U7 merged |
| W6 | U12 Core loop end to end | W5 merged |

The critical path is U1, U2, U4, U6, then the longest W5 unit, then U12. If U6 overruns, its plan board screen (BK-01 web part, `apps/web/src/routes/t/$orgId/plan/`) moves into its own W5 unit; the API part stays in U6 because every W5 unit consumes it.

### Disjoint ownership per wave

| Wave | Unit | Top-level ownership (details per unit below) |
|---|---|---|
| W3 | U3 | `api/src/modules/core/{platform,staff,settings,carrier-users}/`, `api/src/modules/brand/`, `web/src/routes/platform/{tenants,packages,settings}/`, `web/src/routes/t/$orgId/{staff,settings,brand}/`, `web/src/routes/c/$orgId/users/`, i18n parts `core/{platform,staff,settings-ui}`, `brand/*` |
| W3 | U4 | `api/src/modules/core/sites/`, `api/src/modules/booking/{capacity,schema.resources.ts,jobs/holiday-import.ts}`, `shared/src/time/`, `web/src/routes/t/$orgId/{sites,resources}/`, i18n parts `core/sites`, `booking/capacity` |
| W3 | U5 | `api/src/modules/safety/{schema.ts,authoring,register,template}/`, `shared/src/modules/safety/`, `web/src/routes/t/$orgId/safety/`, i18n parts `safety/*` |
| W4 | U6 | `api/src/modules/booking/{schema.ts,lifecycle,staff,emails/{confirmed,changed,cancelled}}`, `api/src/modules/avis/`, `api/src/modules/driver/{schema.ts,access.ts,emails}`, `shared/src/modules/{booking/lifecycle.ts,booking/api.staff.ts,avis}/`, `web/src/routes/t/$orgId/{plan,bookings}/`, i18n parts `booking/{plan,booking,lifecycle}`, `avis/*` |
| W4 | U7 | `api/src/modules/booking/{schema.carriers.ts,carriers,registration,emails/{carrier-*,registration-*}}`, `shared/src/modules/booking/api.carriers.ts`, `web/src/routes/{r,carrier-invite}*`, `web/src/routes/t/$orgId/carriers/`, `web/src/routes/c/$orgId/tenants/`, i18n parts `booking/{carriers,registration}` |
| W5 | U8 | `api/src/modules/booking/portal/`, `shared/src/modules/booking/api.portal.ts`, `web/src/routes/c/$orgId/{bookings,book}/`, i18n part `booking/portal` |
| W5 | U9 | `api/src/modules/yard/`, `shared/src/modules/yard/`, `web/src/routes/t/$orgId/{gate,docks}/`, i18n parts `yard/*` |
| W5 | U10 | `apps/driver/`, `api/src/modules/driver/{session,view}/`, `api/src/modules/safety/driver/`, i18n parts `driver/*`, `packages/i18n/locales/status.json`, `playwright.config.ts` |
| W5 | U11 | `api/src/modules/{report,privacy}/`, `api/src/modules/booking/{jobs/no-show.ts,emails/{reminder,no-show}}`, `api/src/modules/notify/jobs/reminders.ts`, `shared/src/modules/{report,privacy}/`, `web/src/routes/t/$orgId/{reports,privacy}/`, i18n parts `report/*`, `privacy/*`, `notify/*` |

Each unit also owns its tests next to its code, its route cases, and `e2e/<module>/<story-id>.spec.ts` for its stories.

## Shared files

These files are touched by more than one unit. The rule column is binding.

| File | Owner | Rule |
|---|---|---|
| `packages/shared/src/registry.ts`, `packages.ts`, `modules/*/manifest.ts` | coordinator | Contract. A unit that needs a change (a new permission, a setting) says so in its report; the coordinator lands it on `main` before the next wave. Units never edit manifests. |
| `packages/shared/src/index.ts` | coordinator | Frozen. Units export new shared code through files under `packages/shared/src/modules/<id>/` and import them as `@rampflow/shared/modules/<id>/<file>` (U1 adds the `"./*"` export). |
| `apps/api/src/modules/index.ts`, `apps/api/src/app.ts` | U1 | U1 creates every router file of [API routes](../reference/api-routes.md) as an empty router and mounts it. Afterwards only the coordinator edits these files. |
| `apps/api/drizzle/**` | generated | One migration per unit, named after the unit. Before merging, rebase onto `main` and run `pnpm db:regen` ([ADR-0001](../decisions/ADR-0001-data-access-drizzle-node-postgres.md)). No custom SQL on unit branches. |
| `apps/web/src/routeTree.gen.ts` | generated | On conflict take either side and run `pnpm --filter @rampflow/web routes:gen`. |
| `pnpm-lock.yaml`, `*/package.json` dependency lists | unit adding the dependency | U1 and U2 add the foreseeable dependencies (listed in their units). On a lockfile conflict take `main`'s lockfile and rerun `pnpm install`. Pin exact versions. |
| `packages/i18n/locales/<locale>/<ns>/nav.json`, `entitlements.json`, `settings.json` | U2 | Derived label parts for every module. Afterwards the coordinator updates them with manifest changes. Other parts belong to the unit that created them. |
| `apps/api/test/world.ts` | U1 | The two-world fixture (two tenants with two sites each, a linked carrier, a user and session per role). Units add module fixtures through `setup` in their route cases or in their own `fixtures.ts`. |
| `e2e/support/**` | U2 | Login, Mailpit and seed helpers. Units add `e2e/support/<module>.ts`. |
| `playwright.config.ts` | U2, then U10 | U2 adds the staff project; U10 adds the Pixel 7 driver project and the driver dev server. |
| `biome.json` | U1 | Restricted-import rules for the pool, no-RLS tables and `systemActor`. Coordinator afterwards. |
| `docs/reference/*.md` | each unit for its module's sections | A unit edits only the sections of the modules it implements. `docs/INDEX.md` and the catalog tables are generated by `pnpm docs:index`. |

## Merge procedure

For each unit of a wave, one at a time, in unit order:

1. Rebase the unit branch onto `main`.
2. Run `pnpm install`, `pnpm db:regen`, `pnpm --filter @rampflow/web routes:gen` and `pnpm docs:index`.
3. Run `pnpm verify` and `pnpm test:e2e -- e2e/<the unit's modules>`.
4. Fast-forward `main`.

A unit report lists every deviation from the contract (routes, tables, permissions, events) with the reason. The coordinator updates the references before the next wave starts.

## Units

### U1 Kernel

- **Goal.** The database, tenancy, error, access, email, job and test foundation every later unit builds on. No user-facing story.
- **Stories.** NFR security (RLS as `NOBYPASSRLS` non-owner, Origin check, leak tests in CI), NFR email (transactional outbox), NFR i18n (catalog check), the job runner for BK-07, BK-08 and PL-05.
- **Owns.**
  - `apps/api/src/db/` (`pool.ts`, `scope.ts`, `rls.ts`, `ids.ts`), `apps/api/src/kernel/` (`env.ts`, `errors.ts`, `validate.ts`, `access.ts`, `scoped.ts`, `scopes.ts`, `clock.ts`, `jobs.ts`, `outbox.ts`, `mailer.ts`, `email-layout.tsx`, `rate-limit.ts`, `origin.ts`, `system.ts`, `static.ts`, `test-routes.ts`, `route-coverage.test.ts`).
  - `apps/api/src/modules/core/schema.ts` and `apps/api/src/modules/notify/{schema.ts,jobs/outbox.ts}`.
  - `apps/api/src/modules/index.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, and an empty router for every router file in [API routes](../reference/api-routes.md).
  - `apps/api/drizzle/` baseline: `0000_baseline.sql` (custom), the generated core tables, `0002_linked_tenant.sql` (custom).
  - `apps/api/drizzle.config.ts`, `apps/api/scripts/{db-setup,db-regen}.ts`, `apps/api/test/` (`global-setup.ts`, `db.ts`, `world.ts`, `http.ts`, `route-cases.ts`).
  - `packages/i18n/` (package, `createBrowserI18n`, `createServerI18n`, `catalogs.test.ts`, an empty namespace directory per module and locale, `locales/status.json`).
  - `packages/shared/package.json` (`"./*"` export), `biome.json`, root `package.json` scripts (`db:setup`, `db:generate`, `db:migrate`, `db:regen`), `.env.example` (`MIGRATION_DATABASE_URL`, `APP_ORIGIN`, `DRIVER_LINK_SECRET`, `ENABLE_JOBS`, `ENABLE_TEST_ROUTES`), `docs/how-to/run-locally.md`.
  - Dependencies: `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `pg@8.23.1`, `@hono/zod-validator@0.9.1`, `nodemailer@10.1.7`, `@react-email/components@1.0.12`, `@react-email/render@2.1.1`, `i18next@26.5.2`, `date-fns@4.4.0`, `@date-fns/tz@1.5.0`. Remove `postgres`.
- **Provides.** `withScope`, `Scope`, `Tx`, `scoped()`, the scope resolvers (session lookup included; sign-in endpoints come in U2), `AppEnv`, `loadAccess`, `requireModule`, `requirePermission`, `requireEntitlement`, `withinLimit`, `ApiError` and the error envelope, `onInvalid`, `Clock`, `enqueueEmail` with the `EmailTemplates` interface, the job runner, `rateLimit()`, `systemActor()`, the RLS policy helpers, `world()`, the `as(actor)` request helper, `defineRouteCases` and its harness, the test seed route, static serving of `apps/web/dist` and `apps/driver/dist`.
- **Consumes.** The `packages/shared` contract.
- **Tests.**
  - With no scope set, every table with RLS returns zero rows to `rampflow_app` (iterate `pg_tables` where `rowsecurity`).
  - `rampflow_app` owns no table and has `rolbypassrls = false`.
  - Under tenant B's scope, every core table returns no row of tenant A. A gate operator limited to site A1 sees no row of site A2.
  - A handler that writes and then throws, and one that writes and returns 409, leave no row.
  - Two concurrent `withinLimit` calls at `limit - 1` let exactly one write through.
  - `requireModule`, `requirePermission` and `requireEntitlement` answer the documented codes and `details`.
  - A `POST` without `Origin`, or with a foreign one, answers 403.
  - An email enqueued in a rolled-back transaction leaves no outbox row. The worker delivers to Mailpit (checked through its API) and marks the row sent; a failing transport schedules a retry; a duplicate `dedupe_key` enqueues once.
  - Two runners started together execute one tick of a job.
  - The i18n check passes on the empty catalogs and fails on a fixture with a missing key.
  - `route-coverage.test.ts` fails on a toy app with a route that has no case.
- **Verify.** `pnpm db:up && pnpm db:setup && pnpm db:migrate && pnpm verify`.
- **Depends on.** The contract on `main`.
- **Size.** About 3,500 lines.

### U2 Identity and web shell

- **Goal.** People sign in, accept invitations, pick an org, and land in an area shell whose navigation shows only what they may use.
- **Stories.** CR-03; the acceptance half of PL-01, TN-01, CR-01 and CR-04; TN-01 "removing a member ends access" (proven through the per-request membership check).
- **Owns.**
  - `apps/api/src/modules/core/{auth,me,invitations,context}/`, `core/emails/{invitation,magic-link,password-reset}.tsx`, `apps/api/scripts/seed-dev.ts` (`pnpm db:seed`).
  - `packages/shared/src/modules/core/{api.auth.ts,api.context.ts}`.
  - `apps/web/src/main.tsx`, `routes/__root.tsx`, `routes/index.tsx` (org picker), `routes/login.tsx`, `routes/auth/`, `routes/invite.tsx`, the area layouts `routes/platform/route.tsx`, `routes/t/$orgId/route.tsx`, `routes/c/$orgId/route.tsx`, `apps/web/src/lib/{api,access,i18n,time,query-keys}.ts`, `apps/web/src/components/app-shell/`, `apps/web/vite.config.ts` (proxy `/d` to port 5174), `apps/web` scripts `routes:gen`.
  - i18n: `<ns>/{nav,entitlements,settings}.json` for every module, `core/{auth,shell,errors}.json`.
  - `e2e/support/`, `e2e/core/CR-03.spec.ts`, `e2e/core/invitations.spec.ts`, `playwright.config.ts` (staff project).
  - Web dependencies: `i18next`, `react-i18next@17.1.0`, `i18next-resources-to-backend@1.2.3`, `@date-fns/tz@1.5.0`.
- **Provides.** Session sign-in, `/api/me`, the three context endpoints, the `acceptInvitation` service (U3, U7), the web `AppShell`, `guard()`, `useAccess()`, the `hc` client with error-envelope handling and toasts, i18n setup, the site-time formatting wrapper, query-key conventions, Playwright login and Mailpit helpers.
- **Consumes.** U1; the UX concept.
- **Tests.**
  - Sign-in with the right password; the wrong password; an unknown email takes the dummy-hash path; an unverified email cannot sign in.
  - Five failures in 15 minutes for one email and IP answer 429; the same email from another IP still signs in.
  - A magic link works once, expires after 15 minutes (injected clock), and two concurrent exchanges create one session.
  - A password reset revokes every other session.
  - No log line contains a token, a cookie or a password (captured logger output).
  - Invitation acceptance by a new user, by a signed-in user with the invited email, after 7 days (401), and a second time (401); gate and dock site lists become `membership_site` rows.
  - After a member is removed, their next request to that tenant answers 404, while their other memberships still work.
  - Context endpoints return the role's permissions and the tenant's entitlements; route cases for them.
  - Playwright: CR-03 by password, magic link (Mailpit) and reset; invitation acceptance; org picker with two memberships; sidebar items match `navFor` for each role; axe on sign-in and shell shows no serious or critical violation.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/core`.
- **Depends on.** U1, the UX concept.
- **Size.** About 3,800 lines.

### U3 Platform and tenant administration

- **Goal.** Platform admins run tenants, packages, overrides and defaults; tenant admins run staff, settings and the logo; carrier admins run their users.
- **Stories.** PL-01, PL-02, PL-03, PL-04, TN-01, TN-02, TN-05, CR-04.
- **Owns.** `apps/api/src/modules/core/{platform,staff,settings,carrier-users}/`, `apps/api/src/modules/brand/`, `packages/shared/src/modules/core/{api.platform.ts,api.staff.ts,api.settings.ts}`, `packages/shared/src/modules/brand/api.ts`, `apps/web/src/routes/platform/{tenants,packages,settings}/`, `apps/web/src/routes/t/$orgId/{staff,settings,brand}/`, `apps/web/src/routes/c/$orgId/users/`, `apps/web/src/modules/{core,brand}/`, i18n parts `core/{platform,staff,settings-ui}.json` and `brand/*.json`, `e2e/core/{PL-01,PL-02,PL-03,PL-04,TN-01,TN-02,CR-04}.spec.ts`, `e2e/brand/TN-05.spec.ts`.
- **Provides.** `createTenant` (also used by the seed route), the `SettingField` component (effective value, source badge, inherited hint, reset), `logoUrl(tenantId, sha)`.
- **Consumes.** U1 access and settings loading; U2 invitations and shell.
- **Tests.**
  - PL-02: an override that raises and one that lowers a value change a gated route's answer on the next request; an expired override stops applying (clock); unknown and reserved keys answer 400.
  - PL-03: an invalid value answers 422 with the zod path; a tenant override survives a platform change.
  - PL-04: usage counts per tenant; a soft limit above 100% is flagged and blocks nothing.
  - TN-01: the invite at `core.max_internal_users` (members plus pending invitations) answers 409 `limit_reached`; route cases with `siteScoped` cover the gate operator rule.
  - TN-02: each field shows value and source; reset deletes the row; a setting whose entitlement is off is absent and its write answers 403; retention above the schema maximum answers 422.
  - TN-05: PNG and JPEG up to 262,144 bytes pass; 262,145 bytes and an SVG (also one renamed to `.png`) answer 422; the public logo route answers only while `brand.logo` is on.
  - CR-04: a carrier admin invites a colleague; a carrier user cannot (403); both see all bookings of their org (checked again in U8).
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/core e2e/brand`.
- **Depends on.** U2.
- **Size.** About 3,500 lines.

### U4 Sites, capacity and availability

- **Goal.** Tenant admins model sites, halls, docks, bookable resources, hours, closures and load types; the system computes offered start times correctly across time zones and DST.
- **Stories.** MD-01, MD-02, MD-03, MD-04, MD-05; NFR time zones; the availability performance targets.
- **Owns.** `apps/api/src/modules/core/sites/`, `apps/api/src/modules/booking/{schema.resources.ts,capacity/,jobs/holiday-import.ts}`, `packages/shared/src/time/`, `packages/shared/src/modules/booking/{api.capacity.ts,duration.ts}`, `packages/shared/src/modules/core/api.sites.ts`, `apps/web/src/routes/t/$orgId/{sites,resources}/`, `apps/web/src/modules/capacity/`, i18n parts `core/sites.json`, `booking/capacity.json`, `e2e/core/{MD-01,MD-02}.spec.ts`, `e2e/booking/{MD-03,MD-04,MD-05}.spec.ts`. Adds `date-holidays` (exact pin).
- **Provides.** The time module of [ADR-0012](../decisions/ADR-0012-time-handling.md); `loadDayTimeline`, `checkFit` and `offersFor` ([ADR-0004](../decisions/ADR-0004-booking-capacity-concurrency.md)); `durationFor(loadType, loadUnits, entitlements)`; seeded load types; the holiday import job.
- **Consumes.** U1.
- **Tests.**
  - The DST cases listed in ADR-0012 (Berlin 2026-10-25 and 2027-03-28, Bucharest viewed from Berlin).
  - An unknown zone answers 422; the site beyond `core.max_sites` answers 409; dock codes are unique per site; `core.max_docks` counts `active` and `maintenance`.
  - Adding a dock that already belongs to a resource answers 409; a single resource holds at most one dock; creating a pool without `booking.pools` answers 403 while existing pools keep offering times.
  - Lowering capacity cancels nothing and flags affected bookings.
  - No start is offered outside hours, inside a closure, past the daily cap, off the grid, before the lead time or beyond the horizon.
  - The holiday import creates DE-BY closures for the next 400 days, and running it again after a reopen changes nothing.
  - Seeded load types: 20 pallets take 60 minutes and 40 take 90; tiers without `booking.duration_rules` use the largest tier.
  - Benchmark on seeded design-load data: availability for one resource-day under 200 ms and a 30-resource board under 1 s (p95 of 50 runs).
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/core/MD-0* e2e/booking/MD-0*`.
- **Depends on.** U2.
- **Size.** About 3,800 lines.

### U5 Safety authoring and register

- **Goal.** Tenant admins author versioned, multilingual briefings with quizzes; staff read and export the acknowledgement register.
- **Stories.** SF-01, SF-02, SF-03.
- **Owns.** `apps/api/src/modules/safety/{schema.ts,authoring/,register/,template/}`, `packages/shared/src/modules/safety/{api.authoring.ts,api.register.ts,validity.ts}`, `packages/shared/src/assets/pictograms/`, `apps/web/src/routes/t/$orgId/safety/`, `apps/web/src/modules/safety/`, i18n parts `safety/*.json`, `e2e/safety/{SF-01,SF-02,SF-03}.spec.ts`.
- **Provides.** `isAcknowledgementValid(ack, context)` (pure, used by U9, U10, U11), `applicableInstructions(tx, siteId)`, `publishedContent(tx, instructionId, locale)`, `recordAcknowledgement(tx, input)`, the 12-language platform template with pictograms.
- **Consumes.** U1.
- **Tests.**
  - A new instruction starts from the template in 12 locales; locales other than de and en are flagged `machine`.
  - A published version rejects edits (409); editing creates a draft; publishing a material change makes earlier acknowledgements invalid in `isAcknowledgementValid`.
  - With `safety.quiz`, publishing needs 3 to 5 questions per published locale; without it, questions are rejected.
  - The instruction beyond `safety.max_briefing_templates` answers 409 `limit_reached`.
  - The register filters by site, carrier, driver name, version and expiry, and the CSV has a BOM and the user's delimiter.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/safety`.
- **Depends on.** U2.
- **Size.** About 3,000 lines.

### U6 Booking engine and plan board

- **Goal.** Bookings exist: created under capacity rules, moved through the lifecycle by one writer, shown on the dispatcher's plan board, with the avis and the driver link.
- **Stories.** BK-01, BK-02, BK-03, AV-01, AV-02 (staff side), the link-issuing half of CR-06, the event log of YD-08.
- **Owns.** `apps/api/src/modules/booking/{schema.ts,lifecycle/,staff/,emails/{confirmed,changed,cancelled}.tsx}`, `apps/api/src/modules/avis/`, `apps/api/src/modules/driver/{schema.ts,access.ts,emails/link.tsx}`, `packages/shared/src/modules/booking/{lifecycle.ts,events.ts,api.staff.ts}`, `packages/shared/src/modules/avis/`, `apps/web/src/routes/t/$orgId/{plan,bookings}/`, `apps/web/src/modules/booking/`, i18n parts `booking/{plan,booking,lifecycle}.json`, `avis/*.json`, `driver/link-email.json`, `e2e/booking/{BK-01,BK-02,BK-03}.spec.ts`, `e2e/avis/{AV-01,AV-02}.spec.ts`.
- **Provides.** `createBooking`, `transitionBooking` and the command table ([Booking lifecycle](../reference/booking-lifecycle.md)); the avis zod schema with plate, phone and UN-number normalization; `issueDriverLink`, `driverLinkUrl`, `revokeDriverLink`; booking emails; the `BookingView` read model.
- **Consumes.** U4 availability and time; U1.
- **Tests.**
  - Two connections race for the last unit: one 201, one 409 with `offers`, one row.
  - Daily cap; a forced booking over capacity records `forced` and the reason; staff ignore lead time and horizon; walk-in starts at the current grid slot.
  - Reschedule re-checks capacity without counting itself; staff cancel frees capacity at once.
  - Each staff change emails the booking contact (Mailpit); a forced rollback after enqueue sends nothing.
  - AV-01: plates are stored uppercase without separators, phones as E.164; `UN123` fails and `UN1203` with class 3 passes; the `avis.*` settings and `booking.require_plate` are enforced with 422 field paths.
  - AV-02: an edit whose new duration does not fit answers 409 and the stored avis is unchanged.
  - `transitionBooking` rejects every command from a state outside its source list (table-driven over all states); a second identical command answers 200 without a new event; RLS refuses `update` on `booking_event`; dispatchers see events without actors, tenant admins with.
  - The dock-occupancy index rejects a second truck on a dock (service-level call).
  - Plan board: booked against capacity per slot, over-capacity flags, site time with zone label; the list view passes axe; a booking made in a second browser context appears within 30 seconds.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/booking/BK-0* e2e/avis`.
- **Depends on.** U3, U4, U5 merged (W3).
- **Size.** About 4,000 lines.

### U7 Carrier network

- **Goal.** Tenants bring carriers in by invitation or a public link, and manage the links.
- **Stories.** TN-03, TN-04, CR-01 (carrier invitation path), CR-02.
- **Owns.** `apps/api/src/modules/booking/{schema.carriers.ts,carriers/,registration/,emails/{carrier-invitation,registration-verify,registration-approved,registration-rejected}.tsx}`, `packages/shared/src/modules/booking/api.carriers.ts`, `apps/web/src/routes/{r/$slug.tsx,carrier-invite.tsx}`, `apps/web/src/routes/t/$orgId/carriers/`, `apps/web/src/routes/c/$orgId/tenants/`, `apps/web/src/modules/carriers/`, i18n parts `booking/{carriers,registration}.json`, `e2e/booking/{TN-03,TN-04,CR-01,CR-02}.spec.ts`.
- **Provides.** Carrier invitation acceptance, public link slugs, registration approval that creates the link, `assertActiveLink(tx, tenantId, carrierId)`.
- **Consumes.** U2 invitations and sessions; U3 `logoUrl`.
- **Tests.**
  - Inviting by company name and email; acceptance by a new user creates the carrier org, a `carrier_admin` membership and an active link; acceptance with an existing carrier user's email links that org instead.
  - Invitation tokens are single use and expire after 7 days.
  - A deactivated link fails `assertActiveLink`, and the carrier still reads its existing bookings.
  - A disabled public link answers 404; `auto_approve` links at once; `approval_required` keeps the registration pending; approval links and emails, rejection emails the reason; a known email gets the sign-in prompt and attaches to its org.
  - Route cases for every route, including the public ones' token checks.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/booking/TN-0* e2e/booking/CR-0*`.
- **Depends on.** U3 merged (W3).
- **Size.** About 3,000 lines.

### U8 Carrier booking portal

- **Goal.** A carrier books, changes, cancels and rebooks slots across tenants, and shares the driver link.
- **Stories.** BK-04, BK-05, BK-06, CR-05, CR-06 (carrier side), AV-01 and AV-02 (carrier side).
- **Owns.** `apps/api/src/modules/booking/portal/`, `packages/shared/src/modules/booking/api.portal.ts`, `apps/web/src/routes/c/$orgId/{bookings,book}/`, `apps/web/src/modules/portal/`, i18n part `booking/portal.json`, `e2e/booking/{BK-04,BK-05,BK-06,CR-05,CR-06}.spec.ts`.
- **Provides.** Nothing later units consume besides U12.
- **Consumes.** U6 `createBooking`, `transitionBooking`, driver links; U4 availability; U7 links; U3 logos.
- **Tests.**
  - Offered times respect hours, closures, capacity, daily cap, grid, lead time and horizon.
  - Two carriers race for the last unit: one 201, one 409 whose refreshed list the page renders.
  - The confirmation page and email show the code, its QR code, the address and the slot in site time.
  - A scripted returning carrier using "Book again" finishes in under 3 minutes (Playwright timer).
  - After the cutoff, change and cancel answer 409 `cutoff_passed` and the page shows the site phone; cancel before it frees capacity and makes the old driver link show the generic invalid message.
  - CR-05 lists bookings at two tenants with filters; another carrier's booking answers 404.
  - CR-06: copy, email to driver in a chosen locale, Web Share where available; regenerate revokes the old link.
  - A deactivated link answers 403 `link_inactive` on create, while cancel still works.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/booking/BK-0[4-6]* e2e/booking/CR-0[5-6]*`.
- **Depends on.** U6, U7.
- **Size.** About 3,500 lines.

### U9 Yard

- **Goal.** Gate and dock operators run the yard from the booking: check-in, turn away, walk-in, dock call, dock progress, check-out.
- **Stories.** YD-01 to YD-08; the gate side of BK-02 walk-in.
- **Owns.** `apps/api/src/modules/yard/`, `packages/shared/src/modules/yard/`, `apps/web/src/routes/t/$orgId/{gate,docks}/`, `apps/web/src/modules/yard/`, i18n parts `yard/*.json`, `e2e/yard/YD-0*.spec.ts`.
- **Consumes.** U6 `createBooking`, `transitionBooking`, views and `issueDriverLink` (staff channel); U5 `isAcknowledgementValid` and `applicableInstructions`.
- **Tests.**
  - YD-01: search by booking code typed as scanner input with Enter, by plate, reference and carrier.
  - YD-02: punctuality at the tolerance and grace boundaries; with `safety.gate_enforcement` (Pro) check-in stays refused until every applicable instruction has a valid linked acknowledgement, without it (Start) only a warning shows; linking by driver name; a `no_show` booking checks in on the same site-local day, including on a DST day, and not the day after; turn away requires a listed reason.
  - YD-03 walk-in; YD-04 Standgeld flag above `yard.standgeld_flag_minutes`; YD-05 departure from each on-site state, reason before `done`, driver link expiry set.
  - YD-06 overview and queue order; YD-07: two operators call different trucks to one dock at once and one gets 409 `dock_occupied`; single bookings preselect their dock; pools suggest free member docks; other docks carry a warning; reassigning before `at_dock` updates what the driver view returns.
  - YD-08: one tap per state, skipped timestamps stay NULL, `done` frees the dock; the event log shows actors to tenant admins only.
  - Route cases for every route, all `siteScoped`; touch targets of at least 44 CSS px on gate and dock screens; axe.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/yard`.
- **Depends on.** U6.
- **Size.** About 3,500 lines.

### U10 Driver PWA

- **Goal.** A driver opens one link and sees slot, address, briefing, wait and dock call in their language, without an account.
- **Stories.** DR-01, DR-02, DR-03, SF-04; the gate-device briefing of YD-02.
- **Owns.** `apps/driver/` (the whole app, its `size` script, shadcn components added with `-c apps/driver`), `apps/api/src/modules/driver/{session,view}/`, `apps/api/src/modules/safety/driver/` (`routes.driver.ts`, `quiz.ts`, `pass.ts`, `safety_pass.redeem.ts`), i18n parts `driver/*.json` in 12 locales, `packages/i18n/locales/status.json`, `playwright.config.ts` (Pixel 7 project and driver dev server), `e2e/driver/`. Adds `vite-plugin-pwa@2.0.0` and a QR generator under 10 KB gzip (exact pin).
- **Consumes.** U6 driver access and views; U5 content, validity and `recordAcknowledgement`.
- **Tests.**
  - DR-01: the exchange sets the cookie and removes the fragment; no request URL in the Playwright request log and no server log line contains the token; unknown, expired and revoked tokens show one generic message; the eleventh exchange in a minute from one IP answers 429; neither the page nor the API payload contains the driver's name, phone or plate.
  - DR-02: the browser language picks the locale, unknown languages fall back to en, the switcher works in one tap, machine-translated locales show the badge.
  - DR-03: while visible the PWA polls every 15 seconds, so a call appears within 20 seconds; offline it shows the last state with its time.
  - SF-04: a failed quiz shows the content again and counts the attempt; the acknowledgement stores instruction, version, locale, content hash, score, attempts, name, statement, channel and expiry (`safety.validity_days`, 0 means this visit); the next booking at the tenant on the same phone shows "valid until"; a gate-device (`staff`) session never sets a pass.
  - `/d` responses carry `Referrer-Policy: no-referrer` and the CSP; `pnpm --filter @rampflow/driver size` stays under 150 KB gzip; first render under Playwright's mobile CPU and network throttling stays under 3 s.
- **Verify.** `pnpm verify && pnpm --filter @rampflow/driver size && pnpm test:e2e -- e2e/driver`.
- **Depends on.** U6.
- **Size.** About 3,500 lines.

### U11 Reports, jobs and privacy

- **Goal.** Dispatchers read and export KPIs; the system sends reminders, marks no-shows and applies retention; tenant admins answer data subject requests.
- **Stories.** RP-01, RP-02, BK-07, BK-08, PL-05, TN-06.
- **Owns.** `apps/api/src/modules/{report,privacy}/`, `apps/api/src/modules/booking/{jobs/no-show.ts,emails/{reminder,no-show}.tsx}`, `apps/api/src/modules/notify/jobs/reminders.ts`, `apps/api/scripts/retention-run.ts` (`retention:run`), `packages/shared/src/modules/{report,privacy}/`, `apps/web/src/routes/t/$orgId/{reports,privacy}/`, `apps/web/src/modules/{report,privacy}/`, i18n parts `report/*.json`, `privacy/*.json`, `notify/*.json`, `e2e/report/{RP-01,RP-02}.spec.ts`, `e2e/privacy/TN-06.spec.ts`.
- **Consumes.** U6 schema and `transitionBooking`; U5 acknowledgements; U1 jobs and outbox.
- **Tests.**
  - RP-01: a seeded fixture of 10 visits returns the exact expected value of every KPI, computed by hand in the test; a visit missing a timestamp is left out only of the KPIs that need it; site-local days hold across a DST change; 90 days for one site at design load answer in under 2 s.
  - RP-02: UTF-8 with BOM, `;` for de and `,` for en, ISO 8601 with the site offset.
  - BK-08: at `starts_at + yard.no_show_after_minutes` the booking becomes `no_show`, capacity is free and the contact gets an email; a second run changes nothing; with `yard` off the job does nothing.
  - BK-07: one reminder at `notify.reminder_hours_before`; none after a cancel or with `notify.reminders` off; a reschedule yields a reminder for the new start.
  - PL-05: every retention rule in [Data model](../reference/data-model.md#retention) at its boundary (clock); a second run changes nothing; the log holds counts only.
  - TN-06: search by name, phone or plate; JSON export of bookings and acknowledgements; erase pseudonymizes bookings and restricts acknowledgements still under retention.
- **Verify.** `pnpm verify && pnpm test:e2e -- e2e/report e2e/privacy`.
- **Depends on.** U6 (and U5, merged in W3).
- **Size.** About 3,500 lines.

### U12 Core loop end to end

- **Goal.** Prove the core loop of [MVP scope](mvp-scope.md#core-loop) across roles and browsers, and fix what the integration reveals.
- **Stories.** Core loop steps 1 to 8; cross-cutting NFRs (axe on every story's main screen, Pixel emulation for drivers, time zones in the UI).
- **Owns.** `e2e/core-loop/`, `e2e/support/core-loop.ts`, plus integration fixes in any file, coordinated with the owners' sections of the references.
- **Tests.** One spec runs the loop with separate browser contexts: platform admin creates a tenant; the tenant admin accepts, sets up a site, hall, docks, a pool, hours and a load type, and invites a carrier; the carrier accepts, books with the avis and emails the driver link; the driver (Pixel 7) opens it from Mailpit and completes the briefing; the gate operator checks in; the dock operator calls (the driver sees it within 20 s), docks, loads and completes; the gate operator checks out; the dispatcher reads the KPIs and downloads the CSV. A second spec covers a Europe/Bucharest site viewed from Berlin. An axe sweep visits each story's main screen.
- **Verify.** `pnpm verify && pnpm test:e2e`.
- **Depends on.** W5.
- **Size.** About 1,500 lines plus fixes.

## Scope adjustments and risks

| Item | What we did |
|---|---|
| The scope requires "better-auth scrypt" and "better-auth is pinned exactly". | Replaced by a self-built scrypt and session layer ([ADR-0003](../decisions/ADR-0003-authentication-self-built-sessions.md)). Magic links and invitations were already our own tables, and better-auth offers no public way to create a session after our own token check. |
| `safety.validity_days` has no required entitlement in the settings catalog. | Kept as written. The safety code treats validity as 0 while `safety.validity` is off. Adding `requires: 'safety.validity'` would hide the field in that case; it is a one-line manifest change for the scope owner. |
| "The server stores SHA-256 hashes only" versus "copy the driver link later" (CR-06). | Tokens are derived as HMAC of the access id, so the server stores only hashes and can still show the link ([ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md)). |
| "Retention values above the platform maximum return 422" (TN-02). | Interpreted as the schema maximum of each retention setting, matching domain research §5. Platform-set caps would be the LATER "locked settings". |
| Modules beyond the nine entitlement modules. | Added `privacy`, `i18n` and `driver` manifests without entitlements, so every setting key and the driver namespace have an owner ([ADR-0006](../decisions/ADR-0006-module-manifest-entitlements-permissions.md)). |
| `report` depends on `yard`. | KPIs come from gate and dock timestamps; without check-in every booking would turn `no_show`. All three packages include both, so no customer loses anything. The no-show job likewise runs only for tenants with `yard` on. |
| Twelve driver languages and the 12-language safety template. | Code ships the catalogs; nine languages are machine translations flagged `machine` and badged (DR-02). Reviewed translations are content work outside the engineering units. |
| Lighthouse "first render within 3 s". | No Lighthouse in the toolchain. U10 checks the bundle budget in CI and measures first render with Playwright throttling as a proxy; a Lighthouse run stays a manual release check. |
| Holiday data from `date-holidays`. | Its data is CC BY-SA 3.0; the app needs an attribution line (U4 adds it to the closures screen). |
| Size. | 49 stories make about 40,000 changed lines over 12 units. U6 is the largest and most coupled unit; its plan board UI is the first thing to split off if it overruns. |
