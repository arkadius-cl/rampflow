---
title: Answer a data subject request
description: How a tenant admin finds what rampflow stores about a driver, exports it as JSON and erases it, and how operators run the retention job.
type: how-to
audience: [tenant-admin, developer]
tags: [privacy, gdpr, retention, tenancy]
status: draft
updated: 2026-10-19
related: [docs/reference/api-routes.md, docs/reference/data-model.md, docs/explanation/research/domain-standards.md]
---

# Answer a data subject request

A driver can ask what your company stores about them (GDPR Art. 15), or ask you to erase it (Art. 17). This guide shows a tenant admin how to answer both requests on the **Privacy requests** screen. It also shows operators how to run the retention job.

## Before you start

- You need the tenant admin role. Other roles do not see the screen.
- Verify the identity of the person who makes the request. rampflow cannot do this for you.
- Ask for at least one identifier: the full name as the carrier entered it, the phone number, or a plate.

## Find the driver

1. Open **Privacy requests** in the sidebar.
2. Enter the name, phone or plate. One identifier is enough.
   - The name must match in full. Letter case does not matter.
   - Enter the phone in international format, for example `+48 600 123 456`.
   - Spaces and dashes in a plate do not matter.
3. Select **Search**.

The screen lists two kinds of records:

- **Bookings**: bookings whose avis holds the identifier, with the driver data stored on each.
- **Safety acknowledgements**: briefings that the driver completed under this name or for one of these bookings. The **Retention** column shows whether the law still requires you to keep each one.

The search terms do not appear in the URL or in any log.

## Export the data

Select **Export JSON**. The browser downloads one file with every matched booking and acknowledgement. Send this file to the driver. rampflow records that an export took place, with the number of records but without the search terms.

## Erase the data

1. Select **Erase**.
2. Read the summary. It shows how many bookings and acknowledgements the erase changes.
3. Confirm that you have verified the person's identity.
4. Select **Erase data**.

What happens:

- **Bookings** stay for your KPIs. The driver name, phone and plates are removed from them.
- **Acknowledgements still under retention** become restricted. They leave the acknowledgement register and can no longer be linked at the gate. rampflow keeps them as proof that the driver completed the briefing (Art. 18).
- **Acknowledgements past retention** lose the driver name.

You cannot undo an erase. A later search still finds restricted acknowledgements, because they are still stored.

## Run the retention job (operators)

The retention job applies the `privacy.retention.*` settings to every tenant (PL-05). Run it once a day from cron, a systemd timer or the scheduler of your platform:

```sh
pnpm retention:run
```

The job prints counts only, for example `retention: {"tenants":3,"phonesErased":12,...}`. If you run it a second time on the same day, it changes nothing. If a tenant fails, the job still processes the other tenants and exits with code 1. [Data model, "Retention"](../reference/data-model.md#retention) lists every rule.
