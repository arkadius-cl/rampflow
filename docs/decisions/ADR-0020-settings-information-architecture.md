---
title: ADR-0020 Settings information architecture with topics, routes per level and one form per topic
description: How every setting key is placed in one topic and section by an exhaustive web map, which routes the platform, tenant and site settings have, how topic navigation, the topic form, the origin text and the deep link anchors work, and what a unit does when it adds a setting.
type: explanation
audience: [agent, developer]
tags: [adr, settings, frontend, routing, ux, accessibility]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0007-settings-resolution.md, docs/decisions/ADR-0011-frontend-routes-and-org-context.md, docs/decisions/ADR-0015-data-tables-and-entity-views.md, docs/decisions/ADR-0019-central-value-sets.md, docs/explanation/mvp-scope.md, docs/explanation/ux-concept.md]
---

# ADR-0020: Settings information architecture with topics, routes per level and one form per topic

Status: accepted, 2026-10-21. Decided by change 06 (settings navigation).

## Context

The MVP rendered every setting of a level on one long page: 27 fields on the platform page, in eight module cards in no fixed order. No topic had a path, no single setting had a deep link, and every field carried a source badge that read the same on all 27. Site settings were `?site=` tabs of the tenant page, outside the site's own view ([ADR-0015](ADR-0015-data-tables-and-entity-views.md)). An unknown `?site=` fell back to the tenant level, so an admin could save on the wrong level.

The product owner rejected this layout. Users must see where each setting belongs, and every view must be reachable by a path. Settings resolution and storage stay as [ADR-0007](ADR-0007-settings-resolution.md) decides.

## Options considered

| Option | Verdict |
|---|---|
| A `ui: { topic, section }` field per setting in the manifest | Topics cut across modules (`notify.reminder_hours_before` belongs under booking). Placement is presentation, and every regrouping would become a coordinator contract change. |
| Topics = modules | Modules are build boundaries, not the words admins search with. |
| A card with its own save button per setting | Many competing actions, a longer page, and no answer to "what is already in effect". |
| A settings dialog over the current page | Has no path of its own, so a topic or a setting cannot be linked or bookmarked. |
| A second app sidebar for the topics | Two navigation rails side by side compete for attention. |
| **An exhaustive placement map in the web app, topic routes per level, one form per topic** | One typed place to group settings, a URL for every topic and every setting, and one save per topic. |

## Decision

### 1. Placement is an exhaustive map in the web app

- `apps/web/src/modules/core/settings-placement.ts` exports `PLACEMENT`, declared with `satisfies Record<SettingKey, Placement>`.
- `Placement` is `{ topic: SettingsTopic; section: SettingsSection; unit?: SettingUnit }`.
- `SettingsTopic`, `SettingsSection` and `SettingUnit` are value sets in `packages/shared/src/values/settings.ts` ([ADR-0019](ADR-0019-central-value-sets.md)). `SettingsTopic` is also the route param schema (`z.enum(SettingsTopic)`).
- Map order is display order: topics, then sections, then the keys inside a section.
- The topics are `general`, `booking`, `avis`, `safety`, `yard` and `privacy`. The section table is in the `settings-navigation` spec of change 06.

**Adding a setting.** A unit that adds a setting key to a manifest also adds the key to `PLACEMENT`, with its topic, its section and, for a number in minutes, hours, days or percent, its unit. Without the entry `pnpm typecheck` fails and names the missing key. A new topic or section is a new member of its value set and needs its labels in `core/settings-ui.json`.

### 2. Each topic is a route on each level

| Level | Layout | Index | Topic |
|---|---|---|---|
| Platform | `routes/platform/settings/route.tsx` | `index.tsx` redirects | `$topic.tsx` |
| Tenant | `routes/t/$orgId/settings/route.tsx` | `index.tsx` redirects and handles `?site=` | `$topic.tsx` |
| Site | `routes/t/$orgId/sites/$siteId/settings/route.tsx` | `index.tsx` redirects | `$topic.tsx` |

