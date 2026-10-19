# Adversarial design review (D3), reviewer: Fable

Scope: `docs/explanation/mvp-scope.md` as the spec; ADR-0001..0012, `docs/reference/{data-model,module-contract,booking-lifecycle,api-routes}.md`, `docs/explanation/delivery-plan.md`, `packages/shared/src/**`, `AGENTS.md`, and the route map in `docs/explanation/ux-concept.md`.

What I ran: `pnpm test` and `pnpm typecheck` in `packages/shared` (27 tests, green; `tsc -b` clean). What I checked against primary docs: Postgres `CREATE POLICY` (locking clauses are filtered by the SELECT/ALL and UPDATE/ALL `USING` expressions; permissive policies on one table combine with `OR`) and the Drizzle RLS page (`pgPolicy`, `pgRole().existing()`, `entities.roles`). What I could not confirm: whether drizzle-kit 0.31 diffs a changed `using`/`withCheck` expression; see MINOR 13.

Severity: BLOCKER = change before implementation starts. MAJOR = fix inside the unit that touches it, before that unit's wave. MINOR = cheap, fix when touched.

Summary: 3 BLOCKER, 11 MAJOR, 26 MINOR.

---

## BLOCKER

### B1. RLS policies are not conditioned on the party, so every scope that sets `app.tenant_id` satisfies the tenant policies

Pointer: ADR-0002 "Scope and session variables" (lines 78-90) and "How each context works"; `docs/reference/data-model.md` "Policy classes" (lines 30-35) and every per-table RLS line.

