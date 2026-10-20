import type { AnyModuleManifest } from '../contract/module.ts';
import {
  catalog,
  type ImplementedFeatureKey,
  type LimitKey,
  type ModuleId,
  type PermissionKey,
  type SettingKey,
} from '../registry.ts';
import { EntitlementKind } from './entitlements.ts';

// Manifest keys as runtime values (ADR-0019): `Permission.booking.view === 'booking.view'`.
// Each dot of a key opens one level, so `Setting.privacy.retention.visit_days` exists too.

/** A nested object whose leaves are the full keys of `K`. */
export type KeyTree<K extends string, Prefix extends string = ''> = {
  readonly [H in K extends `${infer H}.${string}` ? H : K]: H extends K
    ? `${Prefix}${H}`
    : KeyTree<K extends `${H}.${infer Rest}` ? Rest : never, `${Prefix}${H}.`>;
};

/** Every full key in a key tree: `KeyOf<typeof Permission>` is `PermissionKey`. */
export type KeyOf<T> = T extends string ? T : { [N in keyof T]: KeyOf<T[N]> }[keyof T];

type Branch = { [name: string]: string | Branch };

function keyTree<K extends string>(keys: readonly K[]): KeyTree<K> {
  const root: Branch = {};
  for (const key of keys) {
    const parts = key.split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part] as Branch;
    }
    node[parts.at(-1) as string] = key;
  }
  return root as KeyTree<K>;
}

const keysOf = (pick: (m: AnyModuleManifest) => string[]) => catalog.flatMap((m) => pick(m));

export const Permission = keyTree(keysOf((m) => Object.keys(m.permissions)) as PermissionKey[]);

export const Feature = keyTree(
  keysOf((m) =>
    Object.entries(m.entitlements)
      .filter(([, d]) => d.kind === EntitlementKind.feature && !d.reserved)
      .map(([k]) => k),
  ) as ImplementedFeatureKey[],
);

export const Limit = keyTree(
  keysOf((m) =>
    Object.entries(m.entitlements)
      .filter(([, d]) => d.kind === EntitlementKind.limit)
      .map(([k]) => k),
  ) as LimitKey[],
);

export const Setting = keyTree(keysOf((m) => Object.keys(m.settings)) as SettingKey[]);

export const Module = Object.fromEntries(catalog.map((m) => [m.id, m.id])) as {
  readonly [M in ModuleId]: M;
};
export type Module = ModuleId;