- **Data.** The layout loads the level's `SettingsView`. `availableTopics(view.items)` derives the topic list from `PLACEMENT`. A topic or section without an available setting on that level is not shown.
- **Index.** It redirects with `replace` to the first available topic.
- **Unknown topic.** An unknown topic, or one with no available setting on that level, throws `notFound()`. The area error boundary shows "no access", as for entity views.
- **`?site=`.** The tenant index resolves the id against the tenant context's sites. A known site redirects to `/t/$orgId/sites/<id>/settings`. An unknown or foreign site shows "no access", never the tenant level.
- **Guard.** The platform layout needs `core.manage_platform_settings`. The tenant and site layouts need `core.manage_settings`. The site view shows its "Settings" tab only with that permission.

The route rows are in [ADR-0011](ADR-0011-frontend-routes-and-org-context.md#route-map).

### 3. Topic navigation is vertical on platform and tenant, a second tab row on a site

- `SettingsTopicNav` renders real links. The current topic has `aria-current="page"`.
- **Platform and tenant.** A vertical list in a 12rem column left of the form. The form is at most 48rem wide. GitHub and Vercel use this layout.
- **Site.** A second row of tabs under the site tabs. The site view already has the app sidebar and the site list column, and a third vertical column would leave too little width for the form at 1920 px.

### 4. A topic page is one form

- The page is one react-hook-form. Its value is `Record<SettingKey, FieldDraft>`, with `FieldDraft = { kind: 'own'; value } | { kind: 'inherit' }`. `kind` is the value set `FieldDraftKind`.
- The resolver validates each `own` value with the key's manifest schema.
- **Save.** It sends only the dirty fields in one `PATCH` ([ADR-0007](ADR-0007-settings-resolution.md), "Write path"): `own` goes to `set`, `inherit` goes to `reset`. "Use inherited value" is a pending change like any edit, and "Discard" undoes it.
- **Refetch.** A background refetch updates clean fields and keeps edits (`keepDirtyValues`). After a save the form resets to the response's view.
- **Save bar.** It is sticky at the bottom of the form column, with "Save", "Discard" and a status line ("No unsaved changes" or "N unsaved changes"). Sticky elements get `scroll-padding` on the scroll container, so a focused field is never hidden under them (WCAG 2.4.11).
- Leaving the topic with unsaved changes asks first. Moving to an anchor on the same page does not.

### 5. The origin is text under every field

`SettingOrigin` replaces the source badge.

- **Text.** It maps the entry's source and the page's level to one of "Product default", "From platform", "From tenant", "Set for the platform", "Set for this tenant" or "Set for this site". A value set on the page's level adds "Inherited: {value} ({source})". Whether a value is set here follows from the source, never from comparing values.
- **Link.** The origin links to the same field on the source level when the user may manage that level. In practice the site page links to the tenant page. A tenant admin never gets a link to the platform.
- **Levels hint.** It comes from the entry's scopes. A platform-only key says "Platform only: tenants cannot change this". On the tenant page, a key without a site level says "Applies to all sites of the tenant".
- **Overrides.** A value set on this level keeps the left border in the planned tone, so the state does not rely on text alone either.

### 6. Every setting has an anchor

- **IDs.** The field's title is `<h3 id={key} tabIndex={-1}>` and holds the `<label>` of the control. The control has the id `input-<key>`.
- **Hash.** `useSettingAnchor()` watches the location hash after the topic has rendered. It scrolls the field into view below the sticky header (`scroll-margin-top`), moves focus to the title without a second scroll, and highlights the field for 2 s. An unknown hash does nothing. CSS `:target` is not used, because router navigation through `pushState` does not update it reliably.
- **Copy link.** Each field has a "Copy link" button whose accessible name names the setting. It copies the absolute deep link (`<origin><path>#<key>`) and announces "Link copied" through the toast, a polite live region. The technical key is no longer visible text.

## Consequences

- Every topic and every setting has a URL that works in a new tab, in a bookmark and in a support message.
- The placement map changes with every new manifest key. That is intended: the type error names the key, and this ADR names the file.
- Platform, tenant and site pages share one anatomy, so a fix to the field or the form applies to all three.
- The site page has three navigation layers: the app sidebar, the site tabs and the topic tabs. It is the narrowest layout that keeps the form wide, and the MD-01 e2e step and a 1920 × 1080 screenshot check it.
- The settings search, the unsaved-changes guard, the retention confirmation and the countries editor build on this layout. The [UX concept](../explanation/ux-concept.md#settings-tn-02-pl-03) describes them.
