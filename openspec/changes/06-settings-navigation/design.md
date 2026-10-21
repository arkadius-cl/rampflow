# Design

## Context

See proposal.md for the problem. Current state that shapes the approach:

- **API.** Settings are manifest entries with a zod schema, a default and scopes (ADR-0007). The API reads a level with `settingsView(tx, target, entitlements)` in `apps/api/src/modules/core/settings/settings.ts`. It writes one key with `writeSetting` (upsert) and `resetSetting` (delete), exposed as `PUT` and `DELETE /api/{platform,t/:orgId}/settings/:key`. Each request already runs in one transaction opened by `scoped()` (ADR-0002), so several writes in one handler are atomic for free.
- **Resolver.** `resolveSetting` (`packages/shared/src/contract/settings.ts`) skips any stored level that the key's `scopes` no longer allow. Narrowing a key's scopes therefore needs no data migration.
- **Web.**
  - `SettingsSections` (`apps/web/src/modules/core/settings-sections.tsx`) groups fields by module, with one react-hook-form per field.
  - `controlOf` derives the control from the schema. An enum array above 20 options becomes the chip `Picker`.
  - `SettingField` and `SourceBadge` (`apps/web/src/components/settings-field.tsx`) render label, description, the visible key and a source badge.
- **Site detail** (`routes/t/$orgId/sites/$siteId/route.tsx`). The app sidebar, a 14rem `SiteNav` column of all sites, then a horizontal tab row of real links (docks, hours, load types).
- **Language.** `AuthLayout` (`components/app-shell/auth-layout.tsx`) already renders `LanguageMenu` on every signed-out page. Those pages pass `useLocale()` as `locale` to invitation, sign-up and registration requests. `useSyncLocale(me, tenantLocale(context))` in the tenant layout applies the tenant default to a user without an account language. That overrides the device's earlier explicit choice.
- **Router.** TanStack Router 1.170 provides `useBlocker` with `enableBeforeUnload`, and `scrollRestoration` is on.
- **Docs.** `docs/explanation/mvp-scope.md` still holds the `<<<<<<<`/`>>>>>>>` markers of the 03 merge in MD-01.

## Goals / Non-Goals

**Goals:**
- One exhaustive, typed placement of every setting key. The compiler rejects a new key without a topic.
- The same three-level route shape and the same page anatomy for platform, tenant and site.
- An atomic multi-key write, so a topic save never ends half applied.
- No change to how values are stored or resolved (ADR-0007 points 1, 2, 5 stay).

**Non-Goals:**
- Locking platform values against tenant overrides (ADR-0007 point 4 keeps this LATER).
- A history of setting changes, or counts of the records a shorter retention would delete.
- A global ⌘K search. The office shell's ⌘K button stays a placeholder; the settings search is its own button.
- Moving `site.default_locale` into `setting_value`. It stays a structural site attribute (ADR-0007 point 2).

## Decisions

### 1. Placement lives in the web app as an exhaustive map, not in the manifests

`apps/web/src/modules/core/settings-placement.ts` exports `PLACEMENT` with `satisfies Record<SettingKey, Placement>`, where `Placement` is `{ topic: SettingsTopic; section: SettingsSection; unit?: SettingUnit }`. Map order is display order. `SettingsTopic`, `SettingsSection` and `SettingUnit` are value sets in `packages/shared/src/values/settings.ts` (ADR-0019). `SettingsTopic` is also the route param schema (`z.enum(SettingsTopic)`).

- *Alternative: a `ui: { topic, section }` field per setting in the manifest.* Rejected: topics cut across modules (`notify.reminder_hours_before` sits under booking), placement is presentation, and every regrouping would become a coordinator contract change. A new manifest key still fails `pnpm typecheck` until it is placed, which is the guarantee we need.
- *Alternative: topics = modules.* Rejected by review: modules are build boundaries, not the words admins search with.

### 2. Routes: a settings layout per level with a `$topic` child

