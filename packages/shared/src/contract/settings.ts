import { type Catalog, findSetting, type SettingKeyOf, type SettingValueOf } from './catalog.ts';
import { blockingFeature, type ResolvedEntitlementsOf } from './entitlements.ts';
import { SETTING_SCOPES, type SettingScope } from './module.ts';
import type { Result } from './result.ts';

export type SettingSource = SettingScope | 'default';

export interface ResolvedSetting<T> {
  readonly value: T;
  readonly source: SettingSource;
}

/** Raw stored values per scope, `undefined` where no row exists. */
export type SettingLevels = { readonly [S in SettingScope]?: unknown };

/**
 * Effective value of one setting: site, then tenant, then platform, then the code default.
 * A level the setting does not allow is ignored, and a stored value that no longer parses
 * falls through to the next level, so a schema change never breaks a request.
 */
export function resolveSetting<C extends Catalog, K extends SettingKeyOf<C>>(
  catalog: C,
  key: K,
  levels: SettingLevels,
): ResolvedSetting<SettingValueOf<C, K>> {
  const found = findSetting(catalog, key);
  if (!found) throw new Error(`Setting ${key} is not in the catalog`);
  const { def } = found;
  for (const scope of SETTING_SCOPES) {
    const raw = levels[scope];
    if (raw === undefined || !def.scopes.includes(scope)) continue;
    const parsed = def.schema.safeParse(raw);
    // K is a key of C, so its schema output is SettingValueOf<C, K>.
    if (parsed.success) return { value: parsed.data as SettingValueOf<C, K>, source: scope };
  }
  return { value: def.default as SettingValueOf<C, K>, source: 'default' };
}

/** The feature that hides a setting, or `null` when the setting is available. */
function settingBlockedBy<C extends Catalog>(
  catalog: C,
  entitlements: ResolvedEntitlementsOf<C>,
  key: string,
): string | null {
  const found = findSetting(catalog, key);
  if (!found) return null;
  const features: Readonly<Record<string, boolean>> = entitlements.features;
  const fromModule = blockingFeature(catalog, entitlements, found.module.id);
  if (fromModule) return fromModule;
  const { requires } = found.def;
  return requires !== undefined && !features[requires] ? requires : null;
}

export function isSettingAvailable<C extends Catalog>(
  catalog: C,
  entitlements: ResolvedEntitlementsOf<C>,
  key: SettingKeyOf<C>,
): boolean {
  return settingBlockedBy(catalog, entitlements, key) === null;
}

export interface SettingIssue {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly message: string;
}

export type SettingWriteError =
  | { readonly code: 'unknown_key'; readonly key: string }
  | {
      readonly code: 'scope_not_allowed';
      readonly key: string;
      readonly scope: SettingScope;
      readonly allowed: readonly SettingScope[];
    }
  | { readonly code: 'entitlement_required'; readonly key: string; readonly entitlement: string }
  | {
      readonly code: 'invalid_value';
      readonly key: string;
      readonly issues: readonly SettingIssue[];
    };

export interface SettingWrite<K extends string = string> {
  readonly key: K;
  readonly scope: SettingScope;
  readonly value: unknown;
}

/**
 * Validates a settings write at the API boundary. The API maps the error codes to
 * 400 (`unknown_key`, `scope_not_allowed`), 403 (`entitlement_required`) and 422 (`invalid_value`).
 */
export function parseSettingWrite<C extends Catalog>(
  catalog: C,
  entitlements: ResolvedEntitlementsOf<C>,
  write: SettingWrite,
): Result<SettingWrite<SettingKeyOf<C>>, SettingWriteError> {
  const found = findSetting(catalog, write.key);
  if (!found) return { ok: false, error: { code: 'unknown_key', key: write.key } };
  const { def } = found;
  if (!def.scopes.includes(write.scope)) {
    return {
      ok: false,
      error: { code: 'scope_not_allowed', key: write.key, scope: write.scope, allowed: def.scopes },
    };
  }
  const blockedBy = settingBlockedBy(catalog, entitlements, write.key);
  if (blockedBy) {
    return {
      ok: false,
      error: { code: 'entitlement_required', key: write.key, entitlement: blockedBy },
    };
  }
  const parsed = def.schema.safeParse(write.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path,
      code: i.code,
      message: i.message,
    }));
    return { ok: false, error: { code: 'invalid_value', key: write.key, issues } };
  }
  // findSetting located the key in C.
  const key = write.key as SettingKeyOf<C>;
  return { ok: true, value: { key, scope: write.scope, value: parsed.data } };
}
