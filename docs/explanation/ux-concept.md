---
title: UX concept
description: Design principles, information architecture and route map per role, screen inventory mapped to story IDs, key screen layouts, interaction patterns, visual language, shadcn component mapping and i18n rules for the rampflow web app and driver PWA.
type: explanation
audience: [agent, developer]
tags: [ux, design, booking, yard, safety, settings, entitlements, i18n, accessibility]
status: draft
updated: 2026-10-21
related: [docs/decisions/ADR-0020-settings-information-architecture.md, docs/explanation/mvp-scope.md, docs/explanation/domain-glossary.md, docs/explanation/research/market-and-features.md]
---

# UX concept

This document explains how rampflow looks and behaves for each role, and why. The clickable prototype lives under `apps/web/src/routes/design/` (dev builds only, route `/design`) and uses mock data. Reusable shells and custom pieces live in `apps/web/src/components/`. Screenshots are produced by `pnpm ux:screens`.

## Design principles

1. **Three devices, three densities.** The office desktop is dense and keyboard-first. Office screens (carrier, tenant office roles such as dispatcher and tenant admin, platform admin) are laid out for 1920 × 1080 at 100 % zoom; narrower windows scroll a wide table instead of breaking the page. Gate and dock tablets are glanceable with 44 px targets and gloves in mind. The driver phone shows one thing at a time with one thumb-sized action. The same components serve all three through a `data-density` attribute, so implementation does not fork.
2. **Status is icon plus label, never colour alone.** Every booking, safety and punctuality state renders from one registry (`status-badge.tsx`) with a Lucide icon, a text label and a tone. Tones reinforce, they do not carry meaning. This satisfies the WCAG 2.2 AA requirement in the scope and keeps the board readable in daylight and in greyscale.
3. **Site time, labelled, everywhere.** Every time shows the site wall clock with its zone abbreviation ("08:30 CET"). When the viewer sits in another zone, the viewer time follows in parentheses. The `SiteTime` component is the only way to render a time.
4. **The booking is the spine.** Dispatcher, gate, dock, carrier and driver all look at the same booking, in different clothes. The booking code and the status badge look identical on every screen, so a phone call between gate and carrier can refer to "K7MQ-4D2P, checked in" and both sides see the same thing.
5. **Pools first, docks on arrival.** Carriers never pick a dock. The wizard offers start times against a resource. The dock appears for the first time on the dock operator's call screen and on the driver's phone.
6. **Show the rule, not the error.** Slot pickers hide times that violate hours, closures, lead time, horizon or capacity, and say why the day is closed. Settings show where a value comes from before the user edits it. Check-in explains what blocks it and offers the fix (link or start a briefing) in place.
7. **Free for carriers, said out loud.** The carrier portal states it. The market research shows fees are the main adoption blocker for small forwarders.
8. **Entitlements hide, admins get a hint.** A feature a package does not include is absent for operators and carriers. Only tenant admins see a short, non-pushy hint where the feature would be. Navigation items stay hidden, as PL-02 requires.

## Information architecture and route map

The active organisation is part of the URL (`/t/$orgId/...`, `/c/$orgId/...`). A user with several memberships switches via the org menu at the top of the sidebar, and bookmarks keep working because the org id, not a session cookie, selects the membership. A carrier user sees every linked tenant inside one carrier org, so no switch is needed to work across tenants.