| Level | Layout | Index | Topic |
|---|---|---|---|
| Platform | `routes/platform/settings/route.tsx` | `index.tsx` redirects | `$topic.tsx` |
| Tenant | `routes/t/$orgId/settings/route.tsx` | `index.tsx` redirects (also handles `?site=`) | `$topic.tsx` |
| Site | `routes/t/$orgId/sites/$siteId/settings/route.tsx` | `index.tsx` redirects | `$topic.tsx` |

- **Data.** The layout loads the level's `SettingsView`, as today's pages do. `availableTopics(view.items)` derives the topic list from `PLACEMENT`.
- **Index.** `beforeLoad` throws `redirect({ to: '…/$topic', params: { topic: first }, replace: true })`.
- **`$topic`.** `params.parse` uses `SettingsTopic`. An unknown topic, or a topic with no available item, throws `notFound()`. The existing area error boundary renders "no access" for it, as for entity views (ADR-0015).
- **Tenant index and `?site=`.** It resolves the id against `tenantContext.sites`. A known site redirects to the site layout; an unknown one throws `notFound()`. This removes today's silent fallback to the tenant level.
- **Guard.** `guard({ permission: core.manage_settings })` on the tenant and site layouts, and `core.manage_platform_settings` on the platform layout.
- **Site tab.** The site layout adds a "Settings" tab link only when `can(core.manage_settings)`.

### 3. Topic navigation: vertical on platform and tenant, a second tab row on site

`SettingsTopicNav` renders real `Link`s with `aria-current="page"`, the same `tabClass` styling idea as the site tabs.

- **Platform and tenant.** Vertical, in a 12rem column left of the form, which is at most 48rem wide. This follows GitHub and Vercel.
- **Site page.** Horizontal, as a second row under the site tabs. The site view already has the app sidebar and `SiteNav`, and a third vertical column would leave too little width for the form at 1920 px (review point).
- *Alternative: horizontal everywhere.* Rejected: on the platform and tenant pages there is room, and a vertical list scales when topics grow.
- *Alternative: a second app sidebar (shadcn `sidebar-08`/`09`).* Rejected: two navigation rails side by side compete.

### 4. The topic page is one react-hook-form with a per-field draft

The form value is `Record<SettingKey, FieldDraft>`, with `FieldDraft = { kind: 'own'; value: unknown } | { kind: 'inherit' }`. `kind` is a new value set `FieldDraftKind`.

- **Validation.** The resolver validates each `own` value with the key's manifest schema.
- **Save.** It walks `formState.dirtyFields`: `own` → `set[key] = value`, `inherit` → `reset.push(key)`. The result goes into one `PATCH`.
- **Refetch.** The form gets `values` with `resetOptions: { keepDirtyValues: true }`, so a background refetch updates clean fields and leaves edits alone. After a successful save the form resets to the response's view.
- **Save bar.** Sticky at the bottom of the form column, with "Save", "Discard" and a status line ("No unsaved changes" or "N unsaved changes"). Sticky elements get `scroll-padding` on the scroll container, so a focused field is never hidden under them (WCAG 2.4.11).
- *Alternative: a card and a save button per setting (Vercel style).* Rejected by review: many competing actions and a longer page, and no answer to "what is already in effect".

### 5. Batch write: `PATCH` on the existing settings resources

Request schemas `PatchPlatformSettings = { set: Record<string, unknown>, reset: string[] }` and `PatchTenantSettings = { siteId: uuid | null } & …` live in `api.settings.ts`. A refinement requires at least one entry and no key in both lists. The response is `SettingsView`.

`writeSettings(tx, target, entitlements, { set, reset }, userId, now)` in `settings.ts` works in two passes:

1. **Validate.** Every key goes through `parseSettingWrite`. The first unknown key, disallowed scope or blocked entitlement throws the same 400 or 403 as today. Invalid values are collected, and if there are any, it throws one 422 whose issues have the path `["set", key, ...]`.
2. **Apply.** One multi-row upsert for `set` and one `DELETE … WHERE key IN (…)` for `reset`, then `settingsView`.

The request transaction makes both passes all-or-nothing.

