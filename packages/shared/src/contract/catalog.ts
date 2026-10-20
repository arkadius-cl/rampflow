import type * as z from 'zod';
import type { EntitlementKind } from '../values/entitlements.ts';
import type { AnyModuleManifest, SettingDef } from './module.ts';

/** Every module manifest, listed so that each module comes after the modules it depends on. */
export type Catalog = readonly AnyModuleManifest[];

type Defs<C extends Catalog, F extends 'entitlements' | 'permissions' | 'settings'> = C[number][F];

type KeysWhere<R, V> = R extends unknown
  ? { [K in keyof R]: R[K] extends V ? K : never }[keyof R] & string
  : never;

type KeysOf<R> = R extends unknown ? keyof R & string : never;

export type ModuleIdOf<C extends Catalog> = C[number]['id'];
export type FeatureKeyOf<C extends Catalog> = KeysWhere<
  Defs<C, 'entitlements'>,
  { kind: typeof EntitlementKind.feature }
>;
export type LimitKeyOf<C extends Catalog> = KeysWhere<
  Defs<C, 'entitlements'>,
  { kind: typeof EntitlementKind.limit }
>;
export type EntitlementKeyOf<C extends Catalog> = FeatureKeyOf<C> | LimitKeyOf<C>;
export type ReservedKeyOf<C extends Catalog> = KeysWhere<
  Defs<C, 'entitlements'>,
  { reserved: true }
>;
export type ImplementedFeatureKeyOf<C extends Catalog> = Exclude<FeatureKeyOf<C>, ReservedKeyOf<C>>;
export type ImplementedLimitKeyOf<C extends Catalog> = Exclude<LimitKeyOf<C>, ReservedKeyOf<C>>;
/** Limits that a write must stay within. Soft limits only flag usage. */
export type HardLimitKeyOf<C extends Catalog> = Exclude<
  ImplementedLimitKeyOf<C>,
  KeysWhere<Defs<C, 'entitlements'>, { soft: true }>
>;
export type PermissionKeyOf<C extends Catalog> = KeysOf<Defs<C, 'permissions'>>;
export type SettingKeyOf<C extends Catalog> = KeysOf<Defs<C, 'settings'>>;

type SettingDefOf<C extends Catalog, K extends string> =
  Defs<C, 'settings'> extends infer R
    ? R extends { readonly [P in K]: infer D }
      ? D
      : never
    : never;

export type SettingValueOf<C extends Catalog, K extends SettingKeyOf<C>> =
  SettingDefOf<C, K> extends SettingDef<infer Z extends z.ZodType> ? z.output<Z> : never;

export function findSetting(catalog: Catalog, key: string) {
  for (const module of catalog) {
    const def = module.settings[key];
    if (def) return { module, def };
  }
  return undefined;
}

export function findEntitlement(catalog: Catalog, key: string) {
  for (const module of catalog) {
    const def = module.entitlements[key];
    if (def) return { module, def };
  }
  return undefined;
}
