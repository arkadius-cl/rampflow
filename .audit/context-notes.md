# Coordinator notes for implementation units (state of main)

On main now: ALL units U1-U11 (kernel, identity+shell, platform/tenant admin, sites/capacity, safety, booking engine + plan board, carrier network, carrier portal, yard, driver PWA, reports/jobs/privacy). In progress elsewhere: T1 (making tests independent of the real date; may touch apps/api/test/ fixtures).

Kernel and API conventions (from U1/U2 reports):
- Every route needs route cases in the harness (foreign tenant, foreign site, missing permission, entitlement off; plus a second carrier on the same tenant). Routes under /api/me, /api/auth, /api/public need `accountCases` instead. Cases may send query params; own-org creates may answer any 2xx.
- A new table needs an entry in apps/api/src/db/rls.test.ts rules, or the test fails.
- `asScope` and `systemActor` may be imported only from `jobs/`, `*.redeem.ts`, `booking/capacity/` and `core/platform/usage.ts` (Biome enforces it).
- Read user names/emails via `userDisplay(tx, ids)`; never query app_user directly from other modules.
- jsonb setting/override values are stored as `{ "v": ... }`.
- Tokens: `deriveToken(purpose, id)` from kernel/tokens.ts with TOKEN_SECRET; never store raw tokens; tokens only in URL fragments; pages read them with U2's `useFragmentToken()`.
- Emails: templates declare `category: 'account' | 'booking'`; enqueue via the outbox; payloads carry row ids. U3 enqueues `core.invitation` with `{ invitationId, orgName, role, inviterName }`. U7 can reuse `acceptInvitation`'s user creation and `startSession` (core/invitations/accept.redeem.ts).
- Migrations: one per unit branch; before merging, rebase onto main, `pnpm db:regen`, then `pnpm db:reset` for your dev DB. On conflicts in apps/api/drizzle/meta take main's side, then db:regen.

Web conventions (from U2):
- Requests: `call(api...)` from apps/web/src/lib/api.ts (typed hc client, error envelope -> toast). Query keys: `[area, orgId, module, ...]` (lib/query-keys.ts).
- Access: `useAccess()`, `guard()` (shows "no access" in place), nav from manifests via `navFor`. Station screens (gate, dock) use `staticData.shell` station layout without sidebar, site via `?site=`.
- i18n: typed i18next; add your namespace part files (de, en, pl for staff/carrier; 12 locales for driver), then run `pnpm i18n:derive` (verify runs it with --check). Conflict strings: `core:errors.conflict.<reason>`.
- Site time: apps/web/src/lib/time.ts on the shared time module; always show the zone label.
- Generated files: apps/web/src/routeTree.gen.ts (`pnpm --filter @rampflow/web routes:gen`) and apps/web/src/lib/i18n-resources.gen.ts (`pnpm i18n:derive`): on conflict regenerate.
- The /design prototype routes are dev-only reference screens; reuse components from apps/web/src/components (shells, plan-board, slot-picker, status-badge, site-time, settings-field, entitlement-gate) and match their look.

Seed and E2E:
- `pnpm db:seed` runs seed modules in order from apps/api/scripts/seed/; add `seed/<module>.ts` and one line in the list; must be idempotent. Demo accounts are in docs/how-to/run-locally.md.
- E2E helpers in e2e/support/ (`seedWorld`, `signInAs`, `expectAccessible` for axe, Mailpit helpers). Playwright starts the API with test routes and jobs on. Run `pnpm test:e2e -- e2e/<module>`.

Booking engine (from U6a):
- `createBooking(bookingContext(c), { mode: 'carrier' | 'staff' | 'walk_in', ... })`; `transitionBooking` is the only writer of booking status (a test enforces single-writer). Command table: packages/shared/src/modules/booking/lifecycle.ts.
- A blocked check-in answers 409 `safety_missing`; walk-in mode returns `safety: 'missing'` and leaves the booking `confirmed`. Linking an acknowledgement to a booking is a lifecycle command that writes `safety_linked`.
- `mark_no_show` sets `no_show_at` to the deadline; it sends no email (U11 adds `booking.no-show`).
- `version` increments on every booking row change; edits send the current version (409 `stale_version`).
- New conflict reasons with UI strings: not_offered, safety_missing, acknowledgement_invalid, dock_inactive, not_due.
- Carrier-side routes must add `requireEntitlement('avis.basic')` on avis routes themselves.
- QR codes: `uqr@0.1.3` is already a dependency.
- Demo seed creates one Acme booking per visit state today.

