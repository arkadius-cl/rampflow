---
title: MVP scope
description: What rampflow's first release contains, with the core loop, testable user stories per role, entitlement keys and packages, the settings catalog, resolved questions, exclusions and non-functional targets.
type: explanation
audience: [agent, developer]
tags: [mvp, scope, booking, yard, safety, avis, entitlements, settings, i18n, gdpr]
status: draft
updated: 2026-10-20
related: [docs/explanation/research/market-and-features.md, docs/explanation/research/domain-standards.md, docs/explanation/research/tech-architecture.md, docs/explanation/domain-glossary.md]
---

# MVP scope

## Product goal

rampflow lets small and mid-sized warehouse operators replace phone, email and Excel dock planning with one web app across all their sites and countries. Carriers book for free, send the avis with the booking, and give their driver one link that carries the slot, the site's safety briefing in the driver's language, and the call to the dock. Gate and dock staff run the yard from that same booking, and its timestamps become the KPIs that justify the purchase.

## Core loop

1. The tenant admin sets up master data (MD-01 to MD-05) and invites carriers (TN-03, TN-04).
2. A carrier books a slot with the avis (BK-04, AV-01) and shares the driver link (CR-06).
3. The driver opens the link and completes the safety briefing (DR-01, SF-04).
4. The gate operator checks the truck in (YD-02).
5. A gate or dock operator assigns a dock and calls the truck (YD-07, DR-03).
6. The dock operator records docking, loading and completion (YD-08).
7. The gate operator checks the truck out (YD-05).
8. The dispatcher reads and exports the KPIs (RP-01, RP-02).

## Roles

| Role | Scope |
|---|---|
| `platform_admin` | all tenants |
| `tenant_admin` | whole tenant, with dispatcher rights |
| `dispatcher` | all sites of the tenant, with gate and dock rights |
| `gate_operator`, `dock_operator` | assigned sites |
| `carrier_admin`, `carrier_user` | own carrier org, at linked tenants |
| driver | one booking, by token |

A user has one role per membership and can belong to several orgs.

## Booking lifecycle

The booking carries the visit lifecycle as one state machine. Each transition writes an append-only event with actor and UTC time.

- Active: `confirmed`, `checked_in`, `called`, `at_dock`, `loading`, `done`.
- Final: `departed`, `cancelled`, `no_show`, `turned_away`.
- `requested` is reserved for booking approval (LATER).

Active bookings count against their bookable resource for the planned slot. Physical dock occupancy is a separate check (YD-07).

## User stories

Each story ID names one Playwright `describe` block. Criteria about races or time run as Vitest integration tests on real Postgres with an injectable clock.

### Platform admin

1. **PL-01 Create a tenant.** Creating tenant Acme with a package and an admin email gives Acme that package's entitlements and sends an invitation. Accepting it makes the user `tenant_admin` of Acme only.
2. **PL-02 Packages and overrides.** The admin sees the three packages read-only and sets per-tenant overrides with an optional expiry.
   - Both the packages page and the tenant's entitlements are grouped by module. Groups start collapsed, show per column how many of their features are on, and the open groups are stored per user, so they follow the admin to another computer.
   - Overrides can raise or lower a value, apply on the next request, and lapse at expiry.
   - Unknown or reserved keys return 400.
   - A route whose entitlement is off returns 403 `entitlement_required` with the key, and its navigation item is hidden.
3. **PL-03 Platform defaults.** The admin edits every setting with platform scope. Invalid values return 422 with the zod issue path. Tenants with an override keep it.
4. **PL-04 Usage.** A tenant list shows sites, docks, internal users and bookings this month against limits. A soft limit above 100% is flagged and blocks nothing. The platform admin searches tenants by name, filters by package, sorts by name or creation date and pages through the list; the list's state is in the URL ([ADR-0015](../decisions/ADR-0015-data-tables-and-entity-views.md)).

### Tenant admin

1. **TN-01 Staff.** The admin invites users with a role, plus a site list for gate and dock operators.
   - At `core.max_internal_users` the invite returns 409 `limit_reached`.
   - A gate operator of site A gets 404 for every site B resource.
   - Removing a member ends that user's sessions for this tenant.
