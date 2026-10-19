---
title: Set up a site for booking
description: Create a site with its time zone and region, add halls and docks, decide per dock whether it is booked in a pool, on its own or not at all, set weekly hours and closures, and check the load types, so carriers get correct start times.
type: how-to
audience: [tenant-admin, developer]
tags: [sites, docks, capacity, hours, closures, load-types]
status: stable
updated: 2026-10-19
related: [docs/decisions/ADR-0004-booking-capacity-concurrency.md, docs/decisions/ADR-0012-time-handling.md, docs/reference/api-routes.md]
---

# Set up a site for booking

A site offers start times only when four things are in place: bookable docks, weekly hours, a load type and that load type's resources. This guide sets them up in that order. You need the tenant admin role.

## Create the site

1. Open **Sites and docks** in the sidebar and select **New site**.
2. Enter the name and address.
3. Enter the country as two letters (`DE`) and the region as an ISO 3166-2 code (`DE-BY`). The region decides which public holidays close the site.
4. Select the time zone. Slots, hours and closures use this zone's clock, whatever zone the viewer is in.
5. Select **Create site**.

The new site starts with three load types and with the public holidays of the next 400 days. If your package allows no more sites, the site is not created and a message says that the package limit is reached. The meters on the sites page show how many sites and docks you use against your package. Active docks and docks in maintenance count; inactive docks do not.

## Add halls and docks

1. On the site page, open **Halls, docks and pools**.
2. Select **New hall** and name it.
3. In the hall, select **Dock** and enter a code. The code is unique at the site. Drivers see it when they are called.
4. Set the door type, temperature zone, the dangerous goods (ADR) flag and the status. A dock in maintenance adds no capacity.

## Decide how each dock is booked

Every dock row has a **Booked as** column with three choices:

- **Not bookable**: carriers cannot book the dock.
- **Single dock**: carriers book this dock on its own.
- **Pool &lt;name&gt;**: carriers book the pool. The dock is assigned when the truck arrives.

A dock is in one pool or booked on its own, never both. To create a pool, select **New pool** in **Bookable resources**, enter a name, the directions, the parallel slots (empty means one truck per active dock) and an optional daily cap, then tick the member docks. Docks that are already in another pool or booked on their own are greyed out with the resource they belong to. Change them in their **Booked as** column first.

Lowering parallel slots, the daily cap or the member docks never cancels bookings. Bookings above the new capacity show as over capacity on the plan board.

Pools need the `booking.pools` feature of your package. Without it, existing pools keep offering times, but you cannot create or change pools.

## Set hours and closures

1. Open **Hours and closures**.
2. In **Weekly hours**, add one or more windows per weekday and select **Save hours**. A day without a window is closed. Write `24:00` to stay open until midnight. A night shift is two windows: `22:00` to `24:00` and `00:00` to `06:00` on the next day.
3. To give one pool or dock narrower hours, select it in **Hours of** and turn on **Own hours**.
4. To close the site or block one resource, select **Add closure** and enter the start and end in site time.

Public holidays appear in the closures list. To open the site on a holiday, select **Reopen**. The holiday import never closes a reopened day again. If the setting **Closed on public holidays** is off for the site, holidays block nothing and the list says so.

## Check the load types

1. Open **Load types**.
2. Edit each load type and tick the pools and single docks it can be booked on under **Bookable on**. A load type offers times only on resources that serve its direction.
3. Set the duration, either fixed or by load units (the `booking.duration_rules` feature), and the buffer after each booking.
4. Turn off **Carriers can book it** for load types that only staff book.

With the seeded **Palletised** load type, 20 pallets take 60 minutes and 40 pallets take 90.

## Demo data

`pnpm db:seed` creates two sites for Acme Logistics:

- **Hamburg DC** (Europe/Berlin, DE-HH): halls *Halle 1* (T01 to T05) and *Halle 2* (T06 to T08), the inbound pool *Wareneingang* (T01 to T04), the outbound pool *Versand* (T06, T07), single docks T05 and T08, hours Monday to Friday 06:00 to 22:00 and Saturday 06:00 to 14:00, the three seeded load types plus *Palletised (outbound)*.
- **Bucharest** (Europe/Bucharest, RO-B): hall *Hall A* with the pool *Ramps* (R1, R2), hours Monday to Friday 07:00 to 19:00.
