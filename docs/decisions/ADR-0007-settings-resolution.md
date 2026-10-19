---
title: ADR-0007 Settings stored as validated JSON per scope and resolved site, tenant, platform, default
description: Why settings live in one setting_value table keyed by tenant and site, how writes are validated against the manifest, how values resolve with their source, and how entitlements hide settings.
type: explanation
audience: [agent, developer]
tags: [adr, settings, entitlements, validation]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/tech-architecture.md, docs/decisions/ADR-0006-module-manifest-entitlements-permissions.md]
---

# ADR-0007: Settings stored as validated JSON per scope and resolved site, tenant, platform, default

Status: accepted, 2026-10-19. Implemented in `packages/shared/src/contract/settings.ts`.

## Context

The settings catalog has 29 keys with types from booleans to enums and reference-type lists. Each key allows some of three scopes: platform (P), tenant (T), site (S). Resolution runs site, tenant, platform, code default. The UI shows the effective value and its source (TN-02), "Reset to inherited" deletes an override, invalid values return 422 with the zod issue path (PL-03), and a setting whose entitlement is off is hidden and its writes return 403 (TN-02).

## Options considered

| Option | Verdict |
|---|---|
| Typed columns per setting on `platform_settings`, `tenant`, `site` | Three copies of every column and a migration per new setting. Resolution code per column. |
| One JSON document per scope | Concurrent edits of different keys overwrite each other. "Reset to inherited" becomes a JSON patch. |
| **One row per (scope, key) with a JSON value, validated by the manifest's zod schema** | One table, one write path, one resolver. Deleting the row is "inherit". |

## Decision

1. **Table.** `setting_value (tenant_id uuid null, site_id uuid null, key text, value jsonb, updated_by, updated_at)` with `unique nulls not distinct (tenant_id, site_id, key)` and `check (site_id is null or tenant_id is not null)`. The scope follows from the columns: both NULL is platform, only `tenant_id` is tenant, both set is site. A composite FK `(site_id, tenant_id)` to `site (id, tenant_id)` keeps site rows inside their tenant.
2. **Structural attributes are not settings.** A site's time zone, country, subdivision and default locale are columns on `site`, because queries filter and join on them.
3. **Write path** (`parseSettingWrite(catalog, entitlements, { key, scope, value })`):
   - Unknown key: 400 `bad_request`.
   - Scope not in the key's `scopes`: 400 `bad_request` with `allowed`.
   - Module off or `requires` feature off: 403 `entitlement_required` with the blocking feature key.
   - Schema rejects the value: 422 `validation_failed` with zod issues (`path`, `code`, `message`).
   - Otherwise upsert the row. `DELETE` removes it and answers 204 even when no row exists.
4. **"Platform maximum".** TN-02's "retention values above the platform maximum return 422" is the upper bound of the key's zod schema (for example 30 days for `privacy.retention.driver_phone_days`), which matches the "Max" column of domain research §5. Platform admins cannot lower that bound in the MVP; locked settings are LATER.
5. **Read path** (`resolveSetting(catalog, key, { site, tenant, platform })`):
   - The API loads the platform, tenant and site rows of the request's tenant and site in one query.
   - Per key it takes the most specific level the key allows whose stored value still parses, else the code default, and returns `{ value, source }`.
   - A stored value that no longer parses after a schema change is skipped (and logged by the API), so a request never fails on stale data.
   - The settings screen calls the resolver twice per field: once with all levels (effective value and source) and once without the edited level (the inherited value shown as hint and restored by "Reset to inherited").
6. **Entitlement gating.** `isSettingAvailable` is true when the key's module is on and its `requires` feature (if any) is on. The settings API omits unavailable keys from reads, and the UI hides them. Business code that reads a gated setting also checks the entitlement, as the scope states every such rule as a conjunction (for example "with `safety.gate_enforcement` and `safety.require_for_checkin`").
7. **No cache.** Settings resolve per request inside the scoped transaction, like entitlements ([ADR-0006](ADR-0006-module-manifest-entitlements-permissions.md)).
8. **Who writes which scope.** Platform rows: `core.manage_platform_settings` under the `platform` party. Tenant and site rows: `core.manage_settings` under the `tenant` party. RLS lets every party read platform rows and lets tenant-side parties read their tenant's rows.

## Consequences

- Adding a setting is one manifest entry with schema, default, scopes and optional `requires`. No migration.
- `jsonb` loses the column type, but every read goes through the zod schema, and `SettingValue<K>` gives callers the exact type.
- The catalog keeps `safety.validity_days` without a required entitlement, as the scope's table states. With `safety.validity` off, the safety module treats validity as 0 (per visit) regardless of the stored value. The scope owner may want the field hidden in that case too; that is a one-line `requires` change.
