# Review resolution

Resolves `.audit/review-fable.md` (F) and `.audit/review-opus.md` (O) against the design on `main` (commits `0474083`..`a4aa45f`). "Delegated to U1" means the fix lives in a file U1 owns and is implementing now (ADR-0001..0003, data model, `apps/`, `packages/shared/package.json`).

## BLOCKER and MAJOR

| ID | Reviewer | Finding | Resolution |
|---|---|---|---|
| F-B1 | Fable | RLS policies do not test the party, so every scope that sets `app.tenant_id` passes tenant policies | delegated to U1 (party-conditioned RLS and party matrix test) |
| F-B2 | Fable | Rollback on 4xx erases `rate_limit_event`, so login and exchange limits never fire | delegated to U1 (autocommit rate limit) |
| F-B3 | Fable | `booking` lands in W4 but W3 units (U3, U4, U5) need it | delegated to U1 (lands the whole data model); plan rewritten in `delivery-plan.md#waves` and the "Schema files" rule |
| F-M1 | Fable | Create locks resources in `(sort, id)`, reschedule in id order: deadlock `40P01` | fixed in `ADR-0004#booking-write`: one transaction-scoped advisory lock per site, no lock order exists |
| F-M2 | Fable | Walk-in inherits closed and capacity guards; gate lacks `booking.force` | fixed in `ADR-0004#booking-write`, `booking-lifecycle.md#commands` (`walk_in`), `ADR-0005#decision` item 4. `booking.walk_in` already existed for `gate_operator`; a registry test now pins "walk_in, never force" |
| F-M3 | Fable | Late-cancellation KPI reads a value that only exists in event data | column `booking.cancelled_late` delegated to U1; stamping and KPI fixed in `booking-lifecycle.md#commands` (`cancel`) and `#kpis` |
| F-M4 | Fable | `app.linked_tenant()` created after the migration whose policies call it | delegated to U1 (migration robustness) |
| F-M5 | Fable | Scope switch inside a request undefined; token redemption atomicity contradicts ADR-0003 | delegated to U1 (`asScope` in one transaction) |
| F-M6 | Fable | Driver party has no policy for `link_acknowledgement` writes | delegated to U1 (driver policies) |
| F-M7 | Fable | `carrier_at_tenant` reads every carrier's bookings at the tenant | policies delegated to U1; the capacity read path fixed in `ADR-0004#availability-read` (`asScope`, three columns only) |
| F-M8 | Fable | 288 wall-time buckets double-count the fold and miss the gap | fixed in `ADR-0004#availability-read` (instants from the day start; 276, 288 or 300) and the U4 test list |
| F-M9 | Fable | `GET /api/driver/booking` writes on every 15 s poll | fixed in `ADR-0008#safety-pass`, `api-routes.md#driver`: the poll is read-only, `GET /api/driver/briefings` redeems once, idempotently |
| F-M10 | Fable | UX route map contradicts ADR-0011 and the manifests | fixed in `ADR-0011#route-map` (the only route map) and `ux-concept.md#information-architecture-and-route-map` |
| F-M11 | Fable | U6 too large; split before W4 | fixed in `delivery-plan.md` (U6a API in W4, U6b screens in W5). The U1a/U1b split: rejected, U1 is already in flight |
| O-B1 | Opus | W3 units depend on `booking`, created in W4 | delegated to U1 (whole data model); plan updated as F-B3 |
| O-B2 | Opus | Nested `withScope` deadlocks the pool; two transactions break atomicity | delegated to U1 (`asScope`, pool timeout); pass redemption moved off the poll in `ADR-0008#safety-pass`. Chose the briefings endpoint over a new `POST /api/driver/redeem`: no new route, and the PWA calls it once per load anyway |
| O-B3 | Opus | Policy classes leak or make `FOR UPDATE`, upserts and RETURNING throw | delegated to U1 (party matrix) |
| O-B4 | Opus | Raw tokens in `outbox_message.payload`, no retention | delegated to U1 |
| O-B5 | Opus | UX route map contradicts ADR-0011 and nav | fixed as F-M10, plus manifest nav changes (`booking.tenants` added, `booking.resources` folded into the site page) and a `validateCatalog` check that nav paths stay inside their area prefix |
| O-M1 | Opus | Rollback on 4xx erases rate-limit evidence | delegated to U1 |
| O-M2 | Opus | Lock-order deadlock between create and reschedule | fixed as F-M1 |
| O-M3 | Opus | `carrier_at_tenant` reads other carriers' bookings; leak harness blind | policies and harness delegated to U1; `delivery-plan.md#shared-files` makes the world fixture link two carriers to tenant A; read path fixed as F-M7 |
| O-M4 | Opus | Day timeline ignores bookings across local midnight; `24:00` has no instant | fixed in `ADR-0004#capacity-at-an-instant`, `#availability-read` (window to day end + 16 h) and `ADR-0012#the-shared-time-module` (`24:00` is the next day's start) |
| O-M5 | Opus | Walk-in at a full slot, no uncall, no turn-away after check-in | fixed in `booking-lifecycle.md#commands` (`walk_in` with outcome, `uncall`, `turn_away` from `checked_in`), `ADR-0005#decision`, `api-routes.md#yard` |
| O-M6 | Opus | KPI definitions not computable as specified; drift from the research | fixed in `booking-lifecycle.md#kpis` (columns, BK-08 deadline wins, 10-visit reference fixture with expected values) and `mvp-scope.md` RP-01; column delegated to U1 |
| O-M7 | Opus | `notify.email` gating by template prefix drops account emails | fixed in `ADR-0010#outbox` (`category: 'account' \| 'booking'` per template, listed) |
| O-M8 | Opus | Client IP unspecified behind a proxy | delegated to U1 (TRUST_PROXY) |
| O-M9 | Opus | Carrier scope resolver cannot see `:tenantId` | delegated to U1 (route-level middleware) |
| O-M10 | Opus | jsonb `null` cannot be stored | delegated to U1 |
| O-M11 | Opus | `app_user` has no RLS and three units must read it | delegated to U1 (RLS and `userDisplay`) |
| O-M12 | Opus | Migration workflow conflicts on every rebase | delegated to U1 (regen robustness) |
| O-M13 | Opus | U1 too large for one session | fixed in `delivery-plan.md#u1-kernel-and-data-model`: `packages/i18n` may move to U2 and the plan works either way; run at high effort. U1a/U1b split rejected: U1 is in flight, a split now restarts it |
| O-M14 | Opus | Gate offline queue replays wrong data | fixed in `ADR-0011#station-layout` and `ux-concept.md#gate-yd-01-to-yd-05`: no queue, actions disabled offline |
| O-M15 | Opus | U12 does not prove the core loop | fixed in `delivery-plan.md#u12-core-loop-end-to-end`: Pro, published briefing, blocked-then-allowed check-in, pinned API and browser clocks and site settings, exact KPI row and CSV |

Counts: 34 findings. Fixed 17, delegated to U1 17, rejected 0 (two sub-suggestions rejected: the U1 split in F-M11 and O-M13).

## MINOR accepted

| ID | Finding | Resolution |
|---|---|---|
| F-1 | Cross-midnight bookings in availability | `ADR-0004#availability-read`, read predicate with a 16 h bound |
| F-2 | `no_show → checked_in` adds load without lock; day rule fails after midnight | `ADR-0004#booking-write` (no lock, stated), `booking-lifecycle.md` (`siteDay(no_show_at)`) |
| F-4 | `avis.basic` off makes booking impossible | `booking-lifecycle.md#actors`: create still stores the avis, only edit routes are gated |
| F-5 | `avis.required_reference_types` semantics | manifest comment in `avis/manifest.ts` |
| F-6 | Carrier nav has no warehouses item | `booking.tenants` nav item, registry test |
| F-7 | Station screens need a site | `?site=` with device fallback, `ADR-0011#station-layout` |
| F-8 | Benchmarks inside `pnpm verify` | `pnpm bench` behind `BENCH=1`, run by U4, U11 and after each wave |
| F-10 | `instantsAt` offset probing is circular | `ADR-0012`: probe fixed UTC midnights day-1..day+2 |
| F-15 | `turn_away` from `checked_in` | lifecycle table (revert_check_in rejected below) |
| F-16 | Dock utilisation denominator undefined | `booking-lifecycle.md#kpis` |
| F-18 | `23505` handling inside create | `ADR-0004#booking-write` (lookup after lock, savepoints, constraint name) |
| F-20 | Reminders for bookings created inside the window | `ADR-0010#jobs`, U11 test |
| F-23 | Cross-unit assertions inside W5 | moved to U12; U6a gets a service-level core-loop test run after each W5 merge |
| O-7 | `{ signIn: true }` reveals account existence | `api-routes.md#carrier-network`: always an empty 202, prompt by email |
| O-9 | Idempotency check before the lock | `ADR-0004#booking-write` |
| O-10 | Reschedule never moves the driver link expiry | `ADR-0008#tokens`, lifecycle `reschedule` |
| O-11 | Near-midnight no-show can never check in | as F-2 |
| O-12 | Staff avis edit after check-in re-checks capacity | lifecycle `update_avis` |
| O-14 | Buffer must fall inside opening hours | `ADR-0004#availability-read` step 5 |
| O-15 | Holiday closures with the setting off | `ADR-0004#capacity-at-an-instant` |
| O-19 | Seed route needs U3's `createTenant` | U1 seed route uses `world()` inserts |
| O-20 | Three units share `e2e/support/booking.ts` | helpers per unit (`e2e/support/<unit>.ts`) |
| O-21 | Doc path mismatches | ADR-0011 `/api/public` invitations, ADR-0004 availability path and bucket counts fixed; ADR-0002's `/tenants/:tenantId` delegated to U1 |
| O-23 | Offline cache shows the wrong booking | `ADR-0008#the-app`: cache follows the cookie; an offline exchange shows the offline message |
| O-25 | `parseSettingWrite` needs entitlements for platform writes | `contract/settings.ts` accepts `null` for platform scope; test added; ADR-0007 and module contract updated |
| O-26 | Public link has three switches | `api-routes.md#carrier-network`: the site setting is the only on/off switch; `DELETE` replaced by `regenerate`. The package entitlement stays, by design |
| O-28 | UX extras outside scope | calendar export, `/platform/jobs`, dark mode dropped in `ux-concept.md` |

Delegated to U1 (minor): F-3 (token-then-user scope), F-9 (pool size, SMTP timeout, job lock client), F-11 (outbox retention), F-12 (avis search indexes), F-13 (drizzle-kit policy diffs), F-14 (owner connection for tests), F-19 (single-statement token claim), F-21 (`APP_ORIGIN` in dev; `scripts/checkout-env.mjs` already derives it per checkout), F-22 (shared exports), O-1 (scrypt `maxmem`), O-2 (`nullif` GUC accessors), O-3 (refuse superuser or BYPASSRLS), O-4 (driver reads avis), O-5 (public party scope), O-6 (override notes), O-8 (admin bootstrap), O-16 (`booking_event` delete), O-17 (carrier org retention), O-18 (Biome must allow `systemActor` or `asScope` with `system:usage` in U3's `core/platform/` usage file).

## MINOR rejected

| ID | Finding | Reason |
|---|---|---|
| F-15 (part) | `revert_check_in` command | Check-in needs an explicit "Check in now" in a dialog; a wrong tap is rare. One more command, permission rule and KPI case for a rare slip does not earn its place in the MVP |
| F-17 | Driver exchange 10 per minute per IP vs carrier-grade NAT | The scope fixes 10 per minute. Owner decision; flagged. Correct client IP is delegated to U1 |
| F-24, O-27 | Fold ten RLS parties into four to seven | U1 is building the ten-party matrix with a test that runs every command per party. Folding now restarts that work; the matrix test is what makes many parties safe. Revisit after the MVP |
| F-25 | PL-04 usage through a `SECURITY DEFINER` function | `asScope` in the one request transaction costs a few `set_config` calls per platform page view. A definer function is a second access path around the party model, for a screen platform admins open rarely |
| F-26 | Compute holidays on the fly instead of the import job | U1 is landing the `closure` table now; MD-04 lists holidays among closures with reopen. The job is one idempotent file; on-the-fly holidays make availability merge two sources and need a second table for reopened dates |
| O-13 | BK-03 change of load type or carrier | Cancel and rebook covers it with the same capacity check. A load type change alters eligibility, duration and resource; a carrier change moves the booking between orgs' lists and driver link ownership |
| O-22 | One `hc` client per area for type cost | Unmeasured. TypeScript 7's native compiler; split per area mechanically if `apps/web` typecheck becomes slow |
| O-24 | Auto-close trucks that never check out | YD-04 already flags long stays; an automatic departure invents timestamps that corrupt turnaround |

## Follow-ups for the coordinator

- U1 implements `enqueueEmail` category gating (ADR-0010) and its test. Its lock-only `UPDATE` policy on `bookable_resource` is no longer needed by ADR-0004 (advisory lock per site needs no policy).
- U1's root script `env` is shadowed by pnpm's built-in `pnpm env` (`ERR_PNPM_ENV_NO_SUBCOMMAND`, measured). The plan calls `node scripts/checkout-env.mjs --write` directly; rename the script or document `pnpm run env`.
- U1 may edit `delivery-plan.md`'s U1 section in its worktree; expect a small merge conflict there.
