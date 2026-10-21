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

/** The settings topics, in navigation order; also the `$topic` route param (ADR-0020). */
export const SettingsTopic = {
  general: 'general',
  booking: 'booking',
  avis: 'avis',
  safety: 'safety',
  yard: 'yard',
  privacy: 'privacy',
} as const;
export type SettingsTopic = ValueOf<typeof SettingsTopic>;

/** The named sections of the settings topics (ADR-0020). */
export const SettingsSection = {
  sites: 'sites',
  language: 'language',
  rules: 'rules',
  public_booking: 'public_booking',
  reminders: 'reminders',
  requirements: 'requirements',
  briefing: 'briefing',
  arrival: 'arrival',
  dwell: 'dwell',
  notice: 'notice',
  retention: 'retention',
  driver_access: 'driver_access',
} as const;
export type SettingsSection = ValueOf<typeof SettingsSection>;

/** The unit a numeric setting is measured in, shown as the input's suffix. */
export const SettingUnit = {
  minutes: 'minutes',
  hours: 'hours',
  days: 'days',
  percent: 'percent',
} as const;
export type SettingUnit = ValueOf<typeof SettingUnit>;

/** A field's pending edit on a topic form: a value of its own, or "use inherited value". */
export const FieldDraftKind = {
  own: 'own',
  inherit: 'inherit',
} as const;
export type FieldDraftKind = ValueOf<typeof FieldDraftKind>;
