---
title: Domain standards and compliance research
description: What avis/ASN standards, slot-booking vendors, yard practice, German/EU safety-instruction law, GDPR and time-zone rules imply for rampflow's data model and defaults, with concrete recommendations.
type: explanation
audience: [agent, developer]
tags: [research, avis, booking, capacity, yard, safety, gdpr, i18n]
status: stable
updated: 2026-10-21
---

# Domain standards and compliance research

## Summary

- **Avis.** No SME dock booking uses full EDIFACT DESADV or VDA 4987. GS1 Germany's time-slot recommendation from 2013 is the best neutral reference. It says the pallet count (floor pallets plus intermediate pallets) is the leading unit for slot booking. It makes order numbers and pallet count mandatory whenever a slot system is used. It lists dangerous-goods and temperature fields as optional item data. Real booking forms (Transporeon customers, Cargoclix, Opendock) ask for about six things: unloading point, reference or PO number, load-unit count, plate, driver name and driver mobile. rampflow should ship this small core. Packaging codes map to UN/ECE Rec 21, and SSCC/GTIN can be added later.
- **Capacity.** Vendors size a slot from the load type, using either a fixed duration or count tiers. Lead time, maximum days ahead and edit/cancel cutoff are set per resource. Late arrivals are handled with a grace period and a standby list. rampflow should support two kinds of resource: a dock pool (book a count, door assigned at arrival) and a single dock (book an exact door). A dock may belong to at most one pool. Availability for both is computed from the same bucket timeline.
- **Yard.** Keep Booking (the reservation) separate from Visit (the physical truck). GS1 names three timestamps as required: arrival, call to the dock, and release for departure. It recommends two more: start and end of (un)loading. rampflow's visit lifecycle is built around these timestamps.
- **Safety instructions.** §12 ArbSchG and DGUV Vorschrift 1 §4 cover the site's *own* employees: instruction at least once a year, documented. For external drivers, the duty is §8(2) ArbSchG and DGUV V1 §6(2): the site must *make sure* that drivers received adequate instructions. A notice board is not enough. No statute sets a repeat interval or requires a signature for external drivers. Recommended rampflow defaults: versioned content per language, a short quiz, and a completion valid for 365 days, scoped per tenant.
- **GDPR.** The tenant is the controller and rampflow is its Art. 28 processor. The carrier is a separate controller for the data of its own staff. Use short retention for driver personal data (phone: 7 days; name and plate: 90 days). Keep safety completions until expiry plus 2 years. Driver deep links carry an opaque token in the URL fragment, which the app exchanges for a cookie.
- **Multinational.** Store every event as a UTC instant. Store opening hours and closures as local wall-clock values together with the site's IANA time zone. Generate slots in site time. Display site-local time to every role. Import holidays from `date-holidays`, keyed by ISO 3166-2 subdivision, and treat them as suggestions the tenant confirms. Ship the staff UI in de and en, and the driver PWA in 12 languages.

## 1. Avis / ASN

### What the standards carry

**EDIFACT DESADV.** This is the UN/EDIFACT despatch advice, and BGM code 351 means "despatch advice". The header carries the document number (one implementation guide recommends at most 17 characters), dates (DTM), parties (NAD) and references. The detail section is a packing hierarchy. CPS gives the package level, PAC the number and type of packages, PCI the marking, and GIN the SSCC. Item lines (LIN, QTY) sit below with GTINs. Parties are identified by GLN and goods by GTIN, and both partners must know these numbers in advance.

**VDA (automotive).** VDA 4913 has been in use since 1996. It uses fixed 128-character records: 711 header, 712 transport, 713 delivery note, 714 material, 715 packaging, 716 text, 718 production numbers, 719 trailer. Its EDIFACT-based successor, VDA 4987 (Global DESADV), has existed since 2016 and is pushed by OEMs such as VW. It models loading units (GIN+ML) that contain packages (GIN+AW). Requirements vary by OEM, so rampflow should not try to emulate VDA. It should only be able to store the references VDA users type in: delivery note number, loading unit IDs.

**GS1 identifiers.**
- **SSCC:** 18 digits, Application Identifier (00), one per logistic unit. On a GS1 logistics label it is the only mandatory element.
- **GTIN:** identifies trade items.
- **GLN:** 13 digits. It identifies parties and physical locations, and GS1 explicitly names dock doors as an example.

**CMR consignment note (IRU model 2007).**
- Box 1: consignor. Box 2: consignee.
- Box 3: place and date of taking over. The IRU recommends recording arrival and departure hours here as evidence for waiting-time claims.
- Box 4: place of delivery, ideally with the warehouse's opening hours.
- Box 5: instructions, including customs.
- Box 6: carrier.
- Box 9: attached documents.
- Boxes 10–15: goods description, including dangerous goods.
- Box 16: special agreements, including the use of pallets.
- Box 18: other indications, such as the licence plate.
- Box 24: consignee's confirmation with arrival and departure times.

For dangerous goods, the CMR Convention requires their "generally recognized description". Practical guides spell this out as the proper shipping name, the ADR class and the UN number.

**GS1 Germany, "Zeitfenstersteuerung" (April 2013).** Industry, retail, logistics providers and slot-tool vendors wrote this recommendation together; Cargoclix, Mercareon, Transporeon, DHL and Dachser took part. Its transport advice (IFTMIN) profile contains these fields:
- **Mandatory:** transport order number; consignor and consignee (by GLN or by address); ordering party; logistics provider; a slot qualifier (Z.1 "no slot needed" to Z.5 "slot already fixed"); total gross weight in kg; package type; package count.
- **Mandatory when a slot system is used:** the buyer's order number, the delivery date, and the count of load carriers, meaning pallets, "Boden- und Zwischenpaletten".
- **Optional:** SSCC per package; delivery note number; pallet floor positions in EUR-1 equivalents; dimensions; stackable flag; temperature setting and range.
- **Dangerous goods (if present):** UN number, official name, label model number, packing group, tunnel restriction code, net mass. The recommendation says these follow ADR/RID.

The booking request (IFTMBF) adds the driver's mobile number, the vehicle type and plate, a delivery type (part/full load versus groupage), up to 8 preferred windows, and a reference. The recommendation states that the pallet is usually the leading unit, and that pallets must not be confused with floor positions (*Stellplätze*). Updates are allowed until a deadline set by the receiver.

**What real booking forms ask.**

| Source | Required at booking |
|---|---|
| Wanzl via Transporeon (2025) | unloading point, PO number(s), pallets (which drive the number of 30-minute slots), driver name, plate, driver mobile; vehicle type and documents are optional |
| thyssenkrupp Rothe Erde via Transporeon (2024) | supplier/forwarder name, plate, driver name, driver mobile, reference number, loading station |
| Zalando via Transporeon/Mercareon | shipping notice ID, exact pallet **and** box counts (wrong counts are the most frequent rejection reason), vehicle type (van, truck, stacked pallets, loose-loaded truck or container, swap body) |
| Cargoclix (Wacker Neuson, 2026) | package count, which drives slot length; "1 package = 1 large load carrier (Gitterbox) or 1 pallet of small bins" |
| Opendock | load type, reference number (uniqueness configurable), pallet count, custom fields; PO, BOL upload and notes are optional |

