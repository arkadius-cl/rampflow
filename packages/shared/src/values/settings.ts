import type { ValueOf } from './define.ts';
import { BadRequestReason, ErrorCode } from './errors.ts';

/** Most specific first. Resolution walks this order and falls back to the code default. */
export const SettingScope = {
  site: 'site',
  tenant: 'tenant',
  platform: 'platform',
} as const;
export type SettingScope = ValueOf<typeof SettingScope>;

/** Every scope, broadest first: the order manifests and the catalog tables list them in. */
export const everyScope = [SettingScope.platform, SettingScope.tenant, SettingScope.site] as const;

/** Where a resolved setting's value comes from: a scope's row, or the code default. */
export const SettingSource = {
  ...SettingScope,
  default: 'default',
} as const;
export type SettingSource = ValueOf<typeof SettingSource>;

/** Why a settings write is refused; the API maps each to its status (`parseSettingWrite`). */
export const SettingWriteErrorCode = {
  unknown_key: BadRequestReason.unknown_key,
  scope_not_allowed: BadRequestReason.scope_not_allowed,
  entitlement_required: ErrorCode.entitlement_required,
  invalid_value: BadRequestReason.invalid_value,
} as const;
export type SettingWriteErrorCode = ValueOf<typeof SettingWriteErrorCode>;