The per-key `PUT` and `DELETE` routes stay. `e2e/support/u3.ts`, API tests and scripts use them, and they are correct on their own. The web app uses only `PATCH`.

- *Alternative: N parallel `PUT`s from the browser.* Rejected: partial success on a network error or a 422 in the middle.

### 6. Origin is text, derived from the source, with the levels as a hint

`SettingOrigin` replaces `SourceBadge`.

- **Text.** It maps `(entry.source, pageScope)` to one of "Product default", "From platform", "From tenant", "Set for the platform", "Set for this tenant" or "Set for this site". When `source === pageScope` it adds "Inherited: {value} ({source})" from `entry.inherited`.
- **Link.** It links to `/{level}/settings/{topic}#{key}` of the source level when the user may manage that level. In practice that is the site page linking to the tenant page; a tenant admin never gets a link to the platform. It uses `useAccess().can` on the permission of that level.
- **Levels hint.** It comes from `entry.scopes`: `['platform']` → "Platform only…", and a tenant page with a key lacking `site` → "Applies to all sites…".
- **Overrides.** A value that is set on this level keeps the existing left border (`border-l-tone-planned`), so status does not rely on text alone either.

### 7. Anchors, focus and highlight

- **IDs.** Each field renders its title as `<h3 id={key} tabIndex={-1}>` (the anchor) and the control with `id={"input-" + key}`. The visible label stays a `<label htmlFor>` for the control. The title and label are one element styled as heading: `<h3><label …></label></h3>` keeps both semantics.
- **Hash handling.** A `useSettingAnchor()` hook watches `useLocation().hash`, after the topic data has rendered. It calls `scrollIntoView({ block: 'start' })` (CSS `scroll-margin-top` clears the sticky header), `focus({ preventScroll: true })` on the title and sets `data-highlighted` for 2 s. `:target` is not used: router `pushState` navigation does not update it reliably.
- **Copy link.** It writes `new URL(location.pathname + '#' + key, location.origin)` to the clipboard and announces through the existing `sonner` toast, which is a polite live region.

### 8. Search: `CommandDialog` over the current level's view

The settings layout renders a "Search settings" button (with `SearchIcon`) in the page header. It opens shadcn `CommandDialog`, already installed as `components/ui/command.tsx`.

- **Items.** One per available entry of the current view: label, description, key, plus "Topic › Section" as secondary text.
- **Filtering.** The `filter` prop uses the accent-folding `searchable()` that `settings-sections.tsx` has today, moved to `lib/search.ts`.
- **Selecting.** It navigates to `…/$topic` with `hash: key`. Same topic means a hash-only change, which the blocker lets through (decision 9).

### 9. Unsaved-changes guard: `useBlocker`

`useBlocker({ shouldBlockFn: ({ current, next }) => isDirty && current.pathname !== next.pathname, enableBeforeUnload: () => isDirty, withResolver: true })` drives a shadcn `AlertDialog` ("Leave without saving?" with "Stay" and "Leave"). Comparing pathnames lets hash moves through.

### 10. Retention confirmation is a UI check

Before sending, the form computes, for each dirty `privacy.retention.*` key, the effective value before (`entry.value`) and after (`own.value`, or `entry.inherited.value` for `inherit`). If any value goes down, an `AlertDialog` lists "{label}: {old} → {new} {unit}" and the consequence, and saves only on confirm.

- *Alternative: a server-side `confirm` flag.* Rejected: the risk is an admin's slip in the UI (WCAG 3.3.4). API callers (tests, scripts) act deliberately, and a flag would add a contract field without protecting anyone the dialog doesn't.

### 11. Controls: units as suffix; the countries editor replaces the picker

