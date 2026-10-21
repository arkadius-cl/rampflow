# Tasks

Prerequisite: 03 is merged on `main`. 06 does not depend on 04 (`04-platform-tenant-views`), but both edit `apps/web/src/routes/t/$orgId/route.tsx` and `docs/explanation/mvp-scope.md`. Rebase on whichever lands first and keep both edits.

## 1. Docs: decisions and stories first

- [x] 1.1 Resolve the merge-conflict markers in MD-01 of `docs/explanation/mvp-scope.md`. Keep both halves: the admitted-country sentence of HEAD and the opening-hours sentence and bullets of 03. Verify `git grep -n '^<<<<<<<\|^>>>>>>>' -- docs` prints nothing.
- [x] 1.2 Amend the stories in `docs/explanation/mvp-scope.md`:
  - **PL-03**: settings grouped in topics with their own URLs, deep links, admitted countries chosen from a grouped list, and confirmation before a shorter retention.
  - **TN-02**: one form per topic with Save and Discard; origin always shown; site settings in the site view; `?site=` redirects.
  - **MD-01**: the Settings tab of a site.
  - **Settings catalog**: `i18n.default_locale` scopes P T, with the note "people without a language of their own".

  Verify `pnpm docs:check` passes.
- [x] 1.3 Write `docs/decisions/ADR-0020-settings-information-architecture.md` (type `explanation`, tag `adr`) from design decisions 1 to 4, 6 and 7, with the options table (manifest field, topics = modules, card per setting, settings dialog, second sidebar). Verify `pnpm docs:check` passes.
- [x] 1.4 Update the other ADRs:
  - `docs/decisions/ADR-0007-settings-resolution.md`: key count 30, the batch write (decision 5) under "Write path", the origin display rule under "Read path", and a link to ADR-0020.
  - `docs/decisions/ADR-0011-frontend-routes-and-org-context.md`: route map rows `/platform/settings/$topic`, `/t/$orgId/settings/$topic` and `/t/$orgId/sites/$siteId/settings/$topic`, the index redirects and the `?site=` redirect.
  - `docs/decisions/ADR-0009-i18n-catalogs.md`: the UI language order (account, device choice, browser, tenant default, `de`), the language menu on every page, and the meaning of `i18n.default_locale`.

  Verify `pnpm docs:check` passes.
- [x] 1.5 Update the settings screens in `docs/explanation/ux-concept.md`: topic navigation per level, the field anatomy (title, description, control with unit, origin, copy link), the save bar, search, the retention dialog and the countries editor. Verify `pnpm docs:check` passes.

## 2. Shared value sets and the placement map

- [x] 2.1 Add value sets to `packages/shared/src/values/settings.ts` per ADR-0019: `SettingsTopic` (`general`, `booking`, `avis`, `safety`, `yard`, `privacy`), `SettingsSection` (`sites`, `language`, `rules`, `public_booking`, `reminders`, `requirements`, `briefing`, `arrival`, `dwell`, `notice`, `retention`, `driver_access`), `SettingUnit` (`minutes`, `hours`, `days`, `percent`) and `FieldDraftKind` (`own`, `inherit`). Add `CountryGroup` (`eu`, `other`) with `countryGroupOf(code)` to `packages/shared/src/modules/core/values.ts`. Verify with a unit test that `countryGroupOf` puts the 27 `EuCountry` members in `eu` and the other 30 `SiteCountry` members in `other`.
- [x] 2.2 Write `apps/web/src/modules/core/settings-placement.ts`: `PLACEMENT satisfies Record<SettingKey, Placement>` in the order of the spec table, units on every minutes, hours, days and percent key, plus `availableTopics(items)` and `sectionsOf(topic, items)`. Verify:
  - with a unit test that every topic and section of the spec appears in its order;
  - that `availableTopics` of a site view leaves out `general`;
  - that removing one key from `PLACEMENT` fails `pnpm typecheck`.

## 3. Batch write API

- [x] 3.1 Add `PatchPlatformSettings` and `PatchTenantSettings` to `packages/shared/src/modules/core/api.settings.ts`: at least one entry, and no key in both `set` and `reset` (422). Verify with schema unit tests.
- [x] 3.2 Implement `writeSettings` in `apps/api/src/modules/core/settings/settings.ts` per design decision 5 (validate all, then one upsert and one delete). Verify in `settings.test.ts`:
  - two keys stored;
  - one invalid value → 422 at `["set", key]` and nothing stored;
  - set plus reset in one call;
  - unknown key 400;
  - disallowed scope 400 with `allowed`;
  - entitlement off 403 with the key;
  - `updated_by` and `updated_at` written.
