export const APP_NAME = 'rampflow';

export { navFor, permissionsFor, rolesHeldBy, type VisibleNavItem } from './contract/access.ts';
export type * from './contract/catalog.ts';
export {
  blockingFeature,
  type EntitlementSource,
  type OverrideError,
  parseEntitlementOverride,
  resolveEntitlements,
} from './contract/entitlements.ts';
export {
  type AnyModuleManifest,
  defineModule,
  type Limit,
  type LocaleSet,
  type ModuleManifest,
  type NavItem,
  type OrgParty,
  ROLE_INCLUDES,
  ROLE_PARTY,
  ROLES,
  type Role,
  SETTING_SCOPES,
  type SettingScope,
} from './contract/module.ts';
export type { Result } from './contract/result.ts';
export {
  isSettingAvailable,
  parseSettingWrite,
  type ResolvedSetting,
  resolveSetting,
  type SettingIssue,
  type SettingLevels,
  type SettingSource,
  type SettingWriteError,
} from './contract/settings.ts';
export { validateCatalog } from './contract/validate.ts';
export * from './locales.ts';
export { REFERENCE_TYPES } from './modules/avis/manifest.ts';
export { PACKAGE_IDS, type PackageId, packages } from './packages.ts';
export * from './registry.ts';
