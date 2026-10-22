---
title: ADR-0018 Tenant suspension
description: Why a suspended tenant is a timestamp on org with the reason in platform-only notes, how the request scope, public links and the job runner enforce it per party (403 for staff and carriers at the tenant, 401 for drivers, 404 for public links), what suspension does not revoke, and what every new job and party must state.
type: explanation
audience: [agent, developer]
tags: [adr, tenancy, security, platform, jobs, auth]
status: stable
updated: 2026-10-22
related: [docs/decisions/ADR-0002-tenancy-isolation-rls.md, docs/decisions/ADR-0008-driver-token-pwa-delivery.md, docs/decisions/ADR-0010-email-outbox-job-runner.md, docs/reference/data-model.md, docs/reference/api-routes.md, docs/how-to/onboard-a-tenant.md, openspec/changes/archive/2026-10-22-04-platform-tenant-views/design.md]
---

# ADR-0018: Tenant suspension

Status: accepted, 2026-10-22 (change 04, story PL-07). Extends [ADR-0002](ADR-0002-tenancy-isolation-rls.md) "How each context works".

## Context

With self-registration ([ADR-0016](ADR-0016-tenant-self-registration.md)) anyone with a mailbox and a valid tax id format can create a tenant. The platform admin needs a way to stop a tenant that abuses the service, for example with fake bookings or an unpaid account, and to restore it later without losing data.

A suspension touches every party that acts at a tenant: its staff, the carriers that book there, the drivers of its bookings, visitors of its public booking links, and the jobs that send reminders or mark no-shows. Each of these enters through a different path. A rule that every route has to remember would be forgotten by the next route.

Three facts of the existing design shape the decision:

- `org` rows are readable by the tenant, its linked carriers, `carrier_at_tenant`, `driver` and `public` ([data model](../reference/data-model.md), `org` RLS). Any column on `org` is visible to those parties, whatever the API selects.
- `loadAccess` already reads the tenant's org row inside the request transaction for `Access.tenantStatus` (ON-02, change 03).
- The driver PWA shows its invalid-link screen only for 401. It treats every other failed poll as network trouble and keeps the last booking state on screen ([ADR-0008](ADR-0008-driver-token-pwa-delivery.md)).

## Options considered

**Where the state and the reason live.**

| Option | Verdict |
|---|---|
| `org.suspended_at` and `org.suspend_reason` | The reason would be readable by carriers, drivers and public visitors through `org` RLS. A reason such as "fake bookings reported by Trans-Pol" would be one careless `select` away from a carrier. Rejected. |
| **`org.suspended_at`, and the reason in a platform-only note** | The state is one nullable column next to `activated_at`. The reason sits in `tenant_note`, which only the platform party reads. |

**Where suspension is enforced.**

| Option | Verdict |
|---|---|
| A guard on each route | Every new route must remember it. Rejected. |
| In the scope resolvers | They run in their own short transactions before the request transaction, and they do not load the tenant status. Rejected. |
| **In `scoped()` right after `loadAccess`, in `openPublicLink`, and in `forEachTenant`** | One kernel place per path. The request check reuses the org row `loadAccess` already reads, so it adds no statement, and it covers every router of every area, including routers added later. |

**What the driver sees.**

| Option | Verdict |
|---|---|
| 403 `tenant_suspended` | The PWA would keep the last booking state on screen as "offline", which tells a driver at the gate something false. Rejected. |
| **401 `unauthorized`, as for a revoked link** | The PWA shows its existing invalid-link screen. No new string in the driver locales. |

**What a suspension revokes.**

| Option | Verdict |
|---|---|
| Revoke sessions, driver links and public links | Reactivation would need new invitations and links, and a tenant user with other memberships would be signed out of all of them. Rejected. |
| **Revoke nothing; refuse while suspended** | Reactivation restores every session, link and membership as it was. |

## Decision

### State and reason

