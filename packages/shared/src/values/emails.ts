import type { ValueOf } from './define.ts';

/**
 * Every email template id `<module>.<name>`, one per `apps/api/src/modules/<module>/emails/<name>.tsx`.
 * Each file adds its payload type to the API's `EmailTemplates` interface under this id.
 */
export const EmailTemplate = {
  core_invitation: 'core.invitation',
  core_magic_link: 'core.magic-link',
  core_password_reset: 'core.password-reset',
  core_signup_known_account: 'core.signup-known-account',
  core_signup_verify: 'core.signup-verify',
  core_tenant_suspended: 'core.tenant-suspended',
  core_tenant_reactivated: 'core.tenant-reactivated',
  booking_cancelled: 'booking.cancelled',
  booking_carrier_invitation: 'booking.carrier-invitation',
  booking_changed: 'booking.changed',
  booking_confirmed: 'booking.confirmed',
  booking_no_show: 'booking.no-show',
  booking_registration_approved: 'booking.registration-approved',
  booking_registration_rejected: 'booking.registration-rejected',
  booking_registration_verify: 'booking.registration-verify',
  booking_reminder: 'booking.reminder',
  driver_link: 'driver.link',
  privacy_inactive_notice: 'privacy.inactive-notice',
} as const;
export type EmailTemplate = ValueOf<typeof EmailTemplate>;

/** `account` emails always send; `booking` emails send only while `notify.email` is on. */
export const EmailCategory = {
  account: 'account',
  booking: 'booking',
} as const;
export type EmailCategory = ValueOf<typeof EmailCategory>;

/** What `enqueue` did: wrote an outbox row, found one with the same dedupe key, or sent nothing. */
export const EnqueueResult = {
  enqueued: 'enqueued',
  duplicate: 'duplicate',
  skipped: 'skipped',
} as const;
export type EnqueueResult = ValueOf<typeof EnqueueResult>;