Every party connects as the same database role, `rampflow_app`, and all policies are `TO rampflow_app`. Postgres combines permissive policies of one table and command with `OR`. The policy classes are written as `tenant_id = app.tenant_id()` for the tenant party, `tenant_id = app.tenant_id()` for `carrier_at_tenant`, `driver` and `public` reads, and so on. Nothing in ADR-0002 or the data model says a policy also tests `app.party()`. The only fail-closed argument given is "unset variables read as NULL". But `driver`, `carrier_at_tenant` and `public` scopes set `app.tenant_id` on purpose (they read the tenant's reference data).

Failure scenario: a carrier user calls `PATCH /api/c/:orgId/at/:tenantId/bookings/:bookingId` (reschedule). The scope is `carrier_at_tenant`, so `app.tenant_id` and `app.carrier_id` are set. The handler forgets `carrier_id = ?` in its `UPDATE booking`. The `booking-family` tenant policy ("all commands where `tenant_id = app.tenant_id()`") passes, because `app.tenant_id()` equals the booking's tenant. The carrier rewrites another carrier's booking. The leak harness does not catch it: it checks foreign-org ids and 404s; here the org id is correct and the leak is between carriers of the same tenant. Second scenario: a driver cookie, scope `driver` with `tenantId`, reads `safety_acknowledgement` (`tenant-private`) or `membership` (`tenant all where org_id = app.tenant_id()`) through any driver route with a missing filter. The same holds for every non-site-scoped `tenant-private` table (`safety_instruction`, `invitation`, `carrier_invitation`, `carrier_registration`, `privacy_request_log`, `setting_value` tenant rows).

Fix: state in ADR-0002 and implement in `apps/api/src/db/rls.ts` that every generated predicate is `(select app.party()) = '<party>' and <predicate>`, one policy per party per command. Add to U1's tests a party matrix: for each party scope with all variables set to tenant A's values, every table returns only the rows that party may see per the data model (driver: one booking and its children, reference data; `carrier_at_tenant`: own rows plus the booking slots; and so on). Also make the leak harness run each carrier route as a second carrier linked to the same tenant (see M7).

### B2. The kernel rolls back every transaction that ends in a 4xx, which erases the rate-limit counters the auth and driver limits depend on

Pointer: ADR-0002 `scoped()` (line 106: `if (c.error || c.res.status >= 400) throw ROLLBACK`); ADR-0003 "Abuse limits" (`rate_limit_event`, `login_failed` 5 per 15 min, `driver_exchange`); ADR-0008 exchange step 2; data model `rate_limit_event`.

`rate_limit_event` is written inside the request transaction (handlers "never import the pool"). A failed login answers 401, a bad driver token answers 401, the eleventh exchange answers 429. All of those are `>= 400`, so the row that records the failure is rolled back with the response.

Failure scenario: an attacker posts 10,000 wrong passwords for one email from one IP. Every attempt inserts a `login_failed` event and answers 401; every 401 rolls the event back; the count never reaches 5; CR-03's 429 never fires. Same for token brute force on `POST /api/public/driver-session`: the 10-per-minute limit only counts successful exchanges. U2 and U10 own tests that would fail, and the agents would then work around the kernel in two different ways.

Fix: `rateLimit()` in `apps/api/src/kernel/rate-limit.ts` writes and counts through its own short autocommit statement on the pool (it already lives in `kernel/`, which the Biome rule allows), never through `c.var.db`. Say so in ADR-0003, and add a U1 test: a handler that calls `rateLimit.hit()` and returns 401 leaves the event row in place. The same exception applies to anything that must survive an error response; today nothing else does.

### B3. The `booking` table belongs to U6 (wave 4), but three wave-3 units need it, and it needs wave-3 tables

Pointer: data model "Tables by module" (`booking`, `booking_event`: `booking/schema.ts`, U6; resources and load types: U4; safety: U5); delivery plan "Disjoint ownership per wave" and the U3, U4, U5 test lists.

- U4 (W3) builds `loadDayTimeline`, `checkFit`, daily cap and the over-capacity flag. Its tests read "No start is offered ... past the daily cap" and "Lowering capacity cancels nothing and flags affected bookings". Both need booking rows. U4 cannot query a table that does not exist until W4.
- U5 (W3) creates `safety_acknowledgement.booking_id`, `booking_acknowledgement.booking_id` and `safety_attempt.booking_id` as foreign keys to `booking`. The generated migration fails on a missing table, or U5 drops the FKs and U6 must later edit U5's schema file (ownership violation) to add them.
- U3 (W3) implements PL-04 "bookings this month against limits". Same problem.
- The other direction: `booking.resource_id → bookable_resource` and `booking.load_type_id → load_type` reference U4's tables, so `booking` cannot move to U1 alone either.

Failure scenario: W3 starts; U4 and U5 each invent a placeholder, or U4 skips capacity load, or both define a `booking` table. The W4 merge then regenerates conflicting migrations and `db:regen` cannot help, because the conflict is in the TypeScript schema, not in the journal.

Fix: U1 lands the entire schema of `docs/reference/data-model.md` (the document is complete and column-exact), in the per-module `schema*.ts` files, with policies from `rls.ts`, as one generated migration after the baseline. Later units own the schema files only to add what their report lists as a deviation. This also removes most of the `db:regen` traffic: at most a handful of units will generate a migration at all. If the coordinator prefers to keep schema with its unit, the alternative is a W2.5 "schema" unit that lands the booking family before W3; it costs a wave.

---

## MAJOR

### M1. Lock order differs between create and reschedule, so two carriers can deadlock

Pointer: ADR-0004 "Booking write" (line 85: candidates "in `(sort, id)` order"; line 86: "Rescheduling to another resource locks both rows in id order").

`FOR UPDATE` locks are held until commit, and `createBooking` holds the lock of every resource it tried and found full. Take resources R1 (`sort` 1, id `Z...`) and R2 (`sort` 2, id `A...`), both eligible for the load type. T1 creates: locks R1 (full), then waits for R2. T2 reschedules a booking from R1 to R2 "in id order": locks R2 (`A...`) first, then waits for R1. Postgres aborts one with `40P01`; the design has no retry, so a user gets 500.

Fix: one comparator for every lock sequence, `(sort, id)` as in create, exported as `lockOrder()` from `booking/lifecycle/`; reschedule and `update_avis` use it. Add a U6 test with two connections that runs create and reschedule against the same two resources in opposite preference and expects no `40P01`.

### M2. Walk-in cannot work when it is needed: it inherits the "closed" and capacity guards and the gate operator lacks `booking.force`

Pointer: booking lifecycle `walk_in` row ("Start is the current grid slot; then as staff `create`"), staff `create` row ("Open at the start (never forced); capacity and daily cap unless forced"); ADR-0004 line 87; manifest `booking.walk_in` for `gate_operator`, `booking.force` for `dispatcher` (`packages/shared/src/modules/booking/manifest.ts` lines 27-28).

Failure scenarios: (1) a truck arrives at 05:50, the site opens at 06:00, the gate operator presses "Walk-in": the current slot is closed, the closed check is never forced, 409 `closed`. (2) The pool is full at the current slot, which is the usual reason a truck has no booking; the walk-in needs `force`, the gate operator does not hold `booking.force`, 409 `capacity_full`. YD-03 fails in both common cases.

Fix: `walk_in` is its own command path in `createBooking`: it skips the closed, capacity and daily-cap checks (the truck is physically there), stamps `walk_in = true`, records `forced: false`, and needs only `booking.walk_in` and `yard.gate`. The plan board then shows it as over capacity like any other overbooked slot. Note it in ADR-0004 and the lifecycle table.

### M3. The late-cancellation KPI reads a value that only exists in `booking_event.data`

Pointer: booking lifecycle "Events" (`cancelled: { reason, late }`) and "KPI timestamps" ("Late-cancellation rate = cancelled with late = true / bookings due"; "due: ... not cancelled before the cutoff"); ADR-0005 consequences ("KPI queries read timestamp columns on `booking`, not events"); data model `booking` columns (no `cancel_late`).

U11 either joins events (breaking the one-indexed-scan promise and the 2 s target on 90 days) or recomputes `late` from `cancelled_at`, `starts_at` and today's `booking.cancel_cutoff_minutes`, which changes history whenever the setting changes.

Fix: add `booking.cancelled_late boolean` (or `cutoff_at timestamptz` snapshotted at creation and reschedule) stamped by `transitionBooking` in `cancel`. While there, define the no-show KPI for a booking that was `no_show` and then checked in the same day (`no_show_at` set, status later `departed`): count it as late arrival, not as no-show, and say so in the KPI table.

### M4. `app.linked_tenant()` is created after the generated migration whose policies call it

Pointer: ADR-0001 decision 6 ("After the generated core tables, U1 adds a second custom migration with `app.linked_tenant()`"); data model `site`, `org`, `tenant_subscription`, `entitlement_override`, `setting_value`, `load_type`, `dock`, `hall`, `tenant_logo` RLS lines (`carrier` select where `app.linked_tenant(tenant_id)`).

`CREATE POLICY` parses and analyses its `USING` expression; a function that does not exist fails the statement. The core tables with carrier read policies are in the generated migration that runs before `0002_linked_tenant.sql`. U1's first `db:migrate` fails on `site`.

Fix: define `app.linked_tenant()` in `0000_baseline.sql` with `SET LOCAL check_function_bodies = off` (or as `plpgsql`, which does not validate table references at creation). Keep `tenant_carrier_link` generated. Drop the second custom migration.

### M5. Switching party inside one request is undefined, and ADR-0002 and ADR-0003 disagree on whether token redemption is atomic

Pointer: ADR-0002 "Token redemption switches scope" (line 134: reads and marks under `token`, "then inserts the membership under `tenant`"), "Scope resolution runs in its own short transaction" (line 113); ADR-0003 "Tokens" (line 62: "the exchange marks it used in the same transaction that creates the session or membership"); module contract "The scope middleware sits once per area, so no request opens two scoped transactions"; ADR-0008 safety-pass redemption "runs as a tenant scope with actor `system:safety_pass`".

If redemption is two transactions, an invitation is marked used and the membership insert can fail (limit reached, unique violation): the user has burned a 7-day token and has no membership. If it is one transaction, the kernel offers no way to change `app.party` after `withScope`, and `scoped()` opened the transaction with the `token` scope. Three units (U2 invitations, U7 carrier invitations, U10 safety pass) will each invent a way.

Fix: add `switchScope(tx, scope, fn)` to `apps/api/src/db/scope.ts`: re-issues the `set_config` statement for the new scope, runs `fn`, re-issues the previous scope's variables in `finally`. It is the only API `*.redeem.ts` files may use (Biome rule as for `systemActor`). State in ADR-0002 that redemption is one transaction. Also specify the single-use claim as one statement: `update ... set used_at = now() where token_hash = $1 and used_at is null and expires_at > $2 returning ...`; a `select` followed by an `update` lets two concurrent exchanges both succeed under READ COMMITTED (U2's "two concurrent exchanges create one session" would catch it, but say it once in the ADR).

