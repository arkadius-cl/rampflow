import type { ValueOf } from './define.ts';

/** Most specific first. Resolution walks this order and falls back to the code default. */
export const SettingScope = {
  site: 'site',
  tenant: 'tenant',
  platform: 'platform',
} as const;
export type SettingScope = ValueOf<typeof SettingScope>;

/** Every scope, broadest first: the order manifests and the catalog tables list them in. */
export const everyScope = [SettingScope.platform, SettingScope.tenant, SettingScope.site] as const;
