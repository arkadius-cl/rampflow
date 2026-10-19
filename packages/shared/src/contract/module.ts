import type * as z from 'zod';

export const ROLES = [
  'platform_admin',
  'tenant_admin',
  'dispatcher',
  'gate_operator',
  'dock_operator',
  'carrier_admin',
  'carrier_user',
] as const;
export type Role = (typeof ROLES)[number];

/** The kind of org a membership belongs to. Drivers are not an org party; they hold a booking token. */
export type OrgParty = 'platform' | 'tenant' | 'carrier';

export const ROLE_PARTY = {
  platform_admin: 'platform',
  tenant_admin: 'tenant',
  dispatcher: 'tenant',
  gate_operator: 'tenant',
  dock_operator: 'tenant',
  carrier_admin: 'carrier',
  carrier_user: 'carrier',
} as const satisfies Record<Role, OrgParty>;

/**
 * A role holds every permission granted to the roles it includes, transitively.
 * A manifest therefore names the lowest role that may act, and higher roles follow.
 */
export const ROLE_INCLUDES = {
  platform_admin: [],
  tenant_admin: ['dispatcher'],
  dispatcher: ['gate_operator', 'dock_operator'],
  gate_operator: [],
  dock_operator: [],
  carrier_admin: ['carrier_user'],
  carrier_user: [],
} as const satisfies Record<Role, readonly Role[]>;

/** Most specific first. Resolution walks this order and falls back to the code default. */
export const SETTING_SCOPES = ['site', 'tenant', 'platform'] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];

/** `staff` modules ship de, en and pl catalogs. `driver` ships the 12 driver languages. */
export type LocaleSet = 'staff' | 'driver';

export type FeatureDef = { readonly kind: 'feature'; readonly reserved?: true };
export type LimitDef = { readonly kind: 'limit'; readonly soft?: true; readonly reserved?: true };
export type EntitlementDef = FeatureDef | LimitDef;
/** A numeric entitlement value. `null` means unlimited. */
export type Limit = number | null;

export interface PermissionDef {
  readonly roles: readonly [Role, ...Role[]];
}

export interface SettingDef<Z extends z.ZodType = z.ZodType, F extends string = string> {
  readonly schema: Z;
  readonly default: z.output<Z>;
  readonly scopes: readonly [SettingScope, ...SettingScope[]];
  /** A feature key of the same module. While it is off the setting is hidden and writes fail. */
  readonly requires?: F;
}

/** Tenant navigation can depend on a tenant entitlement. Carrier and platform users have no package. */
export type NavItem<P extends string = string, F extends string = string> =
  | {
      readonly id: string;
      readonly area: 'tenant';
      readonly to: string;
      readonly icon: string;
      readonly permission: P;
      readonly entitlement?: F;
    }
  | {
      readonly id: string;
      readonly area: 'carrier' | 'platform';
      readonly to: string;
      readonly icon: string;
      readonly permission: P;
    };

export type EntitlementDefs = { readonly [key: string]: EntitlementDef };
export type PermissionDefs = { readonly [key: string]: PermissionDef };
export type SettingDefs = { readonly [key: string]: SettingDef };

/** Non-reserved feature keys of one module's entitlement record. */
export type ImplementedFeatureIn<E> = {
  [K in keyof E]: E[K] extends { kind: 'feature' }
    ? E[K] extends { reserved: true }
      ? never
      : K
    : never;
}[keyof E] &
  string;

/** The shape every manifest satisfies. `defineModule` returns the precise literal type. */
export interface AnyModuleManifest {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly enabledBy: string | null;
  readonly locales: LocaleSet;
  readonly entitlements: EntitlementDefs;
  readonly permissions: PermissionDefs;
  readonly settings: SettingDefs;
  readonly nav: readonly NavItem[];
}

export interface ModuleManifest<
  Id extends string,
  E extends EntitlementDefs,
  P extends PermissionDefs,
  S extends SettingDefs,
> {
  readonly id: Id;
  /** Ids of modules listed earlier in the catalog. The module is off while any of them is off. */
  readonly dependsOn: readonly string[];
  /** The module is off while this feature is off. `null` means the module is on by itself. */
  readonly enabledBy: ImplementedFeatureIn<E> | null;
  readonly locales: LocaleSet;
  readonly entitlements: E;
  readonly permissions: P;
  readonly settings: S;
  /** The label key is `nav.<id>` in the module's i18n namespace. */
  readonly nav: readonly NavItem<keyof P & string, ImplementedFeatureIn<E>>[];
}

type Prefixed<Id extends string, R, V> = {
  readonly [K in keyof R]: K extends `${Id}.${string}` ? V : never;
};

type CheckedSettings<Id extends string, S, F extends string> = {
  readonly [K in keyof S]: K extends `${Id}.${string}`
    ? S[K] extends { readonly schema: infer Z extends z.ZodType }
      ? SettingDef<Z, F>
      : never
    : never;
};

/**
 * Declares a module. The compiler rejects keys without the `<id>.` prefix, a setting default
 * that its schema does not accept, and references to reserved or foreign feature keys.
 */
export function defineModule<
  const Id extends string,
  const E extends EntitlementDefs & Prefixed<Id, E, EntitlementDef>,
  const P extends PermissionDefs & Prefixed<Id, P, PermissionDef>,
  const S extends SettingDefs & CheckedSettings<Id, S, ImplementedFeatureIn<E>>,
>(manifest: ModuleManifest<Id, E, P, S>): ModuleManifest<Id, E, P, S> {
  return manifest;
}