### M6. The driver party has no policy for what `link_acknowledgement` writes

Pointer: data model `booking` (`booking-family`: driver `select` only), `booking_event` ("`booking-family` without `update`"; no driver insert); booking lifecycle `link_acknowledgement` row (actor driver, event `safety_linked`); ADR-0005 decision 3 (`transitionBooking` "locks the booking row `FOR UPDATE`").

Failure scenario: a driver completes the briefing (SF-04). `recordAcknowledgement` inserts `safety_acknowledgement` (driver insert policy exists) and then calls `transitionBooking(..., 'link_acknowledgement')`. Step 1, `SELECT ... FOR UPDATE` on `booking`, needs an UPDATE/ALL policy whose `USING` passes for the driver; none exists, so the row is filtered and the command answers 404 or "invalid transition". If the lock is skipped, the `booking_event` insert fails with `42501`. SF-04 cannot complete.

Fix: in `carrierOwnedPolicies`, add for the `driver` party an `update` policy on `booking` with `using id = app.booking_id()` and `with check false` (lock only, same trick as the carrier resource lock), and an `insert` policy on `booking_event` with check `booking_id = app.booking_id()`. Add the driver case to the U1 party matrix (B1). Alternatively, route the driver's link through `switchScope` to a tenant scope with actor `system:safety` (M5), which M5's helper makes a one-liner; pick one and write it in the lifecycle table.

