# Proposal

## Why

`/platform/settings` and `/t/$orgId/settings` render every setting of a level on one long page: 27 fields on the platform page, in eight module cards in no particular order. The page offers no path to a topic, no deep link to a single setting, and one source badge per field that reads the same on all 27. Site settings hang off the tenant page as `?site=` tabs, outside the site's own detail view (ADR-0015), and an unknown `?site=` falls back to the tenant level silently, so an admin can save on the wrong level. The admitted-countries field shows 27 removable chips with a custom search list. The product owner rejects this layout: users must see where each setting belongs, and every view must be reachable by a path.

## What Changes

- **Settings topics with their own routes on every level.**
  - Routes: `/platform/settings/$topic`, `/t/$orgId/settings/$topic` and the new site tab `/t/$orgId/sites/$siteId/settings/$topic`.
  - Topics: `general`, `booking`, `avis`, `yard`, `safety` and `privacy`. Each topic has named sections, for example Booking → Rules, Public booking and Reminders, or Privacy → Privacy notice, Retention and Driver access.
  - Each setting key is placed in exactly one topic and section. A level shows only the topics that hold an available setting.
  - `…/settings` redirects to the first available topic. An unknown topic shows "no access".
- **Deep link to one setting**: `…/$topic#<setting key>` scrolls to the field, highlights it and moves focus to its title. A "Copy link" button replaces the technical key shown under each field today.
- **Settings search** in the settings header. It searches the label, description and key of every setting available on the current level and opens the result's deep link.
- **Site settings move into the site view** as a "Settings" tab. **BREAKING** (web URL): `/t/$orgId/settings?site=<id>` redirects to `/t/$orgId/sites/<id>/settings`. A site the user may not see shows "no access" instead of the tenant level.
- **One form per topic page.**
  - A shared save bar with "Save" and "Discard". Only keys the user changed are written.
  - "Use inherited value" is a pending change, saved with the rest of the form.
  - Leaving the page with unsaved changes asks first.
  - New endpoints `PATCH /api/platform/settings` and `PATCH /api/t/:orgId/settings` write and reset several keys in one transaction: all or nothing. The per-key `PUT` and `DELETE` routes stay as they are.
- **The origin shows as quiet text under every field**, never only when the value deviates. Examples: "Product default", "From platform", "Set for this tenant", "From tenant" with the value an override hides.
  - It links to the level that sets the value when the user may manage that level.
  - Units (minutes, hours, days, %) move from the label into an input suffix.
- **Confirmation before shortening retention.** If a save lowers the effective value of a `privacy.retention.*` key, a dialog names each key with its old and new value and warns that older data is deleted on the next retention run. This includes "Use inherited value" when the inherited value is lower.
- **Admitted countries editor.**
  - Replaces the chip picker: two groups, "EU member states" and "Other countries", each with a select-all checkbox that shows a mixed state.
  - A filter field above, and "27 of 57 selected".
  - The value stays the stored list of country codes.
  - The `Checkbox` component gets a visible indeterminate state.
- **Language.** `i18n.default_locale` loses its site scope (P T only).
  - It is relabelled: it is the language for people who have not chosen one, used in invitations, emails and exports. The UI language always belongs to the person.
  - The site's language stays the `site.default_locale` column, edited in the site form.
  - Stored site rows of `i18n.default_locale` are left in place: the resolver already skips levels a key does not allow, so they stop counting and no custom SQL is needed.
  - The web UI now applies a language this device chose before the tenant default. Today the tenant default overrides it for a user without an account language.
  - A Playwright guard covers the language menu on every signed-out page. The menu already exists in `AuthLayout`.
- **Stories**: PL-03, TN-02 and MD-01 are amended. The merge-conflict markers left in MD-01 of `docs/explanation/mvp-scope.md` by the 03 merge are resolved.

## Capabilities

### New Capabilities