- [x] 3.3 Mount `PATCH /` in `apps/api/src/modules/core/settings/routes.tenant.ts` and `PATCH /settings` in `apps/api/src/modules/core/platform/routes.platform.ts`, with `op({ id, stories: [TN_02] / [PL_03], … responses: { 200: type<SettingsView>() } })` and `validate`. Add route cases for both in `settings/route-cases.ts` and the platform route cases: foreign tenant, foreign site 404, missing permission, entitlement off. Verify `route-coverage.test.ts` and `settings.test.ts` pass, including the 404 for another tenant's `siteId`.
- [x] 3.4 Run `pnpm api:docs`. Verify `apps/api/openapi.gen.json` and the route tables in `docs/reference/api-routes.md` list both PATCH routes with their request and response schemas.

## 4. Language setting scope (coordinator lands the manifest line)

- [x] 4.1 Report the manifest change `i18n.default_locale` → `scopes: [SettingScope.platform, SettingScope.tenant]` (`packages/shared/src/modules/i18n/manifest.ts`) to the coordinator, and rebase once it lands. Verify `pnpm docs:index` updates the catalog table in `docs/reference/module-contract.md`, and `pnpm docs:check` passes.
- [x] 4.2 Add to `settings.test.ts`:
  - a write of `i18n.default_locale` with a `siteId` answers 400 `scope_not_allowed` with `allowed: ['platform', 'tenant']`;
  - a site row inserted as the owner is ignored by the site view and by `access.setting` for that site.

  Verify both pass.
- [x] 4.3 Change the label and description of `i18n.default_locale` in `packages/i18n/locales/{de,en,pl}/i18n/settings.json`: "Language for new contacts" / "Sprache für neue Kontakte", applied to invitations, emails and exports for people without a language of their own; everyone can switch the UI language. Verify `pnpm i18n:derive` leaves no placeholder and the i18n check passes.

## 5. Field building blocks

- [x] 5.1 Give `apps/web/src/components/ui/checkbox.tsx` a visible indeterminate state (`MinusIcon` when `indeterminate`). Verify with a component test that `indeterminate` renders `aria-checked="mixed"` and the minus icon, and that `checked` renders the check icon.
- [x] 5.2 Replace `SourceBadge` with `SettingOrigin` in `apps/web/src/components/settings-field.tsx` per design decision 6: texts per source and page level, "Inherited: …" for a value set here, link to the source level only with permission, and the levels hint from `entry.scopes`. Verify with component tests:
  - tenant value equal to the platform value still reads "Set for this tenant";
  - platform without a row reads "Product default";
  - a site page links "From tenant" for a tenant admin;
  - "From platform" has no link for a tenant admin;
  - `safety.quiz_pass_percent` on the tenant page says it applies to all sites.
- [x] 5.3 Rebuild `SettingField`:
  - `<h3 id={key} tabIndex={-1}>` wrapping the `<label htmlFor={"input-" + key}>`, and description by `aria-describedby`;
  - no visible key;
  - a "Copy link" icon button named after the setting, which copies the absolute deep link and shows the "Link copied" toast;
  - the unit suffix via `InputGroupAddon`, with the addon in `aria-describedby`.

  Verify with component tests for the ids, the accessible name of the button, the clipboard content and the suffix.
- [x] 5.4 Replace `SettingControl.picker` with `SettingControl.grouped_list` in `packages/shared/src/modules/core/values.ts` and `apps/web/src/modules/core/setting-control.ts`. `OPTION_GROUPS` maps `core.site_countries` to `countryGroupOf`, and `controlOf` throws for an ungrouped enum array above 20. Write `GroupedChecklist`:
  - one `FieldSet` and `FieldLegend` per group, with a tri-state group checkbox;
  - an auto-fill grid;
  - a filter that folds case and accents and matches name or code, and hides the group checkboxes while active;
  - "N of M selected" in a polite live region.

  Delete `Picker` and `PICKER_MATCHES`, and move `searchable()` to `apps/web/src/lib/search.ts`. Verify with component tests:
  - the default shows 27 of 57 with EU checked;
  - unchecking Malta makes the EU group mixed;
  - the "Other countries" group checks 30;
  - "slo" lists Slovakia and Slovenia without group checkboxes;
  - "TR" finds Turkey.

## 6. Topic form, save bar and guards

