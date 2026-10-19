import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type OwnerDb, ownerDb } from '../../../test/db.ts';
import type { WorldSide } from '../../../test/world.ts';
import type { BookingId } from '../../db/ids.ts';
import { avis } from '../avis/schema.ts';
import type { BriefingFixture } from '../safety/authoring/fixtures.ts';
import { safetyAcknowledgement } from '../safety/schema.ts';

// Personal data for the privacy tests (TN-06, PL-05), written as the owner.

export const setAvis = (bookingId: BookingId, patch: Partial<typeof avis.$inferInsert>) =>
  ownerDb().update(avis).set(patch).where(eq(avis.bookingId, bookingId));

export const avisOf = async (bookingId: BookingId) => {
  const [row] = await ownerDb().select().from(avis).where(eq(avis.bookingId, bookingId));
  if (!row) throw new Error(`no avis for ${bookingId}`);
  return row;
};

export async function seedAcknowledgement(
  side: WorldSide,
  briefing: BriefingFixture,
  o: {
    driverName: string;
    completedAt: Date;
    expiresAt: Date | null;
    bookingId?: BookingId | null;
    restrictedAt?: Date | null;
  },
  db: OwnerDb = ownerDb(),
) {
  const [row] = await db
    .insert(safetyAcknowledgement)
    .values({
      tenantId: side.tenantId,
      instructionId: briefing.instructionId,
      versionId: briefing.publishedId,
      locale: 'en',
      contentHash: randomBytes(32),
      bookingId: o.bookingId ?? null,
      carrierId: side.carrierId,
      driverName: o.driverName,
      statementShown: 'I have read and understood the site rules.',
      channel: 'link',
      score: null,
      attempts: 1,
      completedAt: o.completedAt,
      expiresAt: o.expiresAt,
      restrictedAt: o.restrictedAt ?? null,
    })
    .returning();
  if (!row) throw new Error('no acknowledgement');
  return row;
}

export const acknowledgementOf = async (id: string) => {
  const [row] = await ownerDb()
    .select()
    .from(safetyAcknowledgement)
    .where(eq(safetyAcknowledgement.id, id as never));
  if (!row) throw new Error(`no acknowledgement ${id}`);
  return row;
};
