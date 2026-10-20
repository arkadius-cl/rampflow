import type { ValueOf } from './define.ts';

/** Every `job` export under `apps/api/src/modules/<module>/jobs/<name>.ts` (ADR-0010). */
export const JobName = {
  outbox: 'outbox',
  reminders: 'reminders',
  no_show: 'no_show',
  retention: 'retention',
  booking_holiday_import: 'booking.holiday_import',
} as const;
export type JobName = ValueOf<typeof JobName>;

/**
 * Who acts when the system opens a scope: a job, or a service step that reads or writes beyond
 * the caller's party (a token redemption, entitlement loading). Stored as `booking_event.actor_job`.
 */
export const SystemActorName = {
  ...JobName,
  access: 'access',
  capacity: 'capacity',
  usage: 'usage',
  invitation: 'invitation',
  carrier_invitation: 'carrier_invitation',
  registration: 'registration',
  signup: 'signup',
  safety_pass: 'safety_pass',
  booking_carrier_names: 'booking_carrier_names',
  avis_unique_references: 'avis_unique_references',
} as const;
export type SystemActorName = ValueOf<typeof SystemActorName>;
