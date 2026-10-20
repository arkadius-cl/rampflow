import { createHash } from 'node:crypto';
import { STAFF_LOCALES, type StaffLocale } from '@rampflow/shared';
import { ActorParty, BookingParty } from '@rampflow/shared/modules/booking/values';
import { notify } from '@rampflow/shared/modules/notify/manifest';
import { EmailTemplate, Setting } from '@rampflow/shared/values';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { TenantId } from '../../../db/ids.ts';
import type { Scope, Tx } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import type { Clock } from '../../../kernel/clock.ts';
import { forEachTenant, type Job, type JobStats } from '../../../kernel/jobs.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { systemActor } from '../../../kernel/system.ts';
import type { BookingContext } from '../../booking/lifecycle/context.ts';
import { bookingContacts, emailFacts } from '../../booking/lifecycle/notify.ts';
import { booking } from '../../booking/schema.ts';

const JOB = 'reminders';
const HOUR = 3_600_000;
/** The schema maximum of `notify.reminder_hours_before`: no reminder is due earlier. */
const MAX_HOURS = notify.settings['notify.reminder_hours_before'].schema.maxValue ?? 72;

/** When the reminder of a booking is due. */
const reminderDueAt = (startsAt: Date, hoursBefore: number) =>
  new Date(startsAt.getTime() - hoursBefore * HOUR);

/**
 * One reminder per recipient and start (ADR-0010): a reschedule makes a new key, a repeat tick
 * finds the old one. The address enters only as a hash, so the key holds no personal data.
 */
const dedupeKey = (bookingId: string, startsAt: Date, email: string) =>
  `reminder:${bookingId}:${startsAt.toISOString()}:${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)}`;

const staffLocale = (l: string | null): l is StaffLocale =>
  l !== null && (STAFF_LOCALES as readonly string[]).includes(l);

/**
 * BK-07 for one tenant: every `confirmed` booking whose reminder time has come and whose start
 * has not, and that existed before the reminder time, so a booking made inside the window gets
 * its confirmation and no reminder on top. A cancelled booking is no longer `confirmed`.
 */
async function sendReminders(tx: Tx, tenantId: TenantId, clock: Clock): Promise<JobStats> {
  const scope: Scope = {
    party: ActorParty.tenant,
    tenantId,
    siteIds: 'all',
    actor: systemActor(JOB),
  };
  const access = await loadAccess(tx, scope, clock);
  const features = access.entitlements?.features;
  if (!features?.['notify.reminders'] || !features['notify.email']) return { off: 1 };
  const now = clock.now();
  const ctx: BookingContext = {
    tx,
    tenantId,
    actor: { party: BookingParty.system, job: JOB },
    access,
    now,
  };
  const upcoming = await tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.tenantId, tenantId),
        eq(booking.status, 'confirmed'),
        gt(booking.startsAt, now),
        lte(booking.startsAt, new Date(now.getTime() + MAX_HOURS * HOUR)),
      ),
    );
  const stats = { reminded: 0 };
  for (const b of upcoming) {
    const hours = (await access.setting(Setting.notify.reminder_hours_before, b.siteId)).value;
    const dueAt = reminderDueAt(b.startsAt, hours);
    if (now < dueAt || b.createdAt > dueAt) continue;
    const recipients = await bookingContacts(ctx, b);
    if (recipients.length === 0) continue;
    const { defaultLocale, ...facts } = await emailFacts(ctx, b);
    for (const r of recipients) {
      const locale = staffLocale(r.locale) ? r.locale : defaultLocale;
      const result = await enqueueEmail(
        tx,
        {
          template: EmailTemplate.booking_reminder,
          to: r.email,
          locale,
          tenantId,
          payload: { ...facts, locale },
          dedupeKey: dedupeKey(b.id, b.startsAt, r.email),
        },
        access.entitlements,
      );
      if (result === 'enqueued') stats.reminded++;
    }
  }
  return stats;
}

export const job: Job = {
  name: JOB,
  everySeconds: 300,
  run: (ctx) => forEachTenant(ctx, JOB, (tx, tenantId) => sendReminders(tx, tenantId, ctx.clock)),
};