Safety (from U5):
- With Acme's briefing published and gate enforcement on (Acme is on Pro), any seed or test that checks trucks in must first record and link the driver's acknowledgement. e2e/support/u5.ts has `apiAs`, `overrideEntitlement`, `publishedBriefing`, `acknowledge`, `bookingsOf`.
- Reusable safety badges/pictograms: apps/web/src/modules/safety/display.tsx. The prototype's `UpsellHint` and `SAFETY_STATUS` have hard-coded English labels: localize before reuse.
- Seed order: core, safety, booking (then later modules).

Master data (from U4):
- Every dock has a "booked as" choice (not bookable / single dock / one pool) via `PUT /capacity/docks/:dockId/booking`.
- The test world's "Ramp pool" has no docks; use `poolWorldDocks` from e2e/support/u4.ts to put D-01 and D-02 in it.
- Playwright: Base UI checkboxes and switches need `getByRole('checkbox' | 'switch')`; `getByLabel` matches two elements.
- i18next selector mode does not collapse plural keys: use plain interpolation instead of plurals.
- Seed list: core, sites, safety, booking.

Process hygiene (binding): never use `pkill -f`/`killall` with a pattern. Several checkouts run api/web/driver servers with identical command lines; a pattern kills other agents' servers. Stop only processes you started, by PID (e.g. `ss -ltnp 'sport = :$API_PORT'` to find the PID on your own port).
E2E: `pnpm test:e2e <path>` (no `--`; with `--` the whole suite runs).

Vitest cache (binding): apps/api/vitest.config.ts now sets `fsModuleCache: false`, because Vitest 5's persistent cache (node_modules/.vitest-cache) kept a stale glob of email templates in kernel/outbox.ts, so new templates failed with "Unknown variable dynamic import". If you see that error in your worktree before rebasing, delete `node_modules/.vitest-cache`.

From U6b/U7/U9/U10:
- Avis form pieces to reuse: `AvisFields`, `avisResolver`, `applyAvisIssues` in apps/web/src/modules/booking/avis-form.tsx.
- Carrier writes call `assertActiveLink(tx, tenantId, carrierId)` from apps/api/src/modules/booking/carriers/links.ts before creating or moving a booking; `GET /api/c/:orgId/tenants` returns each tenant's link and registration status.
- Driver link: `/d#<token>`; the PWA polls `GET /api/driver/booking`; U9's call sets booking.dock_id and the view joins dock code and hall.
- Yard tests: `yardWorld()` and `ownIn` steps show how to move a booking through the lifecycle (direct status updates fail single-writer.test.ts).

From U3/U8/U11:
- Platform admin: /platform/tenants (create tenant with package + admin invitation), /platform/packages, /platform/settings. Tenant admin: /t/$orgId/staff, /t/$orgId/settings (SettingField with source badge), /t/$orgId/brand (logo). `logoUrl(tenantId, sha)` exists (U3).
- Carrier portal: /c/$orgId/book (wizard), /c/$orgId/bookings; helpers in e2e/support/u8.ts (`carrierBooking`, `fillSlot`, `dayButton`, `linkCarrier`).
- Reports /t/$orgId/reports, privacy /t/$orgId/privacy. Jobs: no_show every 60 s (the e2e API runs it, so confirmed past bookings turn no_show during e2e), reminders every 5 min.
- World sessions start at wall time; a test clock more than 7 days away answers 401 unless sessions are moved (T1 is fixing this; until then move sessions like kpis.test.ts does).
- A handler response that goes through a shared helper returning `c.body()` drops other routes from the typed web client: return `c.body()` inside the handler.
- Never use bare `git stash` (the stash stack is shared across worktrees); use a WIP commit.
