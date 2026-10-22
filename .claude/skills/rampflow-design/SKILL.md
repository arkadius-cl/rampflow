---
name: rampflow-design
description: Load before any UI work in apps/web or apps/driver. Use it for every screen, page, route component, component, styling, Tailwind class, colour, theme or dark mode, density, touch size, badge or status display, icon, form, sheet, dialog, table or layout change. It points at the design system reference, the pattern decision tree, the Steckbrief and pnpm design:check.
user-invocable: true
---

# rampflow design

## 1. Read

Read `docs/reference/design-system.md` first. It holds the tokens, densities, type scale, status mapping, component map, patterns and rules. `design/yrd/` is the design source. Read the design counterpart of every component you touch (`design/yrd/components/<group>/<Name>.jsx` and `.prompt.md`). Take its classes, variants, sizes and states. Never edit `design/yrd/`.

## 2. Pick the pattern

Ask from top to bottom. The first match wins.

1. Only confirm, without input? Bestätigung (`AlertDialog`).
2. Declared multi-step by the product owner? Assistent.
3. Create or change data, or a short action? Formular (`Sheet` with a size, or a card in edit mode).
4. Largest count per organisation can exceed 50? Objektliste (`DataTable` with `defineList`).
5. Fixed at 50 or fewer? Kurzliste (`Table` without toolbar).
6. Own id, target of links, several topics? Objektseite (entity route, tabs as child routes).
7. Exactly one record per organisation, site, app or user? Einstellungsseite (settings topic form).
8. None? Sonderbaustein. Ask the product owner.

## 3. Write the Steckbrief

Before you build, write it in the task or report.

```
## Steckbrief
Screen: <route>
Pattern: <pattern from step 2>
Width: <PageWidth from the pattern: full | wide | narrow>
Navigation: <none | line tabs (entity topics) | segmented (views, filters) | vertical list (settings, siblings)>
Largest count: <largest expected count after years in use>
Note: <density, theme default, exceptions with product owner, date and reason>
```

## 4. Build

- Every office page is `<Page width=... title=... actions=... tabs=...>` from `components/shells/page.tsx` (ADR-0022). No `max-w-*` on a page root. Entity topics are `PageTabs`, list views are segmented `Tabs`, settings topics the vertical list.
- shadcn components with their variants. No new primitive. Report a new token or variant instead of adding it.
- Token classes only. No hex, oklch, rgb or hsl, no `style={{ }}`, no `font-family`, no `bg-[#...]`.
- Density through `useDensity` (`hooks/use-density.ts`) with the `Density` value set. It sets `data-density` on `<html>`. Office has none. Gate and dock use `halle`, the driver uses `fahrer`.
- Status through the registry in `components/status-badge.tsx` with icon, word and `BadgeTone`, or `toneClasses` and `toneSolidClasses` by tone. Never `status-*` classes in a screen. Never colour alone.
- Theme through the hooks in `hooks/use-theme.ts`, the switch in `components/theme-switch.tsx` and the `Theme` value set. Never hard-code light.
- Touch targets 56 px under `halle`, 44 px under `fahrer`. No hover-only information under `halle`.
- Strings in `packages/i18n` for every locale of the module's set.

## 5. Prove

- Look at the running screen in light and in dark, in its density, with sample data in the Steckbrief's count.
- Run `pnpm design:check`. A line that must break a rule carries `design-check-ignore: <reason>` and the reason goes in your report.
- Name every deviation from the reference in your report.