**Packaging vocabulary.** UN/ECE Recommendation 21 provides the codes:

| Code | Meaning |
|---|---|
| OH / OG | pallet ISO 1 = 1/1 EURO / ISO 0 = 1/2 EURO |
| O4 / O3 | the same sizes as one-way pallets |
| PX | pallet (generic) |
| PB | box pallet |
| CW | roll cage |
| CT | carton |
| PC | parcel |
| NE | unpacked |
| CL | coil |
| VR / VY / VL | bulk: granular / powder / liquid |
| WA | IBC |
| CR | crate |

EPAL sizes:
- 1200×800 mm: the EUR/EPAL pallet.
- 1200×1000 mm: the industrial pallet.
- 800×600 mm: the half pallet. Sources disagree on its EPAL number.

### Recommendation for rampflow

The avis is a 1:1 child of the booking. The carrier can edit it until the change cutoff. Fields:

| Field | Type | Req. | Notes |
|---|---|---|---|
| `direction` | `inbound \| outbound` | yes | inherited from the load type |
| `references[]` | `{type: purchase_order \| delivery_note \| shipment \| transport_order \| customer_ref \| container \| other, value: string(1..35)}` | ≥1 | site setting `requiredReferenceTypes` (default: any one); optional uniqueness check per site |
| `counterpartyName` | string(1..120) | yes | the supplier for inbound, the customer for outbound |
| `loadUnits[]` | `{type: LoadUnitType, quantity: int ≥1, stackable?: bool}` | ≥1 | drives the duration tiers |
| `palletPositions` | int ≥0 | no | floor positions in EUR-1 equivalents (GS1 *Stellplätze*) |
| `grossWeightKg` | decimal(8,1) | no | the site can make it required |
| `palletExchange` | bool | no | EUR pallet exchange (*Palettentausch*) |
| `loadingMethod` | `rear \| side \| top \| crane` | default `rear` | filters eligible docks |
| `vehicle` | `{type: VehicleType, plate: string, plateCountry: ISO-3166-1 alpha-2, trailerPlate?: string}` | plate required at check-in, optional at booking (site setting) | store the plate normalized: uppercase, no spaces or dashes |
| `driver` | `{name?: string, phone?: E.164, locale?: BCP 47}` | no | see section 5 on data minimisation |
| `dangerousGoods` | `{present: bool, items[]: {unNumber: /^UN\d{4}$/, adrClass: string, packingGroup?: I\|II\|III, quantity?: number, unit?: kg\|l, limitedQuantity?: bool}}` | `present` required | when `present=true`, at least one item with UN number and class |
| `temperature` | `{controlled: bool, minC?: decimal, maxC?: decimal}` | `controlled` required | UI presets: ambient, chilled 2–8, frozen ≤ −18 (the −18 °C figure comes from Directive 89/108/EEC); filters to reefer docks |
| `customs` | `{required: bool, procedure?: import \| export \| transit, mrn?: string(18)}` | `required` default false | |
| `sscc[]` | string(18), with check digit validated | no | hidden in the MVP UI; reserved for EDI import |
| `notes` | string(≤1000) | no | |
| `attachments[]` | file (PDF/JPEG, ≤10 MB) | no | delivery note or CMR; short retention (section 5) |

- **`LoadUnitType`:**
  - `eur_pallet` (OH)
  - `eur_half_pallet` (OG)
  - `industrial_pallet` (PX, 1200×1000)
  - `one_way_pallet` (O4)
  - `box_pallet` (PB, Gitterbox)
  - `roll_cage` (CW)
  - `small_load_carrier` (CR, for KLT/crates)
  - `carton` (CT)
  - `parcel` (PC)
  - `loose` (NE, piece goods or long goods)
  - `coil` (CL)
  - `bulk` (VR/VL)
  - `ibc` (WA)
  - `other` (requires a free-text label)

  Store the Rec 21 code next to each enum value so EDI export is mechanical.
- **`VehicleType`:** `van_3_5t`, `rigid_truck`, `truck_trailer` (*Gliederzug*), `semi_trailer`, `mega_trailer`, `swap_body`, `container`, `reefer` (`reefer` could instead be a flag combined with the temperature data).
- **Units:** kg, °C, cm, count. No imperial units in the MVP.

## 2. Slot capacity model

### Industry practice

**Slot definition (GS1).** A slot is a check-in window plus the dwell time. A truck that arrives after the latest check-in time loses its claim to the slot. A truck that arrives early has no claim to early service. Waiting time counts only from the start of the booked window.

**Granularity and duration.**
- **Opendock:** each appointment belongs to a *load type*. The load type sets the duration (for example, LTL about 15 minutes and FTL about 60 minutes), the direction, the operation, the equipment and whether carriers may book it. Dock hours are set in 30-minute tiles, and a warehouse setting controls the start-time grid.
- **Cargoclix (Wacker Neuson):** count tiers.
  - Rear unloading: 1–30 packages = 30 minutes, 31–60 = 60 minutes, 61–90 = 90 minutes, 91–120 = 150 minutes.
  - Side unloading: 1–10 packages = 15 minutes.
- **Wanzl:** 1–16 pallets = one 30-minute slot, more than 16 = 60 minutes, mixed load = 90 minutes.
- **Transporeon:** advertises durations computed dynamically from pallets or storage positions.

**Hours and blocks.**
- **Opendock:** per-weekday warehouse hours; dock hours must fall inside warehouse hours.
- **Cargoclix:** greys out times when a ramp is closed or at lunch.
- **Transporeon:** shows four slot states: free, reserved, booked, blocked.
- **DataDocks:** time blocks (before 6 AM, lunch, maintenance) and seasonal overrides.

**Lead time, horizon and cutoff.**
- **Cargoclix:** booking opens 30 days ahead at 00:00 and closes 1 hour before the slot.
- **Opendock:** three settings per dock: minimum hours before the appointment, minimum hours to edit or cancel, and maximum days in advance. A separate next-day cutoff is counted in shifts.
- **Zalando:** book by 23:59 the day before; slots are released each Monday for the next week.
- **Cornelsen:** book by 15:00 on the previous working day; late advice costs €80.
- **thyssenkrupp Rothe Erde:** rebooking is free until the slot starts.
- **DataDocks:** a facility-set window locks editing; cancellation reasons are optional.

**Late arrival and no-show.**
- **Cargoclix:** a booking becomes invalid after 5 minutes of lateness.
- **Wanzl:** more than 10 minutes late requires a rebooking or a phone call, otherwise the truck is served the next day.
- **thyssenkrupp Rothe Erde:** entry is allowed from 30 minutes before to 30 minutes after the slot.
- **C3:** most sites call a truck "late" after 30 minutes and give 15–30 minutes of grace. The usual handling is the next open slot or a standby list that fills gaps.