### M7. `carrier_at_tenant` can read every other carrier's bookings at that tenant, and the leak harness cannot see it

Pointer: ADR-0002 party table (`carrier_at_tenant` sees "All its bookings, for capacity counting. The `booking` row holds no personal data, so another carrier's booking reveals only slot, resource and company"); data model `booking-family` (`carrier_at_tenant`: `select` where `tenant_id = app.tenant_id()`); ADR-0002 leak check 1 ("200 with no A ids in the body").

"Slot, resource and company" is the competitor's delivery schedule. `booking.carrier_name` plus `starts_at` for every booking at the tenant is exactly what a forwarder would pay to see. The harness only asserts that no foreign *ids* appear, so a list endpoint that returns `carrier_name` of other carriers' bookings passes CI. The reason given, capacity counting, is a count, not a row read.

Fix: restrict the `carrier_at_tenant` select policy on `booking` to `carrier_id = app.carrier_id()`, and expose load through `app.resource_load(resource_id uuid, from timestamptz, to timestamptz)` as a `SECURITY DEFINER` SQL function in the baseline that returns `(starts_at, blocks_until)` pairs or per-bucket counts with no other column. `loadDayTimeline` uses it for carriers. Extend the harness: for each carrier route, run as a second carrier linked to the same tenant and assert that no `carrier_name`, booking id or code of the first carrier appears in the body.

### M8. The 5-minute bucket model is stated for 24-hour days; on fold days it double-counts and on gap days it misses an hour

Pointer: ADR-0004 "Availability (read)" ("evaluates one site-local day on 5-minute buckets") and consequences ("at most 288 buckets"); ADR-0012 `localDayRange` ("23, 24 or 25 h").

