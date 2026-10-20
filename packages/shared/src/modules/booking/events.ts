import * as z from 'zod';
import { DRIVER_LOCALES } from '../../locales.ts';
import { BOOKING_STATUSES, LINK_VIA, PUNCTUALITY, TURN_AWAY_REASONS } from './lifecycle.ts';
import { BookingEventType, CreatedParty } from './values.ts';

// `booking_event.data` per event type (booking lifecycle, "Events"). Payloads never hold personal
// data; the avis does. Instants travel as ISO strings, as in every API body.

const instant = z.iso.datetime({ offset: true });
const status = z.enum(BOOKING_STATUSES);
const slot = z.object({ resourceId: z.uuid(), startsAt: instant, endsAt: instant });

export const BookingEventData = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(BookingEventType.created),
    resourceId: z.uuid(),
    startsAt: instant,
    endsAt: instant,
    blocksUntil: instant,
    loadTypeId: z.uuid(),
    loadUnits: z.int(),
    createdParty: z.enum(CreatedParty),
    walkIn: z.boolean(),
    forced: z.boolean(),
    forceReason: z.string().nullable(),
  }),
  z.object({
    type: z.literal(BookingEventType.rescheduled),
    from: slot,
    to: slot,
    forced: z.boolean(),
    forceReason: z.string().nullable(),
  }),
  z.object({
    type: z.literal(BookingEventType.avis_updated),
    fields: z.array(z.string()),
    durationChanged: z.boolean(),
  }),
  z.object({
    type: z.literal(BookingEventType.cancelled),
    reason: z.string().nullable(),
    late: z.boolean(),
  }),
  z.object({ type: z.literal(BookingEventType.driver_link_regenerated) }),
  z.object({ type: z.literal(BookingEventType.driver_link_sent), locale: z.enum(DRIVER_LOCALES) }),
  z.object({ type: z.literal(BookingEventType.no_show), dueAt: instant }),
  z.object({
    type: z.literal(BookingEventType.checked_in),
    punctuality: z.enum(PUNCTUALITY).nullable(),
    punctualityMinutes: z.int().nullable(),
    plateRecorded: z.boolean(),
    safety: z.enum(['valid', 'missing_warned', 'not_required']),
    fromNoShow: z.boolean(),
  }),
  z.object({
    type: z.literal(BookingEventType.turned_away),
    reason: z.enum(TURN_AWAY_REASONS),
    fromStatus: status,
  }),
  z.object({
    type: z.literal(BookingEventType.called),
    dockId: z.uuid(),
    outsideResource: z.boolean(),
  }),
  z.object({
    type: z.literal(BookingEventType.reassigned),
    fromDockId: z.uuid(),
    toDockId: z.uuid(),
    outsideResource: z.boolean(),
  }),
  z.object({ type: z.literal(BookingEventType.uncalled), dockId: z.uuid() }),
  z.object({ type: z.literal(BookingEventType.at_dock), dockId: z.uuid() }),
  z.object({ type: z.literal(BookingEventType.loading_started), dockId: z.uuid() }),
  z.object({
    type: z.literal(BookingEventType.done),
    dockId: z.uuid(),
    actualLoadUnits: z.int(),
    discrepancy: z.boolean(),
  }),
  z.object({
    type: z.literal(BookingEventType.departed),
    fromStatus: status,
    reason: z.string().nullable(),
  }),
  z.object({
    type: z.literal(BookingEventType.safety_linked),
    instructionId: z.uuid(),
    acknowledgementId: z.uuid(),
    via: z.enum(LINK_VIA),
  }),
]);
export type BookingEventData = z.infer<typeof BookingEventData>;

// Each event type has exactly one payload, and every payload is an event type.
true satisfies [BookingEventData['type']] extends [BookingEventType]
  ? [BookingEventType] extends [BookingEventData['type']]
    ? true
    : false
  : false;

/** The stored row splits `type` from `data`. */
export type EventPayload<T extends BookingEventType> = Omit<
  Extract<BookingEventData, { type: T }>,
  'type'
>;
