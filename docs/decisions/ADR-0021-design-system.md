---
title: "ADR-0021 Design system: yrd tokens, three densities, light and dark"
description: Why rampflow adopts the yrd design system from Claude Design, where its tokens and fonts live, the office, halle and fahrer densities, how the theme is chosen and stored, how BadgeTone maps onto the status tokens, which component rules hold, and how the reference, the skill and pnpm design:check make it impossible to skip.
type: explanation
audience: [agent, developer]
tags: [adr, ux, design, tokens, accessibility, frontend]
status: stable
updated: 2026-10-21
related: [docs/reference/design-system.md, docs/explanation/ux-concept.md, docs/decisions/ADR-0014-user-ui-preferences.md, docs/decisions/ADR-0015-data-tables-and-entity-views.md, docs/decisions/ADR-0019-central-value-sets.md, docs/decisions/ADR-0020-settings-information-architecture.md, docs/explanation/mvp-scope.md]
---

# ADR-0021 Design system: yrd tokens, three densities, light and dark

Status: accepted, 2026-10-21. Decided by change 07 (design system).

## Context

The MVP styled itself. `apps/web/src/index.css` defined an oklch palette with a deep blue primary, six status tones in blue, amber, violet, green, red and grey, and an orange `signal` colour for the dock call and the now line. Geist Variable was the only font. Gate and dock screens used `data-density="touch"` with 44 px controls. Dark tokens existed, but dark mode was out of scope and untested.