**Concurrency and overbooking.**
- **Opendock:** one appointment per dock and interval, unless the dock has "parallel capacity". An overbooking setting exists and is marked experimental.
- **DataDocks:** combines limits on count per hour, weight per shift and product type per dock. It recommends a ceiling at the historical peak minus 10–15%.

**Per-carrier caps.** No standard exists. The only example found is a DataDocks contract with a weekly tonnage cap.

**Pool versus dock.** Both models exist, and many sites mix them.
- **Cargoclix:** the carrier picks a free time on a *specific ramp* inside a group, such as rear unloading or side unloading.
- **Opendock:** the carrier books a load type at the warehouse. Each dock lists the load types it serves (`loadTypeIds`, required on `Dock`), and creating an appointment requires a `dockId` next to the `loadTypeId` (`CreateAppointmentDto`). An Opendock appointment therefore sits on one dock from the start.
- **General practice:** reserve generic capacity and assign the door on arrival, while dedicating fixed doors to reefer or hazmat loads, or to certain carriers.

**Context.**
- In Germany, trucks over 7.5 t may not drive on Sundays and listed public holidays from 00:00 to 22:00 (§30(3) StVO). The holiday list varies by state (§30(4)).
- At Wanzl, which uses Transporeon, the party that books the slot pays €2.34 per booking. rampflow's carriers do not pay.
- An Open Logistics Foundation working group is drafting an open data model for dynamic slot management. The 24 members include Transporeon and GS1. It was at an early stage in June 2025.

### Recommendation for rampflow

The resource model:

```ts
type Direction = "inbound" | "outbound";
type BookingTarget = { kind: "pool"; poolId: Id } | { kind: "dock"; dockId: Id };

interface Dock {            // a physical door; see section 3 for attributes
  id: Id; siteId: Id; hallId: Id; code: string;
  poolId?: Id;              // at most ONE pool (invariant)
  directBookable: boolean;  // can carriers pick this exact door?
  status: "active" | "maintenance" | "inactive";
}
interface DockPool { id: Id; siteId: Id; name: string; directions: Direction[]; capacityCap?: number }
interface LoadType {        // the duration and eligibility profile
  id: Id; siteId: Id; name: LocalizedText; direction: Direction;
  duration: { kind: "fixed"; minutes: number }
          | { kind: "tiers"; unit: "load_units" | "pallet_positions"; tiers: { upTo: number | null; minutes: number }[] };
  bufferMinutes: number;    // occupies capacity, hidden from the carrier
  targets: BookingTarget[]; // eligible pools and docks
  requires?: Partial<DockCapabilities>; // e.g. temperature zone, ADR
  carrierBookable: boolean;
}
interface WeeklyHours { scope: ScopeRef; isoWeekday: 1|2|3|4|5|6|7; opens: "HH:mm"; closes: "HH:mm"; validFrom?: LocalDate; validTo?: LocalDate }
interface CalendarException {
  scope: ScopeRef;          // site | pool | dock
  start: LocalDateTime; end: LocalDateTime;  // site-local wall time
  kind: "closed" | "blocked" | "extra_open" | "capacity_override";
  capacity?: number; reason?: string; source: "holiday_import" | "manual";
}
```

`BookingPolicy` is resolved in layers: platform default → tenant → site → load type. Defaults:

| Key | Default | Basis |
|---|---|---|
| `startGridMinutes` | 30 | Opendock tiles, Wanzl 30-minute units |
| `durationGranularityMinutes` | 15 | Cargoclix 15-minute minimum |
| `minLeadMinutes` | 120 | between Cargoclix (1 h) and next-day cutoffs; sites can set a "previous day hh:mm" cutoff instead |
| `maxAdvanceDays` | 30 | Cargoclix |
| `carrierChangeCutoffMinutes` | 120 | after the cutoff, only site staff can change or cancel |
| `earlyArrivalToleranceMinutes` | 30 | thyssenkrupp Rothe Erde |
| `lateGraceMinutes` | 15 | C3: 15–30 |
| `noShowAfterMinutes` (after slot start) | 60 | a job marks the booking `no_show` |
| `maxBookingsPerCarrierPerDay` | off | no industry standard |
| `maxTrucksOnSite` | off | yard capacity throttle |
| `overbookPercent` | 0 | staff with a role may force-book above capacity |
| `requireApproval` | false | Opendock "requested" status |
| `closeOnPublicHolidays` | true for DE/AT/CH sites | German truck ban in §30 StVO (AT/CH bans not verified here); the tenant can reopen single dates |

Seeded load types (editable):
- "Parcel / van": fixed 15 minutes.
- "Palletised": tiers by pallet count. 1–16 pallets = 30, 17–33 = 60, more = 90 minutes.
- "Floor-loaded / loose": fixed 90 minutes.

Availability algorithm. It is the same for both target kinds. Compute it on a 5-minute internal bucket timeline for one site-local day.

1. `open(t)` = site hours ∩ scope hours − `closed`/`blocked` exceptions.
2. `docksFree(P, t)` = active docks in pool P that are open at t and have no direct booking at t, capped by `capacityCap`.
3. **Pool target:** `free(P, t) = docksFree(P, t) − poolBookings(P, t)`.
4. **Dock target D in pool P:** D is open and unbooked at t, **and** `poolBookings(P, t) ≤ docksFree(P, t) − 1`. Booking door D must not strand existing pool bookings.
5. **Dock target D in no pool:** D is open and unbooked at t.
6. A start time `s` on the grid is offered when `free ≥ 1` for every bucket in `[s, s + duration + buffer)`, when the site-level caps (trucks on site, carrier per day) still hold, and when `s` lies inside `[now + minLead, now + maxAdvance]`.
7. Commit inside a transaction that locks the pool row for that day. Direct dock bookings are also protected by a PostgreSQL exclusion constraint on `(dock_id, tstzrange)`.

The rule "at most one pool per dock" keeps step 4 a counting check. Overlapping pools would turn availability into a bipartite matching problem, which the MVP should avoid. A site can mix models: rear-unloading doors in one pool, a reefer door bookable directly, and a crane bay set to inactive so that nobody books it.

## 3. Yard and gate process

### Industry practice

**GS1 timestamps.** The *required* timestamps are arrival, call to (un)loading, and release for departure. Start and end of (un)loading are *recommended*. Arrival is compared with the booked window to measure punctuality. The unloading site is responsible for capturing the timestamps.

**Vendor status lists.**
- **Terminal Industries:** expected, arrived, checked-in, staged/parked, in-yard, at-dock, loading/unloading, ready, released, checked-out; plus holds, seal checks and late flags.
- **Hyperbots:** scheduled, arrived, checked in, staged, at dock, loading, unloading, departed.
- **SG Systems:** separates statuses from events: arrival, check-in, door assignment, loading complete, gate-out.
- **Opendock YMS:** "Departed" closes the visit and the SMS thread.