- [x] 6.1 Write `SettingsTopicForm` in `apps/web/src/modules/core/settings-topic-form.tsx` per design decision 4:
  - one react-hook-form over `Record<SettingKey, FieldDraft>` with the manifest schemas;
  - sections with headings in placement order;
  - "Use inherited value ({value})" as a pending `inherit` draft;
  - a sticky save bar with Save, Discard and the status line;
  - one `PATCH` with only the dirty keys;
  - server issues mapped back to their fields;
  - `keepDirtyValues` on refetch.

  Verify with component tests against a mocked API:
  - only `booking.horizon_days` is in `set` after one edit;
  - "Discard" restores the loaded values and sends nothing;
  - a 422 keeps every edit and shows the error at its field;
  - inherit then save sends `reset`;
  - inherit then discard sends nothing;
  - a refetch keeps edits.
- [x] 6.2 Add the retention confirmation per design decision 10: an `AlertDialog` that lists each lowered `privacy.retention.*` key as "old → new unit", including `inherit` to a lower value, and saves only on confirm. Verify with component tests: lowering asks, raising does not, inheriting a lower value asks, cancel sends nothing.
- [x] 6.3 Add the unsaved-changes guard with `useBlocker` per design decision 9, with an `AlertDialog` offering "Stay" and "Leave" and `enableBeforeUnload` while dirty. Verify with a router test: a topic change with edits asks and "Stay" keeps the edits; a hash change on the same path does not ask; after a save, navigation does not ask.
- [x] 6.4 Add `useSettingAnchor()` per design decision 7: scroll with `scroll-margin-top`, focus the title, `data-highlighted` for 2 s, and ignore unknown hashes. Verify with a component test that the hash `booking.horizon_days` focuses its title and that Tab then reaches its input.

## 7. Routes, navigation and search

