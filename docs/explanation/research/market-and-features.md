---
title: Market and feature research
description: Survey of 17 dock scheduling, gate and yard products with a feature matrix, MUST/SHOULD/LATER scope for an SME MVP, entitlement-based packaging, carrier and driver pain points, and KPI definitions.
type: explanation
audience: [agent, developer]
tags: [research, market, features, packaging, entitlements]
status: stable
updated: 2026-10-19
---

# Market and feature research

## Summary

- **The common core is small and stable.** Every booking product reviewed has a carrier self-booking portal, capacity rules (opening hours, slot length, duration by load type), an internal day plan, email confirmations, basic reports and multi-site support. This is the MVP.
- **Carriers almost never pick a dock.** Opendock books against a *load type* mapped to docks. SAP DAS creates *provisional appointments* at a docking location and assigns the loading point later. C3 caps capacity per time slice. Cargoclix's per-ramp grid is the exception. rampflow should make the pool the default; a single bookable dock is a pool of one.
- **Who pays splits the market.** In DACH retail, carriers pay per slot: Transporeon charges carriers or suppliers EUR 2.73 per slot plus EUR 0.23 per SMS; Cargoclix charges EUR 0.50, paid by whichever party the customer chooses. Opendock, LoadingCalendar, TradeLink and GoRamp are free for carriers. A BVL project found that small forwarders cannot pass slot fees on. **rampflow should be free for carriers, and say so loudly.**
- **Safety briefings and driver languages are a DACH gap.** None of the US dock schedulers reviewed offers briefings. DACH gate and visitor specialists sell them (Peripass, TradeLink, Heylog, Loady, WELCOME, friendlyway) in 17 to 29 languages without an app. In slot-booking tools the briefing is at best an add-on or a gate step. One native flow of *slot booking, avis and multilingual briefing before arrival* behind a single deep link is rampflow's wedge.
- **Prices range from EUR 99 to EUR 1,299 per month.** LoadingCalendar is EUR 99 flat; Peripass starts at EUR 1,299 per site; US schedulers sit at USD 175 to 500; Opendock is estimated at USD 6,000 to 7,000 per facility per year. A per-site tiered price of EUR 150 to 600 per month is defensible.
- **SME scale sets the limits.** In Cargoclix's 2019 survey of 148 ramp operators (509 sites), 80% handle 11 to 50 trucks per day, about 250 to 1,100 bookings per site per month.

Capability and performance claims come from vendor marketing unless noted. In the matrix, "–" means *not found in the sources reviewed*, not *absent*.

## Vendors

| # | Vendor / product | Segment | One-line positioning |
|---|---|---|---|
| 1 | **Cargoclix SLOT** (+ TERMINAL, SAFE CHECK-IN, ETA) | DACH SME to mid | Freiburg slot booking at EUR 0.50 per booking, no fixed fees; driver app with geofenced check-in. |
| 2 | **Transporeon Time Slot Management** (incl. ex-Mercareon; Trimble since 2023) | EU retail and industry, enterprise | Network with one carrier portal across all shippers; shippers subscribe, retail carriers pay per slot. |
| 3 | **Opendock Nova** (Loadsmart) | US mid to large | Free carrier account or guest booking, valid at all Opendock facilities; YMS with self check-in since 2025. |
| 4 | **DataDocks** | SME to mid (USD pricing) | Rule-heavy dock calendar with yard, detention reports and a branded carrier link. |
| 5 | **C3 Reservations** (C3 Solutions) | Mid to enterprise DCs | Rule-driven duration and capacity, carrier report card, standing appointments. |
| 6 | **Velostics** | Mid-market | Module ladder Slot, Dock, Yard, Network; Pass check-in and Voice AI add-ons. |
| 7 | **GoRamp** | EU (EN/PL/LT), SME to mid | Scheduling, yard map, check-in and freight procurement. |
| 8 | **LoadingCalendar** (Cargoson) | EU small warehouses | EUR 99 per month flat, unlimited; branded portal, no carrier account; scheduling only. |
| 9 | **Peripass** | EU gate/yard | Kiosk and mobile driver self-registration, safety tests, virtual yard. |
| 10 | **TradeLink** | DACH (Munich) | Slots, yard and supplier collaboration; app-free QR check-in in 20+ languages; free for partners. |
| 11 | **LOGSOL RampMan** | DACH Mittelstand | Web slot booking, recurring slots, dock restrictions, SMS truck call-up, REST API. |
| 12 | **YardSlot360 / YardCloud360** (Rüdiger Wöhrl) | DACH | Slot rules incl. carrier quotas and lead time; waiting-area management. |
| 13 | **Heylog Digitale Pforte** | DACH | App-free check-in via QR, SMS or WhatsApp; 24-language auto-translation. |
| 14 | **Brendel DockScheduler** | DACH small producers | Newcomer for one to several sites; no live customer as of 25.09.2026. |
| 15 | **SAP Dock Appointment Scheduling** | Enterprise reference | Loading points in docking locations, provisional appointments, EWM/TM integration. |
| 16 | **Kaleris YMS** (ex-PINC) | Enterprise yard reference | RFID/GPS yard tracking, kiosk plus RFID tag, AI gate vision. |
| 17 | **FourKites Yard** | Enterprise yard reference | Computer-vision gate, facility twin, ETA-driven booking agent. |

