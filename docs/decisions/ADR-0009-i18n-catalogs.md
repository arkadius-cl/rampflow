---
title: ADR-0009 i18n with i18next, one namespace per module, catalogs split into part files
description: Where translation catalogs live, how namespaces map to modules, how the staff and driver locale sets differ, how the server renders emails, and how CI fails on a missing key.
type: explanation
audience: [agent, developer]
tags: [adr, i18n, translations, testing]
status: stable
updated: 2026-10-21
related: [docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/explanation/research/domain-standards.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md]
---

# ADR-0009: i18n with i18next, one namespace per module, catalogs split into part files

Status: accepted, 2026-10-19. Updated 2026-10-21 by change 06: who chooses the UI language, and what `i18n.default_locale` means.

## Context

The staff and carrier UI ships in de, en and pl. The driver PWA, driver emails and safety content ship in 12 languages, and each driver locale carries a `machine` or `reviewed` flag for the DR-02 badge. The scope requires one i18next namespace per module and a CI failure when any key is missing in any of its locales. Units of the same wave add strings to the same module, so one JSON file per namespace and locale would be a merge conflict in every wave.

## Options considered

| Option | Verdict |
|---|---|
| Lingui or Paraglide | Both need a compiler step. Paraglide is smaller, but the research ranks it second because it reloads on locale switch and its TS 7 path is unverified. |
| i18next, one file per namespace and locale | The common layout. Two units adding keys to `booking` conflict at the end of the same JSON object. |
| **i18next, one directory per namespace and locale, one file per part** | The namespace is the merge of its part files, each mounted under its file name. Units own part files, so parallel units never edit the same file. |

## Decision

1. **Package.** `packages/i18n` holds the catalogs and two small init helpers:
   - `createBrowserI18n(namespaces)` for `apps/web` and `apps/driver`, loading namespaces lazily with `i18next-resources-to-backend` and `import.meta.glob`.
   - `createServerI18n(locale)` for emails, built with `i18next.createInstance()` per message.
2. **Layout.** `packages/i18n/locales/<locale>/<namespace>/<part>.json`. The content of `booking/plan.json` is reachable as `booking:plan.<key>`. Two parts cannot collide, because each part is its own top-level key.
3. **Namespaces are module ids** from the catalog. `core` holds the app shell, common actions and error messages (`core:errors.<code>`). There is no separate `common` namespace.
4. **Locale sets come from the manifest.** A module with `locales: 'staff'` ships `STAFF_LOCALES` (de, en, pl). The `driver` module ships `DRIVER_LOCALES` (12). Safety briefing content is data in the database, not a catalog, so it is not part of this check.
5. **Derived keys.** Every manifest item that the UI labels has a fixed key:
   - module name: `<module>:module.name`, for every module
   - nav item: `<module>:nav.<id>`
   - entitlement: `<module>:entitlements.<key without module prefix>`
   - setting: `<module>:settings.<key without module prefix>.label` and `.description`
   - API error code: `core:errors.<code>`
   U2 writes these part files (`nav.json`, `entitlements.json`, `settings.json`) for every module, and `pnpm i18n:derive` writes them with `module.json`, because it builds the shell that shows them.
6. **CI check.** `packages/i18n/src/catalogs.test.ts` fails when:
   - a part file exists in `en` but not in another locale of the module's set, or the reverse,
   - the key sets of a part differ between `en` and any other locale,
   - a derived key from point 5 is missing in `en`,
   - a value is empty,
   - a driver locale has no entry in `packages/i18n/locales/status.json` (`source`, `machine` or `reviewed`).
   `en` is the source locale for key sets. German is the product's primary language, but key structure is easier to review in one fixed source.
7. **Types.** `apps/web` declares i18next `CustomTypeOptions` from the `en` catalogs with `enableSelector: "optimize"`, so a typo in a key fails `tsc`.
8. **Choosing a locale.**
   - **The UI language belongs to the person.** Every page of the web app offers the language menu (de, en, pl), signed in or not: `AuthLayout` on the sign-in, sign-up, invitation, registration, magic link and reset pages and on `/r/$slug`, the user menu in every signed-in area. A switch changes the text at once, without reload, and keeps entered form values.
   - **Order in the web app.** The account language (`app_user.locale`), else this device's last explicit choice (`localStorage`), else the browser's preferred languages matched against de, en and pl, else the tenant's `i18n.default_locale` inside a tenant area, else `de`. A choice made while signed in becomes the account language. A new account (invitation, carrier invitation, sign-up, public link registration) stores the page's current language.
   - **`i18n.default_locale`** has the platform and tenant levels only. It is the language of invitations, emails and exports addressed to a person without an account language, and the last UI fallback in a tenant area. It never overrides a person's choice. A site's language is the site's `default_locale` column ([ADR-0007](ADR-0007-settings-resolution.md), point 2), not this setting.
   - Drivers: the browser's preferred languages matched against the 12, else `en`; the one-tap switcher stores the choice in `localStorage`.
   - Emails use the recipient's locale: the user's locale for users, the locale chosen in "email to driver" (CR-06) for drivers.
9. **Formatting.** Numbers and dates go through `Intl` and date-fns locales. Times are always shown in the site's zone ([ADR-0012](ADR-0012-time-handling.md)). CSV delimiters follow the user's locale (`;` for de and pl, `,` for en, RP-02).

## Consequences

- A unit adds a part file per locale in its module's namespace and cannot conflict with a sibling unit.
- A missing pl or tr string fails `pnpm verify`, not a user.
- Machine-translated driver strings ship flagged and get the DR-02 badge until someone reviews them and flips the flag in `status.json`.