"288 buckets" is 24 x 12. An implementer who indexes buckets by wall time (`hour*12 + minute/5`) collapses 02:00-03:00 CEST and 02:00-03:00 CET on 2026-10-25 into the same 12 buckets, so a booking in the earlier hour blocks the later hour, and on 2027-03-28 twelve buckets are never occupied by anything. The spec's DST tests cover the grid, not the capacity check, so this passes U4.

Fix: define buckets as instants: `start = localDayRange(day, zone).start`, bucket `i` covers `[start + 5i min, start + 5(i+1) min)`, count `(end - start) / 5 min` (276, 288 or 300). Add a U4 test: Berlin 2026-10-25, a 60-minute booking at 02:30 `earlier` leaves 02:30 `later` offered on a capacity-1 resource; 2027-03-28 offers 46 grid starts and the bucket array has 276 entries. Also handle bookings that start the previous local day and end in this one (see MINOR 1).

### M9. `GET /api/driver/booking` writes on every poll

Pointer: ADR-0008 "Safety pass" ("When this phone opens another booking at the same tenant, `GET /api/driver/booking` redeems valid passes ... runs as a tenant scope with actor `system:safety_pass`"), "What the driver sees" (poll every 15 s); scope NFR (2,000 open driver PWAs).

Redemption is a write (upsert `booking_acknowledgement`, event `safety_linked`) under a second scope, executed by a GET that 2,000 phones call four times a minute: about 130 extra scope switches and lookups per second, a scoped write inside a read, and a `SameSite=Strict` GET with side effects. The `rf_device` cookie has `Path=/api/driver`, so the exchange under `/api/public` cannot redeem instead.

Fix: redeem once, in `GET /api/driver/briefings` (fetched once per page load before the briefing screen, and it is where the result is shown), or in a dedicated `POST /api/driver/passes/redeem` the PWA calls after the exchange. `GET /api/driver/booking` stays read-only and returns the current safety status from `booking_acknowledgement`.

### M10. The UX route map contradicts ADR-0011 and the manifests, and U2 starts from both

Pointer: `docs/explanation/ux-concept.md` "Information architecture and route map" (`/invite/:token`, `/register/:siteSlug`, `/orgs`, `/o/:org/board`, `/o/:org/gate/:site`, `/o/:org/dock/:site`, `/o/:org/admin/...`, `/c/:carrier/warehouses`, `/platform/jobs`, `/login/magic`); ADR-0011 "Areas" (`/invite` with fragment, `/r/$slug`, `/`, `/t/$orgId/plan`, `/t/$orgId/gate`, `/auth/magic`); manifests' `nav[].to` (`/t/$orgId/plan`, `/t/$orgId/docks`, ...); ADR-0003 (tokens travel in the fragment).

The delivery plan starts W2 when "the UX concept ... merged"; it is merged (`d157eec`). U2 and every screen unit now read two route maps. The worst item is `/invite/:token`: a path token lands in access logs, browser history and `Referer`, which ADR-0003 and the logs NFR forbid. Other items change file ownership: the gate and dock stations need a site in the URL (UX) but the manifest `to` has none; `/platform/jobs` has no API route; `/o/:org/admin/privacy` merges TN-05 (U3) and TN-06 (U11).

Fix: before W2, the coordinator rewrites the UX route table to ADR-0011's paths and marks ADR-0011 as authoritative; decide the station site as `?site=` search param on `/t/$orgId/gate` and `/t/$orgId/docks` (keeps the manifest `to` and gives the tablet its URL state); drop `/platform/jobs`; note in ADR-0011 that gate and dock operators get the station layout without the sidebar (UX "Navigation per role").

### M11. U6 is the largest and most coupled unit and already carries three screens; split it before W4

Pointer: delivery plan U6 ("About 4,000 lines"), "Scope adjustments and risks" ("U6 is the largest and most coupled unit; its plan board UI is the first thing to split off if it overruns"), critical path note.

