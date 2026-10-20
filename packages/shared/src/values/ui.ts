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
