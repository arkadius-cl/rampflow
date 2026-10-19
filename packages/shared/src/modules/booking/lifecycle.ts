import * as z from 'zod';
import { DRIVER_LOCALES } from '../../locales.ts';
import type { ImplementedFeatureKey, PermissionKey } from '../../registry.ts';
import { AvisInput, plateSchema } from '../avis/avis.ts';

// The booking lifecycle as data (ADR-0005, docs/reference/booking-lifecycle.md). The API
// enforces it in transitionBooking; the web app reads it to decide which actions to offer.

export const BOOKING_STATUSES = [
  'requested',
  'confirmed',
  'checked_in',
  'called',
  'at_dock',
  'loading',
  'done',
  'departed',
  'cancelled',
  'no_show',
  'turned_away',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that count against capacity. */
export const LOAD_STATUSES = [
  'confirmed',
  'checked_in',
  'called',
  'at_dock',
  'loading',
  'done',
] as const satisfies readonly BookingStatus[];
/** Statuses that hold a dock (index `booking_dock_occupied`). */
export const DOCK_HOLDING_STATUSES = [
  'called',
  'at_dock',
  'loading',
] as const satisfies readonly BookingStatus[];
/** A truck is on site in these: the yard sees it, departure is possible. */
export const ON_SITE_STATUSES = [
  'checked_in',
  'called',
  'at_dock',
  'loading',
  'done',
] as const satisfies readonly BookingStatus[];

/** Final statuses (docs/reference/booking-lifecycle.md): the visit is over or never happens. */
export const FINAL_STATUSES = [
  'departed',
  'cancelled',
  'no_show',
  'turned_away',
] as const satisfies readonly BookingStatus[];

export const TURN_AWAY_REASONS = [
  'safety_not_completed',
  'no_capacity',
  'too_late',
  'documents_missing',
  'wrong_load',
  'damaged',
  'other',
] as const;
export type TurnAwayReason = (typeof TURN_AWAY_REASONS)[number];

export const PUNCTUALITY = ['early', 'on_time', 'late'] as const;
export type Punctuality = (typeof PUNCTUALITY)[number];

export const LINK_VIA = ['completed', 'pass', 'gate_lookup'] as const;
export type LinkVia = (typeof LINK_VIA)[number];

/** Who issues a command. `staff` acts under the tenant party, `carrier` under carrier_at_tenant. */
export const BOOKING_PARTIES = ['carrier', 'staff', 'driver', 'system'] as const;
export type BookingParty = (typeof BOOKING_PARTIES)[number];

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
  send_driver_link: z.object({ email: z.email().max(254), locale: z.enum(DRIVER_LOCALES) }),
  mark_no_show: z.object({}),
  check_in: z.object({ plateSeen: plateSchema.nullable().default(null) }),
  turn_away: z.object({ reason: z.enum(TURN_AWAY_REASONS) }),
  call: z.object({ dockId: z.uuid() }),
  uncall: z.object({}),
  dock: z.object({ dockId: z.uuid().optional() }),
  start_loading: z.object({ dockId: z.uuid().optional() }),
  complete: z.object({
    actualLoadUnits: z.int().min(0).max(1_000_000),
    discrepancyNote: z.string().trim().min(1).max(1000).nullable().default(null),
  }),
  depart: z.object({ reason: reason.nullable().default(null) }),
  link_acknowledgement: z.object({ acknowledgementId: z.uuid(), via: z.enum(LINK_VIA) }),
} as const;

export type CommandName = keyof typeof COMMAND_INPUTS;
export const COMMAND_NAMES = Object.keys(COMMAND_INPUTS) as CommandName[];

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
  siteLock: 'always' | 'when_duration_changes' | 'never';
}

const ACTIVE = LOAD_STATUSES;
const carrierBook: CommandActor = {
  permission: 'booking.book',
  beforeCutoff: true,
  activeLink: true,
};
const staffBook: CommandActor = { permission: 'booking.staff_book' };

/** The command table of docs/reference/booking-lifecycle.md. */
export const COMMANDS = {
  reschedule: {
    from: ['confirmed'],
    to: null,
    actors: { carrier: carrierBook, staff: staffBook },
    siteLock: 'always',
  },
  update_avis: {
    from: ['confirmed', 'checked_in', 'called', 'at_dock', 'loading', 'done'],
    to: null,
    actors: { carrier: { ...carrierBook, from: ['confirmed'] }, staff: staffBook },
    siteLock: 'when_duration_changes',
  },
  cancel: {
    from: ['confirmed'],
    to: 'cancelled',
    actors: { carrier: { ...carrierBook, activeLink: false }, staff: staffBook },
    siteLock: 'never',
  },
  regenerate_driver_link: {
    from: ACTIVE,
    to: null,
    actors: { carrier: { permission: 'booking.book' }, staff: staffBook },
    siteLock: 'never',
  },
  send_driver_link: {
    from: ACTIVE,
    to: null,
    actors: { carrier: { permission: 'booking.book' }, staff: staffBook },
    siteLock: 'never',
  },
  mark_no_show: {
    from: ['confirmed'],
    to: 'no_show',
    actors: { system: { permission: null } },
    siteLock: 'never',
  },
  check_in: {
    from: ['confirmed', 'no_show'],
    to: 'checked_in',
    actors: { staff: { permission: 'yard.gate' } },
    siteLock: 'never',
  },
  turn_away: {
    from: ['confirmed', 'no_show', 'checked_in'],
    to: 'turned_away',
    actors: { staff: { permission: 'yard.gate' } },
    siteLock: 'never',
  },
  call: {
    from: ['checked_in', 'called'],
    to: 'called',
    actors: { staff: { permission: 'yard.call' } },
    entitlement: 'yard.call_to_dock',
    siteLock: 'never',
  },
  uncall: {
    from: ['called'],
    to: 'checked_in',
    actors: { staff: { permission: 'yard.call' } },
    entitlement: 'yard.call_to_dock',
    siteLock: 'never',
  },
  dock: {
    from: ['checked_in', 'called'],
    to: 'at_dock',
    actors: { staff: { permission: 'yard.dock' } },
    entitlement: 'yard.call_to_dock',
    siteLock: 'never',
  },
  start_loading: {
    from: ['checked_in', 'called', 'at_dock'],
    to: 'loading',
    actors: { staff: { permission: 'yard.dock' } },
    entitlement: 'yard.call_to_dock',
    siteLock: 'never',
  },
  complete: {
    from: ['called', 'at_dock', 'loading'],
    to: 'done',
    actors: { staff: { permission: 'yard.dock' } },
    entitlement: 'yard.call_to_dock',
    siteLock: 'never',
  },
  depart: {
    from: ['checked_in', 'called', 'at_dock', 'loading', 'done'],
    to: 'departed',
    actors: { staff: { permission: 'yard.gate' } },
    siteLock: 'never',
  },
  link_acknowledgement: {
    from: ['confirmed', 'no_show', 'checked_in'],
    to: null,
    actors: { staff: { permission: 'yard.gate' }, driver: { permission: null } },
    siteLock: 'never',
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
  return COMMAND_NAMES.filter((name) => {
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
  if (minutes < -earlyToleranceMinutes) return 'early';
  if (minutes > graceMinutes) return 'late';
  return 'on_time';
}