U6 holds the capacity race, the lifecycle writer with a table-driven test over every state, the avis normalisation, driver link issuing, three email templates, the plan board (a custom grid with lanes, over-capacity flags, live refresh and axe), the bookings screens, and five Playwright specs. One Opus session at medium effort will not finish that with its tests green, and "split if it overruns" means discovering that after the session ends, with half-finished files that the W5 units cannot build on.

Fix: U6a (W4): schema deltas, `lifecycle/`, `staff/` routes, `avis/`, `driver/access.ts`, emails, `api.staff.ts`, service-level tests including a core-loop test (create, check_in, call, dock, start_loading, complete, depart, then assert the KPI columns). U6b (W5): `routes/t/$orgId/{plan,bookings}/`, `modules/booking/`, BK-01 to BK-03 and AV-01/02 Playwright specs. U8, U9, U10, U11 consume U6a only. The same treatment is advisable for U1 (3,500 lines of foundation): U1a database, scope, RLS helpers, migrations, test database; U1b kernel, outbox, jobs, route-case harness, i18n package.

---

## MINOR

1. **Cross-midnight bookings in availability.** ADR-0004 step 1 loads "the active bookings that overlap the day" but the only index is `(resource_id, starts_at)`. A naive `starts_at between dayStart and dayEnd` misses a 23:30 booking that blocks until 01:00. Specify the predicate `starts_at < dayEnd and starts_at >= dayStart - interval '1 day' and blocks_until > dayStart` (max duration plus buffer is bounded by the load type schema).
2. **`no_show → checked_in` adds load without the resource lock** (ADR-0004 line 84 claims every load-adding writer locks). Acceptable, because the truck is there; say so. The same-day rule `siteDay(now) = siteDay(starts_at)` also fails for a 23:30 slot marked no-show at 00:30, so a late arrival at 00:40 can never check in. Compare against `siteDay(no_show_at)` or allow within `yard.no_show_after_minutes + 12 h`.
3. **No scope for "token, then user".** `POST /api/public/invitations/accept` by a signed-in user needs both the token hash and the user id; `Scope` has neither variant. Add `userId: UserId | null` to the `token` party.
4. **`avis.basic` off makes booking impossible.** `booking ||--|| avis`, the create guard "avis valid", YD-01 plate search and `plate_seen` all require the avis row, but `avis` is a module that can be turned off by override (ADR-0006). State that `avis.basic` off still stores the minimal avis (counterparty, load units) through the booking form and hides only the avis editor, or forbid turning it off.
5. **`avis.required_reference_types` semantics.** The scope says "empty, any one"; the manifest schema is a list with no note whether all listed types are required or at least one. Write it in the manifest comment and the AV-01 test.
6. **Carrier navigation has no "warehouses" item.** U7 owns `web/src/routes/c/$orgId/tenants/` (CR-02 pending state, CR-05 filters) and the UX lists "Warehouses", but `booking.nav` for the carrier area has only `bookings` and `book`. The screen is unreachable from the sidebar. Coordinator adds `{ id: 'tenants', area: 'carrier', to: '/c/$orgId/tenants', permission: 'booking.view' }` before W4.
7. **Station screens need a site.** Gate and dock operators may hold several sites; the manifest `to` for `yard.gate` and `yard.docks` carries none. Decide `?site=` (M10) and have U9 remember the last site per device in `localStorage`.
8. **Benchmarks inside `pnpm verify`.** U4 ("p95 of 50 runs", design-load seed) and U11 ("90 days ... under 2 s") run on every verify of every unit: slow to seed and flaky on shared CI. Make them `pnpm bench` behind `BENCH=1`, run by the coordinator at merge, not by `verify`.
9. **Pool sizing and connections held across slow work.** The job tick holds a transaction (advisory lock) while per-tenant scopes open further transactions; the outbox tick holds its claim transaction across SMTP calls; every request holds one connection for its whole handler. `pg.Pool` defaults to 10. Specify `max: 20`, an SMTP timeout of 10 s, and take the job advisory lock on a dedicated client outside the pool, so a tick costs one pool connection, not two.
10. **`instantsAt` offset probing is circular.** ADR-0012 step 1 takes `tzOffset` at `dayStart` and `dayEnd`, which `localDayRange` computes with `instantsAt`. Specify the probes as `Date.UTC(y, m, d) - 24 h` and `+ 48 h` (or every offset at `-14 h`, `0`, `+38 h`); EU zones never change twice in one day.
11. **No retention rule for `outbox_message`.** `to_email` and `payload` are marked PD; sent rows live forever. Add "delete sent or failed rows after 30 days" to the retention table and the job.
12. **No indexes for TN-06 and YD-01 avis search.** `avis.driver_name`, `driver_phone`, `plate`, `plate_seen` are searched per tenant; the only avis index is on references. Add `(tenant_id, lower(driver_name))`, `(tenant_id, plate)`, `(tenant_id, driver_phone)` on `avis`.
13. **drizzle-kit policy handling to verify in U1.** Declare `pgRole('rampflow_app').existing()` and set `entities.roles` in `drizzle.config.ts`, otherwise `generate` emits `CREATE ROLE`. Then prove the regen workflow on policies: change one `using` expression in `rls.ts`, run `generate`, and assert an `ALTER POLICY` appears; if drizzle-kit 0.31 does not diff expressions (I could not confirm either way), policy changes need a `--custom` migration on main and ADR-0001 must say so.
14. **Tests need an owner connection.** ADR-0001 says workers "connect as `rampflow_app`", but `world()` must insert rows across two tenants and platform tables, and absence assertions ("leaves no row") must read past RLS. Give `apps/api/test/db.ts` a second pool on `MIGRATION_DATABASE_URL` for seeding and peeking only, and say that the system under test never uses it.
15. **`turn_away` only from `confirmed` and `no_show`.** Three of the seven reasons (`documents_missing`, `wrong_load`, `damaged`) are discovered after check-in. Allow `turn_away` from `checked_in` too (it frees nothing a dock holds). Also note that a wrong tap on "Check in" has no undo; a `revert_check_in` command from `checked_in` back to `confirmed` (tenant admin or dispatcher, reason required, clears punctuality) is one table row and keeps the KPIs honest.
16. **Dock utilisation denominator is undefined.** "Open minutes of the dock" needs hours, but hours belong to sites and resources, and a dock can be in no resource. Define it as the site's open minutes minus site closures over the period, for docks with status `active` on each day.
17. **`driver_exchange` 10 per minute per IP meets carrier-grade NAT.** Mobile operators put thousands of phones behind one IPv4 address, and `X-Forwarded-For` must be trusted explicitly. The limit is in the spec; flag it to the owner and suggest 60 per minute per IP plus a global 600 per minute, keyed on the proxy-provided address with `TRUST_PROXY=1`.
18. **`23505` handling.** Three unique indexes can fire inside `createBooking` and `transitionBooking`: `booking_dock_occupied` (maps to 409 `dock_occupied`), `(created_by, client_request_id)` (should return the existing booking with 200) and `(tenant_id, code)` (random collision). A unique violation aborts the transaction, so the idempotent case cannot continue to read the existing row. Specify: look up `client_request_id` under the resource lock before inserting; retry code generation up to three times in a savepoint; map `23505` to 409 only when `constraint_name = 'booking_dock_occupied'`.
19. **Single-use claim must be one statement** for `auth_token`, `invitation`, `carrier_invitation` and `driver_access` (see M5). Write the `update ... where used_at is null returning` form in ADR-0003 so four units do not each discover it from a failing concurrency test.
20. **Reminders for bookings created inside the window.** A carrier books at 10:00 for 12:00 with `notify.reminder_hours_before = 24`; the reminder job's condition is already true and sends a reminder right after the confirmation. Add `created_at < starts_at - reminder_hours` to the job's predicate.
21. **`APP_ORIGIN` in development is the Vite origin.** The browser sends `Origin: http://localhost:5173` and the proxy forwards it unchanged while the API listens on 3000. Put `APP_ORIGIN=http://localhost:5173` in `.env.example` with that comment, or every POST in dev and Playwright fails with 403 on day one of U2.
22. **`@rampflow/shared` exports.** `index.ts` is frozen and the plan says U1 adds a `"./*"` export, but `packages/shared/src/time/` (U4) and `modules/<id>/<file>` need `"./*": "./src/*.ts"` plus `"./time": "./src/time/index.ts"`; a bare `"./*"` cannot resolve a directory index. Fix the exports map in U1 for every planned subpath.
23. **Cross-unit assertions inside W5.** U9 asserts "reassigning before `at_dock` updates what the driver view returns" (driver view is U10, same wave) and U8 asserts "the old driver link shows the generic invalid message" (U10). Move both to U12, and give U6a the service-level core-loop test (M11) so the first integration of booking, yard and KPI columns happens in W4, not W6. The coordinator should also run the U12 spec skeleton after each W5 merge rather than only at the end.
24. **Over-engineering: ten parties.** Each party is a policy per table and a column in the leak matrix. Cheaper: fold `token` into `anonymous` with one `SECURITY DEFINER` function `app.claim_token(kind, hash, now)` that returns the claimed row (the three token tables then need no `token` policies); fold `carrier_at_tenant` into `carrier` with an optional `tenantId` in the scope once M7's definer function removes the only reason it exists; keep `public` only for `carrier_registration` inserts and serve logos from `tenant_logo` through a definer function. Seven parties, about a third fewer policies, and the party matrix test (B1) shrinks with them.
25. **Over-engineering: PL-04 runs one tenant transaction per tenant per list request.** Twenty short scoped transactions with a `system:usage` actor to render one table. Cheaper: `app.tenant_usage(tenant_id)` as a `SECURITY DEFINER` function returning five counts, callable under `platform`.
26. **Over-engineering: the holiday import job.** A daily job, 400 days of `closure` rows per site, upsert semantics and "never resurrect a reopened date" exist to materialise data that `date-holidays` computes in microseconds. Cheaper: `loadDayTimeline` asks `date-holidays` for the day when `booking.close_on_public_holidays` is on, and a small `holiday_exception (site_id, date)` table records reopened dates; MD-04's list view renders the next 400 days on the fly. One job, one source column, one unique index and the "on site create or subdivision change" trigger go away.

