---
title: Onboard a tenant
description: As platform admin, create a tenant with a package, adjust its entitlements with overrides and check its usage; as tenant admin, follow the onboarding checklist to the first dock, invite staff with site lists, set settings per tenant and site, and upload the logo.
type: how-to
audience: [platform-admin, tenant-admin, developer]
tags: [tenancy, onboarding, entitlements, settings, staff, branding]
status: stable
updated: 2026-10-21
related: [docs/how-to/register-your-company.md, docs/how-to/set-up-a-site.md, docs/reference/api-routes.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md, docs/decisions/ADR-0007-settings-resolution.md]
---

# Onboard a tenant

This guide takes a new warehouse operator from nothing to a working tenant. A warehouse operator can also register its company itself at `/signup` ([Register your company](register-your-company.md)); its first admin then starts at step 5, and the platform admin can still adjust the tenant with steps 2 to 4. Steps 1 to 4 need a platform admin account (create the first one with `pnpm admin:create`, see [Run rampflow locally](run-locally.md)). Steps 5 to 8 need the tenant admin account that step 1 invites.

## 1. Create the tenant

1. Open **Tenants** (`/platform/tenants`) and select **Create tenant**.
2. Enter the company name, choose the package (Start, Pro or Enterprise) and enter the email of the person who will run the tenant.
3. Confirm. The tenant gets the package's entitlements at once, and the admin email receives an invitation that is valid for 7 days. The tenant list shows the new tenant with the status **Onboarding**, like a self-registered one. It becomes **Active** when its admin creates the first dock (step 5).

If the invitation expires or goes to the wrong address, open the tenant and send a new admin invitation. A new invitation to the same address replaces the old one, whose link then stops working.

## 2. Adjust entitlements with overrides

Packages are fixed in code (`/platform/packages` shows them). For one tenant, an override changes one key:

1. Open the tenant from the tenant list. To find it, type part of its name into the search field or filter by package; select its name to open it.
2. Add an override: choose the key, the value (on or off for a feature, a number or unlimited for a limit), an optional expiry date and a note, for example "trial until end of November".
3. The override applies from the tenant's next request. It can raise or lower the package value. At its expiry it stops applying and the package value returns.

Reserved keys (features that are not built yet) cannot be overridden. Turning a feature off hides its navigation item and its settings for the tenant, and its routes answer 403.

## 3. Set platform defaults

**Settings** (`/platform/settings`) holds the default of every setting with a platform level, for example the retention periods. The settings are grouped in topics (General, Booking, Avis, Safety, Yard, Privacy); select a topic in the list on the left, change the fields, and select **Save**. A tenant or site value always wins over the platform default, so changing a default never overwrites a tenant's own choice. Saving a shorter retention period asks for confirmation first.

**Admitted countries** (`core.site_countries`, topic General) lists the countries a tenant may create sites in; the default is the 27 EU member states. The countries are grouped into **EU member states** and **Other countries**. Check or uncheck a country, or a whole group with its group checkbox. Type in the filter, for example `norw`, to find one country. The list offers Europe, Turkey and the South Caucasus, each with a public holiday calendar, and keeps at least one country. Removing a country blocks new sites there and moving a site there; existing sites keep their country and can still be edited.

## 4. Check usage

The tenant list shows sites, docks, internal users and bookings this month against the package limits.

![The tenant list with search, package filter, the created column and usage meters](../assets/screens/platform-tenants.png)

- **Find a tenant.** Type part of the name into the search field; letter case does not matter. Use **Package** to show only some packages and **Status** to show only tenants in onboarding or active ones; each option shows how many tenants match the search and the other filter. **Clear filters** removes all of them.
- **Order and page.** Select the **Tenant** or **Created** header to sort by name or by creation date, again to reverse. The list shows 25 tenants per page; change it under **Rows per page**.
- **Share the view.** The address bar holds the search, filter, sort and page, so a copied link opens the same list for another platform admin, and the browser's back button returns to the previous list.
 A soft limit (bookings per month) above 100% is flagged but blocks nothing; raise it with an override or move the tenant to a larger package. Internal users count members plus invitations that are still open.

## 5. Set up the first dock

A new tenant is in onboarding until its first dock exists. While it is in onboarding, the tenant admin's tenant home opens the checklist **Set up your company** (`/t/<tenant>/onboarding`) with three steps:

1. **Create a site** opens the **New site** form. Enter the address, time zone and region, and confirm or change the weekly opening hours. The preselected template **One shift** opens the site Monday to Friday, 06:00 to 14:00.
2. **Add a hall** opens the site page. Select **New hall** and name it.
3. **Add a dock** opens the site page. In the hall, select **Dock** and enter a code.

Each step shows **Done** or **Open**. A done site step lists the site's opening hours, with **Edit opening hours** to change them. The checklist has no forms of its own. [Set up a site for booking](set-up-a-site.md) describes the site page in detail.

![The onboarding checklist of Nordhafen Kühllogistik with the site and the hall done and the dock open](../assets/screens/onboarding.png)

Saving the first dock activates the tenant. The dock joins a pool that is linked to the site's load types, so the site offers start times at once. The checklist then says **Your company is set up**, with the activation date and links to inviting carriers, the public booking link and staff. Activation is one-way. Setting docks inactive later does not return the tenant to onboarding.

Until the first dock exists, every office screen shows a notice that carriers and bookings open once the first dock exists. These actions are disabled, with the reason next to them:

- **Invite carrier** on the carriers page.
- **Create link** on the public links tab.
- **New booking** and **Walk-in now** on the plan board.
- **Walk-in** at the gate.

The API refuses the same actions, and carrier bookings at the tenant, with the error `onboarding_incomplete`. Sites, halls, docks, pools, hours, closures, load types, settings, the logo and staff invitations work during onboarding. You can do steps 6 to 8 before or after the first dock.

## 6. Invite staff

As tenant admin, open **Staff** (`/t/<tenant>/staff`):

1. Invite each person with their email and role: tenant admin, dispatcher, gate operator or dock operator.
2. For gate and dock operators, choose the sites they work at. Without a site list they see every site. An operator limited to one site gets "not found" for everything at the other sites.
3. Change a role or a site list later from the member's row. Removing a member ends their access to this tenant on their next request; their other memberships stay.

At the package's user limit, new invitations are refused until a member leaves, an invitation is revoked, or the limit is raised.

## 7. Configure settings

Open **Settings** (`/t/<tenant>/settings`) for the tenant level. Select a topic in the list on the left, change the fields, and select **Save**; **Discard** undoes the changes. To change one site, open the site under **Sites and docks** and select its **Settings** tab. Every field shows its effective value and, below it, where the value comes from, for example **From platform** or **Set for this tenant**. **Use inherited value** removes the value of the level you are editing when you save, so the field falls back to the next level up. Settings of features outside the package do not appear.

## 8. Upload the logo

Open **Logo** (`/t/<tenant>/brand`) and upload a PNG or JPEG of at most 256 KB. SVG files are refused. The logo appears on carrier booking pages, in emails and in the driver app while the package includes the logo feature.