Driver-side specialists also checked: **Loady** (17-language briefings, DGUV records), **WELCOME** (29 languages, briefing signed ahead), **friendlyway** (pre-arrival briefing with quiz), **Ixaro** (free booking plus pagers).

## Feature matrix

### A. Booking side

| Vendor | Carrier booking and onboarding | Carrier cost | Booking rules | Dock vs pool | Recurring | Avis / ASN fields | Notifications |
|---|---|---|---|---|---|---|---|
| Cargoclix | Per-ramp schedule grid. Registration link per shipper; support activates the account by the next working day. | EUR 0.50 per booking; customer chooses whether shipper or booker pays | Booking period per ramp; frozen after confirmation; staff and forklift capacity | Per ramp | Series slots on request to the operator | Quantities and quality per shipment | Email; SMS validation of driver mobile number |
| Transporeon | One portal across all shippers; shipper grants access to the carrier's Transporeon ID | EUR 2.73 per slot plus EUR 0.23 per SMS (retail price sheet); EUR 2.34 (Wanzl) | Capacity templates, booking rules, quotas. Zalando setup: weekly slot release, book by 23:59 the day before | Capacity and quotas per site | Reserved and recurring slots per carrier group | Shipping-notice ID, pallets and boxes, delivery or vehicle type | Reminders, SMS |
| Opendock | Free account or guest booking; search facility, then load type, then slot | Free | Max days ahead, minimum hours before booking, edit and cancel; handling time per load type; optional "Requested" approval | Load type mapped to docks (pool-like) | – | refNumber (PO, can be required and unique) plus custom-field template (text, number, document) | Email and SMS status updates |
| DataDocks | Branded link; coordinator sets carrier access level | – | Dock restrictions, time blocks, approval for new carriers, buffer between loads, weight caps, compound rules | Rule-based dock restriction | – | BOL / POD required before submit | Reminders 2 h and 30 min before |
| C3 | Self-serve portal with guided wizards; carriers manage their own users | – | Duration from PO, load type, carrier or supplier; capacity per time slice (bookings, pallets, lifts); truck-type limits | Capacity per shift and time slice | Standing appointments | PO header and lines; attachments | Configurable email; no-show alerts |
| Velostics | Self-booking portal; several calendars per facility; Voice AI booking | – | – | Calendar, then "intelligent dock assignment" | – | PO / load verification | Detention alerts; Voice AI |
| GoRamp | Carrier portal with PO validation | Free (GoRamp claim) | – | Dynamic dock planning | – | PO number | Carrier and driver messaging |
| LoadingCalendar | Branded portal; email verification, no account | Free | Duration by quantity; dock reservations | Dock reservations | Yes | Documents and photos | Email |
| TradeLink | No registration for delivery partners | Free | Rule engine and capacity limits (basic in Starter, pro in higher tiers) | – | – | Order, avis and delivery-note matching | SMS with read receipts |
| RampMan | Supplier self-booking or manual | – | Fixed and priority slots; restrictions by truck type, load type, process or carrier | Dock restrictions | Recurring series | – | Email and SMS |
| YardSlot360 | 24/7 web portal | – | Product groups, blocked times, minimum lead time, per-carrier quotas, JIT and priority windows | – | – | – | Email and SMS |
| DockScheduler | Self-booking; carrier sees the rejection reason | – | Temperature-zone matching | System assigns the dock | – | Weighing slip attached | SMS call to dock |
| SAP DAS | External carrier role; guest URL for carriers not yet onboarded | Licence | Planning window; restricted period; 1 slot up to 7 days | Provisional appointment at docking location, loading point assigned later | – | From EWM/TM | Email to guests |

### B. Gate, yard and commercial side

