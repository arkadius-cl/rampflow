---
title: Book a slot as a carrier
description: Book a slot at a linked warehouse, book again from an earlier booking, change or cancel before the cutoff, and share the driver link.
type: how-to
audience: [carrier, developer]
tags: [booking, carrier-portal, avis, driver-link]
status: draft
updated: 2026-10-19
related: [docs/reference/api-routes.md, docs/reference/booking-lifecycle.md, docs/how-to/bring-in-carriers.md, docs/explanation/mvp-scope.md]
---

# Book a slot as a carrier

A carrier books at every warehouse that linked it ([Bring carriers in](bring-in-carriers.md)). Booking is free for carriers. Every time on these screens is the site's local time, with the zone next to it; when your own zone shows another clock, your time follows in brackets.

## Book a slot

1. Select **New booking** in the sidebar.
2. **Where and what**: choose the warehouse, the site and the load type. Enter the number of load units and their type. The line below shows how long the load takes at this site.
3. **When**: choose a day in the strip, then a start time. Only times that fit the site's opening hours, closures, free capacity, lead time and horizon show. Use the arrows for the next week.
4. **Avis**: enter the references, the supplier or recipient, the truck and the driver. The site decides which fields are required.
5. Select **Confirm booking**.

The confirmation shows the booking code, its QR code, the slot, the site address and until when you can change the booking. The same arrives by email.

If another carrier takes the time while you fill in the avis, the **When** step opens again with the times that are still free. Your avis stays filled in.

## Book again

On a booking's page, select **Book again**. The wizard opens on **When** with the warehouse, site, load type, load units and avis of that booking. References and the driver stay empty, because they change from load to load. Choose a time, enter the references and confirm.

## Change or cancel

1. Open **Bookings** and select **Change** on the row.
2. Select **Change time** to pick a new start, or **Cancel booking**.

Both work until the cutoff that the site sets (`booking.cancel_cutoff_minutes` before the start). After the cutoff, the row shows **Details**, both buttons are disabled and the page shows the site's phone number. A cancel frees the slot at once and the driver link stops working.

**Edit avis** on the booking page works until the same cutoff. If new load units make the load too long for the slot, the edit is refused and the stored avis stays.

When a warehouse pauses your link, you can still read and cancel your bookings there, but not book or change them.

## Share the driver link

The **Driver link** card on the booking page and on the confirmation gives the driver one link with the slot, the address, the safety briefing and the dock call.

- **Copy** puts the link on the clipboard.
- **Email to driver** sends it in the language you choose from the 12 driver languages.
- **Share…** opens the device's share sheet where the browser offers one.
- **Regenerate link** creates a new link and stops the old one at once. Use it when the link reached the wrong person.

Copying, emailing and sharing never change the link.