- **Units.** A number field with `PLACEMENT[key].unit` renders `InputGroup` + `InputGroupInput` + `InputGroupAddon align="inline-end"` with the short unit ("min", "h", "d", "%"). The addon's id is added to the input's `aria-describedby`. Labels in `*/settings.json` lose "(Minuten)" and the like in de, en and pl.
- **Grouped list.**
  - `SettingControl.picker` is replaced by `SettingControl.grouped_list`. `controlOf` returns it for an enum array whose key has an entry in `OPTION_GROUPS`, a web map. `core.site_countries` maps to `CountryGroup`: `eu` from `EuCountry` and `other` for the rest of `SiteCountry`, both in `packages/shared/src/modules/core/values.ts`.
  - The component `GroupedChecklist` renders one `FieldSet` per group with a `FieldLegend` and a group `Checkbox` (`checked` when all, `indeterminate` when some). The members sit in a CSS grid `repeat(auto-fill, minmax(12rem, 1fr))`, which reflows to one column when narrow.
  - A filter `InputGroup` sits above, and a count line below in a polite live region.
  - While the filter is non-empty, the group checkboxes are not rendered.
  - An enum array without groups and above 20 options throws in `controlOf`, so a future case gets designed rather than silently rendered.
- **Checkbox.** `components/ui/checkbox.tsx` renders `MinusIcon` when `indeterminate` and `CheckIcon` otherwise. Base UI already sets `aria-checked="mixed"`.

### 12. Language order on the web

`lib/i18n.ts` splits `deviceLocale()` into `storedLocale()` (only an explicit choice from `localStorage`) and `browserLocale()`.

- **Order.** `useSyncLocale(me, tenantDefault)` applies `me.user.locale ?? storedLocale() ?? browserLocale() ?? tenantDefault ?? 'de'`.
- **Tenant default.** `tenantLocale(context)` keeps reading the first site's resolved `i18n.default_locale`. Without a site level, that value is the tenant's. A tenant without sites falls through to `de`, which only matters for a user with no account language, no stored choice and an unsupported browser language.
- **Manifest.** `i18n.default_locale` changes to `scopes: [platform, tenant]`. The coordinator lands the manifest line per AGENTS.md.

### 13. One new ADR, three updates

- **New: ADR-0020 "Settings information architecture".** It records decisions 1 to 4, 6 and 7: placement as an exhaustive web map, topic routes per level, one form per topic, origin as text, anchors. Other units follow it when they add a setting.
- **ADR-0007.** The batch write (decision 5), the origin display rule and the key count (30).
- **ADR-0011.** The route map: platform, tenant and site settings rows; the `?site=` redirect.
- **ADR-0009.** The UI language order and the meaning of `i18n.default_locale`.

## Risks / Trade-offs

- [Renamed labels break existing e2e selectors (`getByLabel('Zeitraster (Minuten)')`)] → PL-03 and TN-02 specs are rewritten in this change anyway. `rg` for the old German labels in `e2e/` is a task.
- [A third navigation layer on the site page (site tabs + topic tabs)] → It is the narrowest layout that keeps the form wide. The e2e step on the site tab and a 1920 × 1080 screenshot check it.
- [`useBlocker` blocks programmatic navigations the app makes after save] → Navigate only after the form reset, when `isDirty` is false.
- [The placement map must change with every new manifest key] → That is intended. The type error names the missing key, and ADR-0020 tells the unit where to place it.
- [Retention confirmation only in the UI] → Accepted (decision 10). The schema maxima still bound every value on the server.

## Migration Plan

- No database migration. Site rows of `i18n.default_locale` stop counting the moment the manifest narrows the scope.
- Web URLs: `/platform/settings` and `/t/$orgId/settings` keep working through the index redirects. `?site=` bookmarks redirect to the site tab.
- Rollback: revert the change. The per-key API routes never went away, and no data changed shape.

## Seed data

No data model change. To show the origin texts in `pnpm dev`, the seed stores three overrides, upserted by `(tenant_id, site_id, key)`, so a second run converges:

- `apps/api/scripts/seed/core.ts`: platform `booking.horizon_days` = 60 and tenant Acme `booking.cancel_cutoff_minutes` = 240. `core` runs first and creates Acme.
- `apps/api/scripts/seed/sites.ts`: site "Hamburg DC" of Acme, `booking.slot_grid_minutes` = 15. The site exists only after `sites`, which finds it by name.

On the Hamburg DC booking topic this shows "From platform", "From tenant" and "Set for this site · Inherited: 30 (Product default)" next to each other.