| Vendor | Driver check-in | Driver languages | Safety briefing | Yard / queue | Dock board | Reporting | API / EDI | Multi-site | White-label | Pricing |
|---|---|---|---|---|---|---|---|---|---|---|
| Cargoclix | TERMINAL kiosk; app with geofence of 100 m to 1 km; QR on confirmation | Auto-translation | Visitor management incl. safety briefing | Real-time yard view | – | Timestamps, KPI dashboards | ERP/WMS/SAP (one-off development cost) | Yes, across countries | – | Per booking, no fixed fee |
| Transporeon | Real-Time Yard check-in; zekju messaging (WhatsApp, Viber) | Auto-translation | – | Real-Time Yard Management | – | KPIs | GS1 APIs, TMS | Templates reused across sites | – | Shipper: sites, docks, volume |
| Opendock | Kiosk or mobile; camera-based SmartGate | – | – | YMS, two-way SMS | TV mode | Scorecards, dwell, utilisation, BI export | Open API, SSO (enterprise) | Yes | – | Quote, about USD 6 to 7k per facility per year (competitor estimate) |
| DataDocks | QR or tablet (third-party listing) | – | – | Yard, trailers, jockey moves | Live dock view | Detention, carrier performance | WMS/TMS, API | Yes | Branded link | From USD 249 per month (Capterra); about USD 500 (competitor) |
| C3 | Staff PWA timestamps | Multilingual UI (directory listing) | – | Separate C3 Yard | Calendar | Report card, no-show report, daily extract | Web services, SFTP, SAP | Yes | – | Implementation fee plus annual usage fee; 4 programmes |
| Velostics | Pass add-on: QR, forms, BOL capture | – | Voice AI safety alerts | Yard tier | – | Dwell, detention, turn time, benchmarking | REST, TMS (fee per integration) | Yes | – | Annual fee by facilities or shipments |
| GoRamp | Mobile self check-in, plate scan | – | Yard safety checks | Live yard map | – | Dwell, utilisation, carrier | API/EDI | Yes | – | From USD 175 to 249 per month (third-party) |
| LoadingCalendar | Staff sets the status | – | – | No | Colour-coded calendar | Statistics, Excel export | REST | Unlimited | Branded portal | EUR 99 per month flat |
| Peripass | Kiosk (EUR 149 per month rental); mobile portal add-on EUR 249 per month; ID check add-on | – | Safety tests and blacklisting (add-on in the entry tier) | Digital twin and dispatch | – | – | API (Basic tier and up), access control | Per site | – | From EUR 1,299 per site per month |
| TradeLink | QR on own phone or any tablet, no app | 20+ | Signature at check-in | Yard (mid tier) | – | Insights cockpit | API (top tier) | Teams | – | 3 tiers by team count |
| RampMan | Staff tablet timestamps | "Large selection" | – | Listed as YMS | – | – | REST, access control | – | – | Subscription, one-off or rental |
| YardSlot360 | Separate module | – | – | Waiting-area buffer | – | Utilisation, peaks, lateness, supplier performance | Separate module | – | – | Platform from EUR 790 per month |
| Heylog | QR, SMS or WhatsApp; geolocation; no app | 24 | Documents confirmed in the driver's language | Live status | – | – | "No integration" | – | – | Quote |
| DockScheduler | At the gatehouse, no app | – | – | – | All docks on one screen | Wait, dwell, reliability | ERP API plus device API (plate readers, barriers, scales) | 1 to several | – | Unpublished; 30-day trial |
| SAP DAS | Checkpoint and dock arrival/departure | – | – | SAP Yard Logistics | – | – | EWM/TM APIs | Yes | – | Licence |
| Kaleris | Kiosk plus RFID tag; mobile pre-check-in; AI gate | – | – | RFID/GPS yard tracking | – | – | – | Yes | – | Quote |
| FourKites | Computer-vision gate | – | – | Facility twin; door by load type | – | Dwell analytics | Carrier and yard systems | Yes | – | Quote |

**Reading the matrix:**

- **Near-universal:** carrier portal, capacity rules, email notifications, reporting, multi-site, API.
- **Common:** check-in in some form, yard view, SMS.
- **Rare:** recurring bookings (5 of 13 booking tools), a dock status board as a named feature (about 4), white-label (2), and safety briefings (only DACH gate specialists plus Cargoclix).

## MUST, SHOULD, LATER

### MUST (SME MVP)

