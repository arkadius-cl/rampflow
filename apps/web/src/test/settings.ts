import { catalog, type SettingKey } from '@rampflow/shared';
import type {
  ResolvedValue,
  SettingEntry,
  SettingsView,
} from '@rampflow/shared/modules/core/api.settings';
import { type SettingScope, SettingSource } from '@rampflow/shared/values';

export interface EntryOverride {
  value?: unknown;
  source?: SettingSource;
  inherited?: ResolvedValue;
}

/**
 * The settings view of a level as the API answers it: every setting the level may hold at its
 * product default, except the overrides given per key.
 */
export function settingsView(
  scope: SettingScope,
  overrides: Partial<Record<SettingKey, EntryOverride>> = {},
): SettingsView {
  const items: SettingEntry[] = catalog.flatMap((m) =>
    Object.entries(m.settings)
      .filter(([, def]) => def.scopes.includes(scope))
      .map(([name, def]) => {
        const key = name as SettingKey;
        const fallback = { value: def.default, source: SettingSource.default };
        const o = overrides[key] ?? {};
        return {
          key,
          module: m.id,
          scopes: [...def.scopes],
          value: o.value ?? def.default,
          source: o.source ?? SettingSource.default,
          inherited: o.inherited ?? fallback,
        };
      }),
  );
  return { scope, siteId: null, items };
}