**Check-in identification.**
- Cargoclix prints a booking ID that the driver shows at the gate.
- heylog: the driver scans a QR code, enters the plate and order number, then confirms a safety briefing of 8–12 slides in their own language. The vendor says check-in takes about 90 seconds, and that fewer than 1% of drivers have no smartphone; those drivers use a tablet at the gate.
- friendlyway: QR code or plate, data-protection consent, then a ramp assignment.
- Other options are self-service terminals (about €15–40k each according to heylog), number-plate recognition (Transporeon lists it), and call-to-dock by SMS or app.

**Dock hazards.** BGHW guidance M 5 lists the main causes of ramp accidents: the vehicle unexpectedly driving off or rolling away, and reversing without a banksman. When powered pallet trucks drive into a truck, it must be secured with wheel chocks in addition to the parking brake. Wheel chocks with sensors, signal lights, and vehicle restraints interlocked with the dock leveler are recommended technical measures. Dock levelers follow DIN EN 1398 and differ in lip type and working range. Some combined models serve both trucks and vans.

### Recommendation for rampflow

There are two aggregates. **Booking** statuses:
- `requested`
- `confirmed`
- `cancelled` (by carrier or site, with actor and reason)
- `rejected` (by site, before arrival)
- `no_show` (set by a job)
- `fulfilled` (linked to a Visit)

A **Visit** can exist without a booking, for walk-ins. Its statuses:

| Status | Entered when | Records (all timestamps UTC, all with actor) |
|---|---|---|
| `arrived` | truck identified at the gate, kiosk or PWA | `arrivedAt`, `idMethod: booking_code \| qr \| plate \| manual`, plate as seen, punctuality (`early`/`on_time`/`late` + minutes against the booked window) |
| `checked_in` | admitted to the site | `checkedInAt`, operator, `safetyCompletionId` (must be valid if the site requires it), checks passed |
| `waiting` | parked or in queue | `parkingSpotId?`, queue position |
| `called` | dock assigned and driver notified (GS1 *Aufruf*) | `calledAt`, `dockId`, channel `pwa_push \| sms \| display \| in_person` |
| `at_dock` | docked | `dockedAt`, `dockId` (may differ from the called dock) |
| `in_progress` | (un)loading started | `startedAt` |
| `completed` | handling done, released (GS1 *Freigabe*) | `completedAt`, actual unit counts, discrepancies, seal numbers, damage flag, pallets exchanged in/out |
| `departed` | gate out | `departedAt` |
| `rejected` | turned away | `reason: safety_not_completed \| no_capacity \| too_late \| documents_missing \| wrong_load \| damaged \| other` |

- Allow staff to skip states, for example `arrived` → `at_dock` when nobody waits. Record each transition as an append-only event and keep the status as a projection.
- Report waiting time from `max(arrivedAt, slotStart)`, following the GS1 rule. These timestamps are also what carriers need for detention (*Standgeld*) claims.
- **Booking code:** 8 characters, Crockford Base32 (no I/L/O/U), unique per site and active window. The QR code encodes only this code, never the deep-link secret.
- **Plate matching:** normalized plate plus country. Number-plate recognition comes later.

**Dock capabilities** (used to filter eligibility for load types and avis):
- `doorType`: `dock_leveler | ground_level | side_loading | yard_open`
- `leveler`: `none | hinged_lip | telescopic_lip`
- `loadingMethods`: subset of `rear | side | top | crane`
- `temperatureZone`: `ambient | chilled | frozen`
- `dockShelter`: bool
- `vehicleRestraint`: bool
- `maxVehicleHeightCm?`, `maxVehicleLengthM?`
- `vehicleTypes[]`
- `adrAllowed`: bool
- `gln?`: string(13)

**ParkingSpot:**
- `siteId`, `zone`, `code`
- `kind: truck | trailer_drop | van | reefer_powered | adr | waiting_lane`
- `maxLengthM?`
- `status: free | occupied | blocked`
- `visitId?`

## 4. Safety instructions for external drivers

### Legal basis (Germany)

**§12 ArbSchG** obliges the employer to instruct *its own* employees adequately: when hired, on changes, and "erforderlichenfalls regelmäßig". **DGUV Vorschrift 1 §4(1)** adds two requirements for insured staff: at least once a year, and documented. §4(2) requires the content to be conveyed "in verständlicher Weise". Neither provision covers a carrier's driver directly.

The provisions for external drivers are these:
- **§8(1) ArbSchG and DGUV V1 §6(1).** Employers whose staff work at the same workplace must cooperate and inform each other about hazards. DGUV V1 §6(1) adds that they must appoint a coordinator where mutual hazards exist.
- **§8(2) ArbSchG and DGUV V1 §6(2), with the same wording.** The host must "sich je nach Art der Tätigkeit vergewissern", that is, make sure that people from other employers have received adequate instructions about the hazards on its site.
- **DGUV V1 §5(3).** A host who commissions an external company must support that company's risk assessment for site-specific hazards.

