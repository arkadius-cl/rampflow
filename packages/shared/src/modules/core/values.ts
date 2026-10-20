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

/** The columns the platform tenant list sorts by (PL-04). */
export const TenantSortKey = {
  name: 'name',
  createdAt: 'createdAt',
} as const;
export type TenantSortKey = ValueOf<typeof TenantSortKey>;

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
  signup_request: 'signup_request',
  signup_ip: 'signup_ip',
  altcha_solution: 'altcha_solution',
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

/** The sign-in and account form fields whose errors have a message of their own. */
export const CredentialField = {
  email: 'email',
  password: 'password',
} as const;
export type CredentialField = ValueOf<typeof CredentialField>;

/** The message codes the web's own refinements set; the UI translates them. */
export const RefinementMessage = {
  password_match: 'password_match',
} as const;
export type RefinementMessage = ValueOf<typeof RefinementMessage>;

/** The 27 EU member states, the countries a company may register from (RG-01). */
export const EuCountry = {
  AT: 'AT',
  BE: 'BE',
  BG: 'BG',
  CY: 'CY',
  CZ: 'CZ',
  DE: 'DE',
  DK: 'DK',
  EE: 'EE',
  ES: 'ES',
  FI: 'FI',
  FR: 'FR',
  GR: 'GR',
  HR: 'HR',
  HU: 'HU',
  IE: 'IE',
  IT: 'IT',
  LT: 'LT',
  LU: 'LU',
  LV: 'LV',
  MT: 'MT',
  NL: 'NL',
  PL: 'PL',
  PT: 'PT',
  RO: 'RO',
  SE: 'SE',
  SI: 'SI',
  SK: 'SK',
} as const;
export type EuCountry = ValueOf<typeof EuCountry>;

/** `org.tax_id_type`: an EU VAT number, a German tax number or W-IdNr, a Polish NIP (RG-05). */
export const TaxIdType = {
  eu_vat: 'eu_vat',
  de_stn: 'de_stn',
  pl_nip: 'pl_nip',
} as const;
export type TaxIdType = ValueOf<typeof TaxIdType>;

/** `org.tax_id_status`: `pending` until the VIES job checked an `eu_vat`. */
export const TaxIdStatus = {
  pending: 'pending',
  verified: 'verified',
  unverified: 'unverified',
  unavailable: 'unavailable',
} as const;
export type TaxIdStatus = ValueOf<typeof TaxIdStatus>;

/** What the synchronous tax id check found; every member but `ok` is a 422 issue code. */
export const TaxIdCheck = {
  ok: 'ok',
  tax_id_format: 'tax_id_format',
  tax_id_checksum: 'tax_id_checksum',
  tax_id_country: 'tax_id_country',
} as const;
export type TaxIdCheck = ValueOf<typeof TaxIdCheck>;

/** The 422 issue codes of a registration beyond zod's own. */
export const SignupIssue = {
  disposable_email: 'disposable_email',
  altcha_failed: 'altcha_failed',
  tax_id_format: TaxIdCheck.tax_id_format,
  tax_id_checksum: TaxIdCheck.tax_id_checksum,
  tax_id_country: TaxIdCheck.tax_id_country,
} as const;
export type SignupIssue = ValueOf<typeof SignupIssue>;

/** Derived from `org.activated_at`, never stored (tenant-lifecycle). */
export const TenantStatus = {
  onboarding: 'onboarding',
  active: 'active',
} as const;
export type TenantStatus = ValueOf<typeof TenantStatus>;

/** `app_user.salutation`: optional, used only to greet in emails (person-names). */
export const Salutation = {
  mr: 'mr',
  ms: 'ms',
} as const;
export type Salutation = ValueOf<typeof Salutation>;

/** `tenant_signup.status`: waiting for the email link, used, or replaced by a newer one. */
export const SignupStatus = {
  pending_email: 'pending_email',
  verified: 'verified',
  superseded: 'superseded',
} as const;
export type SignupStatus = ValueOf<typeof SignupStatus>;
