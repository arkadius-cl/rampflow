import {
  catalog,
  type Entitlements,
  isSettingAvailable,
  parseSettingWrite,
  resolveSetting,
  type SettingIssue,
  type SettingKey,
  type SettingLevels,
} from '@rampflow/shared';
import type { SettingEntry, SettingsView } from '@rampflow/shared/modules/core/api.settings';
import {
  BadRequestReason,
  ErrorCode,
  SettingScope,
  SettingWriteErrorCode,
} from '@rampflow/shared/values';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { type SiteId, type TenantId, type UserId, wrapJson } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { settingValue } from '../schema.ts';

// Settings screens and writes (TN-02, PL-03; ADR-0007). A row per (tenant, site, key); deleting
// the row is "Use inherited value".

/** Where a write lands: the platform, a tenant, or one site of a tenant. */
export type SettingTarget =
  | { scope: typeof SettingScope.platform }
  | { scope: typeof SettingScope.tenant; tenantId: TenantId }
  | { scope: typeof SettingScope.site; tenantId: TenantId; siteId: SiteId };

const ALL_SETTINGS = catalog.flatMap((m) =>
  Object.entries(m.settings).map(([key, def]) => ({ key: key as SettingKey, module: m.id, def })),
);

const rowOf = (target: SettingTarget) =>
  and(
    target.scope === SettingScope.platform
      ? isNull(settingValue.tenantId)
      : eq(settingValue.tenantId, target.tenantId),
    target.scope === SettingScope.site
      ? eq(settingValue.siteId, target.siteId)
      : isNull(settingValue.siteId),
  );

/** Stored levels per key for the target and everything it inherits from. */
async function levelsFor(tx: Tx, target: SettingTarget): Promise<Map<string, SettingLevels>> {
  const rows = await tx
    .select()
    .from(settingValue)
    .where(
      target.scope === SettingScope.platform
        ? isNull(settingValue.tenantId)
        : or(
            isNull(settingValue.tenantId),
            and(
              eq(settingValue.tenantId, target.tenantId),
              target.scope === SettingScope.site
                ? or(isNull(settingValue.siteId), eq(settingValue.siteId, target.siteId))
                : isNull(settingValue.siteId),
            ),
          ),
    );
  const levels = new Map<string, { -readonly [S in SettingScope]?: unknown }>();
  for (const row of rows) {
    const scope: SettingScope =
      row.tenantId === null
        ? SettingScope.platform
        : row.siteId === null
          ? SettingScope.tenant
          : SettingScope.site;
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
  return {
    scope: target.scope,
    siteId: target.scope === SettingScope.site ? target.siteId : null,
    items,
  };
}

function writeError(
  error: Exclude<ReturnType<typeof parseSettingWrite>, { ok: true }>['error'],
): ApiError {
  switch (error.code) {
    case SettingWriteErrorCode.unknown_key:
      return new ApiError(ErrorCode.bad_request, `Unknown setting ${error.key}`, {
        reason: BadRequestReason.unknown_key,
      });
    case SettingWriteErrorCode.scope_not_allowed:
      return new ApiError(ErrorCode.bad_request, `${error.key} has no ${error.scope} level`, {
        reason: BadRequestReason.scope_not_allowed,
        allowed: error.allowed,
      });
    case SettingWriteErrorCode.entitlement_required:
      return new ApiError(ErrorCode.entitlement_required, `${error.entitlement} is off`, {
        key: error.entitlement,
      });
    case SettingWriteErrorCode.invalid_value:
      return new ApiError(ErrorCode.validation_failed, 'Invalid json', {
        issues: error.issues.map((i) => ({ ...i, path: ['value', ...i.path] })),
      });
  }
}

/** The key, if the catalog has it; else 400 like any other unknown key. */
export function requireSettingKey(key: string): SettingKey {
  const found = ALL_SETTINGS.find((s) => s.key === key);
  if (!found) throw writeError({ code: SettingWriteErrorCode.unknown_key, key });
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
      tenantId: target.scope === SettingScope.platform ? null : target.tenantId,
      siteId: target.scope === SettingScope.site ? target.siteId : null,
      key,
      ...set,
    })
    .onConflictDoUpdate({
      target: [settingValue.tenantId, settingValue.siteId, settingValue.key],
      set,
    });
  return entryOf(tx, target, entitlements, key);
}

/**
 * A topic form's save (ADR-0007, "Write path"): checks every entry first, then stores the `set`
 * values and deletes the `reset` rows. The first unknown key, missing level or blocked
 * entitlement throws as for `writeSetting`; invalid values throw one 422 with their issues under
 * `["set", key, ...]`. The request transaction makes it all or nothing.
 */
export async function writeSettings(
  tx: Tx,
  target: SettingTarget,
  entitlements: Entitlements | null,
  changes: { set: Record<string, unknown>; reset: readonly string[] },
  userId: UserId,
  now: Date,
): Promise<SettingsView> {
  const values: { key: SettingKey; value: unknown }[] = [];
  const invalid: SettingIssue[] = [];
  for (const [key, value] of Object.entries(changes.set)) {
    const parsed = parseSettingWrite(catalog, entitlements, { key, value, scope: target.scope });
    if (parsed.ok) values.push(parsed.value);
    else if (parsed.error.code === SettingWriteErrorCode.invalid_value)
      invalid.push(...parsed.error.issues.map((i) => ({ ...i, path: ['set', key, ...i.path] })));
    else throw writeError(parsed.error);
  }
  const resets: SettingKey[] = [];
  for (const key of changes.reset) {
    // A reset has no value: only the key, level and entitlement checks apply.
    const parsed = parseSettingWrite(catalog, entitlements, {
      key,
      value: undefined,
      scope: target.scope,
    });
    if (!parsed.ok && parsed.error.code !== SettingWriteErrorCode.invalid_value)
      throw writeError(parsed.error);
    resets.push(requireSettingKey(key));
  }
  if (invalid.length > 0)
    throw new ApiError(ErrorCode.validation_failed, 'Invalid json', { issues: invalid });

  if (values.length > 0) {
    await tx
      .insert(settingValue)
      .values(
        values.map(({ key, value }) => ({
          tenantId: target.scope === SettingScope.platform ? null : target.tenantId,
          siteId: target.scope === SettingScope.site ? target.siteId : null,
          key,
          value: wrapJson(value),
          updatedBy: userId,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [settingValue.tenantId, settingValue.siteId, settingValue.key],
        set: { value: sql`excluded.value`, updatedBy: userId, updatedAt: now },
      });
  }
  if (resets.length > 0) {
    await tx.delete(settingValue).where(and(rowOf(target), inArray(settingValue.key, resets)));
  }
  return settingsView(tx, target, entitlements);
}

/** "Use inherited value" of one key: deletes the target's row. Unknown keys answer 400; a missing row is fine. */
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