2. **TN-02 Settings.** Each tenant and site settings field shows the effective value and its source (Default, Platform, Tenant, Site).
   - A site value overrides only that site. "Reset to inherited" deletes the override.
   - Settings whose entitlement is off are hidden, and writes return 403.
   - Retention values above the platform maximum return 422.
3. **TN-03 Invite carriers.** The admin invites a carrier by company name and email.
   - Accepting with an existing carrier admin's email links that org instead of creating one. A `carrier_user` cannot bind the company (403).
   - A deactivated link blocks new bookings by that carrier (403). Existing bookings stay visible to both sides.
4. **TN-04 Public booking link.** Per site, the admin enables a public link and picks `auto_approve` or `approval_required`.
   - Approving a pending registration links the carrier and emails it. Rejecting emails the reason.
   - A disabled link returns 404.
5. **TN-05 Logo.** A PNG or JPEG up to 256 KB appears on carrier booking pages, emails and the driver PWA. SVG is rejected.
6. **TN-06 Data subject requests.** The admin finds drivers by name, phone or plate.
   - Export returns JSON of matching bookings and acknowledgements.
   - Erase pseudonymizes matching bookings with the retention job's function. Acknowledgements under retention become restricted, not deleted.
7. **MD-01 Sites.** A site has name, address, country, ISO 3166-2 subdivision, IANA time zone and default locale. An unknown zone returns 422. A site beyond `core.max_sites` returns 409.
8. **MD-02 Halls and docks.** A dock belongs to a hall and has a code unique per site, door type, temperature zone, ADR flag and status (`active`, `maintenance`, `inactive`). `core.max_docks` counts active and maintenance docks.
9. **MD-03 Bookable resources.** The admin groups docks into pools (name, directions, optional capacity cap, optional daily cap) or marks a dock single.
   - Adding a dock that already belongs to a resource returns 409.
   - Pools need `booking.pools`.
   - Reducing capacity never cancels bookings. The plan board marks affected bookings "over capacity".
10. **MD-04 Hours and closures.** Weekly hours per site, optional narrower hours per resource, and closures or blocks on a site or resource.
    - With `booking.close_on_public_holidays`, the subdivision's public holidays exist as closures for the next 400 days. The admin can reopen a date.
    - No start time is offered outside hours or inside a closure.
11. **MD-05 Load types.** Name (de, en), direction, duration, buffer, eligible resources and a carrier-bookable flag. Durations are fixed, or tiered by load units with `booking.duration_rules`.
    - New sites get the three seeded load types from domain research §2. With them, 20 pallets take 60 minutes and 40 take 90.
12. **SF-01 Author a briefing.** An instruction applies to chosen sites or all sites. Each version holds content per locale (text blocks, bundled pictograms) flagged `source`, `machine` or `reviewed`.
    - A new instruction starts from the 12-language platform template. Content outside de and en is flagged `machine`.
    - Published versions are immutable. Editing creates a draft.
    - Publishing a "material change" invalidates earlier acknowledgements.
    - `safety.max_briefing_templates` limits the instruction count.
13. **SF-02 Quiz.** With `safety.quiz`, each locale has multiple-choice questions with one correct answer. Publishing needs 3 to 5 questions per published locale.
14. **SF-03 Acknowledgement register.** Staff list and export (CSV) acknowledgements by site, carrier, driver name, version and expiry.

### Dispatcher

1. **BK-01 Plan board.** A day view per site has one column per bookable resource. Pools show booked against capacity per grid slot.
   - Times show in site time with zone label, for example "08:30 CET".
   - A booking made elsewhere appears within 30 seconds without reload.
   - A list view offers the same data to keyboard and screen-reader users.
2. **BK-02 Staff booking.** The dispatcher books for a linked carrier or a free-text carrier name. Capacity applies; lead time and horizon do not.
   - On a full resource, the `booking.force` permission books anyway with a mandatory reason, recorded in the event log.
   - "Walk-in now" starts at the current grid slot and continues to check-in.
