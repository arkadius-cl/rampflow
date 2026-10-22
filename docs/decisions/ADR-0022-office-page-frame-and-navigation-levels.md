---
title: "ADR-0022 Office page frame and navigation levels"
description: Why every office page (platform admin, tenant office, carrier portal) renders through one Page frame whose width follows the pattern, which four navigation levels exist (sidebar, line tabs, segmented views, vertical topic list) and when each is used, and what the frame guarantees at 1920 px and above.
type: explanation
audience: [agent, developer]
tags: [adr, ux, design, frontend, navigation]
status: stable
updated: 2026-10-22
related: [docs/reference/design-system.md, docs/decisions/ADR-0021-design-system.md, docs/decisions/ADR-0015-data-tables-and-entity-views.md, docs/decisions/ADR-0020-settings-information-architecture.md, docs/decisions/ADR-0011-frontend-routes-and-org-context.md]
---

# ADR-0022 Office page frame and navigation levels

Status: accepted, 2026-10-22. Decided by the product owner after the review of the platform screens.

## Context

The office shell (`OfficeShell`) gave every page a sidebar, a breadcrumb bar and padding, and nothing else. Each page chose its own width: the tenant list filled the content area, the package matrix stopped at `max-w-5xl`, the settings form at 48rem, the area home at `max-w-2xl`. The page header always spanned the full content width, so on a 1920 × 1080 screen "Search settings" sat 800 px right of the form it belonged to, and "Expand all" stood alone on its own row.

Second-level navigation had four hand-made looks. The tenant entity page drew underline tabs with its own class string, the site entity page a segmented strip with another, the carriers page used the segmented `Tabs` for page areas, the tenant list used line tabs for list views, and the settings topics were a vertical list on two levels and a tab row on the third.

The product owner reviewed the platform screens on 2026-10-22 and asked for one look across all office areas, a page that looks finished at 1920 × 1080 and uses more space above it, and rules that every later agent can apply without asking.

## Decision

### 1. One frame per page

Every office page renders `Page` from `apps/web/src/components/shells/page.tsx`. It takes the width, the title, the description, the actions, the second-level navigation and the content. Title, actions, tabs and content share one container. Nothing in the content sets its own page width.

The content area of the shell is padded 16 px on phones, 24 px from `lg` and 32 px from `2xl` (1536 px). At 1920 px with the 256 px sidebar the content area is 1600 px wide.

### 2. The width follows the pattern

`PageWidth` (`packages/shared/src/values/ui.ts`) has three members. The pattern of the Steckbrief decides which one, the page does not choose.

| Width | Cap | Patterns |
|---|---|---|
| `full` | none | Objektliste, Kurzliste as a page, plan board, matrices such as the package table |
| `wide` | 100rem, centred above it | Objektseite, Startseite je Rolle, reports |
| `narrow` | 80rem, centred above it | Einstellungsseite, Assistent, pages that are one form or one text |

At 1920 px `full` and `wide` are identical. Above it, lists keep growing and text stops. Inside a `narrow` page a form keeps the field width of its pattern (ADR-0020: the settings form grows to 64rem next to a 14rem topic list). Caps are tokens (`--container-page-wide`, `--container-page-narrow` in `apps/web/src/styles/tailwind.css`) and classes (`max-w-page-wide`, `max-w-page-narrow`). No page writes `max-w-*` on its root.

### 3. Four navigation levels

| Level | Building block | Used for | Never for |
|---|---|---|---|
| 1. Sidebar | `navFor` through the shell | The areas of a role (modules) | Anything inside a page |
| 2. Line tabs | `PageTabs` with `PageTab` links, child routes (ADR-0015) | The topics of an Objektseite, at most six | Filters, views of one list |
| 3. Segmented | `Tabs` default variant | Views of one list with counts ("Needs attention", "All"), ranges (Today, Tomorrow, Week), and filters inside a page | Page topics, anything with its own route |
| 4. Vertical list | `SettingsTopicNav`, a sibling switcher such as the site list | Settings topics on every level, and switching between objects of one kind beside the object | Page topics of an entity, fewer than four entries |

Rules that follow:

- Line tabs sit under the title, in the `tabs` slot of `Page`. Each is a real link with `aria-current="page"`. The first topic is the index route.
- Segmented tabs sit in the `tabs` slot of `Page` too, above the table toolbar. They change search params, not the route.
- A vertical list stands left of the content in a 14rem column. The column and the content form one grid; the title stands above the grid when it names the whole page (settings) and inside the content column when the list switches the object (sites).
- Tabs never nest. A settings topic list inside an entity tab is a level-4 list under a level-2 tab, which is allowed. A second tab row under a tab row is not.
- The breadcrumb bar carries the way back. An entity page has no "Back" button.
- Actions right of the title: at most one primary button. Everything else is a secondary button, a badge or a switch. A control that acts on the content (expand all, search settings) stands in the actions, not in the content.

### 4. The office targets 1920 × 1080

A page is finished when it shows no horizontal scrollbar at 1920 × 1080 with sample data, in light and dark. A data table fits its columns into the content width: dates in the short format of the design system, codes with a name only where the name is the value, one line per cell. A long checklist uses columns or a bounded scroll area, never a column of 30 rows.

## Consequences

- `PageHeader` stays as the inner building block of `Page`. No page imports it on its own.
- The hand-made tab class strings in `routes/platform/tenants/$tenantId/route.tsx` and `routes/t/$orgId/sites/$siteId/route.tsx` are gone; both use `PageTabs`. `tabTriggerClass` in `components/ui/tabs.tsx` is the one source of the tab look.
- The tenant list's views are segmented. The carriers page keeps line tabs until its lists become child routes (ADR-0015).
- ADR-0020 §3: the site settings topics are a vertical list inside the site's settings tab, like the other two levels. The width it feared is there since the content area is 1600 px.
- The `rampflow-design` skill's Steckbrief gains `Width` and `Navigation` lines.
- The gate, dock and driver screens are not office pages and keep their shells. They are reviewed separately.