- `settings-navigation`: topics and sections, routes per level, the redirect, deep links with focus, search, origin links, the old-URL redirect and the unavailable states.
- `settings-editing`: the topic form, batch save and its errors, origin text, inherit and discard, the unsaved-changes guard, the retention confirmation, unit suffixes and the admitted-countries editor.
- `ui-language`: who chooses the UI language and where, which language applies when nobody chose one, and what `i18n.default_locale` means.

### Modified Capabilities

None. `entity-views` already requires child routes for detail tabs; the site's Settings tab follows it unchanged.

## Impact

- **API:** `apps/api/src/modules/core/settings/` (`settings.ts` gains `writeSettings`, `routes.tenant.ts` gains `PATCH /`, `route-cases.ts`, `settings.test.ts`), `apps/api/src/modules/core/platform/routes.platform.ts` (`PATCH /settings`). No migration.
- **Shared:**
  - `packages/shared/src/modules/core/api.settings.ts`: `PatchTenantSettings`, `PatchPlatformSettings`.
  - `packages/shared/src/modules/i18n/manifest.ts`: scopes P T. This is a manifest change, landed by the coordinator.
  - New value sets `SettingsTopic`, `SettingsSection` and `SettingUnit` in `packages/shared/src/values/settings.ts`, and `CountryGroup` in `packages/shared/src/modules/core/values.ts`.
- **Web:**
  - Routes: `apps/web/src/routes/platform/settings/`, `routes/t/$orgId/settings/` and the new `routes/t/$orgId/sites/$siteId/settings/`. The site layout gains the tab.
  - Modules: `apps/web/src/modules/core/settings-*.tsx` replaces `settings-sections.tsx` and its `Picker`. `apps/web/src/components/settings-field.tsx`, `components/ui/checkbox.tsx` (indeterminate) and `components/app-shell/user-menu.tsx` (`useSyncLocale` order).
  - `apps/web/src/lib/i18n.ts`: the device's explicit choice is kept apart from the browser's languages.
- **i18n:** `core/settings-ui.json` (topics, sections, origin texts, save bar, search, retention dialog, countries editor) in de, en and pl; derived `*/settings.json` labels lose their unit suffix; `i18n/settings.json` gets the new description.
- **Tests:** `settings.test.ts` (batch write, atomic failure, only-changed keys), route cases for both PATCH routes, `e2e/core/PL-03.spec.ts` and `TN-02.spec.ts` rewritten for topics, deep links, search, origin, the save bar and the retention dialog, a new step in `e2e/core/MD-01.spec.ts` for the site Settings tab, and a test in `e2e/core/shell.spec.ts` for the language menu on every signed-out page. `e2e/support/u3.ts` keeps the per-key helpers.
- **Docs:**
  - New ADR `docs/decisions/ADR-0020-settings-information-architecture.md`.
  - `docs/decisions/ADR-0007-settings-resolution.md`: batch write, origin display and key count 30.
  - `docs/decisions/ADR-0011-frontend-routes-and-org-context.md`: route map.
  - `docs/decisions/ADR-0009-i18n-catalogs.md`: who picks the language.
  - `docs/explanation/mvp-scope.md`: PL-03, TN-02, MD-01, the settings catalog and the conflict markers.
  - `docs/explanation/ux-concept.md`: settings screens.
  - `docs/reference/api-routes.md` via `pnpm api:docs`, and `docs/reference/module-contract.md`, where `i18n.default_locale` changes scope.
- **Data model:** no table, column or check change, and no migration. Seed: no data model change, but the dev seed today stores only one setting override (`booking.public_link_enabled` at Acme Hamburg, `apps/api/scripts/seed/carriers.ts`). So every field would read "Product default". `apps/api/scripts/seed/core.ts` gains a platform and a tenant override, and `seed/sites.ts` a site override for Hamburg DC, so `pnpm dev` shows every origin text and an override hiding an inherited value.
- **Not in scope:** a change history of settings (audit log UI is LATER), counts of the records a shorter retention would delete, synonyms in search, and a global ⌘K search.