---

## Things I checked and found sound (no action)

- `SELECT ... FOR UPDATE` on `bookable_resource` under `carrier_at_tenant` through an `update` policy with `using` and `with check false`: the Postgres docs confirm locking clauses are filtered by the SELECT/ALL and UPDATE/ALL `USING` expressions only.
- `set_config(..., true)` inside `db.transaction` on a `pg.Pool`: Drizzle acquires a dedicated client per transaction, so scope cannot leak between requests; nested `tx.transaction` becomes a savepoint.
- The `scoped()` rollback rule relies on Hono setting `c.error` and building the error response at the throwing handler before `next()` resolves; that is how Hono's compose works, so the rule is implementable as written (B2 is about what the rule erases, not about whether it works).
- `resolveEntitlements`, `parseEntitlementOverride`, `resolveSetting` and `parseSettingWrite` match ADR-0006/0007; every one of the scope's 21 implemented keys, 25 reserved keys and 29 settings exists in the manifests with the right kind, scopes and `requires`; the typetest rejections hold; `pnpm test` and `tsc -b` are green.
- The dock-occupancy partial unique index serialises two concurrent `call` commands to one dock correctly: the second `UPDATE` waits on the first's uncommitted index entry and then fails with `23505`.
- The no-show job and a concurrent gate check-in serialise on the booking row lock, and `check_in` from `no_show` on the same day resolves the job-wins case.
