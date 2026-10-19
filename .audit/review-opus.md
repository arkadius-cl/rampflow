# Adversarial design review (Opus)

Reviewed: `docs/explanation/mvp-scope.md` (spec), ADR-0001..0012, `docs/reference/{data-model,module-contract,booking-lifecycle,api-routes}.md`, `docs/explanation/delivery-plan.md`, `docs/explanation/ux-concept.md`, `packages/shared/src/**`, `AGENTS.md`.

What I checked by running code or reading primary docs:

- `pnpm test` and `pnpm typecheck` in `packages/shared`: 27/27 green, typecheck clean.
- Postgres `CREATE POLICY` docs (current): `SELECT ... FOR UPDATE` filters rows that fail the **UPDATE** policy's USING expression, with no error. `INSERT ... RETURNING` throws if the new row fails the SELECT policies. `ON CONFLICT DO NOTHING` **with an arbiter** and `ON CONFLICT DO UPDATE` check the proposed row against the SELECT policies and throw.
- drizzle-orm 0.45.4 `sql/sql.js:141`: `chunk.value === null ? null : encoder.mapToDriverValue(...)`. A JS `null` becomes SQL NULL, never jsonb `'null'`. `node-postgres/session.js` takes one `pool.connect()` per `db.transaction`.
- Hono 4.13.13 (the repo's version): in a middleware registered with `.use()` on the router mounted at `/c/:orgId`, `c.req.param('tenantId')` is `null` for `/c/o1/at/t9/sites`. After `await next()`, the middleware sees `c.error` and `c.res.status` (500 and 409 cases).
- Node 24.20: `crypto.scrypt(..., { N: 16384, r: 16, p: 1 })` throws `memory limit exceeded` under the default `maxmem`. It works with `maxmem: 64 MiB` (77 ms).
- `Intl` labels for the Bucharest and Berlin fold match ADR-0012.

Severity: **BLOCKER** means change the contract before implementation starts. **MAJOR** means fix it inside the unit that touches it. **MINOR** covers everything else. Each finding gives a pointer, a failure scenario and a fix.

---

## BLOCKER

### B1. W3 units depend on the `booking` table, which U6 creates in W4

- **Pointer.**
  - `delivery-plan.md:24-25` (waves).
  - `data-model.md:44` (`booking` is U6) and `data-model.md:48` (all safety tables are U5).
  - `data-model.md:658` and `:675` (safety FKs to `booking`).
  - `delivery-plan.md:161,167,171` (U4) and `delivery-plan.md:147` with `api-routes.md:127` (U3 PL-04).
- **Scenario.**
  - U5 cannot declare `safety_acknowledgement.booking_id → booking`, `booking_acknowledgement.booking_id → booking` or `safety_attempt.booking_id`, because `booking/schema.ts` does not exist. U5 also cannot implement or test the SF-03 register filter "by site": `safety_acknowledgement` has no `site_id`, so the filter needs a join to `booking`.
  - U4 must ship `loadDayTimeline` ("the active bookings that overlap the day"), the daily-cap test, "lowering capacity flags affected bookings" and the design-load availability benchmark, all without a booking table.
  - U3 must count "bookings this month" and flag the soft limit, and the only soft limit is `booking.max_bookings_per_month`.
  - Each of the three agents will either invent a stub `booking` table, which collides with U6's at `db:regen`, or edit a file it does not own.
- **Fix.**
  - Before W3, the coordinator lands the pure Drizzle schema for `booking`, `booking_event`, `avis` and `avis_reference` on `main`. The columns are already fully specified in `data-model.md`. U6 keeps the logic.
  - Add `site_id` to `safety_acknowledgement`, so the register filters without a join.
  - Alternative: move U5 and the booking-dependent U3 and U4 tests into W4. That lengthens the critical path, so the pre-landed schema is cheaper.

### B2. Switching scope inside one request contradicts the transaction rules, and the obvious implementation deadlocks the pool

- **Pointer.**
  - `ADR-0002:134`: token redemption reads under `token`, then inserts under `tenant`.
  - `ADR-0003:62`: the token is marked used "in the same transaction that creates the session or membership".
  - `module-contract.md:302`: "no request opens two scoped transactions".
  - `ADR-0002:62-75`: `withScope` always opens a new `db.transaction`.
  - `ADR-0008:66` and `api-routes.md:302`: `GET /api/driver/booking` redeems passes under a tenant scope.
  - `ADR-0010:47-48`: the job tick transaction holds the advisory lock while tenant scopes run.
  - `ADR-0002:132`: PL-04 runs per-tenant scopes inside a platform request.
- **Scenario.**
  - The only primitive is `withScope`, so the documented scope switch can only be written as a second `withScope` inside the request transaction. That takes a second pool client while the first is still held.
  - With pg-pool defaults (`max: 10`, `connectionTimeoutMillis: 0`, meaning wait forever), 10 concurrent driver polls each hold one client and wait for a second one for pass redemption. Every later request queues behind them and the API never recovers.
  - At design load, 2,000 PWAs polling every 15 s make about 133 requests per second, so a burst of 10 concurrent polls is routine.
  - Even without the deadlock, the two transactions break atomicity:
    - Invitation acceptance commits "token used" and then fails the membership insert, which burns the token.
    - The inner commit survives the outer 409 rollback.
- **Fix.**
  - U1 provides `asScope(tx, scope, fn)`. It re-runs the `set_config(..., true)` statement inside the **same** transaction, runs `fn`, and restores the previous scope. RLS reads the variables per statement, and row locks persist.
  - `withScope` asserts, through AsyncLocalStorage, that no scope is open.
  - Set `connectionTimeoutMillis` (for example 5 s) so pool exhaustion fails loudly.
  - Jobs: run each tenant inside the tick transaction as `tx.transaction()` (a savepoint) plus `asScope`. One tenant's failure then still does not roll back the others, and no second connection is needed.
  - Move pass redemption off the 15-second poll into a one-time `POST /api/driver/redeem` that the PWA calls after the exchange. It must sit under `/api/driver`, because `rf_device` has `Path=/api/driver`.

### B3. The RLS policy classes as written either leak or make core flows throw

- **Pointer.**
  - `data-model.md:30-35` (policy classes), `:115` (`org`), `:342` (`outbox_message`), `:700` (`safety_pass`).
  - `ADR-0004:92` (`withinLimit`), `ADR-0005:34` (`FOR UPDATE`), `ADR-0010:35` (`on conflict (dedupe_key)`), `booking-lifecycle.md:98` (the driver links acknowledgements).
  - U1 owns `rls.ts` and every core policy. Later units cannot edit `core/schema.ts`.
- **Scenarios.** Each one is confirmed against the Postgres policy table.
  1. **No party guard.**
     - `tenant-private` is "all commands where `tenant_id = app.tenant_id()`". The `driver`, `public` and `carrier_at_tenant` parties also set `app.tenant_id`, so taken literally they get full read and write access to every tenant-private table.
     - Example: a driver handler that forgets a filter reads every `safety_acknowledgement.driver_name` of the tenant.
     - The logo route's `public` scope takes `tenantId` from the URL (`api-routes.md:154`).
  2. **`FOR UPDATE` needs an UPDATE policy.**
     - `org` has no tenant UPDATE policy, so `withinLimit`'s `select ... from org ... for update` returns zero rows and locks nothing. Two concurrent invites at `limit - 1` both pass.
     - Under the `driver` party, `transitionBooking`'s lock on `booking` finds no row, so the driver's `link_acknowledgement` answers 404.
  3. **Upserts and RETURNING need a SELECT policy.**
     - `enqueueEmail` uses `on conflict (dedupe_key) do nothing`, which has an arbiter. The outbox SELECT policy is system-only, so every enqueue from the tenant, carrier and anonymous scopes **throws**. That covers magic links, resets and booking emails.
     - The `safety_pass` upsert under `driver` (insert-only) throws on every acknowledgement, so SF-04 fails outright.
     - Drizzle `.returning()` on `carrier_registration` inserts (`public`) or `org` inserts throws.
  4. **Missing write paths.**
     - `org` has no INSERT for `user` or `token`, although `ADR-0002:120` says the user party creates the carrier org during acceptance (TN-03, CR-02).
     - `booking_event` has no driver INSERT, but the `safety_linked` event needs one.
- **Fix.**
  - Replace the class prose with an explicit matrix of party × table × command (SELECT, INSERT, UPDATE, DELETE, `FOR UPDATE`, upsert).
  - `rls.ts` emits one policy per (party, command), and every expression starts with `(select app.party()) = '<party>'`.
  - Every party that locks rows gets `for update using (...) with check (false)`.
  - Outbox inserts use `on conflict do nothing` without a target. That form does not require SELECT.
  - Rule: no `.returning()` under parties without SELECT. Generate ids in the app.
  - U1 ships a matrix test that runs every allowed and forbidden command per party, including lock, upsert and returning.

### B4. Raw magic-link, reset, invitation and driver tokens sit in `outbox_message.payload`, with no retention

- **Pointer.**
  - `ADR-0010:34-36` (`payload jsonb`, rendered by the worker).
  - `ADR-0002:119` (anonymous writes outbox rows for magic links and resets).
  - `booking-lifecycle.md:89` (`driver.link` email).
  - `data-model.md:731-744` (no outbox row in the retention table).
  - Spec `mvp-scope.md:331` and `ADR-0008:78` ("a leaked database dump exposes no usable driver link").
- **Scenario.**
  - The natural payload is `{ url: 'https://host/d#<token>' }`.
  - A database dump or backup then yields every driver link emailed in the last 7 days, every live reset token (60 min) and every invitation token (7 days). That breaks the "hashes only" NFR that ADR-0008's HMAC design exists to keep.
  - `to_email` and payload personal data are kept forever.
- **Fix.**
  - Payloads carry row ids only (`authTokenId`, `invitationId`, `driverAccessId`). The worker derives the URL at send time.
  - Derive every emailed token as `HMAC(secret, row id)`, the same scheme as driver links, so the database stores only `sha256(token)`.
  - Add an outbox retention rule: null the payload on send, and delete sent or failed rows after 7 days.
  - Units U2, U6, U7 and U10 all enqueue token emails, so this must be fixed before U1 defines `EmailTemplates`.

### B5. The UX route map contradicts ADR-0011 and the manifests' navigation

Fix this before W2 at the latest.

- **Pointer.** `ux-concept.md:33-59` against `ADR-0011:32-43`, the manifest `nav[].to`, and the ownership columns in `delivery-plan.md:35-43`.
- **Contradictions.**
  - Org segment: UX uses `/o/:org/...`, the ADR uses `/t/$orgId/...`.
  - Org picker: UX uses `/orgs`, the ADR uses `/`.
  - Public link: UX uses `/register/:siteSlug`, the ADR uses `/r/$slug`.
  - Invitation: UX uses `/invite/:token`, which puts the token in the path, the request line and logs. That violates ADR-0003:61.
  - Gate and dock: UX uses `/gate/:site` and `/dock/:site`, while the nav uses `/t/$orgId/gate` and `/docks`.
  - Admin pages: UX nests them under `/admin/...`.
  - UX puts the TN-05 logo inside `/admin/privacy`, while the manifest has `brand` at `/t/$orgId/brand`.
  - UX gives the driver PWA paths `/d/booking`, `/d/quiz` and so on, while ADR-0008:71 says "no router library".
  - UX wants "Gate and dock operators ... full-screen, without the sidebar", but ADR-0011:43 has the U2 tenant layout own the sidebar for every child route. U9 would have to edit U2's file.
  - UX nav items that have no manifest entry: Hours and closures, Load types, Bookings (tenant), Warehouses (carrier, the U7 page `c/$orgId/tenants`), Usage, Jobs. Units may not edit manifests, so these screens ship unreachable.
  - UX promises screens with no API: `/platform/jobs` and "Add to calendar".
- **Fix.**
  - Rewrite the UX route table to ADR-0011 paths.
  - Add a pathless station layout, `t/$orgId/_station/{gate,docks}`, owned by U2.
  - Before W2, the coordinator adds the missing nav items, or explicitly folds them into existing pages.
  - Drop `/platform/jobs` and the ICS export.

---

## MAJOR

### M1. The rollback-on-4xx rule erases rate-limit evidence

- **Pointer.** `ADR-0002:106`, `ADR-0003:68-70`.
- **Scenario.**
  - A failed login answers 401, so the `scoped` middleware rolls back, including the `rate_limit_event` insert. The 5-in-15 rule never fires.
  - An invalid driver token answers 401, so brute-force exchanges are unlimited. U10's 429 test probably uses valid tokens and passes anyway.
- **Fix.** `rateLimit()` runs as middleware **before** `scoped()` in its own short transaction, and records the event before the handler runs. Test it with invalid credentials and tokens.

### M2. Lock-order deadlock between create and reschedule

- **Pointer.** `ADR-0004:85-86`.
- **Scenario.**
  - Load type L is eligible at R1 (sort 1, id `9…`) and R2 (sort 2, id `1…`).
  - T1, a carrier create, locks R1, finds it full, and requests R2.
  - T2, a staff reschedule from R1 to R2, locks in id order: it locks R2 and requests R1.
  - Postgres detects the deadlock after 1 s and aborts one transaction with 40P01. No retry path exists, so one user gets a 500.
  - An avis edit that changes the duration on another resource interleaves the same way.
- **Fix.** Every load-adding writer takes one lock per **site**: `select ... from site ... for update`, with the same `with check (false)` trick for carriers, or `pg_advisory_xact_lock` on the site id. Remove per-resource lock ordering. Writes per site per second are far below one.

### M3. `carrier_at_tenant` can read every carrier's bookings at the tenant, and the leak harness cannot notice

- **Pointer.** `data-model.md:34`, `ADR-0002:124`, `ADR-0002:159`, `delivery-plan.md:60` (one linked carrier per world).
- **Scenario.**
  - Carrier B is linked to the same tenant as carrier A.
  - A portal handler that forgets `carrier_id` returns A's booking, with `carrier_name` and `code`, to B. RLS allows it.
  - Worlds A and B have different tenants, so B's link check answers 404 before any query runs, and the test passes.
  - This leaks competitor volumes and times. It also defeats "as another carrier" in the spec's CI rule.
- **Fix.**
  - The booking-family policy for `carrier_at_tenant` covers own carrier only.
  - The capacity and availability reads run under `asScope(tx, tenant system:capacity)` from B2 and return only `(resource_id, starts_at, blocks_until)`.
  - Add a second carrier, linked to tenant A, to the world fixture and to the leak check.

### M4. The day timeline ignores bookings that cross local midnight, and `24:00` has no instant

- **Pointer.** `ADR-0004:61-63,106`, `ADR-0012:37,59-63,70`, `data-model.md:381`.
- **Scenario.**
  - The site runs an overnight shift: Mon 22:00-24:00 plus Tue 00:00-06:00, two rows as specified.
  - A 90-minute load starting Mon 23:30 needs buckets in Tuesday. Monday's 288-bucket timeline either treats them as closed (the slot is never offered) or as empty (Tuesday 00:00 bookings get overbooked).
  - `instantsAt(day, '24:00')` formats back as `00:00` and keeps no instant, so the opening window has no end.
- **Fix.**
  - `loadDayTimeline` covers `[dayStart, dayEnd + max(duration + buffer))`, including the next day's hours and bookings.
  - Map `24:00` explicitly to the next day's `00:00`.
  - Add both cases to U4's DST tests.

### M5. The state machine misses three yard situations the stories imply

- **Pointer.** `booking-lifecycle.md:84,92-93`, `ADR-0004:87`, booking manifest (`booking.force` is held by dispatchers only), spec YD-02 and YD-03 (`mvp-scope.md:173-174`).
- **Scenarios.**
  - **(a) Walk-in at a full slot.** The gate operator holds `booking.walk_in` but not `booking.force`, so YD-03 fails at the busiest moment. A truck at 05:40, before the 06:00 opening, can never be walked in, because "closed" is never forced. An unbooked truck cannot be turned away, because `turn_away` needs a booking. The `no_capacity` reason is therefore unusable for the only case where it applies.
  - **(b) No way to undo a call.** If a called driver never arrives, the dock stays held under `booking_dock_occupied`. The only exits are reassign, which still holds a dock, or `depart`, which corrupts the KPIs.
  - **(c) No turn-away after check-in.** Wrong load or missing documents found after check-in can only be recorded as `depart`.
- **Fix.**
  - Walk-ins skip the capacity and closed checks. Record `walk_in`, and let the board flag over-capacity.
  - Add `turn_away` to the walk-in flow: create directly in `turned_away`. Also allow it from `checked_in`.
  - Add an `uncall` command (`called → checked_in`, clears the dock, event `uncalled`).

### M6. The KPI definitions cannot be computed as specified, and they drift from the spec's source

- **Pointer.** `booking-lifecycle.md:111,138,143-144`, spec `mvp-scope.md:116` ("follow the market research KPI table"), market research KPI table ("no `gate_in_at` by slot end plus grace"; "cancelled_at with the cutoff in force at that time"), `data-model.md:739-741`.
- **Scenario.**
  - The late-cancellation flag lives only in `booking_event.data`, but "RP-01 reads only booking columns".
  - Events are deleted after 365 days while visits are kept 395 days.
  - The no-show rate uses status, but a late check-in reopens `no_show` while `no_show_at` stays set. U11's hand-computed 10-visit fixture will encode whichever reading its agent picks.
  - U11 cannot add the missing column, because U6 owns `booking`.
- **Fix.**
  - In U6's schema, add `cancelled_late boolean` (or `cancel_cutoff_at`) to `booking`.
  - Define the no-show KPI in one sentence and state which column it reads.
  - Write the 10-visit fixture's expected values into `booking-lifecycle.md` before W5.

### M7. `notify.email` gating by template prefix drops account emails

- **Pointer.** `ADR-0010:35-36`, `delivery-plan.md:39`, spec `mvp-scope.md:213`.
- **Scenario.**
  - U7's emails live in `booking/emails/`, so their ids are `booking.carrier-invitation` and `booking.registration-verify`.
  - With `notify.email` overridden off, a test PL-02 performs, carrier invitations and registration verification silently never send. TN-03 and CR-02 dead-end, although "account emails always send".
- **Fix.** Each template exports `kind: 'account' | 'booking'`, and `enqueueEmail` gates on `kind`, not on the id.

### M8. The client IP is unspecified behind a TLS proxy

- **Pointer.** `ADR-0003:67-70`, `ADR-0008:53`, spec `mvp-scope.md:329`.
- **Scenario.** Production sits behind a reverse proxy, because `Secure` cookies need TLS. Every request then shares one IP, so the driver exchange limit (10 per minute) applies to all drivers globally, and login lockouts hit unrelated users.
- **Fix.** Add a kernel `clientIp(c)` with a `TRUST_PROXY_HOPS` environment variable, and add tests with `X-Forwarded-For`.

### M9. The carrier scope resolver cannot see `:tenantId`

Verified on Hono 4.13.13.

- **Pointer.** `module-contract.md:289-292` (`.use(scoped(carrierScope))` on the `/c/:orgId` router).
- **Scenario.**
  - Under `/c/o1/at/t9/...`, `c.req.param('tenantId')` returns `null`. The agent either resolves every request as `carrier`, so carrier booking writes fail RLS, or adds a second `scoped()` on the `/at` router.
  - The second option nests transactions: two connections per request, and an inner commit that is independent of the outer rollback.
- **Fix.** Mount `/c/:orgId/at/:tenantId` as its own area with its own `scoped()`, and make the carrier area middleware skip `/at/`. Alternatively, U1 implements and tests `carrierScope` by parsing `c.req.path`.

### M10. jsonb `null` cannot be stored

- **Pointer.** `data-model.md:233` (`entitlement_override.value`, NOT NULL, "or `null` (unlimited)") and `:248` (`setting_value.value`, NOT NULL). drizzle-orm 0.45.4 `sql.js:141`.
- **Scenario.**
  - PL-02 "set unlimited" writes SQL NULL and fails NOT NULL with a 500.
  - TN-02 setting `privacy.notice_url = null` to override a platform URL fails the same way.
- **Fix.** Store `{ "v": <value> }` in both columns, and unwrap in the repository.

### M11. `app_user` has no RLS and is import-restricted, but three later units must read it

- **Pointer.** `ADR-0002:139`, `data-model.md:130`, `booking-lifecycle.md:74` (booking contact), TN-01 and CR-04 (member lists), `data-model.md:743-744` (retention of users and auth rows).
- **Scenario.**
  - These units need `app_user` or other auth tables, which Biome restricts to `core/auth/`:
    - U3: staff and carrier-user lists with names and emails.
    - U6: booking-contact emails.
    - U11: reminder recipients, deleting inactive carriers, purging `auth_token` and `rate_limit_event`.
  - Each unit will either break the rule with raw SQL or stall.
  - Because `app_user` has no RLS, one forgotten join leaks every user's email across the platform. No backstop exists.
- **Fix.** U2 provides `core/auth/directory.ts` (`contactFor`, `membersOf`, `purgeExpiredAuthRows`) and lists it in its Provides. Alternatively, add RLS on `app_user`: self, or a membership in `app.tenant_id()` or `app.carrier_id()`.

### M12. The migration workflow conflicts on every rebase

- **Pointer.** `ADR-0001:57-58`, `delivery-plan.md:70-71`.
- **Scenario.**
  - Two units in a wave each commit `meta/000N_snapshot.json` and append to `meta/_journal.json`. `git rebase` stops on add/add conflicts before `db:regen` can run.
  - "Generate as often as it likes" creates a new numbered file on each run, so the branch accumulates several migrations.
  - A medium-effort agent may hand-merge the JSON, and that corrupts the snapshot chain.
- **Fix.**
  - `db:generate` first restores `apps/api/drizzle/` from `git merge-base HEAD main` and deletes branch-local files, so the branch always holds exactly one migration.
  - A `db:rebase` script reverts `apps/api/drizzle/**` to the merge-base, commits, rebases (no conflicts possible), regenerates and commits.
  - Add a CI check that `drizzle-kit generate` on `main` reports no changes.

### M13. U1 is too large for one medium-effort session, and it sits on the critical path

- **Pointer.** `delivery-plan.md:84-108`.
- **Scenario.** U1 must cover all of the following:
  - roles, the baseline SQL, `scope.ts` and `rls.ts`;
  - the template-database test harness;
  - a two-world fixture;
  - the route-case harness and the coverage test;
  - outbox, mailer, job runner, rate limit, Origin check, static serving and Biome rules;
  - the regen script;
  - the whole `packages/i18n` package with its catalog test.

  Its errors (B2, B3) propagate into every later unit.
- **Fix.** Split U1 into U1a and U1b and run them sequentially:
  - U1a: the database, scope and RLS work with its matrix test (B3), plus the world fixture and the harness.
  - U1b: outbox, jobs, rate limits and static serving.
  - Move `packages/i18n` to U2. Run U1a at high effort.

### M14. The UX gate "offline queue" records wrong data on replay

- **Pointer.** `ux-concept.md:137`.
- **Scenario.**
  - A check-in queued at 08:05 and replayed at 08:40 stamps `checked_in_at = 08:40` and punctuality "late".
  - A queued `call` replays to a dock that has since been taken, so it gets 409 after the driver has already moved.
  - U9 is told to follow the UX concept, and no ADR covers offline commands.
- **Fix.** Drop the queue for the MVP: show the offline pill and disable actions.

### M15. U12 does not prove the core loop it names

- **Pointer.** `delivery-plan.md:306`.
- **Scenario.**
  - The setup never authors or publishes a briefing, so "driver completes the briefing" has nothing to complete.
  - The package is unspecified, so gate enforcement (the safety-to-gate link, YD-02) may never be exercised.
  - Settings are not pinned (lead time 120 min, holiday closures on, hours), so a run at 23:00 or on a public holiday finds no slot.
  - Nothing asserts KPI values.
- **Fix.**
  - Use Pro and publish the template briefing.
  - Pin lead time to 0, hours to 00:00-24:00, and holidays off.
  - Assert that check-in is blocked before the acknowledgement and allowed after it.
  - Assert the KPI row (one visit, punctuality, non-null turnaround) and the CSV content.

---

## MINOR (28)

1. **scrypt cost exceeds Node's default `maxmem`** (`ADR-0003:46`). Verified: it throws. Pass `maxmem: 64 * 1024 * 1024`.
2. **GUC accessors must use `nullif(current_setting('app.x', true), '')::uuid`.** After a `SET LOCAL` on a pooled connection the GUC reads `''`, not NULL, and `''::uuid` throws instead of failing closed.
3. **The repo `.env` points `DATABASE_URL` at the superuser `rampflow`, which silently bypasses RLS in dev and e2e.**
   - Pointer: the repo's `.env`, and `playwright.config.ts`, whose webServer loads it.
   - Fix: the API refuses to start when `current_user` is superuser, has `rolbypassrls`, or owns any table.
4. **The driver party can read `avis` personal data through RLS** (`data-model.md:570`), and forwarded links are an accepted threat. Remove `driver` from the `avis` and `avis_reference` policies.
5. **The `public` party is too broad.**
   - With the tenant id taken from the logo URL, `public` can read all sites, settings, subscription and override notes of any tenant.
   - The slug scope sees all sites, not only the linked one.
   - Fix: restrict `public` to `tenant_logo` and `site where id = app.site_ids`.
6. **Carriers can read linked tenants' `entitlement_override.note`** (`data-model.md:238`). Limit override reads to the platform and tenant parties.
7. **`{ signIn: true }` on the public registration endpoint reveals account existence** (`api-routes.md:247`), against ADR-0003's anti-enumeration rules. Always answer 202 and send the sign-in prompt by email.
8. **No production bootstrap exists for the first platform admin.** There is no sign-up path, and `seed-dev` is dev-only. Add an `admin:create` script that runs as the owner.
9. **Idempotency and unique-violation handling.**
   - Check `clientRequestId` **after** the resource or site lock. Otherwise a double submit raises 23505 inside an aborted transaction and answers 500.
   - Map `dock_occupied` (23505) inside a savepoint, so the handler can still query afterwards.
10. **Reschedule never moves the driver link expiry.** `expires_at` is set to `starts_at + 7 days` at creation (`ADR-0008:47`). A carrier who reschedules more than 7 days out leaves a link that dies before the visit. Fix: reschedule recomputes the expiry.
11. **A booking near midnight can never be checked in from `no_show`.** A 23:30 booking turns `no_show` at 00:30 on the next site day, so the "same site-local day" rule always fails. Base the rule on `siteDay(starts_at)` plus `no_show_after`.
12. **A staff avis edit after check-in re-checks capacity at a past slot.** On a full slot, the gate cannot record extra pallets. Skip the capacity check for staff edits from `checked_in` on.
13. **BK-03 "change" has no command for load type or carrier**, only time, resource and avis.
14. **The buffer must fall inside opening hours** (`ADR-0004:63`), so the last start of the day is closing time minus duration minus buffer. State this explicitly.
15. **Holiday closures are imported on site create regardless of `booking.close_on_public_holidays`.** The rule that availability ignores them when the setting is off is unspecified.
16. **Any tenant-party handler can delete `booking_event` rows** (`data-model.md:489`). RLS cannot tell a system actor from a user, so "only retention deletes" is a convention, not an enforced rule.
17. **Retention cannot delete carrier orgs.** The `system` party has only SELECT on `org`, and `booking.carrier_id` has no delete action. Define anonymize-not-delete for carrier orgs that have bookings.
18. **PL-04 usage needs `systemActor()` in `core/platform/`**, but Biome allows it only in `jobs/` and `*.redeem.ts` (`ADR-0002:135`).
19. **U1's seed route needs `createTenant`, which U3 provides two waves later** (`delivery-plan.md:142`).
20. **Three units would share `e2e/support/booking.ts`.** U6 and U7 run in parallel in W4, and U8 follows in W5, all in module `booking`. Name the helpers per unit instead.
21. **Doc path mismatches will misroute agents.**
    - `ADR-0002:124` says `/tenants/:tenantId`, against `api-routes.md:27` `/at/:tenantId`.
    - `ADR-0011:34` says `/api/invitations`, against `/api/public/invitations`.
    - `ADR-0004:59` says `booking/resources/availability.ts`, against U4's `booking/capacity/`.
    - "288 buckets" is wrong on a 25-hour day, which has 300.
22. **One `AppType` chain covers about 110 routes.** Hono RPC type cost is a known pain at that size. Give `hc` a client per area.
23. **The offline cache shows the wrong booking.** The PWA's `NetworkFirst` cache for `GET /api/driver/booking` is keyed by URL only, so a phone with two bookings shows the other booking offline.
24. **Trucks that never check out hold their docks and the on-site list forever.** There is no "open since yesterday" view or auto-close.
25. **`parseSettingWrite` requires tenant entitlements, but platform writes (PL-03) have none.** Add a platform variant.
26. **Public-link enablement has three switches across two permissions:** the slug row (`booking.manage_carriers`), the `booking.public_link_enabled` setting (`core.manage_settings`), and the package. Create the slug lazily, and let the setting be the only switch.
27. **Over-engineering: ten RLS parties.**
    - `anonymous`, `token`, `user` and `public` touch mostly tables without RLS.
    - Cheaper equivalent: four RLS parties (tenant with system actors, carrier with an optional tenant, driver, platform). Token lookups go through one `security definer` function and the routing tables.
    - That roughly halves the B3 matrix.
28. **Over-engineering: UX extras outside the scope.** "Add to calendar" (ICS), `/platform/jobs`, and dark mode for the office and the PWA, which doubles the axe contrast surface. Drop them from the MVP.
