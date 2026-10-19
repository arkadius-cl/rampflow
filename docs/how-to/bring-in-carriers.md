---
title: Bring carriers in by invitation or public link
description: Invite a carrier by email, share a site's public booking link, approve or reject registrations, deactivate a carrier, and know what the carrier sees at each step.
type: how-to
audience: [tenant-admin, carrier, developer]
tags: [booking, carriers, invitations, public-link, registration]
status: draft
updated: 2026-10-19
related: [docs/reference/api-routes.md, docs/reference/data-model.md, docs/explanation/mvp-scope.md]
---

# Bring carriers in by invitation or public link

A carrier books slots only at a tenant it is linked to. There are two ways to create the link: an invitation by email (TN-03) and a public booking link per site (TN-04). Both screens are under **Carriers** in the sidebar, which needs the `booking.manage_carriers` permission (dispatchers and tenant admins).

## Invite a carrier

1. Open **Carriers** and select **Invite carrier**.
2. Enter the company name and the contact's email. Pick the language of the email.
3. Select **Send invitation**.

The carrier receives a link to `/carrier-invite`. It works once and for 7 days. The invitation shows under **Pending invitations** until it is accepted.

- **Send again** issues a fresh 7-day link and revokes the old one.
- **Revoke** makes the link stop working at once.

What the carrier does:

- A new contact enters their name, confirms or corrects the company name and chooses a password. They become the administrator of a new carrier company, and the link to your warehouse is active.
- A contact who already has a rampflow account signs in on the same page. The invitation links their existing company instead of creating a new one.

The invitation email is an account email. It is sent even when your package has carrier booking emails (`notify.email`) switched off.

## Share a public booking link

1. Open **Carriers**, tab **Public links**. Each site has one row.
2. Select **Create link** for the site. The link has the form `https://<host>/r/<slug>`.
3. Switch the link on: in **Settings**, choose the site and set **Public booking link** (`booking.public_link_enabled`) to on.
4. In the same place, choose how new carriers are approved (`booking.public_registration_mode`):
   - **Approved by you** (`approval_required`, the default): registrations wait for you.
   - **Approved automatically** (`auto_approve`): a carrier can book as soon as it confirms its email.
5. Copy the link and share it.

The link answers only while the site setting is on and your package includes public links. Otherwise visitors see "Link not available", whatever the slug.

If a link leaks, select **Replace link**. The old link stops working at once.

What the carrier does: it enters company name, country, contact name and email, then confirms the email through the link it receives (valid 24 hours). An email that already has an account gets a sign-in prompt instead, and the registration joins that account's company.

## Approve or reject a registration

1. Open **Carriers**, tab **Registrations**. Registrations waiting for you show **Waiting for approval**.
2. Select **Approve** to link the carrier. It receives an email and can book at once.
3. Or select **Reject**, enter a reason and confirm. The carrier receives the reason by email and is not linked.

Registrations whose email is not confirmed yet show **Email not confirmed**. You cannot decide them.

## Deactivate a carrier

1. Open **Carriers**, tab **Linked carriers**.
2. Select **Deactivate** in the carrier's row and confirm.

The carrier can no longer book new slots or move bookings at your warehouse; the booking API answers 403 with reason `link_inactive`. Existing bookings stay visible to you and to the carrier, and the carrier can still cancel them. The carrier's **Warehouses** screen shows "Paused by the warehouse".

Select **Activate** to lift it. Approving a registration of the same carrier, or an invitation you send after the deactivation, also reactivates the link once accepted. An older invitation and an automatically approved registration do not.

## Demo data

`pnpm db:seed` links Trans-Pol and Baltic Freight UAB to Acme Logistics. When the Acme site "Hamburg" exists, it also creates and switches on the public link `/r/acmehambrg`.
