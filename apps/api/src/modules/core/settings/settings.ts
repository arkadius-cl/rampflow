import {
  catalog,
  type Entitlements,
  isSettingAvailable,
  parseSettingWrite,
  resolveSetting,
  type SettingKey,
  type SettingLevels,
  type SettingScope,
} from '@rampflow/shared';
import type { SettingEntry, SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { and, eq, isNull, or } from 'drizzle-orm';
import { type SiteId, type TenantId, type UserId, wrapJson } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { settingValue } from '../schema.ts';

// Settings screens and writes (TN-02, PL-03; ADR-0007). A row per (tenant, site, key); deleting
// the row is "Reset to inherited".

/** Where a write lands: the platform, a tenant, or one site of a tenant. */
export type SettingTarget =
  | { scope: 'platform' }
  | { scope: 'tenant'; tenantId: TenantId }
  | { scope: 'site'; tenantId: TenantId; siteId: SiteId };

const ALL_SETTINGS = catalog.flatMap((m) =>
  Object.entries(m.settings).map(([key, def]) => ({ key: key as SettingKey, module: m.id, def })),
);

const rowOf = (target: SettingTarget) =>
  and(
    target.scope === 'platform'
      ? isNull(settingValue.tenantId)
      : eq(settingValue.tenantId, target.tenantId),
    target.scope === 'site' ? eq(settingValue.siteId, target.siteId) : isNull(settingValue.siteId),
  );

/** Stored levels per key for the target and everything it inherits from. */
async function levelsFor(tx: Tx, target: SettingTarget): Promise<Map<string, SettingLevels>> {
  const rows = await tx
    .select()
    .from(settingValue)
    .where(
      target.scope === 'platform'
        ? isNull(settingValue.tenantId)
        : or(
            isNull(settingValue.tenantId),
            and(
              eq(settingValue.tenantId, target.tenantId),
              target.scope === 'site'
                ? or(isNull(settingValue.siteId), eq(settingValue.siteId, target.siteId))
                : isNull(settingValue.siteId),
            ),
          ),
    );
  const levels = new Map<string, { -readonly [S in SettingScope]?: unknown }>();
  for (const row of rows) {
    const scope: SettingScope =
      row.tenantId === null ? 'platform' : row.siteId === null ? 'tenant' : 'site';
    const entry = levels.get(row.key) ?? {};
    entry[scope] = row.value.v;
    levels.set(row.key, entry);
  }
  return levels;
}

/**
 * Every setting the target's level may hold, with the effective value and its source, and the
 * value it would inherit without that level. Settings whose entitlement is off are left out.
 */
export async function settingsView(
  tx: Tx,
  target: SettingTarget,
  entitlements: Entitlements | null,
): Promise<SettingsView> {
  const levels = await levelsFor(tx, target);
  const items: SettingEntry[] = [];
  for (const { key, module, def } of ALL_SETTINGS) {
    if (!def.scopes.includes(target.scope)) continue;
    if (entitlements && !isSettingAvailable(catalog, entitlements, key)) continue;
    const stored = levels.get(key) ?? {};
    const { [target.scope]: _edited, ...above } = stored;
    items.push({
      key,
      module,
      scopes: [...def.scopes],
      ...resolveSetting(catalog, key, stored),
      inherited: resolveSetting(catalog, key, above),
    });
  }
  return { scope: target.scope, siteId: target.scope === 'site' ? target.siteId : null, items };
}

function writeError(
  error: Exclude<ReturnType<typeof parseSettingWrite>, { ok: true }>['error'],
): ApiError {
  switch (error.code) {
    case 'unknown_key':
      return new ApiError('bad_request', `Unknown setting ${error.key}`, { reason: 'unknown_key' });
    case 'scope_not_allowed':
      return new ApiError('bad_request', `${error.key} has no ${error.scope} level`, {
        reason: 'scope_not_allowed',
        allowed: error.allowed,
      });
    case 'entitlement_required':
      return new ApiError('entitlement_required', `${error.entitlement} is off`, {
        key: error.entitlement,
      });
    case 'invalid_value':
      return new ApiError('validation_failed', 'Invalid json', {
        issues: error.issues.map((i) => ({ ...i, path: ['value', ...i.path] })),
      });
  }
}

/** The key, if the catalog has it; else 400 like any other unknown key. */
export function requireSettingKey(key: string): SettingKey {
  const found = ALL_SETTINGS.find((s) => s.key === key);
  if (!found) throw writeError({ code: 'unknown_key', key });
  return found.key;
}

/**
 * Validates and stores one value (ADR-0007, "Write path"). Platform writes pass `null`
 * entitlements. Answers the field as the screen shows it after the write.
 */
export async function writeSetting(
  tx: Tx,
  target: SettingTarget,
  entitlements: Entitlements | null,
  input: { key: string; value: unknown },
  userId: UserId,
  now: Date,
): Promise<SettingEntry> {
  const parsed = parseSettingWrite(catalog, entitlements, { ...input, scope: target.scope });
  if (!parsed.ok) throw writeError(parsed.error);
  const { key, value } = parsed.value;
  const set = { value: wrapJson(value), updatedBy: userId, updatedAt: now };
  await tx
    .insert(settingValue)
    .values({
      tenantId: target.scope === 'platform' ? null : target.tenantId,
      siteId: target.scope === 'site' ? target.siteId : null,
      key,
      ...set,
    })
    .onConflictDoUpdate({
      target: [settingValue.tenantId, settingValue.siteId, settingValue.key],
      set,
    });
  return entryOf(tx, target, entitlements, key);
}

/** "Reset to inherited": deletes the target's row. Unknown keys answer 400; a missing row is fine. */
export async function resetSetting(tx: Tx, target: SettingTarget, key: string): Promise<void> {
  const known = requireSettingKey(key);
  await tx.delete(settingValue).where(and(rowOf(target), eq(settingValue.key, known)));
}

async function entryOf(
  tx: Tx,
  target: SettingTarget,
  entitlements: Entitlements | null,
  key: SettingKey,
): Promise<SettingEntry> {
  const entry = (await settingsView(tx, target, entitlements)).items.find((i) => i.key === key);
  if (!entry) throw new Error(`setting ${key} vanished after its write`);
  return entry;
}
