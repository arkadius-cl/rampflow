---
title: Design system
description: The one page every UI task reads. yrd tokens (colour light and dark, status, punctuality, density, radii, shadows, motion), type scale per density, the three densities, status to tone to token to icon, shadcn components and variants, screen patterns with the decision tree, the full UI and UX rule table with status and source, copy and formats, accessibility and open points.
type: reference
audience: [agent, developer]
tags: [ux, design, tokens, accessibility, frontend]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0021-design-system.md, docs/decisions/ADR-0015-data-tables-and-entity-views.md, docs/decisions/ADR-0020-settings-information-architecture.md, docs/explanation/ux-concept.md]
---

# Design system

rampflow uses the yrd design system ([ADR-0021](../decisions/ADR-0021-design-system.md)). Its source of truth is checked in under `design/yrd/`: `readme.md`, `tokens/`, `guidelines/` (foundation cards, contrast tables, the three sample screens, `regeln.html`) and `components/` (one `.jsx`, `.d.ts` and `.prompt.md` per component). It comes from the Claude Design project "yrd Design System" (<https://claude.ai/design/p/d6c60fba-e676-413b-b2a8-221aff505cdf>, 2026-10-11). Nobody edits `design/yrd/`. The app copies its token values into `apps/web/src/styles/`.

The design components are references in plain React. Take their class lists, variants, sizes and states. rampflow keeps its shadcn components on Base UI in `apps/web/src/components/ui/`.

Before any UI work, load the `rampflow-design` skill. Then use this page. `pnpm design:check` enforces the token rules.

## Tokens

The tokens use shadcn names. Light is `:root`, dark is `.dark` on `<html>`. Tailwind binds every token in `styles/tailwind.css` (`bg-primary`, `text-status-called-foreground`, `h-control`, `rounded-control`, `p-pad`, `gap-gap`, `shadow-md`, `ease-yrd`).

Markup uses token classes only. No hex, `oklch()`, `rgb()` or `hsl()` value outside `apps/web/src/styles/`. No `style={{ }}`. No `font-family`. No arbitrary colour class such as `bg-[#...]`.

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` / `foreground` | #FFFFFF / #16191D | #0F1215 / #E8ECEF | Page and body text |
| `card` / `card-foreground` | #FFFFFF / #16191D | #161A1E / #E8ECEF | Cards, tiles |
| `popover` / `popover-foreground` | #FFFFFF / #16191D | #1B2026 / #E8ECEF | Popover, menu, select list |
| `primary` / `primary-foreground` | #0E6E73 / #FFFFFF | #5FC6CA / #052A2C | The accent Petrol. One primary action per screen |
| `secondary` / `secondary-foreground` | #EEF1F4 / #16191D | #232930 / #E8ECEF | Secondary button |
| `muted` / `muted-foreground` | #F2F4F6 / #5A6370 | #1E242A / #9DA7B3 | Hover surface, hints, captions |
| `accent` / `accent-foreground` | #E0F0F0 / #0B4F53 | #143D40 / #A9E4E6 | Selected item, active toggle |
| `destructive` / `destructive-foreground` | #B3261E / #FFFFFF | #F0776F / #2B0804 | Turn away, decline, cancel |
| `border`, `input` | #DCE1E6 | #2A3139 | 1 px borders, input borders |
| `ring` | #0E6E73 | #5FC6CA | Focus ring |
| `chart-1` to `chart-5` | #0E6E73, #2A63C9, #C7820A, #1E8A4C, #8A94A0 | #5FC6CA, #5A8FE8, #E2A33A, #3DB36A, #7A8591 | Chart series in this order |
| `sidebar` / `sidebar-foreground` | #F6F8F9 / #16191D | #131719 / #E8ECEF | Office sidebar |
| `sidebar-primary` / `-foreground` | #0E6E73 / #FFFFFF | #5FC6CA / #052A2C | Sidebar mark, active marker |
| `sidebar-accent` / `-foreground` | #E6EBEE / #16191D | #20262C / #E8ECEF | Active and hovered item |
| `sidebar-border`, `sidebar-ring` | #DCE1E6, #0E6E73 | #2A3139, #5FC6CA | Sidebar border and focus |

Neutrals are cool greys. There is no orange signal colour. The now line and the dock call use `status-called-solid`.

### Status

Every status token has a surface (badge background), a `-foreground` (badge text and icon) and a `-solid` (dot, timeline block, lane, tile edge). All text pairs reach 4.5:1 in both themes (`design/yrd/guidelines/kontrast-hell.html`, `kontrast-dunkel.html`).

| Token | Meaning | Light surface / fg / solid | Dark surface / fg / solid |
|---|---|---|---|
| `status-requested` | Waits for a decision | #FCEFD2 / #704400 / #B5740A | #3A2A06 / #F5C76A / #E2A33A |
| `status-scheduled` | Planned | #E0F0F0 / #0B4F53 / #0E6E73 | #143D40 / #A9E4E6 / #5FC6CA |
| `status-on-yard` | Waits on site | #FCEFD2 / #704400 / #B5740A | #3A2A06 / #F5C76A / #E2A33A |
| `status-called` | Active, called | #DCE8FB / #1A478F / #2A63C9 | #15294D / #9DBDF5 / #5A8FE8 |
| `status-at-dock` | Active, at the dock | #DCE8FB / #1A478F / #2A63C9 | #15294D / #9DBDF5 / #5A8FE8 |
| `status-done` | Done | #DBF2E3 / #14532D / #1E8A4C | #0F3320 / #8FD9A8 / #3DB36A |
| `status-checked-out` | Gone | #ECEFF2 / #5A6370 / #7E8893 | #20262C / #9DA7B3 / #7A8591 |
| `status-problem` | Problem | #FBE0DD / #8A1C14 / #C9302C | #45140F / #F6A09A / #EC6D64 |
| `status-cancelled` | Without effect | #ECEFF2 / #5A6370 / #7E8893 | #20262C / #9DA7B3 / #7A8591 |

### Punctuality

| Token | Light surface / fg | Dark surface / fg |
|---|---|---|
| `punctual-early` | #E6EBF8 / #36458A | #1C2447 / #B3BEF0 |
| `punctual-on-time` | #DBF2E3 / #14532D | #0F3320 / #8FD9A8 |
| `punctual-late-tolerance` | #FCEFD2 / #704400 | #3A2A06 / #F5C76A |
| `punctual-late` | #FBE0DD / #8A1C14 | #45140F / #F6A09A |

### Density

| Token | Class | Office | `halle` | `fahrer` |
|---|---|---|---|---|
| `--control-h` | `h-control` | 36 px | 56 px | 48 px |
| `--control-h-primary` | `h-control-primary` | 36 px | 72 px | 56 px |
| `--control-h-sm` | `h-control-sm` | 28 px | 44 px | 40 px |
| `--touch-min` | `min-h-touch` | 24 px | 56 px | 44 px |
| `--radius` | `rounded-control` | 6 px | 10 px | 10 px |
| `--gap` | `gap-gap` | 8 px | 12 px | 12 px |
| `--pad` | `p-pad` | 16 px | 20 px | 16 px |

### Radii, shadows, motion

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4 px | Badge, chip, table cell |
| `radius-md` | 6 px (10 px in `halle` and `fahrer`) | General |
| `radius-control` | `--radius` | Button, input, menu |
| `radius-lg` | 10 px (14 px in `halle` and `fahrer`) | Card, dialog, sheet, tile |
| `radius-xl` | 16 px | Driver status card |
| `shadow-sm` | light `0 1px 2px rgba(22,25,29,.06)`, dark `0 1px 2px rgba(0,0,0,.4)` | Rare. Surfaces in the page have no shadow |
| `shadow-md` | light `0 2px 8px rgba(22,25,29,.10), 0 1px 2px rgba(22,25,29,.06)`, dark `0 2px 8px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.4)` | Popover, menu |
| `shadow-lg` | light `0 12px 32px rgba(22,25,29,.16), 0 2px 6px rgba(22,25,29,.08)`, dark `0 12px 32px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)` | Dialog, sheet, toast |
| `--focus-ring` | `0 0 0 2px var(--background), 0 0 0 4px var(--ring)` | Focus. Classes `ring-2 ring-ring ring-offset-2 ring-offset-background` |
| `--duration-fast`, `--duration-base` | 120 ms, 180 ms | All transitions |
| `--ease` | `cubic-bezier(.2,0,0,1)` | Class `ease-yrd` |

No pills except the progress bar. No gradients, no glass, no images or patterns as backgrounds. Blur only 2 px behind the dialog. Transparency only for the dialog overlay (foreground at 40 %) and a sticky header (95 %). Motion animates colour, opacity and transform only. No bounces. Pulsing is reserved for a new call on the wallboard.

### rampflow bindings

`apps/web/src/index.css` binds a few classes of its own on top of the yrd tokens. Components rely on them.

| Class | Token | Purpose |
|---|---|---|
| `size-icon` | `--spacing-icon` (`--icon`: 16 px office, 24 px `halle` and `fahrer`) | Icon size that follows the density |
| `bg-canvas` | `--color-canvas` (`--muted`) | The page behind cards and tables |
| `bg-tone-*-bg`, `text-tone-*` | `--color-tone-*-bg`, `--color-tone-*` (the status token and its `-foreground`) | Surface and text of a `BadgeTone`. Exported as `toneClasses` from `components/status-badge.tsx` |
| `bg-tone-*-solid` | `--color-tone-*-solid` (the status token's `-solid`) | Dots, timeline blocks, dock lanes. Exported as `toneSolidClasses` from `components/status-badge.tsx` |
| `border-tone-*-border` | `--color-tone-*-border` (the status token's `-foreground`) | Border of a toned notice or highlighted card, for example the alerts in `modules/booking/detail-panel.tsx` and `modules/yard/check-in-dialog.tsx`. Never on a status badge |

`*` is a `BadgeTone` member. `BadgeTone` is the only way to colour a status. A screen renders a status through the registry and `StatusBadge`, or takes `toneClasses` and `toneSolidClasses` by tone. It never writes `status-*` classes directly.

## Typography

IBM Plex Sans (400, 500, 600, 700) for everything, IBM Plex Mono for plates, booking codes and order numbers (`font-mono`). Both are self-hosted through `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` with the subsets latin, latin-ext, cyrillic and cyrillic-ext. Tabular numerals are global. Letter spacing `--tracking-tight` is -0.01em, `--tracking-caps` is 0.04em. Where a brand mark would stand, the word mark "rampflow" is set in Plex Sans Semibold.

Font size and line height per step, in px:

| Class | Office | `halle` | `fahrer` |
|---|---|---|---|
| `text-xs` | 12 / 16 | 14 / 18 | 13 / 18 |
| `text-sm` | 13 / 18 | 16 / 22 | 15 / 20 |
| `text-base` (body) | 14 / 20 | 18 / 26 | 17 / 24 |
| `text-md` | 16 / 24 | 22 / 30 | 20 / 28 |
| `text-lg` | 18 / 26 | 28 / 34 | 24 / 30 |
| `text-xl` | 22 / 28 | 36 / 42 | 30 / 36 |
| `text-2xl` | 28 / 34 | 48 / 54 | 40 / 46 |
| `text-display` | 40 / 44 | 120 / 120 | 56 / 60 |

## Densities

One system, three densities. Colours, status, terms and icons are the same everywhere. Size follows the place. Office is the absence of `data-density`. `halle` and `fahrer` are members of the value set `Density` (`packages/shared/src/values/ui.ts`) and are set as `data-density` on `<html>`, so dialogs, menus and other portals inherit the density. The shell calls `useDensity(Density.halle)` or `useDensity(Density.fahrer)` from `apps/web/src/hooks/use-density.ts`. The hook removes the attribute when the shell unmounts. The driver PWA has its own `useDensity` in `apps/driver/src/lib/theme.ts`, because it cannot import `apps/web`.

| | Office | `halle` | `fahrer` |
|---|---|---|---|
| Where | Tenant office, carrier portal, platform admin. Desktop 1920 × 1080 | Gate and dock station screens, wallboard, kiosk. Tablet landscape, TV | Driver PWA and the driver shell |
| Input | Mouse and keyboard, shortcuts visible | Touch with gloves | One thumb |
| Control height | 36 px | 56 px | 48 px |
| Primary action | 36 px | 72 px, one per screen | 56 px |
| Touch minimum | 24 px | 56 px | 44 px |
| Body text | 14 px | 18 px | 17 px |
| Icons | 16 px, 12 to 14 px in badges, 14 px in menus | 22 to 28 px | 24 to 48 px, 48 px on the call screen |
| Hover | Muted surface, `brightness(1.1)` on primary | None. Show the information instead of a tooltip | Not relied on |
| Layout | Sidebar, sheet on the right | Offline banner at the top over the full width, few actions, light by default | Status card at the top, one topic per screen, no jargon |

## Theme

Light and dark are equal. Status colours keep their meaning in both. Every screen is checked in both themes.

| | Value set | Stored in | Default |
|---|---|---|---|
| Office (account users) | `Theme` (`light`, `dark`, `system`) | `app_user.ui_prefs`, key `app.theme` ([ADR-0014](../decisions/ADR-0014-user-ui-preferences.md)) | `system` |
| Gate and dock stations | `Theme` | `localStorage` key `rampflow.theme`, per device | `light` |
| Driver | `Theme` | `localStorage` key `rampflow.theme`, per device | `system` |
| Sign-in, token pages, org picker (`AuthLayout`) | none | not stored; `useApplyTheme(Theme.system)` follows the OS | `system` |

The switch lives in `apps/web/src/components/theme-switch.tsx` in two forms: `ThemeSwitch`, a shadcn ToggleGroup, and `ThemeMenuItems`, a DropdownMenu radio group in a submenu. Label de "Darstellung: Hell · Dunkel · Wie System", en "Appearance: Light · Dark · System". `ThemeMenuItems` sits in the office user menu and in the station shell's device menu. The class `dark` on `<html>` carries the theme.

The driver shell (`apps/driver/src/components/driver-shell.tsx`) uses a native `<select>` next to the language select instead. A ToggleGroup or DropdownMenu would push the driver's initial JavaScript over the 150 KB gzip budget of [ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md) (measured 146.5 KB with the native select). This exception is decided by ADR-0021.

Use these names. Do not write a theme or density hook of your own.

| Name | Where | Use |
|---|---|---|
| `Theme`, `ResolvedTheme`, `ThemeSurface`, `Density`, `UiPref` | `packages/shared/src/values/ui.ts` | The value sets. `UiPref.app_theme` is the `app.theme` key |
| `resolveTheme(choice, prefersDark)`, `THEME_DEFAULT`, `THEME_STORAGE_KEY`, `isTheme` | `packages/shared/src/modules/core/theme.ts` | Resolve `system`, the default per surface, the `localStorage` key |
| `useApplyTheme(choice)` | `apps/web/src/hooks/use-theme.ts` | Toggle `dark` on `<html>` while mounted |
| `useAccountTheme()` | `apps/web/src/hooks/use-theme.ts` | The office user's choice from `app.theme`. Called by the app shell |
| `useDeviceTheme(ThemeSurface.station)` | `apps/web/src/hooks/use-theme.ts` | The device's choice. Called by the station shell |
| `useResolvedTheme()` | `apps/web/src/hooks/use-theme.ts` | What `<html>` shows now, for libraries that take a theme name (the toaster) |
| `useDensity(density)` | `apps/web/src/hooks/use-density.ts` | Set `data-density` on `<html>` while mounted |
| `useDeviceTheme()`, `useDensity(density)` | `apps/driver/src/lib/theme.ts` | The driver PWA's own copies |

## Status mapping

Status never relies on colour alone. Every status renders from the registry in `components/status-badge.tsx` with icon, text and tone. The value set `BadgeTone` maps each tone to one status token. The tone uses the token as surface, its `-foreground` for text and icon, and its `-solid` for dots, blocks and lanes. A status badge has no border, like the design's `StatusBadge.jsx`: surface and foreground only. The `tone-*-border` aliases serve toned notices and highlighted cards (see [rampflow bindings](#rampflow-bindings)).

| `BadgeTone` | Token | Meaning |
|---|---|---|
| `planned` | `status-scheduled` | Planned (Petrol) |
| `onsite` | `status-on-yard` | Waits (amber) |
| `active` | `status-called` | Active (blue) |
| `success` | `status-done` | Done (green) |
| `danger` | `status-problem` | Problem (red) |
| `neutral` | `status-cancelled` | Gone or without effect (grey) |

### Booking status

| Status | Tone | Token | Icon (lucide) |
|---|---|---|---|
| `requested` | `onsite` | `status-on-yard` | Clock |
| `confirmed` | `planned` | `status-scheduled` | CalendarCheck |
| `checked_in` | `onsite` | `status-on-yard` | MapPin |
| `called` | `active` | `status-called` | Megaphone |
| `at_dock` | `active` | `status-called` | Forklift |
| `loading` | `active` | `status-called` | PackageOpen |
| `done` | `success` | `status-done` | CircleCheck |
| `departed` | `neutral` | `status-cancelled` | LogOut |
| `cancelled` | `neutral` | `status-cancelled` | MinusCircle, label struck through |
| `no_show` | `danger` | `status-problem` | UserX |
| `turned_away` | `danger` | `status-problem` | Ban |

A conflict is a second badge "Konflikt" with AlertTriangle in `danger` next to the status badge.

### Safety and punctuality

| State | Tone or token | Icon (lucide) |
|---|---|---|
| Briefing `valid` | `success` | ShieldCheck |
| Briefing `missing` | `danger` | ShieldAlert |
| Briefing `expired` | `danger` | ShieldX |
| Briefing `outdated` | `onsite` | ShieldX |
| Punctuality `early` | `punctual-early` | ArrowDownToLine |
| Punctuality `on_time` | `punctual-on-time` | Check |
| Punctuality late within tolerance | `punctual-late-tolerance` | Clock (design only) |
| Punctuality `late` | `punctual-late` | CircleAlert |

The icons follow the design's `status/PunctualityChip.jsx` (its `AlertCircle` is lucide `CircleAlert`). Punctuality chips use the `punctual-*` surface and foreground, not a `BadgeTone`. rampflow has no "late within tolerance" value yet (see Open).

## Components

Use the shadcn component with a variant. Never write a new primitive. A new variant or token is reported to the coordinator, not added by a unit (delivery plan, "Shared files").

### Rules for all components

| Rule | Value |
|---|---|
| Control height | `h-control`. Primary action `h-control-primary`. Small `h-control-sm` |
| Radius | `rounded-control` on button, input, select, menu. `rounded-sm` on badge and chip. `rounded-lg` on card, dialog, sheet, tile |
| Card | 1 px `border`, `bg-card`, `rounded-lg`, no shadow. Padding `p-pad` |
| Gate card | 2 px border, `primary` border when selected |
| Floating layers | Popover and menu `shadow-md`. Dialog, sheet and toast `shadow-lg`. In dark mode they also keep their border |
| Dialog overlay | `bg-foreground/40` with `backdrop-blur-[2px]` |
| Focus | 2 px `ring` with 2 px offset, always visible |
| Hover | `bg-muted`, or `brightness-110` on primary. None under `halle` |
| Press | `translate-y-px` |
| Motion | `duration-150` or the duration tokens, `ease-yrd`. No bounce |
| Spacing | 4 px grid. `p-pad` inside cards and panels, `gap-gap` between controls, 24 to 32 px between sections |

### Button variants

| Variant | When |
|---|---|
| `default` | The one primary action of the screen (Bestätigen, Check-in, Buchen). Under `halle` it is `size="lg"`, 72 px |
| `secondary` | An equal alternative next to the primary action (Verschieben, Walk-in) |
| `outline` | Filters, date, tools in toolbars |
| `ghost` | Cancel, row actions, menu triggers |
| `destructive` | Turn away, decline, cancel a booking. Always with a dialog that asks for the reason |
| `link` | Links in text (history, open booking) |

No button reschedules without confirmation. The system proposes (badge "Vorschlag"), a person decides. Button labels are verbs.

### Component map

| Need | rampflow component | Variant or size | Design counterpart |
|---|---|---|---|
| Action | `ui/button.tsx` | See button variants. Sizes `sm`, `default`, `lg`, `icon` | `design/yrd/components/core/Button.jsx` |
| Icon | `lucide-react` directly | Stroke 2, size per density | `core/Icon.jsx` |
| Reasons, filters as chips | `ui/toggle-group.tsx` | `lg` under `halle`. Selected is `accent` with a check icon | `core/ToggleGroup.jsx` |
| Theme choice | `components/theme-switch.tsx` | `lg` under `halle` | `core/ThemeSwitch.jsx` |
| Extra information | `ui/tooltip.tsx` | Never for required content, not under `halle` | `core/Tooltip.jsx` |
| Loading content | `ui/skeleton.tsx` | Shape of the later content. Spinner only inside a button | `core/Skeleton.jsx` |
| Progress, utilisation | `ui/progress.tsx` | Amber from 85 %, red at 100 %. The only pill | `core/Progress.jsx` |
| Booking, safety, punctuality status | `components/status-badge.tsx` | `sm` in tables, `md` default, `lg` and `xl` under `halle` and `fahrer` | `status/StatusBadge.jsx`, `status/PunctualityChip.jsx` |
| Counts, labels, "Vorschlag" | `ui/badge.tsx` | `secondary`, `outline`, a dashed `proposal` style for "Vorschlag" | `status/Badge.jsx` |
| Notice, warning, offline banner | `ui/alert.tsx` | Offline banner full width at the top under `halle` | `status/Alert.jsx` |
| Result of an action | `ui/sonner.tsx` | Bottom right, at most three, optional action (Rückgängig) | `status/Toast.jsx` |
| Form field | `ui/field.tsx` with react-hook-form | Error with icon and text, `aria-describedby` | `forms/FormField.jsx` |
| Text input | `ui/input.tsx`, `ui/input-group.tsx`, `ui/textarea.tsx` | `font-mono` for plates and numbers | `forms/Input.jsx` |
| Choice from a short list | `ui/select.tsx`, `ui/native-select.tsx` | With search (Command in Popover) for large sets | `forms/Select.jsx` |
| Code entry | Input OTP (not added yet) | `lg` under `halle` and `fahrer` | `forms/InputOTP.jsx` |
| Date | `ui/calendar.tsx` in `ui/popover.tsx` | Week starts Monday. Field shows "Do 15.10." | `forms/Calendar.jsx`, `forms/DatePicker.jsx` |
| Jump search | `ui/command.tsx` | Ctrl+K, results grouped by type | `forms/Command.jsx` |
| Section of a page | `ui/card.tsx` | Title, description, actions, footer | `surfaces/Card.jsx` |
| Confirmation | `ui/alert-dialog.tsx` | Primary action `destructive` for delete and archive | `surfaces/Dialog.jsx` |
| Create, edit, short action | `ui/sheet.tsx` | Size `sm` 384, `md` 480 (default), `lg` 640, `xl` 896 px. Full width on phones | `surfaces/Sheet.jsx` |
| User menu, row actions | `ui/dropdown-menu.tsx` | Menu icons 14 px, `inset` for items without icon | `surfaces/DropdownMenu.jsx` |
| Areas, filters | `ui/tabs.tsx` | `line` for page areas, segmented (default) for filters | `surfaces/Tabs.jsx` |
| Lists | `components/data-table/`, `ui/table.tsx` | Row 36 px, cell padding 12 px, 1 px dividers, no zebra stripes | `data/Table.jsx` |
| Charts | Chart (not added yet) | Series colours `chart-1` to `chart-5` | `data/Chart.jsx` |
| Office navigation | `ui/sidebar.tsx` | 240 px expanded, 56 px collapsed | `navigation/Sidebar.jsx` |
| Plan board | `components/plan-board/` | Docks × 15-minute grid, blocks in `-solid`, now line `status-called-solid` | `yard/Timeline.jsx` |
| Dock state | Dock station tiles | Tile `rounded-lg`, state edge in `-solid` | `yard/DockTile.jsx` |
| Gate arrival | Gate station cards | 2 px border, one primary action | `yard/GateCard.jsx` |
| Driver call | Driver PWA call screen | Dock number in `text-display`, `status-called` | `yard/CallScreen.jsx` |
| Wallboard | Not in the MVP | Plate, status, dock. Readable from a distance | `yard/Wallboard.jsx` |

Design paths in the last column are relative to `design/yrd/components/`.

## Patterns

Pick a pattern, do not design one. Every screen is one pattern from this catalogue. A new look is a defect.

| Pattern (de) | rampflow building block | When |
|---|---|---|
| Objektliste | `DataTable` with `defineList` ([ADR-0015](../decisions/ADR-0015-data-tables-and-entity-views.md)) | Many records, the count can exceed 50 |
| Kurzliste | `Table` without toolbar | Fixed at 50 entries or fewer |
| Objektseite | Entity route with tabs as child routes ([ADR-0015](../decisions/ADR-0015-data-tables-and-entity-views.md)) | Object with its own id, target of links, several topics |
| Einstellungsseite | Settings topic form ([ADR-0020](../decisions/ADR-0020-settings-information-architecture.md)) | Exactly one record per organisation, site, app or user |
| Formular | `Sheet` with a size, or a card in edit mode on an entity page | Create, edit, short action |
| Assistent | The booking wizard and the onboarding checklist | Only flows the product owner declared multi-step |
| Bestätigung | `AlertDialog` | Action without input |
| Einstiegsseite | `AuthLayout` (`components/app-shell/auth-layout.tsx`) | Pages before login or without access |
| Sprung-Suche | `Command` | In the header of every app with an account |
| Startseite je Rolle | Area home (`components/app-shell/area-home.tsx`) | Home of a role |
| Sonderbaustein | Own component | Nothing fits. The product owner decides each case |

### Decision tree

Ask from top to bottom. The first matching answer wins.

1. Only confirm, without input? **Bestätigung**.
2. Declared multi-step by the product owner? **Assistent**.
3. Create or change data, or a short action? **Formular**.
4. Can the largest count per organisation exceed 50? **Objektliste**.
5. Fixed at 50 or fewer? **Kurzliste**.
6. Object with its own id, target of links, several topics? **Objektseite**. If one of these is missing, it is a card on another page.
7. Exactly one record per organisation, site, app or user? **Einstellungsseite**.
8. None of these? **Sonderbaustein**, a question for the product owner.

### Where a form goes

| Case | Where |
|---|---|
| Create | Sheet on the right with all required fields, in one step. Afterwards the user stays in the list. A toast names the new object and offers "Öffnen". No second step |
| Edit, object with an entity page | On the entity page per section. "Bearbeiten" in a card header turns only that card into a form, with "Abbrechen" and "Speichern" in the card. One section at a time |
| Edit, dependent fields | The whole entity page in edit mode with a fixed bar at the bottom. Only when a field changes the valid values of another section |
| Edit, object without an entity page | Sheet |
| Short action | Sheet, for example record a payment, block with a reason, change a plan |
| Confirmation without input | AlertDialog |

Never a form in a modal dialog. Never a form inline in a table.

### Steckbrief

Every task with a screen has a `## Steckbrief` before anyone builds. It names the screen, the pattern, the largest expected count and a note. A list is shown with sample data in that count, in light and dark, and in the screen's density.

