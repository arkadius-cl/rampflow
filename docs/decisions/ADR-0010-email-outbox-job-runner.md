---
title: ADR-0010 Email through a transactional outbox and an in-process singleton job runner
description: How business transactions enqueue email, how one worker delivers it with retries, how jobs (outbox, no-show, reminders, holiday import, retention) run once even with two API instances, and why there is no queue library.
type: explanation
audience: [agent, developer]
tags: [adr, email, jobs, outbox, idempotency]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0002-tenancy-isolation-rls.md]
---

# ADR-0010: Email through a transactional outbox and an in-process singleton job runner

Status: accepted, 2026-10-19.

## Context

- Emails must reach SMTP within 60 seconds, and a rolled-back write must send nothing (NFR performance).
- Booking emails send only with `notify.email`; account emails (invitations, magic links, resets) always send.
- Jobs: the no-show job (BK-08), reminders (BK-07), the holiday import (MD-04) and retention (PL-05). The scope requires singletons, so a second API instance also works, and requires that a second run of no-show and retention changes nothing. Deployment config schedules retention through `retention:run`.

## Options considered

| Option | Verdict |
|---|---|
| Send SMTP inside the request | A rollback after the send cannot unsend. A slow SMTP server slows the request. |
| pg-boss | A solid Postgres queue, but it brings its own schema, migrations and worker model for four periodic jobs and one table drain. |
| **Outbox table plus a small runner** | About 200 lines. Enqueue is one insert in the business transaction. Singleton and retry behavior are explicit in our code and tests. |

## Decision

### Outbox

- `outbox_message (id, tenant_id null, template, to_email, locale, payload jsonb, dedupe_key unique null, created_at, attempts, next_attempt_at, sent_at, failed_at, last_error)`.
- `enqueueEmail(tx, { template, to, locale, payload, dedupeKey? })` inserts with `on conflict (dedupe_key) do nothing`.
- **Gating by category, not by name.** Every template file exports `category: 'account' | 'booking'`, and `EmailTemplates` carries it per id. `enqueueEmail` skips a `booking` template when the tenant's `notify.email` is off and always enqueues an `account` template. The module a template lives in says nothing about its category: U7's carrier invitation lives in `booking/emails/` and is an account email.

  | Category | Templates |
  |---|---|
  | `account` (always sent) | `core.invitation`, `core.magic-link`, `core.password-reset`, `booking.carrier-invitation`, `booking.registration-verify`, `booking.registration-approved`, `booking.registration-rejected`, `privacy.inactive-notice` |
  | `booking` (needs `notify.email`) | `booking.confirmed`, `booking.changed`, `booking.cancelled`, `booking.reminder`, `booking.no-show`, `driver.link` |

  U1's outbox test enqueues one template of each category with `notify.email` off and asserts that only the account email has a row.
- **Templates are files.** `apps/api/src/modules/<module>/emails/<name>.tsx` exports `category`, `render(payload, t)` (React Email) and an `example` payload. The template id is `<module>.<name>`. Payload types join one `EmailTemplates` interface through declaration merging, so `enqueueEmail` is typed per template and no shared registry file exists. The worker loads templates with a dynamic import by id.
- **Worker** (`notify/jobs/outbox.ts`, every 5 seconds):
  1. Claim up to 20 rows with `select ... where sent_at is null and failed_at is null and next_attempt_at <= now() for update skip locked`.
  2. Render with a server i18next instance for `locale`, send through nodemailer (Mailpit in dev).
  3. Mark `sent_at`, or increment `attempts` and set `next_attempt_at = now() + 2^attempts * 30 s`. After 8 attempts set `failed_at` and log the id.
  Delivery is at least once: a crash between the SMTP call and the update resends that one message.
- Logs carry the message id and template, never addresses or payloads.

### Job runner

- `apps/api/src/kernel/jobs.ts` discovers jobs by file convention: every `apps/api/src/modules/*/jobs/*.ts` exports `job: { name, everySeconds, run(ctx) }`. No list file exists.
- Each tick runs in a transaction that first calls `pg_try_advisory_xact_lock(hashtext('job:' || name))`. If another instance holds it, the tick returns at once. Transaction-scoped locks cannot leak through the pool.
- Jobs that span tenants follow [ADR-0002](ADR-0002-tenancy-isolation-rls.md): list tenants under `system`, then process each tenant in its own `tenant` scope with actor `system:<job>`. One tenant's failure is logged and does not stop the others.
- Every run writes `job_run (job, tenant_id null, started_at, finished_at, stats jsonb)`. Stats hold counts only, never personal data.
- Time comes from the injected `Clock`, so tests drive jobs at chosen instants.
- `ENABLE_JOBS=0` turns the in-process runner off; Vitest and one-off scripts set it.

### Jobs

| Job | File | Schedule | Idempotent because |
|---|---|---|---|
| `outbox` | `notify/jobs/outbox.ts` | 5 s | Claims with `skip locked`; sent rows are skipped |
| `no_show` | `booking/jobs/no-show.ts` | 60 s | Transitions only `confirmed` bookings past `starts_at + yard.no_show_after_minutes`, through `transitionBooking`; runs only for tenants whose `yard` module is on |
| `reminders` | `notify/jobs/reminders.ts` | 5 min | `dedupe_key = reminder:<booking id>:<starts_at>`; a reschedule creates a new key. Only bookings created before `starts_at - notify.reminder_hours_before` get one, so a booking made inside the window gets no reminder right after its confirmation |
| `holiday_import` | `booking/jobs/holiday-import.ts` | daily, and on site create or subdivision change | Upserts on `(site_id, holiday_date)` and never resurrects a reopened date |
| `retention` | `privacy/jobs/retention.ts` | not scheduled in process | Each rule is a set-based update or delete on rows past their limit; a second run finds none |

`pnpm --filter @rampflow/api retention:run` runs the retention job once and exits. Deployment schedules it daily (cron, systemd timer or the platform's scheduler).

## Consequences

- A rolled-back booking sends nothing, by construction, and the U6a test proves it by forcing a rollback after enqueue.
- Email latency is at most one tick (5 s) plus SMTP time when the server is healthy.
- Adding a job or a template is adding one file in the owning module.