- `org.suspended_at timestamptz null` holds the state, with the check `org_suspended_tenant_only` (`suspended_at is null or kind = 'tenant'`).
- The tenant status stays derived, never stored. `tenantStatus({ activatedAt, suspendedAt })` returns `suspended` first, then `onboarding` while `activated_at` is null, then `active`. Reactivation therefore returns a tenant to `onboarding` or `active`, whichever it was.
- The reason is the body of a `tenant_note` row of kind `suspended` or `reactivated`. `tenant_note` has platform select and insert policies only, so it is append-only and invisible to every other party. The hub's Overview shows the latest suspension note.
- `suspendTenant` and `reactivateTenant` (`core/platform/suspension.ts`) are guarded updates: `update org set suspended_at = $now where id = $1 and kind = 'tenant' and suspended_at is null returning id`, and the mirror for reactivation. Only the call that changes the row writes the note and the emails. A repeated or concurrent command answers 200 and writes nothing.

### Effect per party

| Party | While suspended | Enforced in |
|---|---|---|
| `tenant` with a user actor | 403 `tenant_suspended` on every request under `/api/t/:orgId`, including the context | `scoped()`, after `loadAccess` |
| `carrier_at_tenant` | 403 `tenant_suspended` on every request under `/api/c/:orgId/at/:tenantId` | `scoped()`, after `loadAccess` |
| `carrier` (cross-tenant) | Reads its own bookings at the tenant as before. The carrier context marks the tenant `suspended` with the carrier portal off, so the booking wizard does not offer it | `core/context/routes.carrier.ts` |
| `driver` | 401 `unauthorized`, as for a revoked link | `scoped()`, after `loadAccess` |
| `public` | 404 `not_found` for the link page and its registrations. Verifying a registration answers 401, as for an expired link, and leaves it pending. Logos stay served | `openPublicLink` |
| `platform` | Not affected: reads the hub, changes package and overrides, invites admins, adds notes | |
| `user`, `token`, `anonymous` | Not affected: they act at no tenant | |
| Jobs | `forEachTenant` skips suspended tenants unless the job passes `SuspendedTenants.include` | `forEachTenant` (`kernel/jobs.ts`) |

- **Staff.** A user who is also a member of another tenant keeps working there. The web renders a suspended page in the tenant area. A screen that was open when the suspension happened switches to it on the next action.
- **Carriers keep read access**, because their bookings are their own delivery schedule. A carrier needs to see what was booked at a tenant that stopped answering.
- **Public links answer 404**, because a prospective carrier must not learn that the operator is suspended. A suspended link reads like a closed one, as `openPublicLink` already answers for a disabled feature or an inactive site.
- **Jobs.** Reminders, no-show and holiday import use the default `SuspendedTenants.skip`. The retention job passes `SuspendedTenants.include`, because retention periods are a legal duty that a suspension does not pause. The outbox drains as before, so emails queued before the suspension still go out.
- **The error.** `tenant_suspended` answers 403 with the message "The organisation is suspended" and no details. No error body carries the reason.

### Emails to admins

On suspension, every `tenant_admin` member of the tenant whose account is not disabled gets one `core.tenant-suspended` email with the tenant name and the reason. On reactivation they get one `core.tenant-reactivated` email. Both are account emails, so they always send, in the member's locale or the platform default. Other roles and repeated commands get no email. The reason reaches the admins only by email: tenant staff can be large teams, and the reason can name a carrier.

### Rules for later changes

- **A new job** that iterates tenants chooses `SuspendedTenants.skip` (the default) or `SuspendedTenants.include`, and says why when it includes them.
- **A new party** that acts at one tenant states its suspension effect in this ADR's table and enforces it in `scoped()` or at its single entry point. `loadAccess` reads the tenant status for every party acting at one tenant, so the check needs no new read.
- **A new path into a tenant** that bypasses `scoped()` (like the public link routes) checks `Access.tenantStatus` itself.

## Consequences

- Suspension takes effect with the tenant's next request. A request that started before the suspension committed still finishes. Suspension is not a security boundary for in-flight requests.
- Sessions, driver links, public links, memberships and invitations survive a suspension. A driver link or a registration link that has not expired works again after reactivation.
- Bookings and data do not change. Bookings whose no-show deadline passed during a suspension are marked `no_show` on the first run after reactivation, with the carrier email. Suspensions are expected to be rare and short; a later change can let the job skip them, using the suspension history in `tenant_note`.
- A tenant admin cannot read the reason in the app, only in the email.
- The platform admin cannot edit or delete a note. A wrong reason is corrected by a new note.
