# Report: 06-settings-navigation

Branch `feat/06-settings-navigation`, 42/42 tasks, 46 commits on top of `main` (2fbc10f). Integration on 58552f8: `pnpm verify` green (API 836 passed, 3 skipped; web 67; shared 152), `docs:check` green on a clean export of HEAD, `scripts/test-at-date.sh +40d` green, full `pnpm test:e2e` 153 passed. Each phase reviewed by Fable; every finding fixed or recorded in `decisions.tsv`.

## Deviations from the contract

Planned and landed on the branch by coordinator authorization:

- Manifest: `i18n.default_locale` scopes `[platform, tenant]` (task 4.1).
- Value sets `SettingsTopic`, `SettingsSection`, `SettingUnit`, `FieldDraftKind`, `CountryGroup` + `countryGroupOf`; `SettingControl.grouped_list` replaces `picker`.
- `PatchPlatformSettings`, `PatchTenantSettings`; ops `core.platform.patchSettings`, `core.settings.patchSettings`.
- ADR-0020; ADR-0007, ADR-0009, ADR-0011 updated.

Found during implementation:

- Retention confirmation covers only keys placed in `SettingsSection.retention`, not `privacy.retention.driver_link_hours` (spec says `privacy.retention.*`). Link validity deletes no data, so the dialog's consequence text would be false.
- `scripts/values-check/check.ts` ignores the `id` of the object passed to `defineModule`: topic members `yard`, `safety`, `privacy` share the spelling of module ids.
- PATCH `reset` keys get the same unknown-key, scope and entitlement checks as `set`; the per-key `DELETE` keeps its old checks (design 5 keeps those routes unchanged).
- Web unit and component tests: Vitest with jsdom and Testing Library in `apps/web`, helpers under `apps/web/src/test/`.
- react-hook-form field names swap the dots of setting keys for slashes.
- Breadcrumbs through an optional `staticData.crumb`; three `values-check-ignore` comments on route paths inside `linkOptions`.
- Showing the account or tenant language no longer stores it as the device choice; only a choice in a language menu does.
- The site Settings tab names the topic in an h2; no page in the app sets a document title.
- Product bug fixed: the shadcn `CommandDialog` rendered its hidden title outside the popup, leaving a "Search settings" heading on every settings page.
- `pnpm docs:screens` opened the removed `?site=` tab; it now opens the site's Settings tab.
- Seeds lost their `as unknown as Tx` casts (the seed transaction already is a `Tx`).
- Task 11.5's `rg "settings\?site="` cannot print nothing: TN-02 tests the `?site=` redirect.

Not changed, by design: a tenant without sites falls back to `de` for the UI language of a person with no choice (design 12).

## Open

- The working tree holds an uncommitted archive of change 03 (made 2026-10-21 21:44Z outside this run). ADR-0017 still links `openspec/changes/03-tenant-onboarding/design.md`, so `docs:check` fails in the working tree until that link moves with the archive.