1. **Sites, halls, docks and pools with a calendar.** Opening hours, closures and holidays per site, with tenant and site overrides of platform defaults. *Why:* every vendor models this; SAP calls it business hours and block time.
2. **Pool-first capacity.** Carriers book against a pool or capacity class; the dock is assigned later by an operator or a rule. Capacity is parallel slots, optionally capped by pallets per time slice. *Why:* Opendock, SAP, C3 and Velostics all work this way. Pools also absorb late trucks; in the BVL simulation, flexible slot use cut waiting more than strict use.
3. **Duration rules.** Duration by load type and direction, plus pallet-count steps. *Why:* C3, LoadingCalendar and Opendock derive duration from the load; fixed slots waste capacity or overrun.
4. **Booking rules.** Minimum lead time, maximum booking horizon, change/cancel cutoff and daily caps per pool. *Why:* every booking tool has them (Opendock, SAP, Cargoclix booking period, YardSlot360).
5. **Free carrier portal with invite and magic link.** Carriers can book without a full account (email or SMS verification), then reschedule or cancel within the rules. The confirmation carries a reference and a QR code. *Why:* with mandatory accounts, 40–60% of carriers keep calling (Dashdoc estimate). Opendock and LoadingCalendar allow guest booking; Cargoclix's support-activated registration is the anti-pattern.
6. **Basic avis fields.** Direction, reference/PO numbers (configurable as required or unique), load type, pallet count, vehicle type, license plate, driver phone and notes. Each site can add custom fields. *Why:* PO number, warehouse and pallet total are standard at booking (BVL); Opendock pairs refNumber with custom fields.
7. **Operator plan board.** A day view per pool and dock, drag-and-drop dock assignment, and a manual booking for phone callers. *Why:* universal; 25% of surveyed SLOT operators still had not replaced Excel even partly, so it must beat Excel.
8. **Status flow with timestamps.** Booked, arrived (gate in), called, at dock, done, departed (gate out); plus no-show and cancelled. Gate operators can check in by hand and the driver PWA can check in by QR. *Why:* every KPI depends on them (see [KPIs](#kpis)).
9. **Driver PWA by deep link.** Booking view, check-in and a "go to dock X" call-up, no install. SMS is the fallback for the call-up. *Why:* TradeLink and Heylog avoid app downloads; DockScheduler, RampMan and TradeLink call trucks by SMS.
10. **Notifications.** Email for booking, change and cancellation to the carrier, with tenant-level templates. *Why:* universal.
11. **Basic reports.** On-time rate, no-show rate, wait time, dwell, utilisation; filters by site, pool and carrier; CSV export. *Why:* universal, and the numbers SMEs justify the purchase with.
12. **Driver UI in 20+ languages and carrier portal in DE/EN at minimum.** *Why:* DACH competitors offer 17 to 29; a driver who cannot read the call-up costs a dock slot.

### SHOULD (cheap differentiators)

1. **Safety briefing done before arrival in the same deep link.** Content per site and language, acknowledgement, validity period (for example 12 months), optional quiz with a pass threshold, and an audit record (timestamp, language version, result). Gate check-in can require a valid briefing. *Why:* only DACH gate and visitor specialists have it (Peripass charges extra in its entry tier), and no slot-booking tool reviewed makes it a native pre-arrival step. Cheap: content plus a state machine.
2. **Recurring bookings and reserved capacity per carrier.** Standing weekly slots and contingents per carrier. *Why:* Transporeon, C3, RampMan, YardSlot360 and LoadingCalendar have them; cheap once pools exist.
3. **Late-arrival policy per site.** Choose between accepting when capacity is free, queuing for the next free slot, or rejecting and asking the carrier to rebook, with grace minutes. *Why:* BVL found four real patterns (no consequence, penalty, queue, rebook next day), queue most common. One setting covers them.
4. **Automatic no-show and capacity release.** Mark a no-show after the grace period, notify the carrier, and free the capacity. Send reminders 24 h and 2 h before the slot. *Why:* DataDocks and C3 do this; reminders are the cheapest no-show fix.
5. **Carrier scorecard visible to the carrier.** *Why:* C3, Opendock and Velostics have scorecards; shared timestamps defuse the "who waited" argument.
6. **Dock status board (TV mode)** and a **live queue in the PWA** showing the driver's position and expected call time. *Why:* Opendock and DockScheduler have boards; 62% of ramp staff cannot give binding wait times (TruckHero).
7. **Approval mode.** A booking starts as "Requested" for new carriers or special loads. *Why:* Opendock and DataDocks; a small status-flow extension.
8. **REST API and webhooks** for bookings and status events, plus **attachments** (delivery note, photos). *Why:* nearly universal; cheap if API-first.
9. **One carrier identity across tenants.** A carrier logs in once and sees all rampflow sites that invited it, with favourites and "copy last booking". *Why:* the strongest carrier feature of Opendock and Transporeon, and the answer to portal fatigue.

### LATER

- **Yard map, trailer and jockey moves, drop-and-hook:** enterprise YMS territory. At 11 to 50 trucks a day, SMEs need a queue, not a map.
- **Plate recognition (ANPR), barriers, scales, kiosk hardware:** hardware projects. Offer an open device webhook first.
- **EDI (DESADV/IFTMIN), certified SAP connectors:** sold per integration elsewhere; build on demand on top of the API.
- **ETA from telematics, auto-translated two-way chat (WhatsApp), voice AI booking, AI agents:** costly and risky before the core is adopted.
- **White-label custom domain and SSO:** enterprise items; logo and colours come earlier.
- **Load carrier/pallet accounts, eCMR, freight tendering:** these belong to adjacent products.
- **Dynamic slot pricing or auctions:** BVL lists them, but carriers already resent fees.

## Packaging

### How vendors tier

| Model | Vendors | Notes |
|---|---|---|
| Per booking | Cargoclix (EUR 0.50), Transporeon carrier side (EUR 2.34 to 2.73) | No entry barrier; burdens carriers when they pay. |
| Per site / facility | Peripass (EUR 1,299 per site per month, 75 trucks per day), Opendock (per facility per year), Velostics (facilities or shipments) | Predictable; volume caps behind the site price. |
| Per site, dock and volume | Transporeon shipper side | Three metrics in one quote. |
| Flat | LoadingCalendar (EUR 99, unlimited), DataDocks (from USD 249) | Self-serve SME. |
| Module ladder | Velostics (Slot, Dock, Yard, Network), TradeLink (Starter, Collaborate, Automate by team count), Peripass add-ons (kiosk, mobile portal, ID check, safety tests) | Check-in and yard are upsells; API often top tier. |

**Recommendation for rampflow:**

- Price **per site per month, in three tiers**, and keep **carriers and drivers free and unlimited**. Carriers are the network effect.
- **Hard limits** apply to configuration (sites, docks, internal users).
- **Soft limits** apply to runtime volume (bookings, SMS): warn and upsell, never block a carrier's booking mid-month.
- Indicative price bands, to be validated:
  - Start: EUR 149 to 249 per site per month.
  - Pro: EUR 399 to 599 per site per month.
  - Enterprise: quote.

### Entitlement key naming

- **Shape:** `<module>.<feature>`, lowercase snake_case. The module prefix is the module that reports the key through the standard entitlement interface: `core`, `booking`, `avis`, `yard`, `safety`, `notify`, `report`, `integration`, `brand`.
- **Booleans** are nouns (`booking.recurring`).
- **Numeric limits** are `<module>.max_<thing>[_per_<period>]`. `null` means unlimited; avoid magic `-1`.
- **No tier names in keys.** Keys are a stable API: a rename means a new key plus a migration.
- **MUST features still get keys**, so platform admins can switch them per tenant for trials and support. They appear in every package.

Key catalogue:

| Module | Boolean keys | Numeric keys |
|---|---|---|
| core | `core.sso`, `core.audit_log` | `core.max_sites`, `core.max_docks`, `core.max_internal_users` |
| booking | `booking.carrier_portal`, `booking.guest_link`, `booking.pools`, `booking.duration_rules`, `booking.recurring`, `booking.carrier_quotas`, `booking.approval`, `booking.late_policy` | `booking.max_bookings_per_month` |
| avis | `avis.basic`, `avis.custom_fields`, `avis.lines`, `avis.attachments` | – |
| yard | `yard.checkin_qr`, `yard.checkin_kiosk`, `yard.board`, `yard.queue`, `yard.call_to_dock`, `yard.map` | – |
| safety | `safety.briefings`, `safety.quiz`, `safety.validity`, `safety.media`, `safety.gate_enforcement` | `safety.max_briefing_templates` |
| notify | `notify.email`, `notify.sms`, `notify.reminders` | `notify.max_sms_per_month` |
| report | `report.basic`, `report.export`, `report.carrier_scorecard`, `report.scheduled` | – |
| integration | `integration.api`, `integration.webhooks`, `integration.edi` | `integration.max_api_calls_per_day` |
| brand | `brand.logo`, `brand.white_label`, `brand.custom_domain` | – |

Driver languages are deliberately **not** an entitlement. A driver who cannot understand a safety briefing is a safety risk, not an upsell.

### Proposed packages

**Start**: one SME site, about 11 to 50 trucks per day.

```yaml
limits:
  core.max_sites: 1
  core.max_docks: 10
  core.max_internal_users: 10
  booking.max_bookings_per_month: 1500   # soft
  notify.max_sms_per_month: 300          # soft
  safety.max_briefing_templates: 2
features: [booking.carrier_portal, booking.guest_link, booking.pools, booking.duration_rules,
  booking.recurring, booking.late_policy, avis.basic, avis.custom_fields, yard.checkin_qr,
  yard.board, yard.call_to_dock, notify.email, notify.sms, notify.reminders,
  safety.briefings, safety.validity, report.basic, report.export, brand.logo]
```

**Pro**: multi-site Mittelstand, regular suppliers, first integrations.

```yaml
limits:
  core.max_sites: 5
  core.max_docks: 60
  core.max_internal_users: 75
  booking.max_bookings_per_month: 10000
  notify.max_sms_per_month: 3000
  safety.max_briefing_templates: 20
  integration.max_api_calls_per_day: 50000
features: [<all Start features>, booking.carrier_quotas, booking.approval, avis.lines,
  avis.attachments, yard.queue, yard.checkin_kiosk, safety.quiz, safety.media,
  safety.gate_enforcement, report.carrier_scorecard, integration.api, integration.webhooks]
```

**Enterprise**: logistics service providers and groups.

```yaml
limits: {all: null}   # unlimited or per contract; bookings soft, SMS billed pass-through
features: [<all Pro features>, core.sso, core.audit_log, report.scheduled, integration.edi,
  brand.white_label, brand.custom_domain, yard.map]
```

The sizing comes from the Cargoclix survey: 50 trucks per day across 22 working days is about 1,100 bookings per month. Start covers one typical site with headroom, and Pro covers about five sites. The SMS cap reflects that SMS carries a real per-message cost (Transporeon passes on EUR 0.23 per SMS), while PWA push and email cost almost nothing.

## Carrier and driver pain points

| Pain point | Evidence | UX implication for rampflow |
|---|---|---|
| **Portal fatigue** | Qued case: one carrier team juggled 40 receiver portals and 17 passwords. Dashdoc: with mandatory accounts, 40–60% of carriers keep calling. | Deep-link booking without an account; one carrier identity across tenants; favourites and copy-last-booking; under 3 minutes per booking; prefill what the tenant already knows. |
| **Fees borne by small forwarders** | Retail slot fees reach EUR 2.50 to 2.73; small forwarders cannot pass them on, and acceptance would rise if operators paid (BVL). In 2016, 72% of carriers accepted at most EUR 0.50 (Cargoclix). | Free for carriers, permanently. Put it on the landing page. |
| **Language barriers** | Competitors offer 17 to 29 languages with pictograms. In a vi2vi case at DAW, drivers' limited German or English led to misunderstandings and detours on site. | PWA language from the phone setting with a one-tap switch; pictograms; safety content per language; templated (not free-text) call-up messages that translate reliably. |
| **Waiting and lack of information** | Trust-Trans 2023: 68% of drivers wait 1.5 to 2 h at retail ramps. TruckHero 2021: 62% of ramp staff cannot give binding wait times, and 65% of drivers are unsure whether they must unload. Under ADSp/VBGL, 2 h each for loading and unloading is free before Standgeld (detention) applies. | Live queue position and expected call time in the PWA; a "driver unloads: yes/no" booking field; a Standgeld-risk flag. |
| **Rigid slots and lateness** | The BVL study found the queue is the most common enforcement pattern. Next-day rebooking requires a phone call to the shipper. Slots released at midnight disadvantage carriers (Qued). | Configurable late policy with grace window; self-service rebooking within rules; pool booking as a corridor; predictable release times instead of midnight drops. |
| **No-shows** | C3 and DataDocks address them with reminders and reports; Peripass offers blacklisting. | Automatic no-show after grace, reminders, capacity release, scorecard; optional "approval required after N no-shows". |
| **Disputed waiting time** | In a 2008 VerkehrsRundschau survey, 94.6% of service providers said trucks usually wait at the customer; only 7.8% of shippers admitted waits over one hour. | Timestamps visible to both sides in the carrier's booking view. |
| **No smartphone or no data** | Vector: QR suits pre-booked carriers, kiosks suit drivers who rely on paper, and SMS suits spot-market drivers who stay in the cab. | Manual check-in by the gate operator; SMS fallback; kiosk mode is the PWA on a tablet. |

## KPIs

The KPIs below need these timestamps on every visit:

- `slot_start`, `slot_end` (booked)
- `gate_in_at` (arrival / check-in)
- `called_at`
- `dock_on_at` (at the dock door)
- `work_done_at`
- `dock_off_at`
- `gate_out_at`
- `cancelled_at`, with the cancellation cutoff in force at that time

Tolerances (`early_tolerance`, `late_tolerance`, `no_show_grace`) are platform defaults that a tenant or site can override.

| KPI | Definition | Notes |
|---|---|---|
| **On-time arrival rate** | Arrived visits with `slot_start - early_tolerance <= gate_in_at <= slot_start + late_tolerance`, divided by arrived visits. | Report early and late separately. Dashdoc treats under 70% as "booking does not change behaviour" and over 85% as good adherence. |
| **No-show rate** | Bookings with no `gate_in_at` by `slot_end + no_show_grace` and not cancelled before the cutoff, divided by bookings due in the period. | Track **late cancellations** (cancelled after the cutoff) as a separate rate. Both are carrier-scorecard inputs. |
| **Wait time (gate to dock)** | `dock_on_at - max(gate_in_at, slot_start)` | Counting from `slot_start` keeps a carrier's early arrival out of the operator's wait figure; the fair number for Standgeld disputes. |
| **Dock dwell / handling time** | `dock_off_at - dock_on_at` | Compare with the planned duration to tune the duration rules (planned-vs-actual accuracy). |
| **Turnaround (site dwell)** | `gate_out_at - gate_in_at` | Racklify calls this yard dwell or turn time. Flag visits over 2 h as Standgeld risk (ADSp/VBGL threshold, configurable). |
| **Dock utilisation** | Sum of occupied minutes (`dock_off_at - dock_on_at`) per dock or pool, divided by open minutes in the period. | Loadsmart sees it as most relevant for small facilities with few doors. Sustained values above about 90% leave no slack for late trucks. |
| **Slot (capacity) utilisation** | Booked capacity divided by offered capacity per pool and period. | Booked versus actually used reveals over-provisioned durations. |
| **Portal adoption** | Bookings created by carriers divided by all bookings (the rest are created by staff from phone or email). | Dashdoc target: 80%+ within 90 days; the SME's real ROI indicator. |

## Sources

[F] = fetched and read. [S] = returned by search; the claim is taken from the search result.

- [F] Cargoclix home: https://start.cargoclix.com/de/
- [F] Cargoclix SLOT: https://start.cargoclix.com/de/slot/
- [F] Cargoclix SAFE CHECK-IN: https://start.cargoclix.com/de/safe-check-in/
- [F] Cargoclix FAQ: https://start.cargoclix.com/de/faq/
- [F] Cargoclix ramp-operator study 2020: https://start.cargoclix.com/wp-content/uploads/2020/07/Ergebnisse_Cargoclix_Studie_SLOT_Management_Summary.pdf
- [F] Eurotransport on the 2016 Cargoclix carrier survey: https://www.eurotransport.de/logistik/spedition-und-logistik/cargoclix-umfrage-mehr-effizienz-dank-zeitfenstermanagement/
- [F] Transporeon Time Slot Management: https://transporeon.com/en/products/time-slot-management
- [F] Transporeon carrier hub: https://www.transporeon.com/en/platform/dock-yard-management-hub/carrier
- [F] Transporeon driver communication (zekju): https://publications.transporeon.com/fact-sheet-driver-communication-with-zekju-integration/
- [F] Transporeon retail fee sheet (Mobau): https://www.mobau-wirtz-classen.de/fileadmin/user_upload/pricing_terms_DE.pdf
- [F] Wanzl information letter (Transporeon booking): https://www.wanzl.com/TMP%20forever/Downloads/Informationsschreiben%20Time%20Slot%20Management%20DE%20-%20EN/Information%20letter%20Time%20Slot%20Management%20%28Zeitfensterbuchung%29%20englisch.pdf
- [S] Transporeon retail fact sheet (reserved and recurring slots): https://www.transporeon.com/website/Fact%20Sheet/FactSheet_Retail%20Time%20Slot%20Management_EN_2.pdf
- [F] Zalando partner guide (Transporeon, previously Mercareon): https://partner.zalando.com/university/article/book-warehouse-delivery-time-mercareon
- [S] Trimble completes Transporeon acquisition: https://news.trimble.com/2023-04-03-Trimble-Completes-Transporeon-Acquisition
- [F] Opendock carrier API (Loadsmart): https://developer.loadsmart.com/docs/opendock/for-carriers/booking-appointments
- [F] Opendock self-scheduling blog: https://blog.opendock.com/self-schedule
- [F] Taylor Logistics Opendock guide (free account or guest): https://taylorlogistics.com/2026/07/01/opendock/
- [S] Opendock Adding Docks (lead-time settings): https://community.loadsmart.com/hc/en-us/articles/14908083511827--Opendock-Adding-Docks
- [S] Opendock on Capterra (plans, SSO): https://www.capterra.com/p/246239/Opendock/pricing/
- [S] Loadsmart YMS launch: https://www.globenewswire.com/news-release/2025/02/13/3025846/0/en/loadsmart-launches-a-yard-management-system-yms-to-connect-dock-and-yard-operations.html
- [F] GoRamp vs Opendock (competitor source): https://www.goramp.com/blog/goramp-vs-opendock
- [F] GoRamp on Opendock Nova (competitor source): https://www.goramp.com/blog/what-is-opendock
- [F] GoRamp home: https://www.goramp.com/
- [F] DataDocks home: https://datadocks.com/
- [F] DataDocks custom rules: https://datadocks.com/datadocks-features/custom-rules
- [F] DataDocks carrier portal: https://datadocks.com/datadocks-features/carrier-portal
- [S] DataDocks on Capterra: https://www.capterra.com/p/179266/DataDocks/
- [F] C3 Reservations FAQ: https://www.c3solutions.com/dock-scheduling/faq/
- [S] C3 Reservations on Capterra (multilingual UI, standing appointments): https://www.capterra.com/p/179747/C3-Reservations/
- [F] Velostics home: https://www.velostics.com/
- [F] Velostics plans: https://www.velostics.com/plans
- [F] LoadingCalendar comparison (vendor source): https://www.loadingcalendar.com/de/blog/best-dock-scheduling-software
- [F] LoadingCalendar pricing: https://www.loadingcalendar.com/pricing
- [F] Peripass pricing: https://www.peripass.com/pricing
- [F] Peripass pricing features: https://www.peripass.com/pricing-features/
- [F] TradeLink home: https://www.tradelink.co/
- [F] TradeLink driver check-in: https://www.tradelink.co/loesung/check-in-fahrer-terminal
- [F] TradeLink packages: https://www.tradelink.co/preise-pakete
- [F] RampMan (LOGSOL): https://www.even-logistics.com/solutions/logsol/zeitfenstermanagement-mit-rampman
- [F] YardSlot360: https://ruediger-woehrl.de/zeitfenstermanagement-software-yardslot360
- [F] Heylog Digitale Pforte: https://heylog.com/digitale-pforte/
- [F] Brendel DockScheduler: https://dock-scheduler.com/
- [F] WELCOME truck management: https://welcomeyou.de/lkw-management/
- [F] Loady driver instructions: https://www.loady.com/de/funktionen/fahrerunterweisungen
- [F] friendlyway digital safety briefing: https://www.friendlyway.de/digitale-sicherheitsunterweisung-fuer-lkw-fahrer-in-der-logistik
- [F] pelzGROUP / Ixaro free booking: https://logistra.de/news/nfz-fuhrpark-lagerlogistik-intralogistik-kostenlose-zeitfensterbuchung-und-rampen-management-pelzgroup-reduziert-standzeiten-fuer-lkw-241494.html
- [F] SAP DAS configuration (SAP Learning): https://learning.sap.com/courses/implementing-sap-business-network-for-logistics/configuring-sap-dock-appointment-scheduling
- [F] SAP appointment management (EWM 9.4 help): https://help.sap.com/saphelp_ewm94/helpdata/en/9e/d0a670bb1843dcb00b1438a7c698ed/content.htm
- [S] Kaleris AI gate automation (MODEX 2026): https://www.ajot.com/news/kaleris-announces-ai-powered-yard-gate-automation-at-modex-2026
- [S] Kaleris Daimler case study: https://kaleris.com/case-study/daimler-case-study/
- [F] FourKites yard management: https://www.fourkites.ai/platform/yard-management
- [S] DAW / vi2vi digital gate case (driver language problems): https://www.industrial-production.de/zulieferer/freie-fahrt-fuer-daten-und-lkw.htm
- [F] Vector check-in mode comparison: https://www.withvector.com/blog/digital-gate-check-in-guide/
- [F] BVL/IGF final report 18499 N, slot management from the SME forwarder perspective: https://www.bvl.de/files/1951/2125/2131/2133/Schlussbericht_18499_N.pdf
- [F] Qued carrier case study (vendor source): https://www.qued.com/from-scheduling-chaos-to-competitive-weapon-an-18-month-transformation-arc/
- [F] Dashdoc dock scheduling guide: https://www.dashdoc.com/en-us/blog/dock-scheduling-appointment-system
- [F] VerkehrsRundschau survey (2008): https://www.verkehrsrundschau.de/nachrichten/transport-logistik/verkehrsrundschau-umfrage-massive-probleme-an-der-rampe-3023251
- [F] lagerflaeche.de summary of Trust-Trans 2023 and TruckHero 2021 (secondary source): https://www.lagerflaeche.de/lager-blog/milliardengrab-warum-warten-groesste-ungeloeste-problem-logistik-ist/
- [F] Loadsmart dock scheduling KPIs: https://blog.loadsmart.com/dock-scheduling-kpis
- [F] Racklify yard KPIs: https://racklify.com/encyclopedia/what-is-yard-management-how-it-controls-trailers-appointments-and-dock-activity/
