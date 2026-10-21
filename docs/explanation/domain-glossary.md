---
title: Domain glossary
description: German and English names for every rampflow domain term, the parties involved, and the invariants that hold between them.
type: explanation
audience: [agent, developer]
tags: [glossary, domain, tenancy, booking, yard, safety, avis]
status: draft
updated: 2026-10-21
---

# Domain glossary

The code uses the English term. The UI shows the localized term.

## Parties

| English (code) | Deutsch (UI) | Meaning |
|---|---|---|
| Platform | Plattform | The operator of rampflow. Platform admins manage tenants, packages and platform-wide default settings. |
| Tenant | Mandant / Lagerbetreiber | Paying customer. Owns sites, docks, staff, and the carrier relationships. |
| Carrier | Spedition / Lieferant | Company that books slots at a tenant's docks. Does not pay. One carrier works with many tenants. |
| Driver | Fahrer | Person who drives the truck. Belongs to a carrier. Has no password. Reaches the app through a deep link. |
| Gate operator | Pförtner / Torpersonal | Tenant staff at the gate. Checks trucks in and out. |
| Dock operator | Rampenpersonal / Lagerist | Tenant staff at the docks. Calls trucks to a dock and records loading progress. |
| Dispatcher | Disponent | Tenant staff who plans the day, edits bookings and manages carriers. |

## Locations

| English (code) | Deutsch (UI) | Meaning |
|---|---|---|
| Site | Standort | A physical warehouse location with an address and a time zone. |
| Hall | Halle | A building on a site. Groups docks. |
| Dock | Rampe / Tor | One loading door. Has attributes such as door type, leveler, reefer. |
| Dock pool | Rampen-Pool | A named group of docks on one site that is booked as one unit with a capacity. The concrete dock is assigned on arrival. |
| Bookable resource | Buchbare Ressource | Either a dock pool or a standalone dock. Carriers book against bookable resources only. |
| Yard | Hof | The area between gate and docks where trucks wait. |

## Process

| English (code) | Deutsch (UI) | Meaning |
|---|---|---|
| Booking | Buchung / Zeitfenster | A reserved time slot at a bookable resource for one truck visit. |
| Avis | Avis / Lieferavis | Advance notice of what the truck carries: orders, delivery notes, load units, weight, hazmat. |
| Visit | Besuch / Anlieferung | The physical truck visit for a booking, from gate arrival to departure. |
| Safety briefing | Sicherheitsunterweisung | Site rules a driver must acknowledge before entering. Versioned, multilingual, valid for a period. |
| Acknowledgement | Unterweisungsnachweis | Proof that a driver completed a briefing version in a language at a time. |
| Entitlement | Berechtigung (Lizenz) | A feature flag or numeric limit a module declares. Packages are lists of entitlements. |
| Package | Paket | A sellable bundle of entitlement values assigned to a tenant. |
| Setting | Einstellung | A typed configuration value with a platform default that a tenant or site may override. |
| Registration (`tenant_signup`) | Registrierung | A company's self-registration at `/signup`, waiting for its email link. Confirming the email creates the tenant and its first `tenant_admin`. Not the carrier registration through a public link (`carrier_registration`, CR-02). |
| Tenant status: onboarding | Einrichtung | A tenant without an activation time (`org.activated_at` null). Every new tenant starts here, whether self-registered or created by the platform admin. Derived, never stored. |
| Tenant status: active | Aktiv | A tenant with an activation time. Tenants that existed before change 02 were backfilled as active since their creation. |
| Tax id (`tax_id_type`, `tax_id_value`) | Steuer-ID | The company's tax registration number, one of: `eu_vat`, the EU VAT number (USt-IdNr in Germany, NIP UE in Poland), confirmed against VIES; `de_stn`, a German Steuernummer (10, 11 or 13 digits) or Wirtschafts-Identifikationsnummer (W-IdNr, `DE` plus 14 digits); `pl_nip`, the Polish NIP (10 digits). |
| Tax id status | Prüfstatus der Steuer-ID | `pending` until VIES answered for an `eu_vat`, `verified` or `unverified` by its answer, `unavailable` when VIES did not answer. `de_stn` and `pl_nip` stay `unverified`: no registry is queried. |

## Working hypotheses for the data model

These are the starting assumptions for the architecture phase. ADRs in `docs/decisions/` confirm or replace them.

- A dock belongs to at most one dock pool. A dock in a pool is not bookable on its own, so pool capacity and single-dock bookings never double count the same door.
- A booking targets exactly one bookable resource. A pool booking gets its concrete dock assigned later, at check-in or by the dock operator.
- A booking carries its visit lifecycle as a state machine. Every transition writes an event row with actor and time.
- Times are stored in UTC. Opening hours and slots are defined in the site's time zone.
- Settings resolve site, then tenant, then platform, then the module's coded default.
- Every module ships a manifest that declares its entitlements, permissions and settings. The platform validates packages against the union of manifests.