## Rules

The status column says how firm a rule is.

| Status | Meaning |
|---|---|
| decided | In an accepted ADR or the MVP scope. Holds without exception until the product owner announces one |
| given | Set by the product owner in conversation, not yet in an ADR. Holds like decided |
| proposal | Follows from research or the design system, not confirmed. A prototype shows it as "Vorschlag" instead of building it silently |

"Product owner" sources carry the date the rule was given. Sources named "rule sheet" come from the product owner's UI and UX rule sheet, folded into this page on 2026-10-21.

### 1. Principles

| Rule | Status | Source |
|---|---|---|
| Pick a pattern, do not design one. Every screen is a pattern from the catalogue. A new look is a defect | decided | ADR-0021 |
| One pattern, one building block. Each pattern is one rampflow building block, and its props allow only the permitted variants | decided | ADR-0021, ADR-0015 |
| shadcn/ui is the template. Building blocks come from shadcn/ui and are adapted through variants. Read the source first and keep classes, z-index, overlay, animation and scroll lock. Own components only where shadcn/ui has none | decided | ADR-0021, AGENTS.md |
| Layout with CSS, not JavaScript. No script that recomputes positions on scroll | given | Product owner, 2026-10-11 |
| Industry standard before innovation. Established design systems and trade terms are adopted. New things only where nothing is established, and then named as such | given | Product owner, 2026-10-09 |
| Build for the real count. Design every list for the largest count expected after years in use, not for 9 sample rows. Generate sample data in that count | decided | ADR-0021, ADR-0015 |
| Lean before tangled. The simplest model that serves the purpose. Expensive UI features only with a clear need | given | Product owner, 2026-10-16 |
| Deviation only through the product owner. An exception stands in the Steckbrief as "Ausnahme (product owner, date, reason)" and in code as `design-check-ignore: <reason>` or `biome-ignore` with the task. When it comes up a second time, a pattern is missing | decided | ADR-0021 |

