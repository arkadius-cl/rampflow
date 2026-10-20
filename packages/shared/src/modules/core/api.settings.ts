import * as z from 'zod';
import type { SettingSource } from '../../contract/settings.ts';
import type { ModuleId, SettingKey } from '../../registry.ts';
import type { SettingScope } from '../../values/settings.ts';

// Request schemas and response shapes of /api/t/:orgId/settings (TN-02) and
// /api/platform/settings (PL-03). Values are validated against the manifest on the server.

export const PutTenantSetting = z.object({ siteId: z.uuid().nullable(), value: z.unknown() });
export type PutTenantSetting = z.infer<typeof PutTenantSetting>;

export const PutPlatformSetting = z.object({ value: z.unknown() });
export type PutPlatformSetting = z.infer<typeof PutPlatformSetting>;

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
