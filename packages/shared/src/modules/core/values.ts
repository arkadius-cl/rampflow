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
  /** A long list: the chosen members as chips, the others found by search and added. */
  picker: 'picker',
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

/**
 * The countries a site may lie in (MD-01, MD-05): Europe by the UN geoscheme, plus Cyprus, Turkey
 * and the South Caucasus.
 * `holiday-import.test.ts` checks that the holiday calendar covers each.
 */
export const SiteCountry = {
  AD: 'AD',
  AL: 'AL',
  AM: 'AM',
  AT: 'AT',
  AX: 'AX',
  AZ: 'AZ',
  BA: 'BA',
  BE: 'BE',
  BG: 'BG',
  BY: 'BY',
  CH: 'CH',
  CY: 'CY',
  CZ: 'CZ',
  DE: 'DE',
  DK: 'DK',
  EE: 'EE',
  ES: 'ES',
  FI: 'FI',
  FO: 'FO',
  FR: 'FR',
  GB: 'GB',
  GE: 'GE',
  GG: 'GG',
  GI: 'GI',
  GR: 'GR',
  HR: 'HR',
  HU: 'HU',
  IE: 'IE',
  IM: 'IM',
  IS: 'IS',
  IT: 'IT',
  JE: 'JE',
  LI: 'LI',
  LT: 'LT',
  LU: 'LU',
  LV: 'LV',
  MC: 'MC',
  MD: 'MD',
  ME: 'ME',
  MK: 'MK',
  MT: 'MT',
  NL: 'NL',
  NO: 'NO',
  PL: 'PL',
  PT: 'PT',
  RO: 'RO',
  RS: 'RS',
  RU: 'RU',
  SE: 'SE',
  SI: 'SI',
  SJ: 'SJ',
  SK: 'SK',
  SM: 'SM',
  TR: 'TR',
  UA: 'UA',
  VA: 'VA',
  XK: 'XK',
} as const;
export type SiteCountry = ValueOf<typeof SiteCountry>;

/** The 27 EU member states, the countries a company may register from (RG-01). */
export const EuCountry = {
  AT: SiteCountry.AT,
  BE: SiteCountry.BE,
  BG: SiteCountry.BG,
  CY: SiteCountry.CY,
  CZ: SiteCountry.CZ,
  DE: SiteCountry.DE,
  DK: SiteCountry.DK,
  EE: SiteCountry.EE,
  ES: SiteCountry.ES,
  FI: SiteCountry.FI,
  FR: SiteCountry.FR,
  GR: SiteCountry.GR,
  HR: SiteCountry.HR,
  HU: SiteCountry.HU,
  IE: SiteCountry.IE,
  IT: SiteCountry.IT,
  LT: SiteCountry.LT,
  LU: SiteCountry.LU,
  LV: SiteCountry.LV,
  MT: SiteCountry.MT,
  NL: SiteCountry.NL,
  PL: SiteCountry.PL,
  PT: SiteCountry.PT,
  RO: SiteCountry.RO,
  SE: SiteCountry.SE,
  SI: SiteCountry.SI,
  SK: SiteCountry.SK,
} as const;
export type EuCountry = ValueOf<typeof EuCountry>;

/** The groups of the admitted-countries editor (PL-03): EU member states and the rest. */
export const CountryGroup = {
  eu: 'eu',
  other: 'other',
} as const;
export type CountryGroup = ValueOf<typeof CountryGroup>;

const EU_COUNTRIES: ReadonlySet<SiteCountry> = new Set(Object.values(EuCountry));

export const countryGroupOf = (code: SiteCountry): CountryGroup =>
  EU_COUNTRIES.has(code) ? CountryGroup.eu : CountryGroup.other;

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

/**
 * Error codes of the VIES REST API (`errorWrappers[].error`). `INVALID_INPUT` means the number
 * is malformed for its state; every other code, and any code VIES adds later, means no answer.
 */
export const ViesError = {
  INVALID_INPUT: 'INVALID_INPUT',
  MS_UNAVAILABLE: 'MS_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  MS_MAX_CONCURRENT_REQ: 'MS_MAX_CONCURRENT_REQ',
  GLOBAL_MAX_CONCURRENT_REQ: 'GLOBAL_MAX_CONCURRENT_REQ',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
export type ViesError = ValueOf<typeof ViesError>;

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

/** ALTCHA 3 widget states (its State enum is declared in types but has no runtime export). */
export const AltchaState = {
  code: 'code',
  error: 'error',
  verified: 'verified',
  verifying: 'verifying',
  unverified: 'unverified',
  expired: 'expired',
} as const;
export type AltchaState = ValueOf<typeof AltchaState>;

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

/** The opening hours a new site starts from (MD-01); `custom` means rows the admin entered. */
export const HoursTemplate = {
  one_shift: 'one_shift',
  two_shifts: 'two_shifts',
  custom: 'custom',
} as const;
export type HoursTemplate = ValueOf<typeof HoursTemplate>;

/** The templates with fixed rows, `hoursTemplateRows` in `api.sites.ts`. */
export const PresetHoursTemplate = {
  one_shift: HoursTemplate.one_shift,
  two_shifts: HoursTemplate.two_shifts,
} as const;
export type PresetHoursTemplate = ValueOf<typeof PresetHoursTemplate>;

/** The checklist steps of a tenant in onboarding, in order (ON-01). */
export const OnboardingStep = {
  site: 'site',
  hall: 'hall',
  dock: 'dock',
} as const;
export type OnboardingStep = ValueOf<typeof OnboardingStep>;

/** What a route case expects from a tenant in onboarding (ON-03): the route answers 409. */
export const OnboardingCase = {
  blocked: 'blocked',
} as const;
export type OnboardingCase = ValueOf<typeof OnboardingCase>;
