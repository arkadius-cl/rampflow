import type { PermissionKey } from '@rampflow/shared';
import {
  Permission,
  SettingScope,
  SettingSource,
  type SettingsTopic,
} from '@rampflow/shared/values';
import type { OriginHref } from '@/components/settings-field';

// The three levels a settings page edits, and the path of a topic on each (ADR-0011, ADR-0020).

export type SettingsLevel =
  | { scope: typeof SettingScope.platform }
  | { scope: typeof SettingScope.tenant; orgId: string }
  | { scope: typeof SettingScope.site; orgId: string; siteId: string };

export function settingsPath(level: SettingsLevel, topic: SettingsTopic): string {
  switch (level.scope) {
    case SettingScope.platform:
      return `/platform/settings/${topic}`;
    case SettingScope.tenant:
      return `/t/${level.orgId}/settings/${topic}`;
    case SettingScope.site:
      return `/t/${level.orgId}/sites/${level.siteId}/settings/${topic}`;
  }
}

/**
 * Origin links of a page on `level`: a value from a level above links to the same field there,
 * when `can` holds that level's settings permission. A tenant area never holds the platform's.
 */
export function originHrefFor(
  level: SettingsLevel,
  topic: SettingsTopic,
  can: (permission: PermissionKey) => boolean,
): OriginHref {
  return (source, key) => {
    if (source === SettingSource.platform && can(Permission.core.manage_platform_settings)) {
      return `${settingsPath({ scope: SettingScope.platform }, topic)}#${key}`;
    }
    if (
      source === SettingSource.tenant &&
      level.scope === SettingScope.site &&
      can(Permission.core.manage_settings)
    ) {
      return `${settingsPath({ scope: SettingScope.tenant, orgId: level.orgId }, topic)}#${key}`;
    }
    return undefined;
  };
}