The route map lives in [ADR-0011](../decisions/ADR-0011-frontend-routes-and-org-context.md#route-map), the only one. It gives each screen its path, its search params (dialog state such as `?checkin=` stays in the URL so a tablet refresh returns to the same dialog), and its nav item or the screen it is reached from. Tokens from emails travel only in the fragment (`/invite#<token>`).

Navigation per role, as rendered by `navFor` from the manifests:

- **Tenant admin and dispatcher.** Operations: Plan board, Gate, Docks, Reports. Administration: Sites and docks (hours, closures, load types and the site's settings are tabs of a site), Carriers, Safety briefings, Acknowledgements, Staff, Settings, Logo, Privacy requests. Each item shows only with its permission and entitlement.
- **Gate and dock operators.** Plan board (read-only), Gate, Docks, as their permissions allow. The gate and dock screens use the station layout (`TabletShell`) for every role: full-screen, no sidebar, the site in `?site=`, and a user menu that reaches the other items.
- **Carrier.** Bookings, New booking, Warehouses, Colleagues (carrier admins).
- **Platform admin.** Tenants (with usage meters), Packages, Settings.

## Screen inventory

| Screen | Stories | Device | App route ([ADR-0011](../decisions/ADR-0011-frontend-routes-and-org-context.md#route-map)) | Prototype route |
|---|---|---|---|---|
| Plan board (board and list view, detail panel) | BK-01, BK-02, BK-03, MD-03 | desktop | `/t/$orgId/plan` | `/design/plan-board` |
| Booking wizard (where, slot, avis, confirmed) | BK-04, AV-01, BK-06, CR-06 | desktop | `/c/$orgId/book`; staff variant as a sheet on `/t/$orgId/plan?new=1` | `/design/booking-wizard` |
| Carrier bookings across tenants | CR-05, BK-05, CR-06, CR-02 | desktop | `/c/$orgId/bookings` | `/design/carrier-bookings` |
| Gate: expected trucks, check-in dialog, walk-in, turn away | YD-01, YD-02, YD-03, YD-04, YD-05 | tablet | `/t/$orgId/gate?site=` | `/design/gate` |
| Dock overview, queue, call dialog, progress | YD-06, YD-07, YD-08 | tablet | `/t/$orgId/docks?site=` | `/design/dock` |
| Driver: booking, briefing, quiz, waiting, called, done | DR-01, DR-02, DR-03, SF-04 | phone | `/d#<token>`, then states of `/d` | `/design/driver?step=` |
| Onboarding checklist | ON-01, ON-02, ON-03 | desktop | `/t/$orgId/onboarding` | none |
| Sites, halls, docks and pool editor | MD-01, MD-02, MD-03 | desktop | `/t/$orgId/sites` ("New site" form at `?new=1`), `/t/$orgId/sites/$siteId` | `/design/master-data` |
| Settings per topic, with origin | TN-02, PL-03, MD-01 | desktop | `/platform/settings/$topic`, `/t/$orgId/settings/$topic`, `/t/$orgId/sites/$siteId/settings/$topic` | `/design/settings` (the earlier one-page layout) |
| Platform tenants, usage, overrides | PL-01, PL-02, PL-04 | desktop | `/platform/tenants`, `/platform/tenants/$tenantId` | `/design/platform-admin` |
| Not prototyped: hours and closures (MD-04), load types (MD-05), booking detail (BK-03, AV-02), staff (TN-01), carriers (TN-03, TN-04), warehouses (CR-02), safety authoring and register (SF-01, SF-02, SF-03), reports (RP-01, RP-02), logo (TN-05), privacy requests (TN-06), sign-in and token pages (CR-01, CR-03) | | desktop | see the route map | They reuse the office shell, `SettingField`, tables and forms shown here. |

## Key screens

### Plan board (BK-01)

```
┌ sidebar (icons) ┬──────────────────────────────────────────────┬ detail panel ┐
│                 │ ‹ Mon 19 Oct 2026 › Today  [Board|List]  legend  Walk-in  + New │
│                 ├────┬─────────────────┬────────────┬──────────┤ M4VD-7HQA     │
│                 │CET │ Inbound pallets │ Outbound   │ A-05 Reefer│ Trans-Pol     │
│                 │    │ Pool 2/slot     │ Pool 2/slot│ Single    │ [Checked in]  │
│                 │06:00│                 │            │           │ Slot 10:30 CET│
│                 │06:30│ ┌Trans-Pol────┐ │            │           │ Resource ...  │
│                 │ ... │ │33 units     │ │ ┌Gebrüder┐ │ ┌Nordfrost│ Edit / Cancel │
│                 │10:30│ ┌Trans┐┌Romtr┐ │ │ Done   │ │ │No-show │ ───────────── │
│                 │11:00│ │Chkd ││Conf ┊DHL┊ 2/2 ...   │           │ Timeline      │
└─────────────────┴────┴─────────────────┴────────────┴──────────┴───────────────┘
```

- One column per bookable resource, time down the side, 48 px per 30 min slot. Pool columns split into capacity lanes. Each grid slot in a pool shows `booked/capacity`; a full slot turns the counter amber, an over-booked slot tints the row red and the extra card gets a dashed red border with a warning icon (MD-03 "over capacity").
- Final states (departed, cancelled, no-show, turned away) render dimmed in a lane of their own. Live bookings are placed first and finals fill the free lanes after them, so a cancellation never moves a live card and never covers one. A dispatcher still sees the cancelled or no-show slot next to its neighbours, which a separate strip would hide.
- The resource header row and the time column stay in view while the board scrolls. On today the board opens at the current time; on other days at the opening time.
- A signal-orange "now" line with the site time crosses all columns.
- The sidebar collapses to icons on this screen to give the board room. The detail panel opens on card click and offers Edit, Cancel and the timeline with actors (BK-03). After check-in both buttons disable with a one-line reason.
- List view (Tabs: Board | List) shows the same bookings as a table for keyboard and screen-reader users.
- Loading: skeleton columns with the real headers. Empty: the grid with "No bookings on this day" centred and the "New booking" button. Error: an Alert above the grid with retry. Live updates (30 s) replace cards in place and announce "Board updated" to screen readers.

### Booking wizard (BK-04, AV-01, BK-06)

```
┌ stepper ┐ ┌ step card ─────────────────────────┐ ┌ summary ─────┐
│ 1 Where │ │ When                               │ │ Warehouse ... │
│ 2 When ●│ │ [Mon 19][Tue 20][Wed 21●][Thu 22]..│ │ Site ...      │
│ 3 Avis  │ │ Start times in CET · Duration 90min│ │ Load ...      │
│ 4 Done  │ │ Morning  [06:30 2 free][07:30 1 left][08:00 full]│ Slot ...  │
│         │ │ Afternoon ...                       │ └───────────────┘
│         │ │ Back                     Continue ›│ Free for carriers.
```

- Step 1 picks warehouse, site and load type (radio cards with duration hints) and load units. The duration line updates ("33 pallets take 90 minutes").
- Step 2 is the `SlotPicker`: a seven-day strip with free counts and closed reasons, then start-time chips grouped Morning and Afternoon. Chips show free capacity ("2 free", "1 left" in amber, "full" disabled). Only offered times appear; a footnote explains lead time and horizon.
- Step 3 is the avis form with the field pattern: label, control, description, error (shown on the PO field with the site's expected format).
- Step 4 confirms with the booking code, a QR, the slot in site time, the address, the change cutoff, "Book again" (BK-06) and the driver link block (copy, email with locale, share sheet, regenerate). Calendar export is not in the MVP.
- Race loss (409 on confirm): the slot step re-opens with a toast "That time was just taken" and the refreshed list.

### Carrier bookings across tenants (CR-05)

A filter row (tabs Upcoming/Today/Past, search, warehouse, status, date range) over a table with date and slot in that site's zone, warehouse and site, code, load and plate, status, briefing status, gate-in to gate-out timestamps, and actions. Rows after the cutoff show "Details" instead of "Change". A pending registration (CR-02 approval mode) shows as an Alert at the top. Empty: "No bookings yet" with a "New booking" button. A booking of another carrier is a 404 page, never an empty row.

### Gate (YD-01 to YD-05)

```
┌ Gate · Hamburg DC            10:42 CET  [Live]  M. Weber ┐
│ [⌶ Scan QR or type code, plate, reference, carrier    ] [Expected 9|On site 5|Departed 1] [Walk-in] │
│ 07:30–09:00 CET  Nordfrost Transport     [Briefing valid] [No-show]   [Check in]          │
│ 10:30–12:00 CET  Romtrans SRL            [Briefing missing][Confirmed] [Check in] (outline) │
│  [Late +12 min]  B 44 RTR · 40 · Pallets inbound · C1ZY-8WNE                               │
```

- The scan field is autofocused and stays focused, so a keyboard-wedge scanner that types the code and Enter opens the matching booking without touching the screen. Search also matches plate, reference and carrier.
- Rows are 64 px tall with the slot, carrier, plate, load, safety badge, booking status and one primary button. A no-show row still offers check-in (late arrival).
- The check-in dialog shows the plate as seen (editable), the arrival time with the computed punctuality badge and tolerance, a safety section that is green when valid and red when not, "Find by driver name" and "Start briefing here", a turn-away reason select with the research list, and the primary "Check in now" button disabled with an inline reason when enforcement blocks it.
- On site tab (YD-04): same rows with time since gate-in and a detention flag above `yard.standgeld_flag_minutes`. Check-out from any on-site state; before `done` a reason is required.
- Walk-in (YD-03): a dialog for an unbooked truck takes carrier, load type, plate and the avis, then ends with "Check in now" or "Turn away" with a reason. Closed hours and full capacity never block it; the plan board shows the truck as over capacity. When safety enforcement blocks the check-in, the walk-in stays on the expected list with "Briefing missing" and the usual link or start-briefing actions.
- "Turn away" also shows for a checked-in truck that has not been called (wrong load, missing documents).
- Offline: the header pill turns red "Offline", lists stay with "as of HH:mm", and every action is disabled with the reason. Nothing is queued: a check-in replayed later would record the wrong arrival time.

### Dock overview and call (YD-06 to YD-08)

Docks are cards grouped by hall. A free dock says "Free" in green text with the word, an occupied dock shows carrier, plate, units, the status badge with "since 09:05 CET", one progress button (At dock, Loading, Done) and a phone button. Maintenance docks are dashed. The right column lists checked-in trucks ordered by slot start with waiting minutes and "Call to dock".

The call dialog shows all docks as large buttons: free member docks of the pool are green and labelled "suggested", occupied docks show the occupant and are disabled, docks outside the pool are selectable with a warning line. The footer offers the driver phone as a `tel:` link, Cancel and "Call to A-01". A called truck's card offers "Cancel call", which frees the dock and returns the truck to the queue when the driver does not show up. Done opens a small sheet for actual units and a discrepancy note.

### Driver PWA (DR-01 to DR-03, SF-04)

- **Booking.** Slot in 30 px type with zone, date, site address with maps link, QR and code, status badge, and a yellow "Safety briefing required" card. A privacy line states that the page shows no personal data. Footer: "Start safety briefing".
- **Briefing.** Progress bar "1 / 4", one rule per screen with a large pictogram, title and body in 18 px, Back and Next. The last rule adds the typed name and the confirmation checkbox. The language button shows "auto" when the locale is machine translated (DR-02).
- **Quiz.** All questions on one scrolling page with large radio rows. After "Check answers" wrong questions turn red with "Read rule 2 again and retry", correct ones green. Retries are unlimited.
- **Waiting.** A hourglass, "Please wait", the checked-in badge, checked-in time and waiting minutes, the briefing validity line, and "Call the site". Offline shows a yellow bar "Offline. Showing status from 10:31."
- **Called.** A full-height signal-orange card with "GO TO DOCK", the dock code at 96 px, the hall, the call time, a vibration note and "Call the dock". The orange is used nowhere else so the change is unmistakable from a cab.
- **Done.** Green check, "Loading done. Please drive to the gate." and the link expiry notice.
- Invalid, expired or revoked token: one neutral screen "This link is no longer valid. Ask your dispatcher for a new one." with no further detail.

### Onboarding checklist (ON-01 to ON-03)

A tenant in onboarding has no dock yet, so nothing can be booked. The checklist at `/t/$orgId/onboarding` is the tenant home of a member with `core.manage_sites` until the first dock exists. Its title is "Set up your company", followed by "{done} of {total} steps done" and three steps: "Create a site", "Add a hall" and "Add a dock". Each step shows its state as an icon and the word "Done" or "Open", never by colour alone.

The checklist has no forms. An open step is a link to the master data screen that does the work: "Create a site" opens the "New site" form on the site list, and the other two open the site page. A hall or dock step without a site says "Create a site first." A done site step lists the site's weekly hours in its zone, with "Edit opening hours" linking to the hours tab, so the admin sees the template they confirmed. After the first dock, the page says "Your company is set up", gives the activation date in site time, and links to "Invite carriers", "Create a public booking link" and "Invite staff" as the member's permissions allow.

While the tenant is in onboarding, every office screen shows a notice: "Your company is still being set up. Carriers and bookings open once the first dock exists." For a member with `core.manage_sites`, it ends with "Open the setup checklist". The notice reads the tenant status from the context query, so it disappears without a reload once the dock dialog saves the first dock.

The actions that need a dock stay visible but disabled: "Invite carrier", "Create link" on the public links tab, "New booking" and "Walk-in now" on the plan board, and "Walk-in" at the gate. A disabled button gets no hover or focus, so the reason never hides in a tooltip. A line with a lock icon next to the button says why, for example "Carriers can be invited once the first dock exists.", and adds "Finish setup" for a member with `core.manage_sites`. On the gate screen that link has a 44 px target.

### Sites, halls, docks and pools (MD-01 to MD-03)

Three panes: site list with usage meters against package limits, halls as cards with a dock table (code, door, zone, ADR, status, "Booked as"), and the pool editor (name, direction toggles, parallel slots, daily cap, member docks). A warning line states that lowering capacity never cancels bookings and how many would show as over capacity.

The "New site" form has an "Opening hours" section, because a site without hours offers no slot. It offers three choices: "One shift" (Monday to Friday, 06:00 to 14:00, preselected), "Two shifts" (Monday to Friday, 06:00 to 22:00) and "Custom". The week below shows the chosen template read-only. "Custom" makes the same week editor as the hours tab editable, starting from the template chosen last, with several windows a day.

Every dock is in exactly one resource, so "Booked as" offers "Single dock" and the site's pools, never an empty choice. A pool of another profile, or the hall pool of another hall, stays in the list but disabled, with its reason in the option text ("Pool Versand: other dock profile"). The dock dialog shows "Bookable for" read-only: the pool or "Single dock", and the dock's active load types with a link to the load types tab. When the admin changes the door type, temperature zone or ADR flag of a pooled dock, the dialog says before saving that the dock moves to the pool for its new profile.

The pool editor moves docks rather than refusing them. The member list says "Checking a dock moves it here from its current pool or single booking", and each dock held elsewhere carries "moves from Wareneingang" or "booked on its own, moves here". Docks of another profile, or of another hall for a hall pool, are disabled with "other profile" or "other hall". In a hall pool, its own docks cannot be unchecked. They leave by moving into another pool or by being booked on their own. The editor shows the pool's dock profile and a "Hall pool" badge for a default pool.

### Settings (TN-02, PL-03)

Settings have one anatomy on every level. [ADR-0020](../decisions/ADR-0020-settings-information-architecture.md) decides the topics, the routes and the form.

**Topics.** Settings are grouped in the topics General, Booking, Avis, Safety, Yard and Privacy, each with named sections, for example Booking with Rules, Public booking and Reminders. Each topic is its own page with its own URL. A level lists only the topics and sections that hold a setting it may show, so a site has no General topic. The page title names the topic, and the breadcrumb names the level and the topic ("Platform › Settings › Booking", "Sites › Hamburg › Settings › Booking").

**Topic navigation.**

- On the platform and tenant pages, the topics are a vertical list in a 12rem column left of the form, which is at most 48rem wide.
- On a site, the settings are the last tab of the site view, and the topics are a second row of tabs under the site tabs. The app sidebar and the site list already take width, and the form stays wide at 1920 px.
- Each topic is a link, and the current one carries `aria-current="page"`. The tenant page's header links to the site list, where each site's settings live.

**Field anatomy.** Each field is a block in the form column, top to bottom:

1. The title, which is also the control's label and the anchor of the deep link (`…/booking#booking.horizon_days`).
2. The description in one or two sentences.
3. The control. A number in minutes, hours, days or percent shows its unit as a suffix inside the input ("min", "h", "d", "%"), and the label does not repeat it.
4. The origin as quiet text, always shown: "Product default", "From platform", "From tenant", "Set for the platform", "Set for this tenant" or "Set for this site". A value set on this level adds "Inherited: 30 (Product default)" and "Use inherited value (30)", and keeps the blue left rule. An origin on a level the user may manage links to that field there.
5. The levels hint where they differ from all three: "Platform only: tenants cannot change this", or on the tenant page "Applies to all sites of the tenant".
6. "Copy link", a button whose accessible name names the setting. It copies the field's absolute deep link and announces "Link copied". The technical key is not shown.

Opening a deep link scrolls the field below the sticky header, highlights it for 2 s and moves focus to its title, so the next Tab reaches the control. Settings whose entitlement is off are absent; a compact `UpsellHint` at the end of the section names what the next package adds.

**Save bar.** A topic page is one form. A bar sticks to the bottom of the form column with "Save", "Discard" and a status line: "No unsaved changes" or "3 unsaved changes". Both buttons stay disabled until a field differs from its loaded value. "Use inherited value" is a pending change like any edit. A failed save keeps every edit and shows each 422 error under its field. Leaving the topic with unsaved changes asks "Leave without saving?" with "Stay" and "Leave"; moving to an anchor on the same page does not ask.

**Search.** A "Search settings" button in the settings header opens a command dialog. It matches label, description and key of every setting on the current level, ignoring case and accents. Each result shows the label with "Booking › Rules" as secondary text, and choosing one opens its deep link.

**Retention dialog.** When a save lowers the effective value of a retention period, including through "Use inherited value", a dialog lists each one ("Keep visits: 395 → 180 days") and says that older data is deleted or pseudonymized on the next retention run. The request goes out only after the admin confirms; cancelling keeps the edits unsaved. Raising a value does not ask.

**Countries editor.** The platform's admitted countries (`core.site_countries`) are a checklist in two groups, "EU member states" and "Other countries", sorted by name in the UI language. Each group has a select-all checkbox that shows a mixed state when some of its countries are checked. The countries sit in a grid that reflows to one column on narrow screens. A filter above narrows the list by name or code; while it is active the group checkboxes are hidden, so no click changes a country the admin cannot see. A count below reads "27 of 57 selected" and always counts every country. Unchecking the last country shows "Select at least one country".

### Platform admin (PL-01, PL-02, PL-04)

A data table of tenants: Tenant (link to the tenant view, sortable), Package, Created (instant in the viewer's zone with the zone name, sortable), and meters for sites, docks, users and bookings per month (not sortable). The toolbar searches the tenant name and filters by package with a count per package; "Clear filters" appears while either is set. 25 tenants per page by default, 10, 25, 50 or 100 to choose. "Create tenant" stays in the page header whatever the filters. A soft limit above 100 % shows a red "108 % soft" with a warning icon and blocks nothing. Below, the selected tenant's package select, an override table (key, package value, override with "higher" or "lower" and "soft", expiry, remove) and an add-override form whose key select contains only non-reserved keys.

## Interaction patterns

- **Booking wizard with slot picker.** Four steps in the URL (`step=`), a persistent summary, forward only after the step validates, Back keeps data. The slot picker is a day strip plus start-time chips with capacity hints.
- **Dispatcher plan board.** Columns per resource, pool capacity per slot, lanes, final states dimmed, now line, detail panel, list view toggle. Staff booking opens the same wizard in a sheet with the lead-time and horizon rules switched off and a mandatory reason when forcing over capacity (BK-02).
- **Gate check-in with safety status.** Scan field first, then a dialog that computes punctuality, shows the safety state in colour and words, offers link or start briefing, and keeps turn-away one select away.
- **Dock overview and call.** Cards per dock, queue by slot start, call dialog with suggested docks and a warning for others, one tap per progress state.
- **Driver flow.** Booking, briefing, quiz, waiting, called, done. Each screen has one primary action in the sticky footer. The PWA polls every 15 s while visible and shows the last known state with its time when offline.
- **Settings.** One form per topic with a sticky save bar. The origin is text under every value, "Use inherited value" appears only on values set on the current level, and settings whose entitlement is off are absent. Every setting has a deep link.
- **Entitlement gating.** `EntitlementGate` renders children when on, nothing when off, and an `UpsellHint` when the page is an admin page. Navigation items of off features are not rendered. API 403 `entitlement_required` maps to the same hint on admin pages and to a plain "not available" page elsewhere.
- **Lists.** Lists that users browse are `DataTable`s ([ADR-0015](../decisions/ADR-0015-data-tables-and-entity-views.md)): search, facets, sort and paging run on the server, and the state lives in the URL with the API's parameter names, so a filtered list is a link. A facet, sort or page change adds a history entry, a typing run in the search field adds one, so back restores the previous list. Changing the search, a facet or the page size returns to page 1. First load shows the header with placeholder rows; a later fetch keeps the previous rows, marks the table busy and shows a spinner in the toolbar. A failed fetch shows an error with "Try again". Two empty states: "none yet" with the list's primary action, and "no match" naming the active criteria with "Clear filters". Each row links to its entity's own view.
- **Org switching.** The org menu in the sidebar header lists all memberships with kind and role. Selecting one navigates to that org's home route. Carriers work across tenants inside one org through filters, not switches.

## Visual language

- **Colour tokens** (`apps/web/src/index.css`, oklch). Primary deep blue `oklch(0.43 0.15 258)` on a cool off-white canvas, dark navy sidebar. Six status tones, each with foreground, surface and border: planned (blue), onsite (amber), active (violet), success (green), danger (red), neutral (grey). `signal` orange `oklch(0.7 0.19 48)` is reserved for the dock call and the now line.
- **Booking state to tone.** confirmed planned; checked_in onsite; called, at_dock, loading active; done success; departed and cancelled neutral; no_show and turned_away danger. Safety: valid success, missing and expired danger, outdated onsite. Punctuality: early neutral, on time success, late onsite.
- **Typography.** Geist Variable for everything, tabular numerals for times, codes and counts, monospace for plates and booking codes. Office 14 px base, tablet 17 px base, phone 17 px base with 30 px slot times and 96 px dock code.
- **Spacing and density.** Office uses shadcn's compact sizes (32 px controls). `data-density="touch"` lifts every control to at least 44 px and buttons to 16 px text. Radios, checkboxes and switches keep a 24 px glyph inside a 44 px label row.
- **Dark mode.** Not in the MVP. Every screen runs light, so the axe contrast checks cover one theme. The dark tokens stay defined for later.
- **Radius and elevation.** 8 px radius, 1 px borders, shadows only on cards that float (board cards on hover, dialogs).

## shadcn component mapping

| Screen | shadcn components | Custom |
|---|---|---|
| Office shell | Sidebar, DropdownMenu (org switcher), Breadcrumb, Button, Kbd, Avatar, Tooltip, Separator | none |
| Plan board | ButtonGroup, ToggleGroup, Select, Table (list view), Button, Separator | `PlanBoard` grid |
| Booking wizard | Card, Field, Input, InputGroup, NativeSelect, RadioGroup, Checkbox, Textarea, Button | `SlotPicker`, `QrPlaceholder` |
| Carrier bookings | Tabs, InputGroup, NativeSelect, Table, Alert, Button | none |
| Gate | InputGroup (scan), Tabs, Dialog, Field, Input, NativeSelect, Button | `TabletShell` |
| Dock | Dialog, Button | `TabletShell`, dock picker buttons |
| Driver | Progress, RadioGroup, Checkbox, Field, Input, Button | `DriverShell`, `PhoneFrame` |
| Master data | Card, Table, Badge, Field, Input, InputGroup, ToggleGroup, Checkbox, Progress, Button | none |
| Settings | Field, Switch, Input, InputGroup, NativeSelect, Checkbox, Command, AlertDialog, Button | `SettingField`, `SettingOrigin`, `SettingsTopicNav`, `GroupedChecklist`, `UpsellHint` |
| Platform admin | Table, Badge, Card, Field, Input, InputGroup, NativeSelect, Select, Popover, Command, Empty, Skeleton, Spinner, Progress, Button | `DataTable`, usage `Meter` |

Custom components and why no shadcn component fits:

- `PlanBoard` (`components/plan-board/plan-board.tsx`). Time-positioned cards in capacity lanes with per-slot counters. No calendar or table primitive does this.
- `SlotPicker` (`components/slot-picker.tsx`). The Calendar component cannot show per-day free counts, closed reasons or per-slot capacity, and must hide rather than grey out invalid times.
- `StatusBadge` and registries (`components/status-badge.tsx`). shadcn Badge has no icon contract and no tone scale. The registry makes "icon plus label" impossible to forget.
- `SiteTime` (`components/site-time.tsx`). Enforces the zone label.
- `SettingField` and `SettingOrigin` (`components/settings-field.tsx`). Field plus origin plus inherit plus copy link is a product pattern, not a form primitive. `SettingsTopicNav` and `GroupedChecklist` live in `modules/core/`; the checklist composes Field, Checkbox and InputGroup, because no shadcn component groups checkboxes with a mixed-state group toggle.
- `EntitlementGate` and `UpsellHint` (`components/entitlement-gate.tsx`). Behavioural wrapper around the three entitlement states.
- Shells (`components/shells/`). Composed from Sidebar for the office; the tablet shell (gate and dock stations) and the driver shell are plain layout because Sidebar assumes a desktop.
- `DataTable` (`components/data-table/`). The shadcn data-table is a guide, not a registry item, so the table, toolbar, faceted filter, sortable header and pagination are composed here from Table, InputGroup, Popover, Command, Badge, Select and Empty on TanStack Table v9, with the state hook that keeps them in the URL.
- `QrPlaceholder`. Stand-in for a QR encoder; the implementation swaps in a real one.

## Copy tone and i18n

- Short, plain sentences. Verbs first on buttons ("Check in now", "Call to A-01"). No exclamation marks. Errors say what to do next.
- Statuses are nouns or past participles that translate as single words ("Checked in", "Called", "Done"). The German UI terms come from the glossary (Rampe, Buchung, Avis, Unterweisung).
- Text expansion. German runs about 30 % longer than English and Polish and Hungarian up to 40 %. Every badge, button and column in the prototype allows for that: badges truncate never, buttons wrap never and have `min-w`, table cells wrap. Avoid fixed-width labels except for codes and times.
- Driver strings are templates with slots ("Go to dock {dock}, hall {hall}"), never free text, so the twelve locales stay reliable. Machine-translated locales carry the "auto" badge until reviewed.
- Numbers and dates follow the viewer's locale through `Intl`: `1.500` in de, `1,500` in en and `1 500` in pl; dates as "Mo. 19.10.2026" in de and "Mon 19 Oct 2026" in en. Times are always 24 h with the zone label. CSV export follows RP-02 (`;` for de, `,` for en).
- Plates display with their spacing as typed but store normalised. Phone numbers display in international format.

## Open questions

- Should the dispatcher be able to drag cards on the board to reschedule, or is the detail panel enough for the MVP? The research lists drag and drop as universal, the scope lists only edit and cancel.
- Does the gate need a dedicated "On site" layout with larger waiting timers, or do the tabs cover YD-04?
- The driver "Called" screen could show an expected walking route or yard map later. The MVP shows hall and dock only.
- Carriers booking at a tenant with `approval_required` see a pending alert. Should the booking wizard let them draft a booking before approval, or stay disabled?
- Dark mode is out of the MVP. Night shifts at the gate may ask for it first.
