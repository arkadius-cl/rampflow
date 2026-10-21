---
title: Set up a site for booking
description: Create a site with its time zone, region and weekly hours, add halls and docks, split the default pools or book docks on their own, set closures, and check the load types, so carriers get correct start times.
type: how-to
audience: [tenant-admin, developer]
tags: [sites, docks, capacity, hours, closures, load-types]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0004-booking-capacity-concurrency.md, docs/decisions/ADR-0017-homogeneous-pools-dock-profile.md, docs/decisions/ADR-0012-time-handling.md, docs/reference/api-routes.md]
---

# Set up a site for booking

A site offers start times only when it has weekly hours, an active dock, and a load type linked to that dock's pool or single dock. The site form asks for the hours, and every new dock joins a pool that is linked to the site's load types. A new site with one dock therefore offers start times without further setup. This guide covers the defaults and how to change them. You need the tenant admin role.

## Create the site

1. Open **Sites and docks** in the sidebar and select **New site**.
2. Enter the name and address.
3. Enter the country as two letters (`DE`) and the region as an ISO 3166-2 code (`DE-BY`). The region decides which public holidays close the site.
4. Select the time zone. Slots, hours and closures use this zone's clock, whatever zone the viewer is in.
5. Under **Opening hours**, choose a template:
   - **One shift**: Monday to Friday, 06:00 to 14:00. This template is preselected.
   - **Two shifts**: Monday to Friday, 06:00 to 22:00.
   - **Custom**: starts from the template you chose last. Add several windows a day, for example to close for a lunch break.
6. Select **Create site**.

The site needs at least one window. You can change the hours later on the **Hours and closures** tab. The new site starts with three load types and with the public holidays of the next 400 days. If your package allows no more sites, the site is not created and a message says that the package limit is reached. The meters on the sites page show how many sites and docks you use against your package. Active docks and docks in maintenance count; inactive docks do not.

## Add halls and docks

1. On the site page, open **Halls, docks and pools**.
2. Select **New hall** and name it.
3. In the hall, select **Dock** and enter a code. The code is unique at the site. Drivers see it when they are called.
4. Set the door type, temperature zone, the dangerous goods (ADR) flag and the status. A dock in maintenance adds no capacity. To take a dock out of service, set its status to inactive.

The new dock joins the default pool of its hall and dock profile. The dock profile is the door type, the temperature zone and the ADR flag. If the hall has no pool for that profile yet, rampflow creates one, linked to every load type of the site. The pool is named after the hall, plus every attribute that differs from dock leveler, ambient and no ADR. A frozen dock in *Halle 2* of a German site gets the pool *Halle 2 · Tiefkühl*. The pool editor marks a default pool with **Hall pool**. You can rename it.

If your package does not include pools (`booking.pools`), the new dock becomes a single dock instead.

The dock dialog shows **Bookable for**: the dock's pool or **Single dock**, and its active load types. If you change the profile of a dock in a pool, the dialog says that saving moves the dock to the pool for its new profile.

## Split the pools by hand

A pool books as one unit, and the dock is assigned when the truck arrives. rampflow never splits a pool on its own. Split it when docks of one hall serve different work, for example inbound and outbound.

Every dock row has a **Booked as** column with these choices:

- **Single dock**: carriers book this dock on its own.
- **Pool &lt;name&gt;**: carriers book the pool.

A dock is always in exactly one pool or booked on its own. Choosing another entry moves it there. A pool of another profile, or the hall pool of another hall, is disabled, and its entry says why.

To split a pool:

1. In **Bookable resources**, select **New pool**.
2. Enter a name, the directions, the parallel slots (empty means one truck per active dock) and an optional daily cap.
3. Tick the member docks. A dock that is in another pool or booked on its own says where it moves from. Docks of another profile than the first ticked dock are disabled.
4. Select **Create pool**.

The docks move into the new pool, and the new pool gets the load types of the pools they came from. If you later untick a dock in a pool that you created, the dock returns to the default pool of its hall and profile. A hall pool keeps its own docks: to take one out, choose another pool or **Single dock** in its **Booked as** column.

A dock's pool or single dock always keeps at least one active load type. If a change would leave a dock without one, the change is refused and the message names the docks. Link another active load type to their pool first.

Lowering parallel slots, the daily cap or the member docks never cancels bookings. Bookings above the new capacity show as over capacity on the plan board.

Pools need the `booking.pools` feature of your package. Without it, existing pools keep offering times, but you cannot create or change pools.

## Set hours and closures

1. Open **Hours and closures**.
2. In **Weekly hours**, add one or more windows per weekday and select **Save hours**. A day without a window is closed. Write `24:00` to stay open until midnight. A night shift is two windows: `22:00` to `24:00` and `00:00` to `06:00` on the next day.
3. To give one pool or dock narrower hours, select it in **Hours of** and turn on **Own hours, narrower than the site's**.
4. To close the site or block one resource, select **Add closure** and enter the start and end in site time.

Public holidays appear in the closures list. To open the site on a holiday, select **Reopen**. The holiday import never closes a reopened day again. If the setting **Closed on public holidays** is off for the site, holidays block nothing and the list says so.

## Check the load types

1. Open **Load types**.
2. Edit each load type and tick the pools and single docks it can be booked on under **Bookable on**. A load type offers times only on resources that serve its direction.
3. Set the duration, either fixed or by load units (the `booking.duration_rules` feature), and the buffer after each booking.
4. Turn off **Carriers can book it** for load types that only staff book.

With the seeded **Palletised** load type, 20 pallets take 60 minutes and 40 pallets take 90.

## Demo data

`pnpm db:seed` creates three sites for Acme Logistics:

- **Hamburg DC** (Europe/Berlin, DE-HH): halls *Halle 1* (T01 to T05) and *Halle 2* (T06 to T09), the inbound pool *Wareneingang* (T01 to T04), the outbound pool *Versand* (T06, T07), single docks T05 and T08, hours Monday to Friday 06:00 to 22:00 and Saturday 06:00 to 14:00, the three seeded load types plus *Palletised (outbound)*. *Wareneingang* and *Versand* are the renamed hall pools of *Halle 1* and *Halle 2*. The frozen dock T09 is alone in its own hall pool *Halle 2 · Tiefkühl*, which shows the profile rule and **Bookable for**.
- **Bucharest** (Europe/Bucharest, RO-B): hall *Hall A* with the pool *Ramps* (R1, R2), hours Monday to Friday 07:00 to 19:00.
- **Lager Hamburg** (Europe/Berlin, DE-HH): hall *Halle 1* with the pool *Rampen 1–6* (D-01 to D-06), open around the clock. The first `pnpm db:seed` of a day adds that day's demo bookings here, around the current time and in every state of the visit, from booked to departed.