KomNet NRW (the state's occupational-safety Q&A service) answers the driver case directly:
- A notice at the gate is not enough.
- The driver's employer is primarily responsible for instructing the driver.
- The host must still verify this.
- Duty of care and the duty to keep the premises safe (§823 BGB) also apply to drivers who count as visitors.

BG Verkehr, the statutory accident insurer for transport, adds two points. The host briefs external workers on local conditions, site-specific hazards and emergency procedures. The host should also check whether a translation is needed.

**BetrSichV §12** matters only if drivers operate site equipment such as forklifts, pallet trucks or leveler controls. It then requires an equipment-specific instruction at least once a year, with date and names recorded in writing. rampflow's default instruction should state that drivers do *not* operate site equipment.

**Unregulated points.** No statute sets a repeat interval or requires a signature for external drivers. Practice borrows the annual interval: Dyckerhoff requires proof of a yearly driver briefing at every plant, and online providers issue certificates valid for 12 months. For retention, KomNet (2019) cites DGUV Information 211-005, which recommends keeping instruction records for 2 years. One university notes that this DGUV publication is outdated, so the 2-year figure is guidance, not law.

### Typical content

The following list is based on BGHW M 5, BG Verkehr, fm-connect and HSE.
- PPE: high-visibility vest always; safety shoes when outside the cab; more depending on the task.
- Traffic rules: speed limit (often 10 km/h), routes, one-way systems, parking and waiting zones, no reversing without a banksman, footpaths.
- Forklift and crane zones; the driver stays in the designated waiting area during (un)loading.
- Securing the vehicle at the dock: parking brake, wheel chocks or restraint, follow the signal lights, never drive off before release. The key handover is a site-specific rule.
- Load securing remains the driver's responsibility.
- Bans on alcohol, smoking outside designated areas, phone use while driving, and photography.
- Emergencies: alarm signal, assembly point, whom to call, first aid, reporting accidents.
- Site-specific: ADR rules, reefer areas, toilets and facilities.

### Practice and tools

- Digital briefings run before arrival on a phone, or on a kiosk or tablet at the gate.
- They use short slides, pictograms or video in the driver's language, and end with a confirmation and often a quiz.
- Some systems block the barrier until the briefing is complete. friendlyway, for example, logs a timestamp, the language version and the quiz result.
- Language counts claimed by vendors: heylog "24+", welcomeyou 29, friendlyway "dozens".

| Vendor | Confirmed features |
|---|---|
| Quentic | multilingual contractor and visitor briefings, before the visit or at a terminal, test questions, automatic certificates |
| sam® (secova/Systew) | web briefing before or on site, knowledge check, visitor badges, gatekeeper pre-registration, access-control interfaces |
| hse-COACH | targets truck drivers explicitly, runs in the browser on a terminal or phone, questionnaire that sends learners back on wrong answers, certificate with optional photo, timestamp and signature |
| LENA | contractor briefing via a registration link or QR code |

Two names from the brief could not be confirmed in this space. **Lobster** turned up only as a no-code integration platform (LOBSTER_pro). **simpleclub** produced no evidence of an occupational-safety product.

### Other countries (brief)

- **EU, Directive 89/391/EEC.** Art. 6(4) requires employers sharing a workplace to cooperate and coordinate. Art. 12(2) requires the employer to ensure that workers from outside undertakings "have in fact received appropriate instructions".
- **Austria.** §8(2) ASchG requires informing and instructing external workers where necessary.
- **Switzerland.** Art. 9 VUV requires agreements and mutual information. This was quoted from a secondary source; the official text was not checked.
- **Poland.** Art. 208 of the Labour Code requires cooperation and a health-and-safety coordinator.
- **UK.** HSE asks sites to give visiting drivers the site rules, routes and procedures, and to coordinate with the drivers' employers.

All of these require the host to verify or provide hazard information. None fixes an interval.

### Recommendation for rampflow

```ts
interface SafetyInstruction { id; tenantId; siteIds: Id[] /* empty = all sites */; title: LocalizedText;
  validityDays: number /* default 365 */; requiredForCheckIn: boolean /* default true */ }
interface SafetyInstructionVersion { id; instructionId; version: number; status: "draft"|"published"|"retired";
  publishedAt?: Instant; invalidatesEarlier: boolean /* material change → everyone redoes it */;
  quiz?: { passPercent: number /* default 100, retries allowed */; questionsPerAttempt: number /* 3-5 */ } }
interface SafetyInstructionContent { versionId; locale: BCP47; blocks: Block[] /* text, pictogram, image, video */;
  questions: Question[]; sha256: string; translation: "source"|"machine"|"reviewed" }
interface SafetyCompletion { id; tenantId; instructionId; versionId; locale; contentSha256;
  driverId: Id /* tenant-scoped driver record */; carrierId?: Id; bookingId?: Id; visitId?: Id;
  channel: "pwa"|"kiosk"|"staff"; startedAt; completedAt; quizScore?; attempts;
  confirmation: { method: "checkbox"|"typed_name"|"drawn_signature"; statement: string /* exact text shown */ };
  expiresAt; revokedAt? }
```

- **Validity:** valid when `completedAt ≤ now < expiresAt`, `revokedAt` is null, and no later published version has `invalidatesEarlier = true`. Default validity is **365 days**. Tenants can choose "per visit" (`validityDays = 0`) for high-hazard sites.
- **Quiz:** **on by default.** No law requires it, but it is the best evidence that the instructions were "adequate" and understood. Every surveyed vendor offers one. Use 3–5 pictogram-friendly questions.
- **Confirmation:** a checkbox plus the driver's name is enough, because only documentation is required. Drawn signatures are an optional tenant setting. Do not capture signature dynamics such as pressure or speed, which risks biometric data under Art. 9 GDPR.
- **Scope:** completions are scoped to the tenant (section 5). Only a completion for the same instruction counts across that tenant's sites.
- **Retention of content:** keep every version's content and hash as long as any completion that references it is kept.
- **Default languages (12):** de, en, pl, ro, bg, lt, uk, ru, cs, sk, hu, tr.
  - Polish, Lithuanian and Romanian vehicles are the top three foreign origins on German motorways: 22.2%, 4.6% and 4.3% of tolled mileage in November 2025, with foreign vehicles at 48.9% overall.
  - Russian covers the large numbers of Belarusian, Ukrainian and Central Asian drivers in Lithuanian and Polish fleets. Lithuanian firms hired more than 25,000 drivers from outside the EU in 2025.
  - Next wave: hr/sr-Latn, sl, lv, uz, nl, fr, it, es.
  - None of these languages is right-to-left.
- **Platform template:** the platform ships a template translated into all 12 languages. Tenants edit only the site-specific blocks. Machine-translated text stays flagged until someone reviews it.

## 5. GDPR / data protection

### Roles

- **Tenant:** controller for site operations (bookings, visits, safety completions, yard data).
- **rampflow:** the tenant's processor under an Art. 28 data processing agreement (AVV) for that data. If rampflow used tenant data for its own purposes, such as cross-tenant benchmarks, Art. 28(10) would make it a controller for that processing. The rule is therefore: aggregate and anonymize, or obtain a separate legal basis.
- **Carrier:** a separate controller for its staff's data. When it enters a driver's name and phone number it discloses that data to the tenant.
- **Cross-tenant carrier accounts:** if one carrier account serves many tenants, rampflow itself decides the purposes and means of that directory, and is therefore the controller for account and identity data. Transporeon follows the same split: it is the controller for platform users, uses controller-to-controller standard contractual clauses with carriers, and acts as processor for driver data handled for its business customers.
- **Caveat:** roles depend on the facts, not on the contract (EDPB Guidelines 07/2020). Have counsel confirm this split.

### Legal bases

- **Booking, visit and plate data, and the driver's name:** Art. 6(1)(f), the tenant's legitimate interest in site safety, access control and dock coordination.
- **Phone number:** optional, used only to call the driver to the dock. Same basis.
- **Safety completion:** arguably Art. 6(1)(c), because it is needed to meet the duty to "vergewissern" under §8(2) ArbSchG. Fall back on Art. 6(1)(f). The point is uncertain because DGUV rules are statutes of the accident insurers, not parliamentary law.
- **Carrier side:** the carrier's own basis for sharing its employees' data falls under §26 BDSG or Art. 6. After CJEU C‑34/21 (2023), several commentators consider §26(1) BDSG inapplicable and rely on Art. 6 directly. Others read the ruling more narrowly.
- **Transparency (Art. 14):** driver data comes from the carrier, so the tenant must inform the driver within one month at the latest, or at the first contact. The PWA deep link is that first contact: show the tenant's privacy notice there and at the kiosk.

### Data minimisation and the deep link

Collect at most: name, optional phone, plate, preferred language, and the safety completion. Do not collect ID scans, photos or birth dates. Tokens in query strings leak through Referer headers, server and proxy logs, browser history and third-party scripts, and HTTPS does not help (OWASP). Design the link as follows:
- Format `https://<host>/d#<token>`. The token is at least 128 random bits and carries no meaning.
- The PWA reads the fragment, POSTs the token to an exchange endpoint, receives a short-lived `HttpOnly; Secure; SameSite=Strict` session cookie scoped to that one booking, and removes the fragment with `history.replaceState`.
- Store only `sha256(token)`. Make tokens revocable and rate-limited.
- Expire the token 24 hours after departure, and never later than 7 days after the slot.
- Send `Referrer-Policy: no-referrer` and load no third-party scripts in the PWA.
- Let a forwarded link show booking times only. Showing the driver's name, phone or plate requires a step-up, such as entering the last 3 characters of the plate.

### German specifics

Gate and dock operators' actions carry timestamps and user IDs. That makes rampflow "objectively suitable" to monitor employee behaviour and performance, so §87(1) no. 6 BetrVG gives a works council a co-determination right. Tenants with a works council will need a works agreement (*Betriebsvereinbarung*). Ship role-based visibility for audit logs and let reports show operators under pseudonyms.

### Recommendation for rampflow

Retention defaults. Tenants may shorten them, or lengthen them within the platform maximum.

| Data | Default | Max | Basis |
|---|---|---|---|
| Driver phone | 7 days after departure, cancellation or no-show | 30 days | only needed for the call to the dock |
| Driver name and plate on bookings and visits | 90 days after the visit ends, then removed and the record pseudonymized | 13 months | Transporeon's visibility product deletes location data and plates after 90 days by default; freight claims expire after 1 year (§439 HGB, Art. 32 CMR) |
| De-personalized visit records (carrier, references, timestamps, quantities) | 13 months | tenant-defined | detention and freight disputes; KPIs |
| Avis attachments (delivery note, CMR scans) | 90 days | 13 months | rampflow is not the tax archive; delivery notes that are not accounting vouchers stop needing retention once the invoice arrives |
| Safety completion | until `expiresAt` + 2 years | expiry + 3 years | DGUV I 211-005 via KomNet; the regular limitation period is 3 years (§195 BGB) |
| Instruction content versions | as long as any referencing completion exists | n/a | proof of what was shown |
| Deep-link token hashes | 24 hours after departure, at most 7 days after the slot | n/a | security |
| Staff audit log | 12 months | 24 months | security; works agreement |
| Carrier user accounts (rampflow as controller) | while active; deleted after 24 months of inactivity, with 30 days' notice | n/a | storage limitation |

Deletion and export features:
- **Per driver:** search by name, phone or plate. Export (Art. 15) as JSON and PDF. Erase or pseudonymize (Art. 17). Records still under retention, such as safety completions, are restricted (Art. 18) instead of deleted.
- **Carrier accounts:** portability (Art. 20). Art. 20 applies only to consent or contract bases, so it does not apply to drivers processed under legitimate interest.
- **Tenant exit:** full export and verified deletion at contract end (Art. 28(3)(g)).
- **Deletion jobs:** idempotent, with a deletion log that holds no personal data.

## 6. Multinational aspects

### Findings

- **PostgreSQL:** `timestamptz` stores UTC and converts on output. The PostgreSQL docs advise against `time with time zone`, because an offset means nothing without a date once DST is involved.
- **RFC 5545 (iCalendar):**
  - Nonexistent local times, in the spring-forward gap, are interpreted with the UTC offset from before the gap. Local 02:30 therefore becomes 03:30 summer time.
  - Ambiguous times, in the autumn fold, refer to the first occurrence.
- **Temporal API:** its `disambiguation: "compatible"` default follows this convention. Other options are `earlier`, `later` and `reject`. W3Schools reports native Temporal in Chrome 144 and Firefox 139, but not yet in Safari, so a polyfill or a library is still needed.
- **Opendock:** stores an IANA time zone per warehouse and accepts ISO 8601 times with an explicit offset.
- **DST dates:** under Directive 2000/84/EC, the EU changes clocks on the last Sunday of March and October. The 2018 proposal to abolish this stalled in the Council. Never hard-code transition dates; use tzdata.
- **Holiday data:**
  - `date-holidays`: 207 countries, ISO 3166-2 subdivisions and regions, types public/bank/school/optional/observance, computed for any year. Code is ISC-licensed; the data is CC BY-SA 3.0, so attribution and share-alike obligations apply.
  - Nager.Date: an open-source API that can be self-hosted.
  - OpenHolidays API: 36 countries, mostly European, with public and **school** holidays from 2020 onward and names in local languages, German and English.
- **Regional German holidays:** §30(4) StVO shows how holidays vary within Germany. Corpus Christi and All Saints' Day apply only in some states, Reformation Day in others.

### Recommendation for rampflow

**Time-zone rule.** Store every instant (booking start and end, every visit event) as `timestamptz` in UTC. Store `site.timeZone` as an IANA name. Store opening hours as `(isoWeekday, "HH:mm", "HH:mm")` and exceptions as local date-times, then evaluate them in the site's time zone. Keep a snapshot of `siteTimeZone` on each booking for audit. Every role sees times in the **site's** local time with the zone abbreviation, for example "08:30 CET". When the viewer's zone differs, show their own time as a secondary hint.

**DST.**
- Generate the slot grid by walking local wall-clock times and converting each one with `compatible` disambiguation.
- **Skip** start times that fall in a spring-forward gap; do not shift them, which would create duplicates.
- In an autumn fold, offer both instants and label them with their offsets.
- Compute durations in elapsed UTC minutes, so a 60-minute slot always lasts 60 real minutes.
- Daily caps use the local calendar day, which can be 23 or 25 hours long.
- Most DACH docks are closed on Sunday night, so mainly 24/7 sites are affected. Cover both transition Sundays with tests.

**Holidays.** Each site stores `countryCode` (ISO 3166-1), `subdivisionCode` (ISO 3166-2, for example `DE-BY`) and an optional `date-holidays` region. A nightly job imports public holidays for the next 400 days as `CalendarException{source: "holiday_import"}`. Auto-apply is on for DE, AT and CH; the tenant confirms each holiday elsewhere. Tenants can reopen any date. School holidays from OpenHolidays are only an informational overlay.

**Locales and units.**
- BCP 47 tags; format through `Intl` (CLDR).
- 24-hour clock everywhere, weeks start on Monday (ISO 8601).
- APIs use ISO 8601 with offsets.
- Metric only: kg, cm, m, °C.
- Plates and phone numbers are stored in normalized form: E.164 for phones.

**UI languages first.** The staff and tenant-admin UI ships in de and en. The carrier portal ships in de, en and pl. The driver PWA and safety content ship in the 12 languages from section 4. The platform defaults the driver locale from `driver.locale`, then the browser, then the plate country.

## Sources

Standards and avis
- GS1 Austria DESADV guideline: https://www.gs1.at/sites/default/files/2020-05/DESADV_AT_CZ_SK_V_1.0.pdf
- GS1 Germany eDESADV core: https://www.publikationen.gs1-germany.de/Complete/eEurope_english/desadv/english/printing/eDESADV-core.pdf
- TrueCommerce DESADV D.96A: https://help.truecommerce.com/en/articles/16045095-edifact-desadv-d-96a-despatch-advice
- Telekom Slovenije DESADV guide: https://www.telekom.si/media/a3pb3l4s/desadv_telekom_slovenije_v01.pdf
- EDITEL DESADV SSCC MIG: https://editelgroup.com/fileadmin/user_upload/MediaLibrary/04_SK/Downloads/Message_DESADV_D01B_SSCC_EN.pdf
- VW VDA 4987 T2: https://www.vwgroupsupply.com/one-kbp-pub/media/shared_media/documents_1/electronic_data_interchange/edi_guidelines/lieferscheindaten/vda_4987___global_desadv/VDA4987_T2_Lieferavis_VWGroup_EN.pdf
- Brose VDA 4987 handbook: https://www.brose-sitech.com/suppliers/DE/VDA4987-de.pdf
- ecosio on VDA 4913: https://ecosio.com/de/blog/was-ist-ein-vda-4913-lieferavis-und-wozu-wird-dieser-benoetigt/
- Auria VDA 4913 guide: https://www.auriasolutions.com/wp-content/uploads/Auria-EDI-4913.pdf
- GS1 Sweden pallet label rules: https://gs1.se/en/guides/how-to-guides/labeling-the-pallet/rules-and-recommendations/
- GS1 UK SSCC guide: https://www.gs1uk.org/knowledge-hub/barcodes/how-do-i-create-ssccs-and-logistics-labels
- GS1 GLN summary: https://www.gs1.org/docs/idkeys/GS1_GLN_Executive_Summary.pdf
- GS1 Canada GLN: https://gs1ca.org/standards/global-location-numbers/
- IRU CMR 2007 guide: https://www.iru.org/sites/default/files/2017-01/how-to-fill-cmr-model-iru-2007-en.pdf
- Racklify CMR guide: https://racklify.com/encyclopedia/how-to-fill-and-use-a-cmr-consignment-note-step-by-step-guide/
- GS1 Germany Zeitfenstersteuerung (2013): https://www.gs1-germany.de/fileadmin/gs1/fachpublikationen/anwendungsempfehlung_zeitfenstersteuerung.pdf
- UN/ECE Rec 21 (Peppol): https://docs.peppol.eu/logistics/codelist/UNECERec21/
- Euro pallet sizes: https://quivo.co/en/euro-pallets-dimensions-explained/
- EPAL half pallet: https://cn.epal-pallets.org/news/details/article/the-new-epal-half-pallet-increasingly-popular-on-the-market
- Directive 89/108/EEC: https://eur-lex.europa.eu/eli/dir/1989/108/oj

Booking practice and capacity
- Wanzl time-slot letter: https://www.wanzl.com/_default_upload_bucket/Informationsschreiben_Time-Slot-Management_09.09.2025_DE_1.pdf
- thyssenkrupp Rothe Erde: https://www.thyssenkrupp-rotheerde.com/_binary/UCPthyssenkruppBACTBearing/9f114dcb-0f4b-4a43-b299-4024c7187e33/240513_Zeitfenstermanagement_englisch.pdf
- Zalando Mercareon guide: https://partner.zalando.com/university/article/book-warehouse-delivery-time-mercareon
- Cargoclix training (Wacker Neuson): https://wackerneusongroup.com/fileadmin/general/downloads-de/02_lieferanten/formulare_und_richtlinien/03_logistik/standortspezifische_anforderung/cargoclix_-_schulungsunterlagen_lieferant_reichertshofen.pdf
- Cornelsen delivery rules: https://www.cvk.de/wp-content/uploads/Warenanlieferungsrichtlinien-CVK-1121.pdf
- Faire on Opendock: https://www.faire.com/support/articles/46023138863387
- Opendock booking API: https://developer.loadsmart.com/docs/opendock/for-carriers/booking-appointments
- Opendock API description (`CreateAppointmentDto`, `Dock`): https://neutron.opendock.com/docs-json
- Opendock load type: https://community.loadsmart.com/hc/en-us/articles/14905949746579--Opendock-What-is-a-Load-Type
- Opendock adding docks: https://community.loadsmart.com/hc/en-us/articles/14908083511827--Opendock-Adding-Docks
- Opendock what is a dock: https://community.loadsmart.com/hc/en-us/articles/14908026829587--Opendock-What-is-a-Dock
- Opendock parallel appointments: https://community.loadsmart.com/hc/en-us/articles/14932518094995--Opendock-Multiple-Appointments-per-Time-Slot
- Opendock scheduling restrictions: https://community.loadsmart.com/hc/en-us/articles/14909761890195-Scheduling-Restrictions
- Opendock next-day cutoff: https://community.loadsmart.com/hc/en-us/articles/47964817699603--Opendock-How-the-Next-Day-Scheduling-Cutoff-feature-works
- Opendock YMS: https://community.loadsmart.com/hc/en-us/articles/41909390947987--Opendock-What-is-Opendock-s-Yard-Management-System-YMS
- DataDocks capacity limits: https://datadocks.com/datadocks-features/capacity-limits
- DataDocks booking portal: https://docs.datadocks.com/booking-portal/
- DataDocks custom rules: https://datadocks.com/posts/custom-rules
- C3 on late arrivals: https://www.c3solutions.com/blog-c3/dock-scheduling-carrier-late-arrivals-how-to-deal-with-it/
- C3 on dock scheduling: https://www.c3solutions.com/blog-c3/everything-you-need-to-know-about-dock-scheduling/
- Racklify on dock door assignment: https://racklify.com/encyclopedia/what-is-dock-door-assignment-definition-role-and-common-practices/
- Transporeon TSM fact sheet: https://www.transporeon.com/website/Fact%20Sheet/de/FactSheet_Time_Slot_Management_DE.pdf
- Transporeon TSM masterclass: https://www.transporeon.com/website/pdf/TSM%20Masterclass-DE.pdf
- Open Logistics Foundation TSM: https://logistik-heute.de/news/open-source-open-logistics-foundation-will-zeitfenstermanagement-dynamisch-machen-216391.html
- Standgeld ruling (Verkehrsrundschau): https://www.verkehrsrundschau.de/nachrichten/recht-geld/urteil-standgeld-bei-ueberziehung-des-ladezeitfensters-rechtens-2993240
- §30 StVO: https://www.gesetze-im-internet.de/stvo_2013/__30.html

Yard and gate
- Terminal Industries on YMS: https://terminal-industries.com/blog/yard-management-system-ai-powered-operations
- Hyperbots yard glossary: https://www.hyperbots.com/glossary/yard-management
- SG Systems YMS glossary: https://sgsystemsglobal.com/glossary/yard-management-system/
- heylog digital check-in: https://heylog.com/lkw-anmeldung-werk-digitalisieren/
- friendlyway digital truck gate: https://www.friendlyway.de/digitale-lkw-pforte
- friendlyway driver safety briefing: https://www.friendlyway.de/digitale-sicherheitsunterweisung-fuer-lkw-fahrer-in-der-logistik
- welcomeyou truck management: https://welcomeyou.de/lkw-management/
- myleo/dsc self check-in: https://telematik-markt.de/telematik/lkw-fahrer-app-von-myleo-dsc-erm%C3%B6glicht-self-check-ohne-vorgebuchte-zeitfenster
- BGHW M 5 Laderampen: https://www.bghw-medienshop.de/fileadmin/user_upload/BGHW_Medienshop/Website/Medien-Dateien/M/M_5.pdf
- VBG Laderampen: https://www.vbg.de/cms/_Resources/Persistent/c/3/0/e/c30e17e6739b1768283e836c63ddbdcc7f9e47ec/fi_laderampen.pdf
- ASSA ABLOY Combidock: https://www.assaabloyentrance.com/at/de/solutions/products/loading-dock-equipment/dock-levelers/assa-abloy-dl6030c-combidock

Safety instruction law and practice
- §12 ArbSchG: https://www.gesetze-im-internet.de/arbschg/__12.html
- §8 ArbSchG: https://www.gesetze-im-internet.de/arbschg/__8.html
- DGUV Vorschrift 1 (VBG print): https://cdn.vbg.de/media/c1d2782713bf49da9a9afe7c27afad8b/dld:attachment/VBG_DGUV%20V1_2024-06_WEB.pdf
- §12 BetrSichV: https://www.gesetze-im-internet.de/betrsichv_2015/__12.html
- KomNet on truck drivers: https://www.komnet.nrw.de/_sitetools/dialog/17545
- KomNet on record retention: https://www.komnet.nrw.de/_sitetools/dialog/42746
- Uni Duisburg-Essen on instructions: https://www.uni-due.de/chemie/arbeitssicherheit/schutz/unterweisungen
- BG Verkehr on contractors: https://www.bg-verkehr.de/arbeitssicherheit-gesundheit/themen/arbeitsschutz-organisieren/fremdfirmen-und-lieferanten
- fm-connect on truck drivers: https://zutritt.fm-connect.com/strategie/fremdfirmen/lkw-fahrer/
- Dyckerhoff driver briefing: https://www.dyckerhoff.com/en/logistik-sicherheitsunterweisung
- SafetyWorx365: https://safetyworx365.de/sicherheitsunterweisungen
- Quentic online instruction: https://www.quentic.at/software/online-unterweisungen/
- secova contractor management: https://www.secova.de/software/fremdfirmenmanagement/
- hse-COACH: https://www.hse-coach.com/
- LENA contractor briefing: https://www.lena-training.de/funktionen/fremdfirmenunterweisung
- Lobster services: https://lobster-world.com/en/service
- Directive 89/391/EEC Art. 6: https://www.legislation.gov.uk/eudr/1989/391/article/6
- Directive 89/391/EEC Art. 12: https://www.legislation.gov.uk/eudr/1989/391/article/12
- Austria §8 ASchG: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10008910&Paragraf=8
- Switzerland VUV Art. 9 (secondary): https://www.air-glaciers.ch/media/attachments/2019/88819_D_AG.pdf
- Poland Art. 208 Labour Code: https://e-prawnik.pl/artykuly/jedno-miejsce-pracy--wielu-pracodawcow-a-koordynator-ds--bhp-.html
- HSE visiting drivers: https://hse.gov.uk/workplacetransport/personnel/managingvisitors.htm
- BALM Mautverkehr KOMPAKT, Dec 2025: https://www.balm.bund.de/SharedDocs/Downloads/DE/Verkehrsdatenmanagement/Mautverkehr_KOMPAKT/Mautverkehr_KOMPAKT_Monatsausgaben_2025/Mautverkehr_KOMPAKT_Ausgabe_Dezember_2025.pdf?__blob=publicationFile&v=2
- trans.info on migrant drivers: https://trans.info/en/migrant-truck-drivers-478421
- Central Asian drivers study: https://www.tandfonline.com/doi/full/10.1080/02634937.2025.2479099

GDPR
- Transporeon driver privacy policy: https://legal.transporeon.com/DP/RTV/en_Driver_Privacy_Policy.pdf
- Transporeon carrier SCC addendum: https://www.transporeon.com/website/Legal/scc/2025/EN_Transporeon_GmbH_AddAgr_EU_model_clauses_Carrier_V4.0_online.pdf
- EDPB Guidelines 07/2020: https://www.edpb.europa.eu/documents/309_en
- GDPR Art. 14: https://gdpr-info.eu/art-14-gdpr/
- GDPR Art. 20: https://gdpr-info.eu/art-20-gdpr/
- GDPR Art. 28: https://gdpr-info.eu/art-28-gdpr/
- OWASP query-string exposure: https://community.owasp.org/vulnerabilities/Information_exposure_through_query_strings_in_url
- CMS on CJEU C-34/21: https://cms.law/de/deu/legal-updates/eugh-keine-generalklauseln-im-beschaeftigtendatenschutz
- Rechtslupe on §87 BetrVG: https://www.rechtslupe.de/arbeitsrecht/fahrtkostenabrechnung-mit-google-maps-und-die-mitbestimmung-des-betriebsrats-373486
- betriebsrat.de on monitoring systems: https://www.betriebsrat.de/betriebsratslexikon/br/technische-kontrolleinrichtungen
- WBS on GPS tracking ruling: https://www.wbs.legal/it-und-internet-recht/datenschutzrecht/verstoss-gegen-dsgvo-heimliches-gps-tracking-von-lkw-fahrern-verboten-61201/
- sevdesk on delivery note retention: https://sevdesk.de/lexikon/aufbewahrungsfristen-lieferscheine
- Eurotransport on freight claim limitation: https://www.eurotransport.de/logistik/recht-und-management/transportrecht-verjaehrung-von-frachtanspruechen/
- Rechtslupe on freight claim limitation: https://www.rechtslupe.de/wirtschaftsrecht/handelsrecht/verjaehrung-bei-frachtvertraegen-319095

Time and i18n
- PostgreSQL date/time types: https://www.postgresql.org/docs/current/datatype-datetime.html
- RFC 5545 DATE-TIME: https://icalendar.org/iCalendar-RFC-5545/3-3-5-date-time.html
- MDN Temporal ZonedDateTime.with: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/with
- W3Schools Temporal: https://www.w3schools.com/jsrEF/jsref_obj_temporal_duration.asp
- EP Think Tank on clock changes: https://epthinktank.eu/2018/11/30/discontinuing-seasonal-changes-of-time-eu-legislation-in-progress/
- date-holidays: https://github.com/commenthol/date-holidays
- Nager.Date: https://nagerholidays.com/
- OpenHolidays API: https://www.openholidaysapi.org/en/
