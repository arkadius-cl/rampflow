import type { ImplementedLimitKey } from '../../registry.ts';
import type { ValueOf } from '../../values/define.ts';
import { TokenPurpose } from '../../values/tokens.ts';

export const DoorType = {
  dock_leveler: 'dock_leveler',
  ground_level: 'ground_level',
  side_loading: 'side_loading',
  yard_open: 'yard_open',
} as const;
export type DoorType = ValueOf<typeof DoorType>;

export const TemperatureZone = {
  ambient: 'ambient',
  chilled: 'chilled',
  frozen: 'frozen',
} as const;
export type TemperatureZone = ValueOf<typeof TemperatureZone>;

export const DockStatus = {
  active: 'active',
  maintenance: 'maintenance',
  inactive: 'inactive',
} as const;
export type DockStatus = ValueOf<typeof DockStatus>;

/** Docks that count toward `core.max_docks`. Only `active` docks add capacity (ADR-0004). */
export const CountedDockStatus = {
  active: DockStatus.active,
  maintenance: DockStatus.maintenance,
} as const;
export type CountedDockStatus = ValueOf<typeof CountedDockStatus>;

/** The limits a tenant's usage is measured against (PL-04). */
export const UsageKey = {
  max_sites: 'core.max_sites',
  max_docks: 'core.max_docks',
  max_internal_users: 'core.max_internal_users',
  max_bookings_per_month: 'booking.max_bookings_per_month',
} as const satisfies Record<string, ImplementedLimitKey>;
export type UsageKey = ValueOf<typeof UsageKey>;

/** `auth_token.kind`: the tokens the core module emails to a user without a session. */
export const AuthTokenKind = {
  magic_link: TokenPurpose.magic_link,
  password_reset: TokenPurpose.password_reset,
} as const;
export type AuthTokenKind = ValueOf<typeof AuthTokenKind>;

/** The abuse limits of ADR-0003, "Abuse limits"; `RATE_LIMITS` in the API sets each one. */
export const RateLimitBucket = {
  login_failed: 'login_failed',
  login_ip: 'login_ip',
  magic_link_request: 'magic_link_request',
  reset_request: 'reset_request',
  driver_exchange: 'driver_exchange',
  registration_request: 'registration_request',
  registration_ip: 'registration_ip',
} as const;
export type RateLimitBucket = ValueOf<typeof RateLimitBucket>;

/** How an office screen treats an entitlement: shown, hidden, or locked with a hint (PL-02). */
export const EntitlementState = {
  on: 'on',
  off: 'off',
  upsell: 'upsell',
} as const;
export type EntitlementState = ValueOf<typeof EntitlementState>;

/** The control a settings field gets from its manifest schema (TN-02, PL-03). */
export const SettingControl = {
  switch: 'switch',
  select: 'select',
  number: 'number',
  list: 'list',
  url: 'url',
} as const;
export type SettingControl = ValueOf<typeof SettingControl>;

/** The forms of the sign-in page (CR-03). */
export const SignInMode = {
  password: 'password',
  magic: 'magic',
  reset: 'reset',
} as const;
export type SignInMode = ValueOf<typeof SignInMode>;

/** The sign-in forms that email a link. */
export const EmailLinkMode = {
  magic: SignInMode.magic,
  reset: SignInMode.reset,
} as const;
export type EmailLinkMode = ValueOf<typeof EmailLinkMode>;
