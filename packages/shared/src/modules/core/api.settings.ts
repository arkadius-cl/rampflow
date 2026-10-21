import * as z from 'zod';
import type { SettingSource } from '../../contract/settings.ts';
import type { ModuleId, SettingKey } from '../../registry.ts';
import type { SettingScope } from '../../values/settings.ts';
import { ZodIssueCode } from '../../values/validation.ts';

// Request schemas and response shapes of /api/t/:orgId/settings (TN-02) and
// /api/platform/settings (PL-03). Values are validated against the manifest on the server.

export const PutTenantSetting = z.object({ siteId: z.uuid().nullable(), value: z.unknown() });
export type PutTenantSetting = z.infer<typeof PutTenantSetting>;

export const PutPlatformSetting = z.object({ value: z.unknown() });
export type PutPlatformSetting = z.infer<typeof PutPlatformSetting>;

const SettingKeyText = z.string().min(1).max(100);

/** A topic form's save: values to store on the level and keys whose row to delete (ADR-0007). */
const settingChanges = {
  set: z.record(SettingKeyText, z.unknown()),
  reset: z.array(SettingKeyText).max(100),
};

function checkChanges(
  { set, reset }: { set: Record<string, unknown>; reset: string[] },
  ctx: z.RefinementCtx,
) {
  if (Object.keys(set).length === 0 && reset.length === 0) {
    ctx.addIssue({ code: ZodIssueCode.custom, message: 'Set or reset at least one setting' });
  }
  reset.forEach((key, i) => {
    if (Object.hasOwn(set, key)) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        path: ['reset', i],
        message: `${key} is set and reset`,
      });
    }
  });
}

export const PatchPlatformSettings = z.object(settingChanges).superRefine(checkChanges);
export type PatchPlatformSettings = z.infer<typeof PatchPlatformSettings>;

export const PatchTenantSettings = z
  .object({ siteId: z.uuid().nullable(), ...settingChanges })
  .superRefine(checkChanges);
export type PatchTenantSettings = z.infer<typeof PatchTenantSettings>;

export const SettingsQuery = z.object({ siteId: z.uuid().optional() });
export type SettingsQuery = z.infer<typeof SettingsQuery>;

export interface ResolvedValue {
  value: unknown;
  source: SettingSource;
}

/** One field of a settings screen (ADR-0007, "Read path"). */
export interface SettingEntry extends ResolvedValue {
  key: SettingKey;
  module: ModuleId;
  scopes: SettingScope[];
  /** What the field shows after "Reset to inherited": the value without the edited level. */
  inherited: ResolvedValue;
}

export interface SettingsView {
  /** The level this view edits. */
  scope: SettingScope;
  siteId: string | null;
  items: SettingEntry[];
}
