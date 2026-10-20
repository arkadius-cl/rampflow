import * as z from 'zod';
import type { ImplementedFeatureKey, PermissionKey } from '../../registry.ts';
import { values } from '../../values/define.ts';
import { Feature, Permission } from '../../values/keys.ts';
import { DriverLocale } from '../../values/locales.ts';
import { AvisInput, plateSchema } from '../avis/avis.ts';
import {
  BookingParty,
  BookingStatus,
  CommandName,
  DockHoldingStatus,
  FinalBookingStatus,
  LinkVia,
  LoadStatus,
  OnSiteStatus,
  Punctuality,
  SiteLock,
  TurnAwayReason,
} from './values.ts';

// The booking lifecycle as data (ADR-0005, docs/reference/booking-lifecycle.md). The API
// enforces it in transitionBooking; the web app reads it to decide which actions to offer.

export {
  BookingParty,
  BookingStatus,
  CommandName,
  DockHoldingStatus,
  FinalBookingStatus,
  LinkVia,
  LoadStatus,
  OnSiteStatus,
  Punctuality,
  TurnAwayReason,
};
export const BOOKING_STATUSES = values(BookingStatus);
export const LOAD_STATUSES = values(LoadStatus);
export const DOCK_HOLDING_STATUSES = values(DockHoldingStatus);
export const ON_SITE_STATUSES = values(OnSiteStatus);
export const FINAL_STATUSES = values(FinalBookingStatus);
export const TURN_AWAY_REASONS = values(TurnAwayReason);
export const PUNCTUALITY = values(Punctuality);
export const LINK_VIA = values(LinkVia);
export const BOOKING_PARTIES = values(BookingParty);

const isoInstant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const reason = z.string().trim().min(1).max(500);

/** Command inputs, keyed by command name. The API parses route bodies into these. */
export const COMMAND_INPUTS = {
  reschedule: z.object({
    startsAt: isoInstant,
    resourceId: z.uuid().optional(),
    version: z.int().min(1),
    /** Staff with `booking.force` only: books over capacity and the daily cap, never when closed. */
    forceReason: reason.optional(),
  }),
  update_avis: z.object({ avis: AvisInput, version: z.int().min(1) }),
  cancel: z.object({ reason: reason.nullable().default(null) }),
  regenerate_driver_link: z.object({}),
  send_driver_link: z.object({ email: z.email().max(254), locale: z.enum(DriverLocale) }),
  mark_no_show: z.object({}),
  check_in: z.object({ plateSeen: plateSchema.nullable().default(null) }),
  turn_away: z.object({ reason: z.enum(TurnAwayReason) }),
  call: z.object({ dockId: z.uuid() }),
  uncall: z.object({}),
  dock: z.object({ dockId: z.uuid().optional() }),
  start_loading: z.object({ dockId: z.uuid().optional() }),
  complete: z.object({
    actualLoadUnits: z.int().min(0).max(1_000_000),
    discrepancyNote: z.string().trim().min(1).max(1000).nullable().default(null),
  }),
  depart: z.object({ reason: reason.nullable().default(null) }),
  link_acknowledgement: z.object({ acknowledgementId: z.uuid(), via: z.enum(LinkVia) }),
} as const satisfies Record<CommandName, z.ZodType>;

export const COMMAND_NAMES = values(CommandName);

/** `z.object({})` infers `Record<string, never>`, which no `{ type }` intersection satisfies. */
type Fields<T> = string extends keyof T ? unknown : T;

/** A parsed command: `{ type: 'call', dockId }`. */
export type BookingCommand = {
  [K in CommandName]: { type: K } & Fields<z.output<(typeof COMMAND_INPUTS)[K]>>;
}[CommandName];
export type CommandOf<K extends CommandName> = Extract<BookingCommand, { type: K }>;
/** What a caller passes: defaults may be omitted. */
export type CommandInput = {
  [K in CommandName]: { type: K } & Fields<z.input<(typeof COMMAND_INPUTS)[K]>>;
}[CommandName];

export interface CommandActor {
  /** `null`: no permission beyond the party (the system job, the driver's own booking). */
  permission: PermissionKey | null;
  /** Narrows the command's source states for this party. */
  from?: readonly BookingStatus[];
  /** The carrier acts only before `starts_at - booking.cancel_cutoff_minutes` (BK-05). */
  beforeCutoff?: boolean;
  /** The carrier needs an active tenant link (TN-03); cancel works without one. */
  activeLink?: boolean;
}

export interface CommandDef {
  from: readonly BookingStatus[];
  /** `null`: the status stays as it is. */
  to: BookingStatus | null;
  actors: Partial<Record<BookingParty, CommandActor>>;
  /** A tenant feature beyond the actor's permission. */
  entitlement?: ImplementedFeatureKey;
  /** Takes `lockSiteCapacity` before reading load (ADR-0004). */
  siteLock: SiteLock;
}

const ACTIVE = values(LoadStatus);
const carrierBook: CommandActor = {
  permission: Permission.booking.book,
  beforeCutoff: true,
  activeLink: true,
};
const staffBook: CommandActor = { permission: Permission.booking.staff_book };