### 2. Design system and styling

| Rule | Status | Source |
|---|---|---|
| Tailwind CSS v4 is the base. Styling only through Tailwind classes | decided | ADR-0021 |
| Themes are CSS variables with shadcn names (`--background`, `--primary`, `--destructive`), extended by tokens for status and density | decided | ADR-0021 |
| Tokens from the design system. Accent Petrol #0E6E73 light and #5FC6CA dark. IBM Plex Sans and IBM Plex Mono. Radius 6 and 10 px. Sidebar 240 px. Office type steps 12, 13, 14, 16, 18, 22, 28, 40 px | given | Claude Design project yrd, released 2026-10-11; ADR-0021 |
| Icons from lucide, as in shadcn/ui. Icons in menus 14 px, not 16 px | decided | ADR-0021 |
| Icons only where they carry meaning. An action always has a word, the icon alone is not enough | proposal | Rule sheet (NN/g) |
| No stock photos and no truck illustrations as decoration | proposal | Rule sheet; design system readme |
| Tables use tabular numerals so numbers align in columns | decided | ADR-0021 (global `tabular-nums` in the type tokens) |
| Tokens only in markup. No hex, oklch, rgb or hsl, no inline style, no font-family, no arbitrary colour class | decided | ADR-0021, `pnpm design:check` |

