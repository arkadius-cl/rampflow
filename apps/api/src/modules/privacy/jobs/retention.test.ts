import { randomBytes, randomUUID } from 'node:crypto';
import { BookingStatus, CreatedParty } from '@rampflow/shared/modules/booking/values';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { type World, world } from '../../../../test/world.ts';
import type { BookingId, OrgId, UserId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { runJobTick } from '../../../kernel/jobs.ts';
import { bookingRow, eventsOf, seedBooking, setSetting } from '../../booking/lifecycle/fixtures.ts';
import { bookingEvent } from '../../booking/schema.ts';
import { appUser, membership, org } from '../../core/schema.ts';
import { driverAccess } from '../../driver/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { type BriefingFixture, seedBriefing } from '../../safety/authoring/fixtures.ts';
import { acknowledgementOf, avisOf, seedAcknowledgement, setAvis } from '../fixtures.ts';
import { job } from './retention.ts';

// PL-05: every rule of data-model.md, "Retention", one minute past its limit and one minute
// before it, against the injected clock. The job spans every tenant of this worker's
// database, so the assertions look at this file's rows only.

const NOW = new Date();
const MIN = 60_000;
const DAY = 86_400_000;
const ago = (days: number, minutes = 0) => new Date(NOW.getTime() - days * DAY - minutes * MIN);
const clock = testClock(NOW);
const mailer = { send: async () => undefined };
const run = async () => {
  const tick = await runJobTick(job, { clock, mailer });
  if (!tick.ran) throw new Error('retention did not run');
  return tick.stats;
};

const LIMITS = { phone: 7, identity: 90, visit: 395, safety: 730, audit: 365 };

let w: World;
let briefing: BriefingFixture;

/** A departed visit whose departure lies `days` and `minutes` before now. */
async function departed(days: number, minutes: number) {
  const at = ago(days, minutes);
  const b = await seedBooking(w.A, {
    startsAt: new Date(at.getTime() - 2 * 3_600_000),
    status: BookingStatus.departed,
  });
  await ownerDb()
    .insert(bookingEvent)
    .values({
      tenantId: w.A.tenantId,
      siteId: b.siteId,
      bookingId: b.id,
      type: 'departed',
      fromStatus: 'done',
      toStatus: 'departed',
      at,
      actorParty: 'tenant',
      data: { fromStatus: 'done', reason: null },
    });
  await ownerDb().execute(
    sql`update booking set departed_at = ${at}, checked_in_at = ${new Date(at.getTime() - 3_600_000)} where id = ${b.id}`,
  );
  await setAvis(b.id as BookingId, {
    driverName: 'Jan Kowalski',
    driverPhone: '+48600123456',
    plate: 'WA12345',
    trailerPlate: 'WA67890',
    plateSeen: 'WA12345',
  });
  return b.id as BookingId;
}

type VisitKey =
  | 'phonePast'
  | 'phoneInside'
  | 'identityPast'
  | 'identityInside'
  | 'active'
  | 'visitPast'
  | 'visitInside';
const ids = {} as Record<VisitKey, BookingId>;
const acks = {} as Record<
  'expiredPast' | 'expiredInside' | 'perVisitPast' | 'restrictedPast',
  string
>;

beforeAll(async () => {
  w = await world();
  briefing = await seedBriefing(ownerDb(), w.A);
  const by = w.A.users.tenant_admin.id;
  await setSetting(w.A.tenantId, 'privacy.retention.driver_phone_days', LIMITS.phone, by);
  await setSetting(w.A.tenantId, 'privacy.retention.driver_identity_days', LIMITS.identity, by);
  await setSetting(w.A.tenantId, 'privacy.retention.visit_days', LIMITS.visit, by);
  await setSetting(w.A.tenantId, 'privacy.retention.safety_after_expiry_days', LIMITS.safety, by);
  await setSetting(w.A.tenantId, 'privacy.retention.audit_log_days', LIMITS.audit, by);

  ids.phonePast = await departed(LIMITS.phone, 1);
  ids.phoneInside = await departed(LIMITS.phone, -1);
  ids.identityPast = await departed(LIMITS.identity, 1);
  ids.identityInside = await departed(LIMITS.identity, -1);
  const active = await seedBooking(w.A, { startsAt: ago(LIMITS.identity + 5) });
  await setAvis(active.id as BookingId, {
    driverName: 'Still Confirmed',
    driverPhone: '+48600999999',
  });
  ids.active = active.id as BookingId;
  ids.visitPast = (await seedBooking(w.A, { startsAt: ago(LIMITS.visit, 1) })).id as BookingId;
  ids.visitInside = (await seedBooking(w.A, { startsAt: ago(LIMITS.visit, -1) })).id as BookingId;

  const ack = (name: string, completedAt: Date, expiresAt: Date | null, restrictedAt?: Date) =>
    seedAcknowledgement(w.A, briefing, {
      driverName: name,
      completedAt,
      expiresAt,
      restrictedAt,
    }).then((a) => a.id);
  acks.expiredPast = await ack('Ewa Past', ago(800), ago(LIMITS.safety, 1));
  acks.expiredInside = await ack('Ewa Inside', ago(800), ago(LIMITS.safety, -1));
  acks.perVisitPast = await ack('Olga Visit', ago(LIMITS.safety, 1), null);
  acks.restrictedPast = await ack('Rita Restricted', ago(800), ago(LIMITS.safety, 1), ago(10));
});

describe('PL-05 retention job', () => {
  let first: Record<string, number>;
  beforeAll(async () => {
    first = await run();
  });

  it('erases the driver phone after driver_phone_days in a final state', async () => {
    expect(await avisOf(ids.phonePast)).toMatchObject({
      driverPhone: null,
      phoneErasedAt: NOW,
      driverName: 'Jan Kowalski',
      pseudonymizedAt: null,
    });
    expect(await avisOf(ids.phoneInside)).toMatchObject({
      driverPhone: '+48600123456',
      phoneErasedAt: null,
    });
    expect(await avisOf(ids.active)).toMatchObject({ driverPhone: '+48600999999' });
  });

  it('pseudonymizes name and plates after driver_identity_days', async () => {
    expect(await avisOf(ids.identityPast)).toMatchObject({
      driverName: null,
      plate: null,
      trailerPlate: null,
      plateSeen: null,
      driverPhone: null,
      pseudonymizedAt: NOW,
      updatedBy: null,
    });
    expect(await avisOf(ids.identityInside)).toMatchObject({
      driverName: 'Jan Kowalski',
      plate: 'WA12345',
      pseudonymizedAt: null,
    });
    expect(await avisOf(ids.active)).toMatchObject({ driverName: 'Still Confirmed' });
  });

  it('deletes visits with their children after visit_days', async () => {
    await expect(bookingRow(ids.visitPast)).rejects.toThrow();
    expect(await ownerCount('avis', sql`booking_id = ${ids.visitPast}`)).toBe(0);
    expect(await ownerCount('driver_access', sql`booking_id = ${ids.visitPast}`)).toBe(0);
    expect((await bookingRow(ids.visitInside)).id).toBe(ids.visitInside);
  });

  it('pseudonymizes acknowledgements after expiry (or completion) plus safety_after_expiry_days', async () => {
    expect(await acknowledgementOf(acks.expiredPast)).toMatchObject({
      driverName: '',
      pseudonymizedAt: NOW,
    });
    expect(await acknowledgementOf(acks.perVisitPast)).toMatchObject({ pseudonymizedAt: NOW });
    expect(await acknowledgementOf(acks.restrictedPast)).toMatchObject({
      driverName: '',
      pseudonymizedAt: NOW,
    });
    expect(await acknowledgementOf(acks.expiredInside)).toMatchObject({
      driverName: 'Ewa Inside',
      pseudonymizedAt: null,
    });
  });

  it('deletes booking events after audit_log_days', async () => {
    const past = await departed(LIMITS.audit, 1);
    const inside = await departed(LIMITS.audit, -1);
    await run();
    expect(await eventsOf(past)).toEqual([]);
    expect(await eventsOf(inside)).toHaveLength(1);
  });

  it('deletes driver links past their expiry', async () => {
    const b = await seedBooking(w.A, { startsAt: ago(30) });
    const link = (expiresAt: Date) =>
      ownerDb()
        .insert(driverAccess)
        .values({
          tenantId: w.A.tenantId,
          siteId: w.A.sites[0].id,
          bookingId: b.id,
          tokenHash: randomBytes(32),
          channel: 'staff',
          expiresAt,
        })
        .returning({ id: driverAccess.id });
    await ownerDb().delete(driverAccess).where(eq(driverAccess.bookingId, b.id));
    const [past] = await link(new Date(NOW.getTime() - MIN));
    const [inside] = await link(new Date(NOW.getTime() + MIN));
    await run();
    const left = await ownerDb()
      .select({ id: driverAccess.id })
      .from(driverAccess)
      .where(eq(driverAccess.bookingId, b.id));
    expect(left.map((l) => l.id)).toEqual([inside?.id]);
    expect(past).toBeDefined();
  });

  it('changes nothing on a second run and logs counts only', async () => {
    expect(first.visitsDeleted).toBeGreaterThanOrEqual(1);
    const again = await run();
    const { tenants: _, failedTenants, ...counts } = again;
    expect(failedTenants).toBe(0);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    const [log] = await ownerDb()
      .execute<{ stats: Record<string, unknown> }>(
        sql`select stats from job_run where job = 'retention' order by id desc limit 1`,
      )
      .then((r) => r.rows);
    expect(Object.values(log?.stats ?? { none: 'x' }).every((v) => typeof v === 'number')).toBe(
      true,
    );
  });
});

describe('PL-05 platform rules', () => {
  const carrierUser = async (lastSeenDaysAgo: number, minutes: number) => {
    const carrierId = randomUUID() as OrgId;
    await ownerDb()
      .insert(org)
      .values({ id: carrierId, kind: 'carrier', name: `Inactive ${carrierId.slice(0, 6)}` });
    const [u] = await ownerDb()
      .insert(appUser)
      .values({
        email: `inactive-${randomUUID()}@example.test`,
        name: 'Inactive Carrier User',
        locale: 'pl',
        lastSeenAt: ago(lastSeenDaysAgo, minutes),
        uiPrefs: { 'platform.tenant.openModules': ['yard'] },
      })
      .returning();
    if (!u) throw new Error('no user');
    await ownerDb()
      .insert(membership)
      .values({ userId: u.id, orgId: carrierId, orgKind: 'carrier', role: 'carrier_admin' });
    return { user: u, carrierId };
  };
  const notices = (to: string) =>
    ownerDb()
      .select()
      .from(outboxMessage)
      .where(
        and(eq(outboxMessage.toEmail, to), eq(outboxMessage.template, 'privacy.inactive-notice')),
      );
  const userRow = async (id: UserId) =>
    (await ownerDb().select().from(appUser).where(eq(appUser.id, id)))[0];

  it('notifies an inactive carrier user 30 days ahead, then deletes the user and the empty org', async () => {
    const days = 730; // privacy.retention.carrier_inactive_days, platform default
    const due = await carrierUser(days - 30, 1);
    const notYet = await carrierUser(days - 30, -1);
    const gone = await carrierUser(days, 1);
    // Bookings still name this user as their creator: anonymized instead of deleted.
    const referenced = await carrierUser(days, 1);
    await seedBooking(w.A, {
      startsAt: ago(40),
      createdParty: CreatedParty.carrier,
      createdBy: referenced.user.id,
    });

    await run();
    expect(await notices(due.user.email)).toHaveLength(1);
    expect((await notices(due.user.email))[0]).toMatchObject({ tenantId: null, locale: 'pl' });
    expect(await notices(notYet.user.email)).toHaveLength(0);
    expect(await userRow(gone.user.id)).toBeUndefined();
    expect(await ownerCount('org', sql`id = ${gone.carrierId}`)).toBe(0);
    expect(await userRow(referenced.user.id)).toMatchObject({
      email: `deleted-${referenced.user.id}@invalid.rampflow`,
      name: '-',
      passwordHash: null,
    });
    expect((await userRow(referenced.user.id))?.uiPrefs).toEqual({});
    expect((await userRow(referenced.user.id))?.disabledAt).not.toBeNull();
    expect(await ownerCount('membership', sql`user_id = ${referenced.user.id}`)).toBe(0);

    await run();
    expect(await notices(due.user.email)).toHaveLength(1);
    // World carrier users signed up just now and keep their accounts.
    expect(await userRow(w.A.users.carrier_user.id)).toMatchObject({
      email: w.A.users.carrier_user.email,
    });
  });

  it('deletes used sign-in tokens and rate-limit events after 24 hours and sent mail after 7 days', async () => {
    const user = w.A.users.carrier_admin.id;
    const token = (usedAt: Date) =>
      ownerDb().execute(
        sql`insert into auth_token (kind, user_id, token_hash, expires_at, used_at) values ('magic_link', ${user}, ${randomBytes(32)}, ${usedAt}, ${usedAt}) returning id`,
      );
    const past = (await token(ago(1, 1))).rows[0] as { id: string };
    const inside = (await token(ago(1, -1))).rows[0] as { id: string };
    const bucket = `retention-test-${randomUUID()}`;
    await ownerDb().execute(
      sql`insert into rate_limit_event (bucket, key_hash, at) values ('login_failed', ${Buffer.from(bucket)}, ${ago(1, 1)}), ('login_failed', ${Buffer.from(bucket)}, ${ago(1, -1)})`,
    );
    const mail = (sentAt: Date) =>
      ownerDb()
        .insert(outboxMessage)
        .values({
          template: 'core.magic-link',
          toEmail: `${randomUUID()}@example.test`,
          locale: 'en',
          payload: {},
          sentAt,
        })
        .returning({ id: outboxMessage.id });
    const [oldMail] = await mail(ago(7, 1));
    const [newMail] = await mail(ago(7, -1));

    await run();
    expect(await ownerCount('auth_token', sql`id = ${past.id}`)).toBe(0);
    expect(await ownerCount('auth_token', sql`id = ${inside.id}`)).toBe(1);
    expect(await ownerCount('rate_limit_event', sql`key_hash = ${Buffer.from(bucket)}`)).toBe(1);
    expect(await ownerCount('outbox_message', sql`id = ${oldMail?.id}`)).toBe(0);
    expect(await ownerCount('outbox_message', sql`id = ${newMail?.id}`)).toBe(1);
  });
});