/** The command table of docs/reference/booking-lifecycle.md. */
export const COMMANDS = {
  reschedule: {
    from: [BookingStatus.confirmed],
    to: null,
    actors: { carrier: carrierBook, staff: staffBook },
    siteLock: SiteLock.always,
  },
  update_avis: {
    from: [
      BookingStatus.confirmed,
      BookingStatus.checked_in,
      BookingStatus.called,
      BookingStatus.at_dock,
      BookingStatus.loading,
      BookingStatus.done,
    ],
    to: null,
    actors: { carrier: { ...carrierBook, from: [BookingStatus.confirmed] }, staff: staffBook },
    siteLock: SiteLock.when_duration_changes,
  },
  cancel: {
    from: [BookingStatus.confirmed],
    to: BookingStatus.cancelled,
    actors: { carrier: { ...carrierBook, activeLink: false }, staff: staffBook },
    siteLock: SiteLock.never,
  },
  regenerate_driver_link: {
    from: ACTIVE,
    to: null,
    actors: { carrier: { permission: Permission.booking.book }, staff: staffBook },
    siteLock: SiteLock.never,
  },
  send_driver_link: {
    from: ACTIVE,
    to: null,
    actors: { carrier: { permission: Permission.booking.book }, staff: staffBook },
    siteLock: SiteLock.never,
  },
  mark_no_show: {
    from: [BookingStatus.confirmed],
    to: BookingStatus.no_show,
    actors: { system: { permission: null } },
    siteLock: SiteLock.never,
  },
  check_in: {
    from: [BookingStatus.confirmed, BookingStatus.no_show],
    to: BookingStatus.checked_in,
    actors: { staff: { permission: Permission.yard.gate } },
    siteLock: SiteLock.never,
  },
  turn_away: {
    from: [BookingStatus.confirmed, BookingStatus.no_show, BookingStatus.checked_in],
    to: BookingStatus.turned_away,
    actors: { staff: { permission: Permission.yard.gate } },
    siteLock: SiteLock.never,
  },
  call: {
    from: [BookingStatus.checked_in, BookingStatus.called],
    to: BookingStatus.called,
    actors: { staff: { permission: Permission.yard.call } },
    entitlement: Feature.yard.call_to_dock,
    siteLock: SiteLock.never,
  },
  uncall: {
    from: [BookingStatus.called],
    to: BookingStatus.checked_in,
    actors: { staff: { permission: Permission.yard.call } },
    entitlement: Feature.yard.call_to_dock,
    siteLock: SiteLock.never,
  },
  dock: {
    from: [BookingStatus.checked_in, BookingStatus.called],
    to: BookingStatus.at_dock,
    actors: { staff: { permission: Permission.yard.dock } },
    entitlement: Feature.yard.call_to_dock,
    siteLock: SiteLock.never,
  },
  start_loading: {
    from: [BookingStatus.checked_in, BookingStatus.called, BookingStatus.at_dock],
    to: BookingStatus.loading,
    actors: { staff: { permission: Permission.yard.dock } },
    entitlement: Feature.yard.call_to_dock,
    siteLock: SiteLock.never,
  },
  complete: {
    from: [BookingStatus.called, BookingStatus.at_dock, BookingStatus.loading],
    to: BookingStatus.done,
    actors: { staff: { permission: Permission.yard.dock } },
    entitlement: Feature.yard.call_to_dock,
    siteLock: SiteLock.never,
  },
  depart: {
    from: [
      BookingStatus.checked_in,
      BookingStatus.called,
      BookingStatus.at_dock,
      BookingStatus.loading,
      BookingStatus.done,
    ],
    to: BookingStatus.departed,
    actors: { staff: { permission: Permission.yard.gate } },
    siteLock: SiteLock.never,
  },
  link_acknowledgement: {
    from: [BookingStatus.confirmed, BookingStatus.no_show, BookingStatus.checked_in],
    to: null,
    actors: { staff: { permission: Permission.yard.gate }, driver: { permission: null } },
    siteLock: SiteLock.never,
  },
} as const satisfies Record<CommandName, CommandDef>;

/** Source states of `command` for `party`. */
export function sourceStates(command: CommandName, party: BookingParty): readonly BookingStatus[] {
  const def: CommandDef = COMMANDS[command];
  return def.actors[party]?.from ?? def.from;
}

/**
 * Commands a party may offer for a booking in `status`, for buttons in the UI. The API still
 * decides: guards such as the cutoff, the safety check or a free dock are not evaluated here.
 */
export function availableCommands(
  status: BookingStatus,
  party: BookingParty,
  can: (permission: PermissionKey) => boolean,
): CommandName[] {
  return values(CommandName).filter((name) => {
    const actor: CommandActor | undefined = (COMMANDS[name] as CommandDef).actors[party];
    if (!actor || (actor.permission !== null && !can(actor.permission))) return false;
    return sourceStates(name, party).includes(status);
  });
}

/** Punctuality of a check-in `minutes` after `starts_at` (booking lifecycle, "Punctuality"). */
export function punctualityOf(
  minutes: number,
  earlyToleranceMinutes: number,
  graceMinutes: number,
): Punctuality {
  if (minutes < -earlyToleranceMinutes) return Punctuality.early;
  if (minutes > graceMinutes) return Punctuality.late;
  return Punctuality.on_time;
}