### 2a. Light and dark

| Rule | Status | Source |
|---|---|---|
| Every app has a light and a dark variant | decided | ADR-0021 |
| The user picks Hell, Dunkel or Wie System. With an account the choice holds for all the user's apps. The driver chooses in the driver PWA. Stations, kiosk and wallboard choose per device | decided | ADR-0021, ADR-0014 |
| Without a choice, Wie System holds. On gate and dock stations, Hell | decided | ADR-0021 |
| Status colours, contrast and meaning are the same in both variants. Check every screen in both | decided | ADR-0021, design contrast tables |

### 3. Patterns

The catalogue and the decision tree are in [Patterns](#patterns). Their status is decided (ADR-0021, ADR-0015, ADR-0020).

### 4. Lists and search

| Rule | Status | Source |
|---|---|---|
| An Objektliste works like the shadcn/ui data table. Header with title and "Neu", views as tabs with counts, text filter, facets with counts, sort in the column header | decided | ADR-0015 |
| Pages on the server, the page lives in the URL. 20 rows per page | decided (server paging, URL); proposal (20 rows) | ADR-0015; rule sheet |
| The default view is the one that needs action, not "Alle". Example "Braucht Aufmerksamkeit" | proposal | Rule sheet |
| A work list is not its own pattern. It is an Objektliste with views by status | decided | ADR-0021, ADR-0015 |
| A click on the row opens the entity page | decided | ADR-0015 |
| A Kurzliste is a table with row actions and "Neu" above it. No filter, no pages, no views | decided | ADR-0021 |
| Search jumps, it does not filter. The jump search covers all objects with an entity page, groups hits by type, Enter opens the entity page | decided | ADR-0021 |
| No select with all records. For large sets use a choice with search | given | Product owner, 2026-10-12 |
| Before a new list or work area, check how established tools solve it | given | Product owner, 2026-10-12 |

### 5. Row actions

| Rule | Status | Source |
|---|---|---|
| A "…" menu at the right of the row, as in the shadcn/ui data table, as one shared row actions component. Not added yet: the first unit that needs it reports it, and it lives in `components/data-table/row-actions.tsx` | decided (rule); not added yet (component) | ADR-0021 |
| First the standard actions with icon. Ansehen (Eye), Bearbeiten (Pencil), Duplizieren (Copy) | decided | ADR-0021 |
| Then a separator and the other actions | decided | ADR-0021 |
| Last, after a separator, the red actions. Löschen (Trash2), Archivieren | decided | ADR-0021 |
| Icons 14 px. Items without icon and the label align on the same text edge (shadcn `inset`) | decided | ADR-0021 |
| The component derives the groups from the action type, not the caller | decided | ADR-0021 |

### 6. Forms

| Rule | Status | Source |
|---|---|---|
| Where a form goes follows the table in [Where a form goes](#where-a-form-goes) | decided | ADR-0021, ADR-0015, ADR-0020 |
| Never a form in a modal dialog, never inline in a table | decided | ADR-0021 |
| Sheet as in shadcn/ui. Fixed, full height, z-50, overlay with blur | given | Product owner, 2026-10-11 |
| A form sheet (create, edit, short action with a reason) is modal. Overlay with blur, focus trapped, the shadcn default. The booking-detail side panel next to the plan board may be non-modal, as the design readme's "Sheet 480 px rechts, nicht modal" describes. That is a per-screen decision in the screen's Steckbrief | decided | ADR-0021 |
| Fixed size when opened. `sm` 384 px (1 to 3 fields), `md` 480 px (default), `lg` 640 px (two columns, many sections, small tables), `xl` 896 px (only with a wide table) | decided | ADR-0021 |
| Full width on phones. No freely draggable width | decided | ADR-0021 |
| The footer holds only "Abbrechen" and exactly one main action. Other actions stand in the section or tab they belong to | decided | ADR-0021 |
| Sections with a heading are the default, all open | decided | ADR-0021 |
| Required fields never sit in a collapsed area | decided | ADR-0021 |
| Collapsible only for rarely changed sections. Collapsed, a summary of the values in the header, opens by itself on an error | decided | ADR-0021 |
| Tabs (variant `line`) only for independent areas. At most 4, one "Speichern" for all, a dot on a tab with an error, jump to the first error, no tabs in tabs | decided | ADR-0021 |
| No accordion with `type="single"` in forms | decided | ADR-0021 |
| No autosave per field. Every change is audited, saving is deliberate | decided | ADR-0021, ADR-0020 |
| Unsaved changes. Leaving the page or the tab asks through an AlertDialog | decided | ADR-0021, ADR-0020 |
| An error never stays in a hidden part | decided | ADR-0021 |

### 7. Confirmations

| Rule | Status | Source |
|---|---|---|
| An action without input (delete, archive, discard) is confirmed with a shadcn/ui AlertDialog | decided | ADR-0021 |
| For delete and archive the main action is red | decided | ADR-0021 |
| An action that needs input, such as a reason, is a short action in a sheet | decided | ADR-0021 |
| Destructive actions name the reason in the dialog | decided | ADR-0021, design system readme |

### 8. Wizard, entry page, home

| Rule | Status | Source |
|---|---|---|
| Assistent only for declared flows. In rampflow, the booking wizard (BK-04), tenant self-registration and the site onboarding (ON-01 to ON-03) | decided | ADR-0021, ADR-0016, MVP scope |
| Wizard steps with number and title at the top, "Zurück" and "Weiter" at the bottom. Each step saves, the user can stop and continue later. The user always sees where they stand and what is missing | decided | ADR-0021 |
| Einstiegsseite after the shadcn/ui block login-02. Two columns from 1024 px, form with logo on the left, a full-height image on the right. Below 1024 px only the form column. Form at most 320 px wide. In dark mode the image is darkened and grey | decided | ADR-0021 |
| No social login button | decided | ADR-0021, ADR-0003 |
| Home per role. Tiles with short lists, each tile leads to a view of the catalogue. Charts later | decided | ADR-0021 |

### 9. Status and colour

| Rule | Status | Source |
|---|---|---|
| Colour never alone. Every status has colour, icon and word | decided | MVP scope NFR (WCAG 2.2 AA, WCAG 1.4.1), ADR-0021 |
| The status to colour mapping in [Status mapping](#status-mapping) | decided | ADR-0021 (from the design system's meaning table) |
| Choose colours safe for red-green deficiency. About 8 % of men have a colour vision deficiency | proposal | Rule sheet |
| Status colour against the background at least 3:1, its label at least 4.5:1 | decided | MVP scope NFR (WCAG 1.4.11, 1.4.3), design contrast tables |

### 10. Accessibility

The target is WCAG 2.2 level AA in every app (MVP scope NFR). Playwright runs axe on each story's main screen.

| Rule | Norm | Status |
|---|---|---|
| Text at least 4.5:1 contrast, large text 3:1 | WCAG 1.4.3 | decided |
| Controls and meaningful graphics at least 3:1 | WCAG 1.4.11 | decided |
| Colour is never the only carrier of information | WCAG 1.4.1 | decided |
| Touch targets at least 24 × 24 px with spacing. Under `halle` at least 56 px, under `fahrer` at least 44 px | WCAG 2.5.8, ADR-0021 | decided |
| Focus always visible, everything operable by keyboard | WCAG 2.4.7, 2.1.1 | decided |
| Both themes pass axe | WCAG 1.4.3 | decided |

### 11. Three densities

| Rule | Status | Source |
|---|---|---|
| One design system, three densities. Colours, status, terms and icons are the same everywhere, size and density follow the place | decided | ADR-0021 |
| Office. Calm and dense, one accent colour, tabular numerals, keyboard shortcuts in dispatch | decided | ADR-0021 |
| `halle`. Touch targets 56 px, main action 72 px, spacing at least 8 px, high contrast, few actions per screen, one main button, light by default | decided (tokens); proposal (glove sizes) | ADR-0021; glove test open |
| `fahrer`. Mobile first, one step per screen, status at the top, icon plus word, short sentences, one verb per button, numbers and dock number very large, small bundle | decided | ADR-0021, ADR-0008 |

### 12. Driver PWA and languages

| Rule | Status | Source |
|---|---|---|
| The driver PWA ships the 12 `DriverLocale` languages, staff and carrier UI ship de, en and pl | decided | ADR-0009 |
| Language preselected from the browser, switchable, the choice is remembered | decided | ADR-0009 |
| Every translation is reviewed. Machine translation carries the "auto" badge until reviewed | decided | ADR-0009, MVP scope (DR-02) |
| Language choice without flags. Each language in its own name (Polski, Română, Українська). The switch is always visible at the top | proposal | Rule sheet (W3C) |
| Deep link without login and without installation. PWA installation only offered | decided | ADR-0008 |
| Weak network. The last status is cached, offline is stated clearly | proposal | Rule sheet |

### 13. Copy, terms and formats

| Rule | Status | Source |
|---|---|---|
| One term, one name. The UI uses the names from the [domain glossary](../explanation/domain-glossary.md) | decided | Domain glossary, AGENTS.md |
| Do not use in the UI: Termin, Zeitfenster, Dock, Tor, Pool, Zone, Mandant | proposal | Design system readme; conflicts with the glossary (see Open) |
| Date in de as "Do 15.10.", time 24 h without seconds, times on a 15-minute grid | proposal (date format); decided (24 h) | Design system readme; ADR-0012 |
| Short verbs on buttons, in the infinitive in de. No jargon the user does not know, especially in the driver PWA | proposal | Rule sheet, design system readme |
| Status words in lower case like adjectives in running text. Proper names capitalised (No-Show, Konflikt) | proposal | Design system readme |
| Plates and numbers (B-1042, WGM 4KX21) in mono | decided | ADR-0021 |
| Drivers are addressed with "Sie" | proposal | Design system readme |
| No emoji, no Unicode characters as icons | decided | ADR-0021 |
| Live data says "aktualisiert vor 5 s" in `text-sm text-muted-foreground` | proposal | Design system readme |

### 14. Domain rules every screen keeps

| Rule | Status | Source |
|---|---|---|
| Carriers and drivers never see the dock time or the dock group. The driver sees the dock only when called | proposal | Design system readme; MVP scope (pools first) |
| The system proposes, a person decides. No button reschedules without confirmation | proposal | Design system readme |
| Every action writes a history entry (who, when, what). The entity page shows it | proposal | Rule sheet |
| Live data appears without reload, subtly with "aktualisiert vor 5 s" | proposal | Rule sheet |
| Navigation shows each user only what the role permits | decided | ADR-0006, ADR-0011, MVP scope (PL-02) |
| Elements not yet decided show subtly as "Vorschlag" in a prototype | proposal | Rule sheet |

### 15. Working on a screen

| Step | Rule | Source |
|---|---|---|
| Before | Load the `rampflow-design` skill and read this page | ADR-0021 |
| Before | Read the existing screen and compare it with the pattern catalogue. Name deviations as findings, do not adopt them silently | Product owner, 2026-10-14 |
| Refine | Every task with a screen has a Steckbrief (screen, pattern, largest count, note). Only then is it built | ADR-0021 |
| Build | Use the building blocks of the catalogue. No screen generator exists yet | ADR-0021 |
| Prove | Show every list with sample data in the Steckbrief's count. Look at it in light and dark and in its density | ADR-0021 |
| Prove | After a change, look at the running page before reporting done | Product owner, 2026-10-16 |
| Check | `pnpm design:check` passes. Review against the Steckbrief and the catalogue. A pattern outside the catalogue is a finding | ADR-0021 |

## Copy and formats

| Item | Rule |
|---|---|
| Terms | From the [domain glossary](../explanation/domain-glossary.md). The design system's term list (Standort, Halle, Rampengruppe, Rampe, Buchungsart, Buchung, Ankunftszeit, Rampenzeit, Check-in, Aufruf, Abfahrtsfreigabe, Check-out, Walk-in, Wartezeit, Standzeit, Standgeld, Pünktlichkeit) is a proposal |
| Two times | Arrival time ("Anmeldung an der Pforte bis 13:45 Uhr") for carriers and drivers. Dock time only in dispatch |
| Date | "Do 15.10." in de (proposal). Times always in site time with the zone label ([ADR-0012](../decisions/ADR-0012-time-handling.md)) |
| Time | 24 h, no seconds, 15-minute grid, tabular numerals |
| Numbers | Locale formatting through `Intl`. Plates, booking codes, order and delivery note numbers in `font-mono` |
| Buttons | Verbs. Destructive actions name the reason in the dialog |
| Forbidden words | Termin, Zeitfenster, Dock, Tor, Pool, Zone, Mandant. Proposal, see Open |

## Accessibility

| Item | Rule |
|---|---|
| Level | WCAG 2.2 AA in every app, both themes, all densities |
| Contrast | Text 4.5:1, large text 3:1, controls and meaningful graphics 3:1. The design's text pairs reach 4.5:1 |
| Colour | Never the only carrier. Icon plus word for every status |
| Targets | 24 px office, 56 px `halle`, 44 px `fahrer` |
| Focus | Always visible, 2 px `ring` with 2 px offset. Everything works by keyboard |
| Tests | axe on each story's main screen in Playwright |

## Open

| Point | Needs |
|---|---|
| The status colour mapping, the three densities and the glove target sizes are proposals of the design system, confirmed by use | A decision of the product owner and a test with real gloves for `halle` |
| Accent Petrol and IBM Plex Sans are proposals of the design system. The brand is open | Confirmation by the product owner (brand and domain) |
| The image of the entry page depends on branding | Branding decision |
| rampflow has no "late within tolerance" punctuality value. The token `punctual-late-tolerance` is unused | A product decision on a tolerance |
| The forbidden word list contradicts the glossary (Mandant, Tor, Zeitfenster, Rampen-Pool) | A glossary decision |
| The design's German status labels (bestätigt, aufgerufen, an Rampe, abgefertigt, ausgecheckt) differ from the catalogue (Gebucht, Gerufen, Am Tor, Fertig, Abgefahren) | A copy decision |
| Gate and dock flows (check-in, walk-in, check-out) use dialogs with inputs, against "never a form in a modal dialog" | A decision whether `halle` keeps dialogs as an exception or moves to sheets |
