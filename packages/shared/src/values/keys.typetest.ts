// Compile-time proof that each key tree holds exactly the manifest keys. `tsc -b` fails otherwise.
import type {
  ImplementedFeatureKey,
  LimitKey,
  ModuleId,
  PermissionKey,
  SettingKey,
} from '../registry.ts';
import type { ValueOf } from './define.ts';
import type { Feature, KeyOf, Limit, Module, Permission, Setting } from './keys.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const proof = <T extends true>() => undefined as unknown as T;

export const permissions = proof<Equal<KeyOf<typeof Permission>, PermissionKey>>();
export const features = proof<Equal<KeyOf<typeof Feature>, ImplementedFeatureKey>>();
export const limits = proof<Equal<KeyOf<typeof Limit>, LimitKey>>();
export const settings = proof<Equal<KeyOf<typeof Setting>, SettingKey>>();
export const modules = proof<Equal<ValueOf<typeof Module>, ModuleId>>();
export const leaf = proof<Equal<(typeof Permission)['booking']['view'], 'booking.view'>>();
export const nested =
  proof<
    Equal<(typeof Setting)['privacy']['retention']['visit_days'], 'privacy.retention.visit_days'>
  >();
