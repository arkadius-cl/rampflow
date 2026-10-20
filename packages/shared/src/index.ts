export { LocaleSet } from './values/locales.ts';
export { PackageId } from './values/packages.ts';
export { OrgKind, Role } from './values/roles.ts';
export { SettingScope } from './values/settings.ts';
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
  type ModuleManifest,
  type NavItem,
  ROLE_INCLUDES,
  ROLE_PARTY,
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
export { packages } from './packages.ts';
export * from './registry.ts';
