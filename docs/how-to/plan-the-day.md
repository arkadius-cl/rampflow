---
title: Plan the day on the plan board
description: Read the plan board of a site, book a slot for a carrier (also over capacity), reschedule or cancel before check-in, and edit the avis until departure.
type: how-to
audience: [dispatcher, tenant-admin]
tags: [booking, avis]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/ux-concept.md, docs/reference/booking-lifecycle.md, docs/decisions/ADR-0004-booking-capacity-concurrency.md]
---

# Plan the day on the plan board

The plan board shows one day of one site (BK-01). Dispatchers book, reschedule and cancel there (BK-02, BK-03). Gate and dock operators see the board too, but they cannot book.

## Read the board

1. Open **Plan board** in the sidebar.
2. Select the site in the toolbar. Use the arrows, the date button or **Today** to change the day.
3. Read the board:
   - Each bookable resource has a column. A pool column shows `booked/capacity` for each grid slot, for example `1/2`. A single dock shows only its bookings.
   - Times are site time. The zone label (CET or CEST) is in the top left corner and next to every time in the detail panel.
   - A grey slot is closed. A red slot holds more load than its capacity. Bookings in a red slot have a dashed red border and a warning icon (MD-03 "over capacity").
   - Departed, cancelled and no-show bookings span the column and are dimmed.
   - On today, an orange line marks the current site time.
4. Select a booking to open the detail panel. It shows the slot, the load, the plate, the references, the flags and the timeline.

The board refreshes every 15 seconds. A booking made elsewhere shows without a reload.

For keyboard and screen-reader use, select **List** in the toolbar. The list has the same bookings as a table.

## Book a slot for a carrier

1. Select **New booking**.
2. Under **Carrier**, select a linked carrier, or select **Other company** and enter a name. A carrier without an account gets no email.
3. Select the load type, the date and, if you want a specific one, the resource. **Any free resource** lets the system choose.
4. Select a start time. Lead time and booking horizon do not apply to staff.
5. Enter the shipment details (avis). The fields marked **Required at this site** come from the site settings.
6. Select **Book**.

The booking opens in the detail panel. The carrier's admins get a confirmation email.

## Book over capacity

A start time marked **full** has no capacity left. You need the permission to book over capacity (dispatchers have it).

1. Select the full start time.
2. Enter the reason under **Reason for booking over capacity**.
3. Select **Book over capacity**.

The booking gets the flag **Booked over capacity**. The reason is in the timeline. A closed time cannot be booked, also not over capacity.

## Reschedule or cancel

You can reschedule or cancel until the truck checks in. The carrier cutoff does not apply to staff.

1. Select the booking on the board.
2. Select **Reschedule**, choose the new day, resource and start time, and select **Reschedule**. Capacity is checked again without this booking.
3. Or select **Cancel booking**, enter a reason if you want, and confirm. The slot is free at once.

The carrier gets an email for each change. After check-in both buttons are off, and the panel says why. The gate and dock screens continue the visit.

## Edit the shipment details

1. In the detail panel, select **Open booking**. The booking page opens at `/t/<org>/bookings/<booking id>`.
2. In **Shipment details**, select **Edit**, change the fields, and select **Save shipment details**.

Staff can edit until the truck departs. Before check-in, a change of load units that needs more time than the slot has free is refused: the page shows "That time is full" and keeps the stored details. Reschedule the booking first, or edit again after check-in, when the truck carries what it carries.
