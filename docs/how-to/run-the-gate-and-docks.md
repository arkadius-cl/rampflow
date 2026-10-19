---
title: Run the gate and the docks
description: How gate and dock operators check trucks in, handle walk-ins and turn-aways, call trucks to docks, record loading and check trucks out on the station tablets.
type: how-to
audience: [gate-operator, tenant-admin, developer]
tags: [yard, gate, docks, safety, station]
status: draft
updated: 2026-10-19
related: [docs/reference/api-routes.md, docs/reference/booking-lifecycle.md, docs/explanation/ux-concept.md]
---

# Run the gate and the docks

The gate screen is `/t/<org>/gate` and the dock screen is `/t/<org>/docks`. Both run in the station layout for tablets: no sidebar, large buttons, and the site in the address (`?site=`). A tablet opens the site it used last. Pick another site in the header menu.

## Check a truck in

1. Scan the QR code of the booking with the scanner, or type the booking code, the plate, a reference or the carrier name in the search field. Then press Enter. An exact booking code opens the check-in at once.
2. Compare the plate on the truck with the one shown. Correct it in **Plate as seen** if it differs.
3. Check the punctuality badge. It uses the site's early tolerance and grace minutes.
4. If the site requires a safety briefing and none is linked, **Check in now** stays disabled. Do one of these:
   - Type the driver's name in **Find by driver name**, then select **Link** next to a valid briefing.
   - Select **Start briefing here** and hand the tablet to the driver. When the driver finishes, select **Refresh status**.
5. Select **Check in now**. The truck moves to the **On site** tab.

A truck marked as a no-show can still check in on the same site-local day. It counts as late.

## Turn a truck away

In the check-in dialog, choose a reason under **Turn away instead** and select **Turn away**. A truck that is checked in but not yet called shows **Turn away** on the **On site** tab.

## Record a walk-in

1. Select **Walk-in**.
2. Enter the carrier, the plate, the load type and the shipment details.
3. Select **Check in now**, or choose a reason and select **Turn away**.

Opening hours and capacity never block a walk-in. If the site requires a briefing, the walk-in stays on the **Expected** tab with "Briefing missing" until you link one.

## Call a truck to a dock

1. On the dock screen, select **Call to dock** next to a truck in the queue. Gate operators can do the same from the **On site** tab.
2. Keep the suggested dock, or pick another one. A dock outside the booking's pool shows a warning, and the call still works. Occupied docks and docks in maintenance cannot be picked.
3. Select **Call to <dock>**. The driver's phone shows the dock and hall on its next poll, within 15 seconds.

If the driver does not come, select **Cancel call** on the dock card. The dock becomes free and the truck returns to the queue.

## Record loading

On the dock card, select **At dock**, then **Loading**, then **Done**. You can skip a step. **Done** asks for the actual load units and an optional discrepancy note, then frees the dock.

## Check a truck out

On the **On site** tab, select **Check out**. A truck that is not done needs a reason. The driver link expires `privacy.retention.driver_link_hours` after departure.

## When the tablet is offline

The header shows **Offline** and every action is disabled. The lists keep their last state with the time of that state. Nothing is queued, so wait for the connection and repeat the action.
