---
title: Onboard a tenant
description: As platform admin, create a tenant with a package, adjust its entitlements with overrides and check its usage; as tenant admin, invite staff with site lists, set settings per tenant and site, and upload the logo.
type: how-to
audience: [platform-admin, tenant-admin, developer]
tags: [tenancy, entitlements, settings, staff, branding]
status: stable
updated: 2026-10-19
related: [docs/reference/api-routes.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md, docs/decisions/ADR-0007-settings-resolution.md]
---

# Onboard a tenant

This guide takes a new warehouse operator from nothing to a working tenant. Steps 1 to 4 need a platform admin account (create the first one with `pnpm admin:create`, see [Run rampflow locally](run-locally.md)). Steps 5 to 7 need the tenant admin account that step 1 invites.

## 1. Create the tenant

1. Open **Tenants** (`/platform/tenants`) and select **Create tenant**.
2. Enter the company name, choose the package (Start, Pro or Enterprise) and enter the email of the person who will run the tenant.
3. Confirm. The tenant gets the package's entitlements at once, and the admin email receives an invitation that is valid for 7 days.

If the invitation expires or goes to the wrong address, open the tenant and send a new admin invitation. A new invitation to the same address replaces the old one, whose link then stops working.

## 2. Adjust entitlements with overrides

Packages are fixed in code (`/platform/packages` shows them). For one tenant, an override changes one key:

1. Open the tenant from the tenant list.
2. Add an override: choose the key, the value (on or off for a feature, a number or unlimited for a limit), an optional expiry date and a note, for example "trial until end of November".
3. The override applies from the tenant's next request. It can raise or lower the package value. At its expiry it stops applying and the package value returns.

Reserved keys (features that are not built yet) cannot be overridden. Turning a feature off hides its navigation item and its settings for the tenant, and its routes answer 403.

## 3. Set platform defaults

**Platform defaults** (`/platform/settings`) holds the default of every setting with a platform level, for example the retention periods. A tenant or site value always wins over the platform default, so changing a default never overwrites a tenant's own choice.

## 4. Check usage

The tenant list shows sites, docks, internal users and bookings this month against the package limits. A soft limit (bookings per month) above 100% is flagged but blocks nothing; raise it with an override or move the tenant to a larger package. Internal users count members plus invitations that are still open.

## 5. Invite staff

As tenant admin, open **Staff** (`/t/<tenant>/staff`):

1. Invite each person with their email and role: tenant admin, dispatcher, gate operator or dock operator.
2. For gate and dock operators, choose the sites they work at. Without a site list they see every site. An operator limited to one site gets "not found" for everything at the other sites.
3. Change a role or a site list later from the member's row. Removing a member ends their access to this tenant on their next request; their other memberships stay.

At the package's user limit, new invitations are refused until a member leaves, an invitation is revoked, or the limit is raised.

## 6. Configure settings

Open **Settings** (`/t/<tenant>/settings`). The first tab edits the tenant level, the other tabs one site each. Every field shows its effective value and where it comes from: Default, Platform, Tenant or Site. **Reset to inherited** removes the value of the level you are editing, so the field falls back to the next level up. Settings of features outside the package do not appear.

## 7. Upload the logo

Open **Logo** (`/t/<tenant>/brand`) and upload a PNG or JPEG of at most 256 KB. SVG files are refused. The logo appears on carrier booking pages, in emails and in the driver app while the package includes the logo feature.
