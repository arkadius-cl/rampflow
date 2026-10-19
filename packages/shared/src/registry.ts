import type {
  Catalog,
  EntitlementKeyOf,
  FeatureKeyOf,
  HardLimitKeyOf,
  ImplementedFeatureKeyOf,
  ImplementedLimitKeyOf,
  LimitKeyOf,
  ModuleIdOf,
  PermissionKeyOf,
  SettingKeyOf,
  SettingValueOf,
} from './contract/catalog.ts';
import type {
  EntitlementOverrideOf,
  PackageValuesOf,
  ResolvedEntitlementsOf,
} from './contract/entitlements.ts';
import { avis } from './modules/avis/manifest.ts';
import { booking } from './modules/booking/manifest.ts';
import { brand } from './modules/brand/manifest.ts';
import { core } from './modules/core/manifest.ts';
import { driver } from './modules/driver/manifest.ts';
import { i18n } from './modules/i18n/manifest.ts';
import { integration } from './modules/integration/manifest.ts';
import { notify } from './modules/notify/manifest.ts';
import { privacy } from './modules/privacy/manifest.ts';
import { report } from './modules/report/manifest.ts';
import { safety } from './modules/safety/manifest.ts';
import { yard } from './modules/yard/manifest.ts';

/** Every MVP module, each listed after the modules it depends on. */
export const catalog = [
  core,
  i18n,
  privacy,
  brand,
  integration,
  booking,
  avis,
  yard,
  safety,
  notify,
  report,
  driver,
] as const satisfies Catalog;

export type RampflowCatalog = typeof catalog;
export type ModuleId = ModuleIdOf<RampflowCatalog>;
export type FeatureKey = FeatureKeyOf<RampflowCatalog>;
export type LimitKey = LimitKeyOf<RampflowCatalog>;
export type EntitlementKey = EntitlementKeyOf<RampflowCatalog>;
export type ImplementedFeatureKey = ImplementedFeatureKeyOf<RampflowCatalog>;
export type ImplementedLimitKey = ImplementedLimitKeyOf<RampflowCatalog>;
export type HardLimitKey = HardLimitKeyOf<RampflowCatalog>;
export type PermissionKey = PermissionKeyOf<RampflowCatalog>;
export type SettingKey = SettingKeyOf<RampflowCatalog>;
export type SettingValue<K extends SettingKey> = SettingValueOf<RampflowCatalog, K>;
export type PackageValues = PackageValuesOf<RampflowCatalog>;
export type EntitlementOverride = EntitlementOverrideOf<RampflowCatalog>;
export type Entitlements = ResolvedEntitlementsOf<RampflowCatalog>;
