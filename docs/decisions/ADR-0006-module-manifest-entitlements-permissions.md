---
title: ADR-0006 Module manifests as the single source of entitlements, permissions, settings and navigation
description: Why every module declares its keys in a typed defineModule manifest in packages/shared, how packages and overrides resolve, how roles map to permissions, and why the catalog lives in code.
type: explanation
audience: [agent, developer]
tags: [adr, entitlements, permissions, settings, modules]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/explanation/research/market-and-features.md]
---

# ADR-0006: Module manifests as the single source of entitlements, permissions, settings and navigation

Status: accepted, 2026-10-19. Implemented in `packages/shared/src/contract/` and `packages/shared/src/modules/*/manifest.ts`.

## Context

The scope lists 9 entitlement modules with 21 implemented and 25 reserved keys, 3 packages, 29 settings, 7 roles, and per-tenant overrides with expiry. It requires that CI fails on unknown or reserved keys in packages, navigation or settings, that a module turns off when a module it depends on is off, and that the API and the UI gate the same keys. Twelve implementation units will add routes, screens and settings in parallel. Any list that two units must keep in sync will drift.

## Options considered

| Option | For | Against |
|---|---|---|
| Catalog in database tables, edited by the platform admin | Changeable without a deploy | Keys are referenced by code, so a key without code is meaningless. The compiler cannot check references. |
| Feature-flag service (OpenFeature provider) | Rollout tooling | Models flags, not paid entitlements with limits and sources. A second system to reconcile. |
| Constants per module, roles mapped in one central table | Simple | The central role table is a hand-synced list next to every module. |
| **One typed manifest per module, composed into a catalog** | Every key, its type, its roles and its settings sit in one file per module. The compiler derives key unions, so a typo or a reserved key fails the build. | Changing a package needs a deploy. Acceptable: packages change with pricing, not daily. |

## Decision

1. **`defineModule` manifests.** Each module exports one manifest from `packages/shared/src/modules/<id>/manifest.ts`: `id`, `dependsOn`, `enabledBy`, `locales`, `entitlements`, `permissions`, `settings`, `nav`. The compiler rejects:
   - a key without the `<id>.` prefix,
   - a setting default its zod schema does not accept,
   - `enabledBy`, a setting's `requires`, or a nav `entitlement` that is reserved, a limit, or from another module,
   - a nav permission the module does not declare,
   - an entitlement on carrier or platform navigation, because those users have no package.
   `packages/shared/src/contract/module.typetest.ts` proves each rejection with `@ts-expect-error`.
2. **The catalog** is `catalog` in `packages/shared/src/registry.ts`: all 12 manifests in dependency order (`core`, `i18n`, `privacy`, `brand`, `integration`, `booking`, `avis`, `yard`, `safety`, `notify`, `report`, `driver`). Key types (`FeatureKey`, `HardLimitKey`, `PermissionKey`, `SettingKey`, `SettingValue<K>`) are derived from it. `validateCatalog` repeats the structural checks at runtime, and `registry.test.ts` runs it in CI.
3. **Modules beyond the scope's nine.** `privacy` owns TN-06, PL-05 and the `privacy.*` settings. `i18n` owns `i18n.default_locale`. `driver` owns the PWA and the only namespace in 12 locales. They declare no entitlements, so they are always on.
4. **Entitlements.** A key is a `feature` (boolean) or a `limit` (number, `null` = unlimited, optionally `soft`). Reserved keys carry `reserved: true`, resolve to off, and cannot appear in packages (type error) or overrides (`parseEntitlementOverride` returns `reserved_key`, the API answers 400).
5. **Packages** are data in `packages/shared/src/packages.ts`, typed `PackageValues`, so a reserved or unknown key fails compilation. Pro spreads Start, Enterprise spreads Pro.
6. **Resolution** is the pure function `resolveEntitlements(catalog, package, overrides, now)`:
   - An unexpired override wins, whether it raises or lowers the value. An override stops applying at `expiresAt`.
   - Otherwise the package value applies, otherwise the key is off (`false`, `0`).
   - A module is on when every module in `dependsOn` is on and its `enabledBy` feature (if any) is on. Every key of an off module resolves to off with source `module_off`.
   - Every key reports its source (`default`, `package`, `override`, `reserved`, `module_off`) for the platform admin screen (PL-02).
   Dependencies: `report` needs `yard` (its KPIs come from gate and dock timestamps). `avis`, `yard`, `safety`, `notify`, `driver` need `booking`.
7. **Permissions and roles.** A permission lists the lowest roles that hold it. `ROLE_INCLUDES` makes `tenant_admin` include `dispatcher`, `dispatcher` include `gate_operator` and `dock_operator`, and `carrier_admin` include `carrier_user`. `permissionsFor(catalog, role)` expands this. There is no central role-to-permission table.
8. **Carrier context.** A carrier acting at tenant X is governed by X's entitlements (for example `booking.carrier_portal`) and by the carrier's own role permissions.
9. **No cache in the MVP.** The API resolves entitlements once per request inside the scoped transaction from `tenant_subscription` and `entitlement_override` (two indexed rows). Overrides therefore apply on the next request (PL-02) with nothing to invalidate. If profiling ever shows this query matters, add a per-process cache invalidated by `LISTEN/NOTIFY`, as the scope's scale section allows.

## Consequences

- Adding an entitlement, permission, setting or nav item touches one manifest file. Every consumer picks it up through the derived types.
- Manifest edits are contract changes. During a wave, units do not edit manifests; the coordinator lands manifest changes on main before the wave starts ([delivery plan](../explanation/delivery-plan.md)).
- The enforcement middleware, the context endpoint and the web guards are specified in [Module contract](../reference/module-contract.md).
