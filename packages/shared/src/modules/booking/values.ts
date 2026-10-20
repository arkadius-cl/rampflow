import type { ValueOf } from '../../values/define.ts';
import { ConflictReason } from '../../values/errors.ts';

// The booking lifecycle's value sets (ADR-0005, docs/reference/booking-lifecycle.md).

export const BookingStatus = {
  requested: 'requested',
  confirmed: 'confirmed',
  checked_in: 'checked_in',
  called: 'called',
  at_dock: 'at_dock',
  loading: 'loading',
  done: 'done',
  departed: 'departed',
  cancelled: 'cancelled',
  no_show: 'no_show',
  turned_away: 'turned_away',
} as const;
export type BookingStatus = ValueOf<typeof BookingStatus>;

/** Statuses that count against capacity. */
export const LoadStatus = {
  confirmed: BookingStatus.confirmed,
  checked_in: BookingStatus.checked_in,
  called: BookingStatus.called,
  at_dock: BookingStatus.at_dock,
  loading: BookingStatus.loading,
  done: BookingStatus.done,
} as const;
export type LoadStatus = ValueOf<typeof LoadStatus>;

/** Statuses that hold a dock (index `booking_dock_occupied`). */
export const DockHoldingStatus = {
  called: BookingStatus.called,
  at_dock: BookingStatus.at_dock,
  loading: BookingStatus.loading,
} as const;
export type DockHoldingStatus = ValueOf<typeof DockHoldingStatus>;

/** A truck is on site in these: the yard sees it, departure is possible. */
export const OnSiteStatus = {
  checked_in: BookingStatus.checked_in,
  called: BookingStatus.called,
  at_dock: BookingStatus.at_dock,
  loading: BookingStatus.loading,
  done: BookingStatus.done,
} as const;
export type OnSiteStatus = ValueOf<typeof OnSiteStatus>;

/** Final statuses (docs/reference/booking-lifecycle.md): the visit is over or never happens. */
export const FinalBookingStatus = {
  departed: BookingStatus.departed,
  cancelled: BookingStatus.cancelled,
  no_show: BookingStatus.no_show,
  turned_away: BookingStatus.turned_away,
} as const;
export type FinalBookingStatus = ValueOf<typeof FinalBookingStatus>;

export const TurnAwayReason = {
  safety_not_completed: 'safety_not_completed',
  no_capacity: 'no_capacity',
  too_late: 'too_late',
  documents_missing: 'documents_missing',
  wrong_load: 'wrong_load',
  damaged: 'damaged',
  other: 'other',
} as const;
export type TurnAwayReason = ValueOf<typeof TurnAwayReason>;

export const Punctuality = {
  early: 'early',
  on_time: 'on_time',
  late: 'late',
} as const;
export type Punctuality = ValueOf<typeof Punctuality>;

export const LinkVia = {
  completed: 'completed',
  pass: 'pass',
  gate_lookup: 'gate_lookup',
} as const;
export type LinkVia = ValueOf<typeof LinkVia>;

/** Who issues a command. `staff` acts under the tenant party, `carrier` under carrier_at_tenant. */
export const BookingParty = {
  carrier: 'carrier',
  staff: 'staff',
  driver: 'driver',
  system: 'system',
} as const;
export type BookingParty = ValueOf<typeof BookingParty>;

/** Who created a booking: a carrier through the portal, or staff. */
export const CreatedParty = {
  carrier: BookingParty.carrier,
  staff: BookingParty.staff,
} as const;
export type CreatedParty = ValueOf<typeof CreatedParty>;

/** The party a `booking_event` row records as its actor. */
export const ActorParty = {
  carrier: 'carrier',
  tenant: 'tenant',
  driver: 'driver',
  system: 'system',
} as const;
export type ActorParty = ValueOf<typeof ActorParty>;

export const CarrierLinkStatus = {
  active: 'active',
  deactivated: 'deactivated',
} as const;
export type CarrierLinkStatus = ValueOf<typeof CarrierLinkStatus>;

export const CarrierLinkSource = {
  invitation: 'invitation',
  public_link: 'public_link',
} as const;
export type CarrierLinkSource = ValueOf<typeof CarrierLinkSource>;

export const RegistrationStatus = {
  pending_email: 'pending_email',
  pending_approval: 'pending_approval',
  approved: 'approved',
  rejected: 'rejected',
} as const;
export type RegistrationStatus = ValueOf<typeof RegistrationStatus>;

export const RegistrationMode = {
  auto_approve: 'auto_approve',
  approval_required: 'approval_required',
} as const;
export type RegistrationMode = ValueOf<typeof RegistrationMode>;

/** Countries offered first on the registration form; the API accepts any ISO 3166-1 code. */
export const RegistrationCountry = {
  AT: 'AT',
  BE: 'BE',
  BG: 'BG',
  BY: 'BY',
  CH: 'CH',
  CZ: 'CZ',
  DE: 'DE',
  DK: 'DK',
  EE: 'EE',
  ES: 'ES',
  FI: 'FI',
  FR: 'FR',
  GB: 'GB',
  GR: 'GR',
  HR: 'HR',
  HU: 'HU',
  IE: 'IE',
  IT: 'IT',
  LT: 'LT',
  LU: 'LU',
  LV: 'LV',
  MD: 'MD',
  NL: 'NL',
  NO: 'NO',
  PL: 'PL',
  PT: 'PT',
  RO: 'RO',
  RS: 'RS',
  SE: 'SE',
  SI: 'SI',
  SK: 'SK',
  TR: 'TR',
  UA: 'UA',
} as const;
export type RegistrationCountry = ValueOf<typeof RegistrationCountry>;

export const Direction = {
  inbound: 'inbound',
  outbound: 'outbound',
} as const;
export type Direction = ValueOf<typeof Direction>;

export const ResourceKind = {
  pool: 'pool',
  single: 'single',
} as const;
export type ResourceKind = ValueOf<typeof ResourceKind>;

export const ClosureKind = {
  closed: 'closed',
  blocked: 'blocked',
} as const;
export type ClosureKind = ValueOf<typeof ClosureKind>;

/** Why a booking does not fit the capacity timeline; each is also its 409 reason. */
export const FitFailure = {
  closed: ConflictReason.closed,
  capacity_full: ConflictReason.capacity_full,
  daily_cap_reached: ConflictReason.daily_cap_reached,
} as const;
export type FitFailure = ValueOf<typeof FitFailure>;

export const ClosureSource = {
  manual: 'manual',
  holiday: 'holiday',
} as const;
export type ClosureSource = ValueOf<typeof ClosureSource>;

/** `booking_event.type`; `events.ts` gives each its payload (booking lifecycle, "Events"). */
export const BookingEventType = {
  created: 'created',
  rescheduled: 'rescheduled',
  avis_updated: 'avis_updated',
  cancelled: 'cancelled',
  driver_link_regenerated: 'driver_link_regenerated',
  driver_link_sent: 'driver_link_sent',
  no_show: 'no_show',
  checked_in: 'checked_in',
  turned_away: 'turned_away',
  called: 'called',
  reassigned: 'reassigned',
  uncalled: 'uncalled',
  at_dock: 'at_dock',
  loading_started: 'loading_started',
  done: 'done',
  departed: 'departed',
  safety_linked: 'safety_linked',
} as const;
export type BookingEventType = ValueOf<typeof BookingEventType>;