- [x] 7.1 Write `SettingsTopicNav` (vertical and horizontal) and `SettingsSearch` (`CommandDialog` over the level's view, filtered with `searchable()`, results with "Topic › Section", choosing one navigates to `…/$topic#key`). Verify with component tests:
  - "storno" finds the cancellation cutoff;
  - `driver_link_hours` finds the driver link;
  - a tenant view yields nothing for "Länder";
  - the current topic carries `aria-current="page"`.
- [x] 7.2 Build the platform routes `apps/web/src/routes/platform/settings/{route,index,$topic}.tsx` per design decision 2. Use the `PATCH` route, `notFound()` for an unknown or empty topic, and the breadcrumb "Platform › Settings › {topic}". Rename the platform nav label to "Einstellungen" / "Settings" / "Ustawienia" with `pnpm i18n:derive` and a translation. Verify with a router test that `/platform/settings` replaces to `/platform/settings/general` and that `/platform/settings/billing` shows "no access".
- [x] 7.3 Build the tenant routes `apps/web/src/routes/t/$orgId/settings/{route,index,$topic}.tsx`. `index` redirects `?site=<id>` to the site tab for a known site, shows `notFound()` for an unknown one, and otherwise redirects to the first topic. The header links to the site list. Delete `settings-sections.tsx`. Verify with router tests for the three index cases.
- [x] 7.4 Build the site routes `apps/web/src/routes/t/$orgId/sites/$siteId/settings/{route,index,$topic}.tsx` with the horizontal topic nav, and add the "Settings" tab to `routes/t/$orgId/sites/$siteId/route.tsx` only with `core.manage_settings`. Verify with router tests:
  - the index replaces to `…/settings/booking`;
  - `…/settings/general` shows "no access";
  - a user without `core.manage_settings` sees no tab.
- [x] 7.5 Run `pnpm values:check apps/web packages/shared` and `pnpm lint`. Verify no topic, section, unit or draft kind is written as a string literal.

## 8. UI language order

- [ ] 8.1 Split `deviceLocale()` in `apps/web/src/lib/i18n.ts` into `storedLocale()` and `browserLocale()`. Make `useSyncLocale` (`apps/web/src/components/app-shell/user-menu.tsx`) apply account, then stored choice, then browser, then tenant default, then `de`. Verify with unit tests:
  - a stored `en` beats a tenant default `de` for a user without a locale;
  - the account `pl` beats a stored `en`;
  - a Turkish browser with no choice gets the tenant default.
- [ ] 8.2 Check that invitation, carrier invitation, sign-up verification and the public-link registration store the page language as the account language. They send `locale` today. Add an API test for each path that lacks one. Verify each test reads the new user's `locale` as sent.

## 9. Strings

- [x] 9.1 Add to `packages/i18n/locales/{de,en,pl}/core/settings-ui.json`:
  - topic and section names;
  - origin texts and the levels hints;
  - save bar, discard and leave dialog;
  - copy link and "Link copied";
  - search button, placeholder and empty state;
  - retention dialog;
  - countries editor (groups, filter, count, "Select at least one country");
  - the unit suffixes.

  Remove the keys of the old picker, source badge and site tabs. Verify the i18n check passes and `rg` finds no use of a removed key.
- [x] 9.2 Drop the unit from every settings label in `packages/i18n/locales/{de,en,pl}/*/settings.json`, for example "Zeitraster (Minuten)" → "Zeitraster". Verify the i18n check passes and `rg '\((Minuten|Stunden|Tage|%)\)' packages/i18n/locales/de/*/settings.json` prints nothing.

## 10. Seed

- [ ] 10.1 In `apps/api/scripts/seed/core.ts`, upsert the platform `booking.horizon_days` = 60 and the Acme tenant `booking.cancel_cutoff_minutes` = 240. In `apps/api/scripts/seed/sites.ts`, upsert `booking.slot_grid_minutes` = 15 for Acme's "Hamburg DC", found by name. Extend `core.test.ts` and `sites.test.ts` so two runs leave one row each. Verify on a fresh database that `pnpm db:seed` then `pnpm dev` shows "From platform", "From tenant" and "Set for this site · Inherited: 30 (Product default)" on `/t/<acme>/sites/<hamburg>/settings/booking`.

## 11. End-to-end tests

- [ ] 11.1 Rewrite `e2e/core/PL-03.spec.ts` (`describe('PL-03 Platform defaults')`):
  - the topic nav and the `/platform/settings` redirect;
  - a deep link to `privacy#privacy.retention.visit_days` focuses the field;
  - search "Fahrerlink";
  - the countries editor (uncheck Malta, save, the reload shows 26 of 57);
  - lowering a retention value asks first and saves on confirm;
  - axe on `/platform/settings/general`.

  Verify with `pnpm test:e2e e2e/core/PL-03.spec.ts`.
- [ ] 11.2 Rewrite `e2e/core/TN-02.spec.ts` (`describe('TN-02 Settings')`):
  - edit two booking fields and save once (one PATCH);
  - discard;
  - leaving with edits asks;
  - the origin texts on tenant and site;
  - "Use inherited value" then save;
  - `?site=` redirects to the site tab and a foreign id shows "no access";
  - entitlement off hides "Reminders";
  - axe on the tenant and site topic pages.

  Verify with `pnpm test:e2e e2e/core/TN-02.spec.ts`.
- [ ] 11.3 Add a step to `e2e/core/MD-01.spec.ts`: the site's tabs end with "Settings", which opens `…/settings/booking`. Verify with `pnpm test:e2e e2e/core/MD-01.spec.ts`.
- [ ] 11.4 Add to `e2e/core/shell.spec.ts`: on every signed-out page (login, signup, signup verify, invite, carrier invite, carrier registration, magic link, reset, `/r/<slug>`), the language menu switches to English without reload and keeps a typed value. Then a device choice of English on `/login` survives sign-in for a user without a locale. Verify with `pnpm test:e2e e2e/core/shell.spec.ts`.
- [ ] 11.5 Search `e2e/` for the old settings labels with units, `setting-source` and `?site=`, and update any spec outside PL-03, TN-02 and MD-01 that used them (for example `e2e/core-loop/core-loop.spec.ts`). Verify `rg "setting-source|settings\?site=" e2e` prints nothing.

## 12. Docs

- [ ] 12.1 Grep `docs/` for `?site=`, "Plattform-Standards", `SourceBadge`, "chips" and the old `/platform/settings` description, and fix every doc that still describes the old screens, including `docs/how-to/` and `docs/reference/api-routes.md`. Verify the grep prints only historical ADR text.
- [ ] 12.2 Run `pnpm docs:index` and `pnpm docs:check`. Verify both pass and `docs/INDEX.md` lists ADR-0020.

## 13. Integration

- [ ] 13.1 Run `pnpm verify` and `scripts/test-at-date.sh +40d`. Verify both exit 0.
- [ ] 13.2 Run the full `pnpm test:e2e`. Verify every spec passes.
- [ ] 13.3 Capture `/platform/settings/general`, `/t/<acme>/settings/booking` and `/t/<acme>/sites/<hamburg>/settings/booking` at 1920 × 1080 with `pnpm docs:screens` or Playwright. Verify:
  - the form column is at least 40rem wide on the site page;
  - no field is hidden under the save bar when focused;
  - the countries editor shows its two groups without horizontal scrolling.
