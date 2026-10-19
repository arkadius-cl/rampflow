import { STAFF_LOCALES, type StaffLocale } from '@rampflow/shared';
import { and, eq } from 'drizzle-orm';
import type { CarrierId, UserId } from '../../../db/ids.ts';
import { type EmailTemplates, enqueueEmail, type TemplateId } from '../../../kernel/outbox.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { site } from '../../core/schema.ts';
import { loadType } from '../schema.resources.ts';
import type { booking } from '../schema.ts';
import { actorUserId, type BookingContext } from './context.ts';
import { carrierAdmins, type Recipient } from './elevated.ts';
import type { BookingEmailPayload } from './email-parts.tsx';

export type BookingRow = typeof booking.$inferSelect;

/**
 * The booking contact (booking lifecycle, "Actors"): the carrier user who created the booking;
 * for a staff booking of a linked carrier, every `carrier_admin` of it; nobody for free text.
 */
export async function bookingContacts(ctx: BookingContext, b: BookingRow): Promise<Recipient[]> {
  if (b.createdParty === 'carrier' && b.createdBy) {
    const user = (await userDisplay(ctx.tx, [b.createdBy])).get(b.createdBy);
    return user ? [{ email: user.email, locale: user.locale }] : [];
  }
  if (b.carrierId) {
    const asUser = actorUserId(ctx.actor) ?? b.createdBy;
    if (!asUser) return [];
    return carrierAdmins(ctx.tx, b.carrierId as CarrierId, asUser as UserId);
  }
  return [];
}

const staffLocale = (l: string | null): l is StaffLocale =>
  l !== null && (STAFF_LOCALES as readonly string[]).includes(l);

/** Display data of a booking email; everything but the recipient's locale. */
export async function emailFacts(
  ctx: BookingContext,
  b: BookingRow,
): Promise<Omit<BookingEmailPayload, 'locale'> & { defaultLocale: StaffLocale }> {
  const [s] = await ctx.tx
    .select()
    .from(site)
    .where(and(eq(site.id, b.siteId), eq(site.tenantId, b.tenantId)));
  const [lt] = await ctx.tx
    .select({ name: loadType.name })
    .from(loadType)
    .where(and(eq(loadType.id, b.loadTypeId), eq(loadType.tenantId, b.tenantId)));
  if (!s || !lt) throw new Error(`booking ${b.id} without site or load type`);
  return {
    defaultLocale: s.defaultLocale,
    bookingId: b.id,
    code: b.code,
    site: {
      name: s.name,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      postalCode: s.postalCode,
      city: s.city,
      country: s.country,
      phone: s.phone,
    },
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    timeZone: b.siteTimeZone,
    loadTypeName: lt.name as BookingEmailPayload['loadTypeName'],
    carrierName: b.carrierName,
  };
}

type BookingTemplate = Extract<
  TemplateId,
  'booking.confirmed' | 'booking.changed' | 'booking.cancelled'
>;

/** Enqueues `template` to every booking contact in their language, in the caller's transaction. */
export async function emailContacts<K extends BookingTemplate>(
  ctx: BookingContext,
  b: BookingRow,
  template: K,
  extra: Omit<EmailTemplates[K], keyof BookingEmailPayload>,
): Promise<void> {
  const recipients = await bookingContacts(ctx, b);
  if (recipients.length === 0) return;
  const { defaultLocale, ...facts } = await emailFacts(ctx, b);
  for (const r of recipients) {
    const locale = staffLocale(r.locale) ? r.locale : defaultLocale;
    await enqueueEmail(
      ctx.tx,
      {
        template,
        to: r.email,
        locale,
        tenantId: b.tenantId,
        payload: { ...facts, locale, ...extra } as EmailTemplates[K],
      },
      ctx.access.entitlements,
    );
  }
}