3. **BK-03 Staff edit and cancel.** Staff change or cancel any booking before check-in, ignoring the carrier cutoff. Reschedules re-check capacity. The booking carrier user gets an email for each change.
4. **RP-01 KPI dashboard.** Filters are site, date range in site-local days, resource and carrier. It shows on-time rate (early and late apart), no-show rate, late-cancellation rate, wait, dock dwell, turnaround, dock utilisation, portal adoption, and visits above `yard.standgeld_flag_minutes`.
   - Definitions follow the market research KPI table, except that a no-show uses the BK-08 deadline (`starts_at + yard.no_show_after_minutes`), so the job, the carrier email and the KPI agree. [Booking lifecycle](../reference/booking-lifecycle.md#kpis) holds the exact definitions and a seeded fixture of 10 visits with the expected values.
   - A visit missing a timestamp is left out only of KPIs that need it.
5. **RP-02 CSV export.** The visit list and the KPI table export as UTF-8 CSV with BOM. The delimiter is `;` for de users and `,` for en. Timestamps are ISO 8601 with the site offset.

### Carrier

1. **CR-01 Accept an invitation.** A new user enters name and company, then signs in by password or magic link. An existing carrier user accepts after signing in. Invitation tokens are single use and expire after 7 days.
2. **CR-02 Register through a public link.** The form asks for company name, country, contact name and email. A magic link verifies the email.
   - With `auto_approve`, the carrier can book at once. With `approval_required`, booking pages show "pending" until approval.
   - A known email gets a sign-in prompt, and the request attaches to the existing org.
3. **CR-03 Sign in.** Carrier users sign in by email and password, or by magic link.
   - A magic link is single use and expires after 15 minutes.
   - Five failed passwords in 15 minutes for one email and IP return 429.
   - A password reset revokes all other sessions.
4. **CR-04 Carrier users.** A carrier admin invites colleagues. All users of a carrier org see all its bookings.
5. **CR-05 Bookings across tenants.** One list shows the org's bookings at all linked tenants, filterable by tenant, site, date and status, with the timeline from gate-in to gate-out. Another carrier's booking returns 404.
6. **CR-06 Share the driver link.** Booking detail offers copy, email to driver (address and locale), and the share sheet where the Web Share API exists.
   - The link is `https://<host>/d#<token>`.
   - "Regenerate" revokes the old token, whose link then shows "no longer valid".
7. **BK-04 Book a slot.** The carrier picks tenant, site, load type, date and an offered start time, fills in the avis, and confirms.
   - Offered times respect hours, closures, capacity, daily cap, grid, `booking.min_lead_minutes` and `booking.horizon_days`.
   - When two carriers race for the last capacity unit, one gets 201 and the other 409 with a refreshed list.
   - The confirmation page and email show the booking code, its QR code, the address, and the slot in site time.
   - A scripted returning carrier using BK-06 books in under 3 minutes.
8. **BK-05 Change and cancel.** Until `booking.cancel_cutoff_minutes` before start, the carrier reschedules (capacity re-checked) or cancels.
   - After the cutoff, both actions are disabled and the site phone number shows.
   - Cancelling frees capacity at once and revokes the driver link.
9. **BK-06 Book again.** "Book again" prefills site, load type and avis, leaving references, date and driver empty.
10. **AV-01 Avis.** The avis holds the fields of domain research §1 except loading method, customs, SSCC and attachments.
    - Plates are stored uppercase without separators and phones as E.164. Invalid input returns 422 with the field path.
    - `UN123` fails. `UN1203` with class 3 passes.
    - The API enforces the `avis.*` settings.
11. **AV-02 Edit the avis.** Carriers edit until the cutoff, staff until departure. If new load units give a duration that no longer fits, the edit returns 409 and the old data stays.

### Driver

1. **DR-01 Open the link.** The PWA posts the fragment token to an exchange endpoint, gets a cookie for this booking, and removes the fragment.
   - No request URL or log line contains the token.
   - The page shows logo, site, address with map link, slot, booking code with QR, status and privacy notice.
   - The page shows no driver name, phone or plate.
   - Unknown, expired and revoked tokens get one generic message.
2. **DR-02 Language.** The PWA picks the browser language from the 12, falls back to en, and offers a one-tap switcher. Machine-translated locales show a badge.
3. **DR-03 Wait and dock call.** After check-in the PWA shows "wait". A call shows "Go to dock D-03, hall 2" from a translated template and vibrates where allowed.
   - The PWA polls every 15 seconds while visible, so a call appears within 20 seconds.
   - Offline, it shows the last known state with its time.
4. **SF-04 Complete the briefing.** The driver reads the content in an available locale, answers the quiz if one exists, types their name and ticks the confirmation.
   - A failed quiz shows the content again. Retries are unlimited and counted.
   - The acknowledgement stores instruction, version, locale, content hash, score, attempts, name, statement shown, channel, and expiry from `safety.validity_days` (0 means this visit only).
   - The phone keeps a safety pass per tenant. The next booking at that tenant opened on that phone shows "valid until" instead of the briefing.

### Gate operator

1. **YD-01 Expected trucks.** Today's bookings for my sites show carrier, plate, load type, load units, safety status and punctuality. Search works by booking code (keyboard-wedge scanners too), plate, reference or carrier.
2. **YD-02 Check in.** Check-in records the plate as seen and punctuality using `yard.early_tolerance_minutes` and `yard.grace_minutes`.
   - With `safety.gate_enforcement` and `safety.require_for_checkin`, check-in stays disabled until a valid acknowledgement is linked. Otherwise a warning shows.
   - The operator can link an acknowledgement found by driver name, or start the briefing on the gate device (channel `staff`).
   - A `no_show` booking can still check in that site-local day, as a late arrival.
   - "Turn away" requires a reason from the domain research list.
3. **YD-03 Walk-in.** For an unbooked truck, BK-02 "walk-in now" and check-in run as one flow.
4. **YD-04 On-site list.** Trucks on site show state, time since gate-in and wait. Trucks above `yard.standgeld_flag_minutes` are flagged.
5. **YD-05 Check out.** Departure can be recorded from any on-site state. Leaving before `done` requires a reason. The driver link expires `privacy.retention.driver_link_hours` later.

### Dock operator

1. **YD-06 Dock overview.** Docks grouped by hall show the current truck and its state, next to a queue of checked-in trucks ordered by slot start.
2. **YD-07 Assign and call.** The operator picks a dock and calls the truck. Single-dock bookings preselect their dock. Pool bookings suggest free member docks. Other active docks are selectable with a warning.
   - A dock holding another truck in `called`, `at_dock` or `loading` returns 409.
   - Reassigning before `at_dock` updates the driver PWA.
   - The driver phone shows as a `tel:` link. Gate operators can call too.
3. **YD-08 Dock progress.** One tap each sets `at_dock`, `loading` and `done`. `done` takes actual load units and a discrepancy note and frees the dock.
   - Skipped states leave their timestamps empty.
   - Tenant admins see the event log with actors.

### System jobs

1. **BK-07 Reminder.** With `notify.reminders`, the booking carrier user gets one email `notify.reminder_hours_before` the start, unless cancelled.
2. **BK-08 No-show.** Without check-in by slot start plus `yard.no_show_after_minutes`, the booking becomes `no_show`, frees capacity and emails the carrier. A second run changes nothing.
3. **PL-05 Retention job.** `retention:run` applies the `privacy.retention.*` settings and logs counts without personal data. A second run changes nothing. Deployment config schedules it.

## Modules and entitlements

Every module exports one manifest through `defineModule` in `packages/shared`, declaring entitlements, permissions, settings and navigation. An entitlement is a feature or a limit (optionally soft). LATER keys carry `reserved: true`, resolve to off, and cannot appear in packages or overrides.

A package maps keys to `boolean`, `number` or `null` (unlimited). The package overrides the catalog default, and an explicit tenant override beats both. CI fails on unknown or reserved keys in packages, navigation or settings. A module turns off when a module it depends on is off.

| Module | Implemented | Reserved |
|---|---|---|
| core | `core.max_sites`, `core.max_docks`, `core.max_internal_users` | `core.sso`, `core.audit_log` |
| booking | `booking.carrier_portal`, `booking.public_link`, `booking.pools`, `booking.duration_rules`, `booking.max_bookings_per_month` (soft) | `booking.guest_link`, `booking.recurring`, `booking.carrier_quotas`, `booking.approval`, `booking.late_policy` |
| avis | `avis.basic` | `avis.custom_fields`, `avis.lines`, `avis.attachments` |
| yard | `yard.checkin_qr` (gate check-in and out), `yard.call_to_dock` (dock overview, call, progress) | `yard.checkin_kiosk`, `yard.board`, `yard.queue`, `yard.map` |
| safety | `safety.briefings`, `safety.validity`, `safety.quiz`, `safety.gate_enforcement`, `safety.max_briefing_templates` | `safety.media` |
| notify | `notify.email`, `notify.reminders` | `notify.sms`, `notify.max_sms_per_month` |
| report | `report.basic`, `report.export` | `report.carrier_scorecard`, `report.scheduled` |
| integration | none | `integration.api`, `integration.webhooks`, `integration.edi`, `integration.max_api_calls_per_day` |
| brand | `brand.logo` | `brand.white_label`, `brand.custom_domain` |

`booking.public_link` is new, because the research key `booking.guest_link` means booking without an account. Without `safety.validity`, every visit needs a new acknowledgement. `notify.email` gates booking emails only; account emails always send.

### Packages

```yaml
start:
  limits: {core.max_sites: 1, core.max_docks: 10, core.max_internal_users: 10,
    booking.max_bookings_per_month: 1500, safety.max_briefing_templates: 2}
  features: [booking.carrier_portal, booking.public_link, booking.pools, booking.duration_rules,
    avis.basic, yard.checkin_qr, yard.call_to_dock, safety.briefings, safety.validity,
    notify.email, notify.reminders, report.basic, report.export, brand.logo]
pro:
  limits: {core.max_sites: 5, core.max_docks: 60, core.max_internal_users: 75,
    booking.max_bookings_per_month: 10000, safety.max_briefing_templates: 20}
  features: [<start>, safety.quiz, safety.gate_enforcement]
enterprise:
  limits: all null
  features: [<pro>]
```

In the MVP, Enterprise differs from Pro only in limits. Reserved keys join the packages later as the market research places them.

## Settings catalog

Scopes are P (platform), T (tenant) and S (site). Resolution runs site, tenant, platform, code default. A setting whose entitlement is off is hidden and rejected.

| Key | Type | Default | Scopes | Notes |
|---|---|---|---|---|
| `booking.slot_grid_minutes` | 5, 10, 15, 20, 30, 60 | 30 | P T S | |
| `booking.min_lead_minutes` | 0..10080 | 120 | P T S | |
| `booking.horizon_days` | 1..365 | 30 | P T S | |
| `booking.cancel_cutoff_minutes` | 0..10080 | 120 | P T S | carrier changes |
| `booking.close_on_public_holidays` | bool | true | P T S | |
| `booking.require_plate` | bool | false | P T S | at booking |
| `booking.public_link_enabled` | bool | false | S | `booking.public_link` |
| `booking.public_registration_mode` | `auto_approve`, `approval_required` | `approval_required` | T S | `booking.public_link` |
| `avis.required_reference_types` | list | empty, any one | P T S | |
| `avis.unique_references` | bool | false | T S | per site |
| `avis.require_gross_weight` | bool | false | P T S | |
| `avis.require_driver_phone` | bool | false | P T S | |
| `yard.early_tolerance_minutes` | 0..240 | 30 | P T S | on-time start |
| `yard.grace_minutes` | 0..240 | 15 | P T S | on-time end |
| `yard.no_show_after_minutes` | 15..1440 | 60 | P T S | after slot start |
| `yard.standgeld_flag_minutes` | 30..1440 | 120 | P T S | ADSp/VBGL 2 h |
| `safety.validity_days` | 0..730 | 365 | P T S | 0 = per visit |
| `safety.require_for_checkin` | bool | true | P T S | `safety.gate_enforcement` |
| `safety.quiz_pass_percent` | 50..100 | 100 | P T | `safety.quiz` |
| `notify.reminder_hours_before` | 1..72 | 24 | P T S | `notify.reminders` |
| `i18n.default_locale` | `de`, `en`, `pl` | `de` | P T S | users without a locale |
| `privacy.notice_url` | URL or null | null | P T S | null shows the platform Art. 14 template |
| `privacy.retention.driver_phone_days` | 1..30 | 7 | P T | |
| `privacy.retention.driver_identity_days` | 1..395 | 90 | P T | then pseudonymize |
| `privacy.retention.visit_days` | 30..3650 | 395 | P T | de-personalized records |
| `privacy.retention.safety_after_expiry_days` | 0..1095 | 730 | P T | |
| `privacy.retention.audit_log_days` | 30..730 | 365 | P T | |
| `privacy.retention.driver_link_hours` | 1..168 | 24 | P | after departure, cap 7 days after slot |
| `privacy.retention.carrier_inactive_days` | 365..1095 | 730 | P | 30 days' notice |

## Resolved open questions

| Question | Decision | Source |
|---|---|---|
| Pools and single docks? | One `bookable_resource`, kind `pool` or `single`. A dock belongs to at most one, and pooled docks are never booked directly. | Ruling 1; narrows domain §2 |
| Physical occupancy? | Checked at assignment, one truck per dock in `called`, `at_dock` or `loading`. Capacity counts planned slots only. | Ruling 1; tech §7 |
| Booking and visit as two aggregates? | One state machine on the booking. Walk-ins are staff bookings. | Glossary over domain §3 |
| Booking without an account? | No. Invitation or public link, then an account with magic link. | Ruling 2; market MUST 5 disagrees |
| better-auth magic-link plugin? | No. Own single-use token table, as for invitations. | Ruling 2; tech §4 advisories |
| Dock call without SMS? | PWA polling plus staff calling the driver's phone. | Ruling 3; market MUST 9 |
| Unregistered carrier on the phone? | Free-text carrier name on a staff booking. | This doc |
| Languages? | de, en and pl for staff and carriers (pl accepted from the scope review: largest foreign fleet group, strings exist for drivers). 12 driver languages, machine strings badged. Briefings per tenant and locale. | Ruling 4 amended; domain §4, §6 |
| Safety model? | Versions per locale, 3 to 5 questions, 100% with retries, typed name and checkbox, 365 days, check-in block. | Ruling 5; domain §4 |
| Acknowledgement reuse without driver accounts? | Safety pass on the phone plus gate lookup by name. | This doc |
| Forwarded driver link? | Shows no personal data, so no step-up. | Domain §5, simplified |
| Driver link format and lifetime? | `/d#<token>`, 24 h after departure, at most 7 days after slot. | Domain §5 over tech §4 |
| Late arrivals? | The gate shows punctuality; the operator decides. | Market SHOULD 3 |
| Key catalog? | Market catalog plus `booking.public_link`; tech §5 examples dropped. | Market packaging |
| Overrides and unlimited? | Explicit overrides win, may lower, may expire. Unlimited is `null`, not `-1`. | Tech §5; market for `null` |
| Cancel cutoff default? | 120 minutes. | Domain §2 over tech §5 (24 h) |
| Holidays? | Auto-imported closures in every country; tenants reopen dates. | Domain §6, simplified |
| Capacity below bookings? | No auto-cancel; the plan board flags them. | This doc |
| Works council? | No per-operator report figures; actors visible to tenant admins only. | Domain §5 |
| Ruling 6 features? | LATER; the core loop works without each. | Ruling 6 |
| KPIs? | Market definitions, one dashboard, CSV. | Ruling 7 |
| Retention? | Domain defaults, idempotent job, deployment schedules it. | Ruling 8; domain §5 |

## Out of scope (LATER)

- Booking: account-less booking, recurring bookings, carrier quotas, approval, automatic late policy, trucks-on-site cap.
- Avis: attachments, custom fields, order lines, SSCC, customs, EDI.
- Yard: parking map, kiosk, TV board, driver queue position, driver self check-in, geofencing, plate recognition, barriers, scales, trailers.
- Notifications: SMS, web push, chat apps.
- Safety: media uploads, drawn signatures.
- Reports: carrier scorecard, scheduled reports.
- Platform: billing, SSO, white label, custom domains, public API, webhooks, audit-log UI, impersonation, locked settings.
- More staff UI languages, right-to-left scripts, native apps.
- Load test at twice the design load, Firefox and WebKit E2E runs.

## Non-functional requirements

### Scale

Design load is 20 tenants, 100 sites, 1,000 docks, 500 carrier orgs, 5,000 named users, 120,000 bookings per month. Peak load is 300 concurrent staff and carrier sessions plus 2,000 open driver PWAs. One API process and one Postgres 18 carry this. Caches invalidate through `LISTEN/NOTIFY` and jobs run as singletons, so a second API instance also works.

### Performance

Targets are p95 at design load. The MVP checks them with seeded data in integration tests; a load test at twice the design load is LATER.

- API reads 300 ms, writes 500 ms.
- Availability for one resource-day 200 ms. Plan board with 30 resources 1 s. KPIs for one site over 90 days 2 s.
- Driver PWA at most 150 KB gzip initial JavaScript and first render within 3 s under Lighthouse mobile throttling.
- Emails reach SMTP within 60 s through a transactional outbox, so rolled-back writes send nothing.

### Security

- Tenant isolation uses application scoping plus Postgres RLS, with the app connected as a `NOBYPASSRLS` non-owner role. The server checks the active org against memberships.
- CI calls every repository read and API route as another tenant, carrier and driver booking, expecting 404 or empty. A route without this leak test fails CI.
- Driver tokens have 256 random bits, travel in the fragment, and are exchanged by POST for an `HttpOnly; Secure; SameSite=Strict` cookie. The server stores SHA-256 hashes only and rate-limits exchange to 10 per minute per IP.
- The driver PWA sends `Referrer-Policy: no-referrer` and loads no third-party scripts.
- Magic-link, invitation and safety-pass tokens are hashed. Safety passes expire with their acknowledgement; the others are single use.
- Passwords use better-auth scrypt with at least 10 characters and verified email. Public sign-up exists only through an enabled public link.
- Mutating requests need a same-origin `Origin` header.
- The API enforces entitlements and permissions and checks limits inside write transactions.
- Logs hold no tokens, cookies, phones or plates. better-auth is pinned exactly.

### Accessibility

WCAG 2.2 AA. Playwright runs axe on each story's main screen and allows no serious or critical violation. Driver and gate touch targets are at least 44 CSS px. Status never relies on color alone. The call screen shows the dock number at 48 px or more.

### Browsers and devices

| Context | Support |
|---|---|
| Office desktop | Current and previous Chrome, Edge, Firefox, Safari; 1280×720 and up |
| Gate and dock tablet | iPadOS 17+ Safari, Android 12+ Chrome; 1024×768 and up; keyboard-wedge scanners |
| Driver phone | iOS 16.4+ Safari, Android 10+ Chrome; 360×640 and up; 2 GB RAM Android as low end; no install |

E2E covers Chromium for staff and Pixel emulation (Chromium) for drivers. Firefox and WebKit runs are LATER.

### Time zones

- Instants are UTC `timestamptz`. Sites store an IANA zone, and bookings snapshot it.
- Every role sees site time with zone abbreviation, plus their own time when it differs.
- The slot grid walks local wall-clock times, skips spring-forward gaps, and labels both instants in autumn folds.
- Durations are elapsed minutes. Daily caps and KPI days follow the site-local day.
- Tests cover Europe/Berlin on 2026-10-25 and 2027-03-28, and a Europe/Bucharest site viewed from Berlin.

### Internationalization

All strings live in i18next catalogs, one namespace per module. CI fails when a key is missing in de, en, pl or any driver locale. Each driver locale carries a `machine` or `reviewed` flag for the DR-02 badge.
