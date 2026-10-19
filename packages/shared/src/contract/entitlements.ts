import {
  type Catalog,
  type FeatureKeyOf,
  findEntitlement,
  type ImplementedFeatureKeyOf,
  type ImplementedLimitKeyOf,
  type LimitKeyOf,
  type ModuleIdOf,
} from './catalog.ts';
import type { EntitlementDef, Limit } from './module.ts';
import type { Result } from './result.ts';

/** Values a package grants. Reserved keys do not compile here. Omitted keys resolve to off. */
export type PackageValuesOf<C extends Catalog> = {
  readonly [K in ImplementedFeatureKeyOf<C>]?: boolean;
} & { readonly [K in ImplementedLimitKeyOf<C>]?: Limit };

export type EntitlementOverrideOf<C extends Catalog> =
  | {
      readonly key: ImplementedFeatureKeyOf<C>;
      readonly value: boolean;
      readonly expiresAt: Date | null;
    }
  | {
      readonly key: ImplementedLimitKeyOf<C>;
      readonly value: Limit;
      readonly expiresAt: Date | null;
    };

/**
 * Why a key has its value. `module_off` means a package or override turned the key on,
 * but its module is off because its enabling feature or a dependency is off.
 */
export type EntitlementSource = 'default' | 'package' | 'override' | 'reserved' | 'module_off';

export interface ResolvedEntitlementsOf<C extends Catalog> {
  readonly features: { readonly [K in FeatureKeyOf<C>]: boolean };
  readonly limits: { readonly [K in LimitKeyOf<C>]: Limit };
  readonly modules: { readonly [K in ModuleIdOf<C>]: boolean };
  readonly sources: { readonly [K in FeatureKeyOf<C> | LimitKeyOf<C>]: EntitlementSource };
}

const OFF = { feature: false, limit: 0 } as const;

const isOff = (value: boolean | Limit) => value === false || value === 0;

/**
 * Effective entitlements of one tenant at `now`.
 * Order of precedence: an unexpired override, then the package, then off.
 * Reserved keys are always off. Every key of a module that is off is off.
 */
export function resolveEntitlements<C extends Catalog>(
  catalog: C,
  pkg: PackageValuesOf<C>,
  overrides: readonly EntitlementOverrideOf<C>[],
  now: Date,
): ResolvedEntitlementsOf<C> {
  const packaged: Readonly<Record<string, boolean | Limit | undefined>> = pkg;
  const active = new Map<string, boolean | Limit>();
  for (const o of overrides) {
    if (o.expiresAt === null || o.expiresAt > now) active.set(o.key, o.value);
  }

  const values: Record<string, boolean | Limit> = {};
  const sources: Record<string, EntitlementSource> = {};
  const modules: Record<string, boolean> = {};

  for (const module of catalog) {
    for (const [key, def] of Object.entries(module.entitlements)) {
      const override = active.get(key);
      const fromPackage = packaged[key];
      if (def.reserved) {
        values[key] = OFF[def.kind];
        sources[key] = 'reserved';
      } else if (override !== undefined) {
        values[key] = override;
        sources[key] = 'override';
      } else if (fromPackage !== undefined) {
        values[key] = fromPackage;
        sources[key] = 'package';
      } else {
        values[key] = OFF[def.kind];
        sources[key] = 'default';
      }
    }

    const depsOn = module.dependsOn.every((id) => modules[id] === true);
    const enabled = module.enabledBy === null || values[module.enabledBy] === true;
    modules[module.id] = depsOn && enabled;
    if (modules[module.id]) continue;

    for (const [key, def] of Object.entries(module.entitlements)) {
      const value = values[key];
      if (value === undefined || isOff(value)) continue;
      values[key] = OFF[def.kind];
      sources[key] = 'module_off';
    }
  }

  const features: Record<string, boolean> = {};
  const limits: Record<string, Limit> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'boolean') features[key] = value;
    else limits[key] = value;
  }
  // The loops above visit every entitlement key and module id of C exactly once.
  return { features, limits, modules, sources } as ResolvedEntitlementsOf<C>;
}

/**
 * The feature key that keeps a module off: the enabling feature of the first dependency that
 * is off, else the module's own enabling feature. `null` when the module is on.
 */
export function blockingFeature<C extends Catalog>(
  catalog: C,
  entitlements: ResolvedEntitlementsOf<C>,
  moduleId: ModuleIdOf<C>,
): string | null {
  const modulesOn: Readonly<Record<string, boolean>> = entitlements.modules;
  const features: Readonly<Record<string, boolean>> = entitlements.features;
  const visit = (id: string): string | null => {
    if (modulesOn[id]) return null;
    const module = catalog.find((m) => m.id === id);
    if (!module) return null;
    for (const dep of module.dependsOn) {
      const blocked = visit(dep);
      if (blocked) return blocked;
    }
    return module.enabledBy !== null && !features[module.enabledBy] ? module.enabledBy : null;
  };
  return visit(moduleId);
}

export type OverrideError =
  | { readonly code: 'unknown_key'; readonly key: string }
  | { readonly code: 'reserved_key'; readonly key: string }
  | {
      readonly code: 'invalid_value';
      readonly key: string;
      readonly expected: 'boolean' | 'limit';
    };

export interface RawOverride {
  readonly key: string;
  readonly value: unknown;
  readonly expiresAt: Date | null;
}

const isLimit = (value: unknown): value is Limit =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);

export function isValidEntitlementValue(def: EntitlementDef, value: unknown): boolean {
  return def.kind === 'feature' ? typeof value === 'boolean' : isLimit(value);
}

/**
 * Parses an override from the API or the database. Unknown and reserved keys fail,
 * so the API answers 400 and a stale database row is skipped instead of applied.
 */
export function parseEntitlementOverride<C extends Catalog>(
  catalog: C,
  raw: RawOverride,
): Result<EntitlementOverrideOf<C>, OverrideError> {
  const found = findEntitlement(catalog, raw.key);
  if (!found) return { ok: false, error: { code: 'unknown_key', key: raw.key } };
  const { def } = found;
  if (def.reserved) return { ok: false, error: { code: 'reserved_key', key: raw.key } };
  if (!isValidEntitlementValue(def, raw.value)) {
    const expected = def.kind === 'feature' ? 'boolean' : 'limit';
    return { ok: false, error: { code: 'invalid_value', key: raw.key, expected } };
  }
  // The key was found in C, is not reserved, and the value matches its kind.
  return { ok: true, value: raw as EntitlementOverrideOf<C> };
}
