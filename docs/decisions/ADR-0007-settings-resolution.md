---
title: ADR-0007 Settings stored as validated JSON per scope and resolved site, tenant, platform, default
description: Why settings live in one setting_value table keyed by tenant and site, how writes are validated against the manifest, how values resolve with their source, and how entitlements hide settings.
type: explanation
audience: [agent, developer]
tags: [adr, settings, entitlements, validation]
status: stable
updated: 2026-10-21
related: [docs/decisions/ADR-0020-settings-information-architecture.md, docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md]
---

# ADR-0007: Settings stored as validated JSON per scope and resolved site, tenant, platform, default

Status: accepted, 2026-10-19. Implemented in `packages/shared/src/contract/settings.ts`. Updated 2026-10-21 by change 06: the batch write, the origin display rule and the key count. How the screens group and present settings is [ADR-0020](ADR-0020-settings-information-architecture.md).

## Context

The settings catalog has 30 keys with types from booleans to enums and reference-type lists. Each key allows some of three scopes: platform (P), tenant (T), site (S). Resolution runs site, tenant, platform, code default. The UI shows the effective value and its source (TN-02), "Use inherited value" deletes an override, invalid values return 422 with the zod issue path (PL-03), and a setting whose entitlement is off is hidden and its writes return 403 (TN-02).

## Options considered

| Option | Verdict |
|---|---|
| Typed columns per setting on `platform_settings`, `tenant`, `site` | Three copies of every column and a migration per new setting. Resolution code per column. |
| One JSON document per scope | Concurrent edits of different keys overwrite each other. "Use inherited value" becomes a JSON patch. |
| **One row per (scope, key) with a JSON value, validated by the manifest's zod schema** | One table, one write path, one resolver. Deleting the row is "inherit". |

## Decision

1. **Table.** `setting_value (tenant_id uuid null, site_id uuid null, key text, value jsonb, updated_by, updated_at)` with `unique nulls not distinct (tenant_id, site_id, key)` and `check (site_id is null or tenant_id is not null)`. The scope follows from the columns: both NULL is platform, only `tenant_id` is tenant, both set is site. A composite FK `(site_id, tenant_id)` to `site (id, tenant_id)` keeps site rows inside their tenant.
2. **Structural attributes are not settings.** A site's time zone, country, subdivision and default locale are columns on `site`, because queries filter and join on them.
3. **Write path** (`parseSettingWrite(catalog, entitlements, { key, scope, value })`):
   - Unknown key: 400 `bad_request`.
   - Scope not in the key's `scopes`: 400 `bad_request` with `allowed`.
   - Module off or `requires` feature off: 403 `entitlement_required` with the blocking feature key. Platform writes (PL-03) skip this check and pass `null` entitlements, because no package gates the platform defaults.
   - Schema rejects the value: 422 `validation_failed` with zod issues (`path`, `code`, `message`).
   - Otherwise upsert the row. `DELETE` removes it and answers 204 even when no row exists.
   - **Batch write.** `PATCH /api/platform/settings` and `PATCH /api/t/:orgId/settings` write and reset several keys of one level. The body is `{ set: { <key>: <value> }, reset: [<key>] }`, and the tenant route adds `siteId` (uuid or null). It holds at least one entry, and no key appears in both lists (422). `writeSettings` works in two passes:
     1. **Validate.** Every key goes through `parseSettingWrite`. The first unknown key, disallowed scope or blocked entitlement throws the same 400 or 403 as the per-key write. Invalid values are collected into one 422 whose issues have the path `["set", <key>, ...]`.
     2. **Apply.** One multi-row upsert for `set` and one delete for `reset`.

     The request transaction ([ADR-0002](ADR-0002-tenancy-isolation-rls.md)) makes both passes all-or-nothing: a failed request stores nothing. A `siteId` of another tenant returns 404. The response is the level's `SettingsView`. The per-key `PUT` and `DELETE` routes stay for tests and scripts; the web app writes only through `PATCH`, so a topic save never ends half applied. A topic form sends only the keys the user changed.
4. **"Platform maximum".** TN-02's "retention values above the platform maximum return 422" is the upper bound of the key's zod schema (for example 30 days for `privacy.retention.driver_phone_days`), which matches the "Max" column of domain research §5. Platform admins cannot lower that bound in the MVP; locked settings are LATER.
5. **Read path** (`resolveSetting(catalog, key, { site, tenant, platform })`):
   - The API loads the platform, tenant and site rows of the request's tenant and site in one query.
   - Per key it takes the most specific level the key allows whose stored value still parses, else the code default, and returns `{ value, source }`.
   - A stored value that no longer parses after a schema change is skipped (and logged by the API), so a request never fails on stale data.
   - The settings screen calls the resolver twice per field: once with all levels (effective value and source) and once without the edited level (the inherited value shown as hint and restored by "Use inherited value").
   - **Origin display.** Every field shows its origin as text, always, not only when the value deviates. The text follows from the entry's `source` and the page's level: "Product default", "From platform", "From tenant", "Set for the platform", "Set for this tenant" or "Set for this site". A value set on the page's level also shows "Inherited: {value} ({source})" from `inherited`. Whether a value is set on this level follows from `source`, never from comparing values, so a tenant value equal to the platform value still reads "Set for this tenant". The origin links to the source level when the user may manage it ([ADR-0020](ADR-0020-settings-information-architecture.md)).
6. **Entitlement gating.** `isSettingAvailable` is true when the key's module is on and its `requires` feature (if any) is on. The settings API omits unavailable keys from reads, and the UI hides them. Business code that reads a gated setting also checks the entitlement, as the scope states every such rule as a conjunction (for example "with `safety.gate_enforcement` and `safety.require_for_checkin`").
7. **No cache.** Settings resolve per request inside the scoped transaction, like entitlements ([ADR-0006](ADR-0006-module-manifest-entitlements-permissions.md)).
8. **Who writes which scope.** Platform rows: `core.manage_platform_settings` under the `platform` party. Tenant and site rows: `core.manage_settings` under the `tenant` party. RLS lets every party read platform rows and lets tenant-side parties read their tenant's rows.

## Consequences

- Adding a setting is one manifest entry with schema, default, scopes and optional `requires`. No migration.
- `jsonb` loses the column type, but every read goes through the zod schema, and `SettingValue<K>` gives callers the exact type.
- The catalog keeps `safety.validity_days` without a required entitlement, as the scope's table states. With `safety.validity` off, the safety module treats validity as 0 (per visit) regardless of the stored value. The scope owner may want the field hidden in that case too; that is a one-line `requires` change.
