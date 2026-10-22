import type { ValueOf } from './define.ts';
import { HtmlInputType } from './dom.ts';

// Value sets of the web app and the driver PWA that no single module owns.

/** The tone of a status badge. It only reinforces the icon and label, never replaces them. */
export const BadgeTone = {
  planned: 'planned',
  onsite: 'onsite',
  active: 'active',
  success: 'success',
  danger: 'danger',
  neutral: 'neutral',
} as const;
export type BadgeTone = ValueOf<typeof BadgeTone>;

/** Status badge sizes. `xl` is the 44 px touch size of the gate, dock and driver screens. */
export const BadgeSize = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
} as const;
export type BadgeSize = ValueOf<typeof BadgeSize>;

/** The driver PWA shows only the touch-sized badges. */
export const DriverBadgeSize = {
  lg: BadgeSize.lg,
  xl: BadgeSize.xl,
} as const;
export type DriverBadgeSize = ValueOf<typeof DriverBadgeSize>;

/** A step in a wizard's progress indicator. */
export const StepState = {
  done: 'done',
  current: 'current',
  todo: 'todo',
} as const;
export type StepState = ValueOf<typeof StepState>;

/** Whether a dialog creates a record or edits an existing one. */
export const EditMode = {
  create: 'create',
  edit: 'edit',
} as const;
export type EditMode = ValueOf<typeof EditMode>;

/** Which validation messages a form field gets: text says "required", a number "too small". */
export const InputKind = {
  text: HtmlInputType.text,
  number: HtmlInputType.number,
} as const;
export type InputKind = ValueOf<typeof InputKind>;

/** The device a screen is designed for, or a test browser emulates. */
export const DeviceClass = {
  desktop: 'desktop',
  tablet: 'tablet',
  phone: 'phone',
} as const;
export type DeviceClass = ValueOf<typeof DeviceClass>;

/**
 * The density of a screen, set as `data-density` on the root element (yrd design system). The
 * office is the absence of the attribute: tenant, carrier and platform screens on a desktop.
 * `halle` is the gate, dock and wallboard tablet (touch with gloves), `fahrer` the driver's phone.
 */
export const Density = {
  halle: 'halle',
  fahrer: 'fahrer',
} as const;
export type Density = ValueOf<typeof Density>;

/** The appearance a user or device chose: light, dark, or whatever the OS prefers. */
export const Theme = {
  light: 'light',
  dark: 'dark',
  system: 'system',
} as const;
export type Theme = ValueOf<typeof Theme>;

/** What `system` resolves to: the class `dark` on `<html>`, or none. */
export const ResolvedTheme = {
  light: Theme.light,
  dark: Theme.dark,
} as const;
export type ResolvedTheme = ValueOf<typeof ResolvedTheme>;

/** The keys of app_user.ui_prefs (ADR-0014), named `<area>.<screen>.<what>`. */
export const UiPref = {
  app_theme: 'app.theme',
  platform_packages_open_modules: 'platform.packages.openModules',
  platform_tenant_open_modules: 'platform.tenant.openModules',
} as const;
export type UiPref = ValueOf<typeof UiPref>;

/** Where a theme choice is kept: the account (office), or this device (station tablet, driver phone). */
export const ThemeSurface = {
  office: 'office',
  station: 'station',
  driver: 'driver',
} as const;
export type ThemeSurface = ValueOf<typeof ThemeSurface>;

/** The frame a tenant route renders in: the office shell, or the tablet station layout. */
export const ShellLayout = {
  office: 'office',
  station: 'station',
} as const;
export type ShellLayout = ValueOf<typeof ShellLayout>;

/** A yes or no choice in a form; the form adds `''` for "not answered". */
export const YesNo = {
  yes: 'yes',
  no: 'no',
} as const;
export type YesNo = ValueOf<typeof YesNo>;

/** The screens of the design prototype (`/design`) that its navigation marks as active. */
export const PrototypeScreen = {
  board: 'board',
  master_data: 'master-data',
  settings: 'settings',
  bookings: 'bookings',
  wizard: 'wizard',
  tenants: 'tenants',
} as const;
export type PrototypeScreen = ValueOf<typeof PrototypeScreen>;

/** The fixed widths of a form sheet (design system, "Forms"): 384, 480 (default), 640, 896 px. */
export const SheetSize = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
} as const;
export type SheetSize = ValueOf<typeof SheetSize>;

/**
 * The group of a row action in a data table's "…" menu (design system, "Row actions"): the
 * standard actions first, then the others after a separator, the destructive ones last.
 */
export const RowActionKind = {
  view: 'view',
  edit: 'edit',
  duplicate: 'duplicate',
  other: 'other',
  destructive: 'destructive',
} as const;
export type RowActionKind = ValueOf<typeof RowActionKind>;