The product owner then released a design system in Claude Design, the project "yrd Design System" (<https://claude.ai/design/p/d6c60fba-e676-413b-b2a8-221aff505cdf>, 2026-10-11). It defines shadcn-named tokens for light and dark, nine status tokens with surface, foreground and solid, four punctuality tokens, three densities (office, halle, fahrer), IBM Plex Sans and Mono, and 29 component references. The whole project is checked in under `design/yrd/` as the source of truth: `readme.md`, `tokens/`, `guidelines/` and `components/`.

The product owner also brought a UI and UX rule sheet from another project. Its rules apply to rampflow. Its sources (decision log E1, ADR 0004, `packages/ui`, bun) do not exist here.

Without a single reference and a check, every unit would keep picking colours, sizes and patterns of its own.

## Decision

### 1. Tokens and fonts

- The token files live in `apps/web/src/styles/`: `fonts.css`, `theme.css`, `typography.css` and `tailwind.css`. Values are copied verbatim from `design/yrd/tokens/`. Comments may be translated. Each file names the design project in a one-line origin note.
- `apps/web/src/index.css` imports `tailwindcss`, `tw-animate-css` and `shadcn/tailwind.css`, then the four style files in the order fonts, theme, typography, tailwind, then the base layer. The driver PWA imports the web app's `index.css`.
- Fonts are self-hosted through `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`, weights 400, 500, 600 and 700, subsets latin, latin-ext, cyrillic and cyrillic-ext. Geist is removed.
- `design/yrd/` is never edited. Biome and the typecheck do not see it.

### 2. Densities

- The value set `Density` (`halle`, `fahrer`) lives in `packages/shared/src/values/ui.ts` ([ADR-0019](ADR-0019-central-value-sets.md)).
- Office is the absence of `data-density`. Gate and dock station screens set `halle`. The driver PWA and the driver shell set `fahrer`.
- The shell sets the attribute on `<html>` through `useDensity` (`apps/web/src/hooks/use-density.ts`, in the driver PWA `apps/driver/src/lib/theme.ts`), so portals inherit the density.
- `data-density="touch"` is removed.
- Control height is 36, 56 and 48 px, the primary action 36, 72 and 56 px, the touch minimum 24, 56 and 44 px.

### 3. Theme

- The value set `Theme` (`light`, `dark`, `system`) lives in `packages/shared/src/values/ui.ts`. Dark is the class `dark` on `<html>`.
- Account users store the choice in `app_user.ui_prefs` under `app.theme` ([ADR-0014](ADR-0014-user-ui-preferences.md)). The default is `system`.
- Gate and dock stations and the driver store it per device in `localStorage` under `rampflow.theme`. Stations default to `light`, the driver to `system`.
- `resolveTheme` (`packages/shared/src/modules/core/theme.ts`) resolves `system`. The hooks in `apps/web/src/hooks/use-theme.ts` (`useAccountTheme`, `useDeviceTheme`, `useApplyTheme`, `useResolvedTheme`) read the choice and set the class.
- The switch offers "Darstellung: Hell · Dunkel · Wie System" (en "Appearance: Light · Dark · System"). `apps/web/src/components/theme-switch.tsx` holds it as a ToggleGroup (`ThemeSwitch`) and as a DropdownMenu radio group (`ThemeMenuItems`). The office user menu and the station shell's device menu use the radio group. The driver shell uses a native select next to the language switch (see Consequences).

### 4. Status tones

`BadgeTone` stays. Its six members are re-pointed to the design's status tokens.

| `BadgeTone` | Status token | Booking status |
|---|---|---|
| `planned` | `status-scheduled` | `confirmed` |
| `onsite` | `status-on-yard` | `requested`, `checked_in` |
| `active` | `status-called` | `called`, `at_dock`, `loading` |
| `success` | `status-done` | `done` |
| `danger` | `status-problem` | `no_show`, `turned_away` |
| `neutral` | `status-cancelled` | `departed`, `cancelled` |

Each tone uses the token as surface, its `-foreground` for text and icon, and its `-solid` for dots, blocks and lanes. A status badge has no border, like the design's `StatusBadge.jsx`. The `tone-*-border` aliases in `apps/web/src/index.css` point at the `-foreground` too and serve toned notices and highlighted cards, never a badge. `toneClasses` and `toneSolidClasses` in `components/status-badge.tsx` are the only way to colour by status. Punctuality uses the `punctual-*` tokens. The orange `signal` colour is removed. The now line and the dock call use `status-called-solid`.

`BadgeTone` stays because it names a meaning, not a booking state. Safety states and punctuality share the six tones, and the design's own tokens already pair (`requested` equals `on-yard`, `called` equals `at-dock`, `checked-out` equals `cancelled`). Six tones cover all values with no loss.

### 5. Status icons

Each booking status has one fixed lucide icon: requested Clock, confirmed CalendarCheck, checked_in MapPin, called Megaphone, at_dock Forklift, loading PackageOpen, done CircleCheck, departed LogOut, cancelled MinusCircle, no_show UserX, turned_away Ban. Icons are 16 px in the office (12 to 14 px in badges), 22 to 28 px under `halle` and 24 to 48 px under `fahrer`. Status never relies on colour alone.

### 6. Components

rampflow keeps its shadcn components on Base UI. The design components are references for class lists, variants, sizes and states. New primitives are not written.

| Rule | Value |
|---|---|
| Control height | `h-control`, primary `h-control-primary`, small `h-control-sm` |
| Radius | `rounded-control` on button, input and menu. `rounded-sm` on badge and chip. `rounded-lg` on card, dialog and tile |
| Sidebar | 240 px expanded, 56 px collapsed |
| Sheet | `sm` 384, `md` 480 (default), `lg` 640, `xl` 896 px. Full width on phones |
| Office table | Row 36 px, cell padding 12 px, no zebra stripes |
| Elevation | Cards have a 1 px border and no shadow. Popover and menu `shadow-md`. Dialog, sheet and toast `shadow-lg` |
| Overlay | Foreground at 40 % with 2 px blur |
| Sheet modality | A form sheet (create, edit, short action with a reason) is modal with the overlay and a focus trap. The booking-detail side panel next to the plan board may be non-modal, decided per screen in its Steckbrief |
| Focus | 2 px `ring` with 2 px offset |
| Motion | 120 to 180 ms, `cubic-bezier(.2,0,0,1)`, no bounces |
| Hover | None under `halle` |

### 7. Enforcement

- [Design system](../reference/design-system.md) is the single reference for every UI task. It holds the tokens, densities, type scale, status mapping, the pattern catalogue mapped to rampflow building blocks, and every rule of the rule sheet with a status (decided, given, proposal) and a rampflow source.
- The Claude Code skill `rampflow-design` (`.claude/skills/rampflow-design/SKILL.md`) is loaded before any UI work. It points at the reference.
- `pnpm design:check` runs inside `pnpm verify`. It scans `apps/web/src` and `apps/driver/src` and fails on hex, oklch, rgb or hsl values outside `apps/web/src/styles/`, inline `style={{`, `font-family`, arbitrary colour classes, `data-density="touch"` and the removed `signal` classes. The `tone-*` classes stay: they are the `BadgeTone` aliases of the status tokens. A line that must keep one carries `design-check-ignore: <reason>`.

## Consequences

- Every unit with UI work loads the skill, reads the reference and writes a Steckbrief before it builds.
- Units change `apps/web/src/styles/**` and `apps/web/src/components/ui/**` only through the reference's rules. A new token or variant goes into the unit's report for the coordinator.
- Every screen is checked in light and dark and in its density. axe covers both themes.
- Screens keep `BadgeTone` and the registry in `status-badge.tsx`. A colour class next to a status is a finding.
- Runtime positions (plan board) and fixed-colour graphics (QR code) need `design-check-ignore` with a reason, or a CSS variable set outside markup.
- Rules marked proposal in the reference need the product owner before they are built as fact. Among them are the forbidden word list, the date format "Do 15.10.", the glove target sizes and the brand (accent Petrol, IBM Plex Sans).
- The touch NFR of the MVP scope (44 px for driver and gate) still holds. `halle` raises the gate and dock minimum to 56 px.
- The driver's theme switch is a native `<select>` next to the language select, not the ToggleGroup or DropdownMenu of the office and the station. Either component would push the driver's initial JavaScript over the 150 KB gzip budget of [ADR-0008](ADR-0008-driver-token-pwa-delivery.md). With the native select it measures 146.5 KB.

## Alternatives considered

| Option | Verdict |
|---|---|
| Rename `BadgeTone` to the nine status tokens | Duplicates three pairs with identical values and ties safety and punctuality to booking words. Every call site would change for no visible difference |
| Keep two palettes, the MVP oklch set for the app and yrd for new screens | Two sources of truth. Screens would drift, and dark mode would need two contrast proofs |
| Load IBM Plex from Google Fonts at runtime, as the design project does | A third-party request on every page view, a GDPR question for EU tenants, and no font on a station without internet. Self-hosting through Fontsource avoids all three |
