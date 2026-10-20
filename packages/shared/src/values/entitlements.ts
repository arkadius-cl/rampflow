import type { ValueOf } from './define.ts';
import { BadRequestReason } from './errors.ts';

/** A feature is on or off; a limit is a number or unlimited. */
export const EntitlementKind = {
  feature: 'feature',
  limit: 'limit',
} as const;
export type EntitlementKind = ValueOf<typeof EntitlementKind>;

/**
 * Why a key has its value. `module_off` means a package or override turned the key on,
 * but its module is off because its enabling feature or a dependency is off.
 */
export const EntitlementSource = {
  default: 'default',
  package: 'package',
  override: 'override',
  reserved: 'reserved',
  module_off: 'module_off',
} as const;
export type EntitlementSource = ValueOf<typeof EntitlementSource>;

/** Why an entitlement override is refused; the API sends it as the 400 `reason`. */
export const OverrideErrorCode = {
  unknown_key: BadRequestReason.unknown_key,
  reserved_key: BadRequestReason.reserved_key,
  invalid_value: BadRequestReason.invalid_value,
} as const;
export type OverrideErrorCode = ValueOf<typeof OverrideErrorCode>;

/** The JSON type an override's value must have for its entitlement kind. */
export const EntitlementValueType = {
  boolean: 'boolean',
  limit: EntitlementKind.limit,
} as const;
export type EntitlementValueType = ValueOf<typeof EntitlementValueType>;
