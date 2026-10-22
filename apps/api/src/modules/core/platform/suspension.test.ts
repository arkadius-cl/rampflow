import { randomBytes, randomUUID } from 'node:crypto';
import type { PortalBookingPage } from '@rampflow/shared/modules/booking/api.portal';
import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import type { TenantDetail, TenantNoteList } from '@rampflow/shared/modules/core/api.platform';
import { TenantNoteKind, TenantStatus } from '@rampflow/shared/modules/core/values';
import {
  EmailTemplate,
  ErrorCode,
  OrgKind,
  PackageId,
  Role,
  StaffLocale,
} from '@rampflow/shared/values';
import { and, asc, eq, like } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { onboardingTenant, WORLD_NOW, type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { BookingId, OrgId, TenantId, UserId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { booking } from '../../booking/schema.ts';
import { driverAccess } from '../../driver/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { appUser, invitation, membership, org, tenantCarrierLink, tenantNote } from '../schema.ts';
import { errorOf, inviteeEmail } from '../staff/fixtures.ts';

// PL-07 through /api/platform and the areas it closes, against Postgres.

const clock = testClock(WORLD_NOW);
const app = createApp({ clock });

let w: World;
beforeAll(async () => {
  w = await world();
});

const platform = () => as(app, w.platformAdmin);
const suspend = (tenantId: string, reason = 'Fake bookings reported by carriers') =>
  platform().post(`/api/platform/tenants/${tenantId}/suspend`, { body: { reason } });
const reactivate = (tenantId: string, reason = 'Operator confirmed its sites') =>
  platform().post(`/api/platform/tenants/${tenantId}/reactivate`, { body: { reason } });

const notesOf = (tenantId: string) =>
  ownerDb()
    .select()
    .from(tenantNote)
    .where(eq(tenantNote.tenantId, tenantId as TenantId))
    .orderBy(asc(tenantNote.createdAt));
const mailsOf = (noteId: string) =>
  ownerDb()
    .select()
    .from(outboxMessage)
    .where(like(outboxMessage.dedupeKey, `tenant-suspension:${noteId}:%`));
const suspendedAtOf = async (tenantId: string) => {
  const [row] = await ownerDb()
    .select({ at: org.suspendedAt })
    .from(org)
    .where(eq(org.id, tenantId as OrgId));
  return row?.at ?? null;
};

/** A user with a membership of `role` in `orgId`, written as the owner. */
async function member(
  orgId: string,
  role: Role,
  user: Partial<typeof appUser.$inferInsert> = {},
): Promise<{ id: UserId; email: string }> {
  const id = randomUUID() as UserId;
  const email = `member-${randomBytes(4).toString('hex')}@suspension.test`;
  await ownerDb()
    .insert(appUser)
    .values({ id, email, name: `Member ${email}`, ...user });
  await ownerDb()
    .insert(membership)
    .values({ userId: id, orgId: orgId as OrgId, orgKind: OrgKind.tenant, role });
  return { id, email };
}

/** A fresh world whose tenant A is suspended for the test and active again afterwards. */
async function whileSuspended<T>(tenantId: TenantId, fn: () => Promise<T>): Promise<T> {
  expect((await suspend(tenantId)).status).toBe(200);
  try {
    return await fn();
  } finally {
    expect((await reactivate(tenantId)).status).toBe(200);
  }
}

describe('PL-07 suspend and reactivate', () => {
  it('suspends with the reason as a note by the admin, and emails each admin once', async () => {
    const own = await world();
    const second = await member(own.A.tenantId, Role.tenant_admin, {
      name: 'Mara Engel',
      givenName: 'Mara',
      familyName: 'Engel',
      salutation: null,
      locale: StaffLocale.pl,
    });
    const noLocale = await member(own.A.tenantId, Role.tenant_admin, { locale: null });
    const disabled = await member(own.A.tenantId, Role.tenant_admin, { disabledAt: WORLD_NOW });

    const res = await suspend(own.A.tenantId, 'Unpaid since March');
    expect(res.status).toBe(200);
    expect(((await res.json()) as TenantDetail).status).toBe(TenantStatus.suspended);
    expect(await suspendedAtOf(own.A.tenantId)).toEqual(WORLD_NOW);

    const [note, ...others] = await notesOf(own.A.tenantId);
    expect(others).toEqual([]);
    expect(note).toMatchObject({
      kind: TenantNoteKind.suspended,
      body: 'Unpaid since March',
      authorId: w.platformAdmin.id,
      createdAt: WORLD_NOW,
    });

    const mails = await mailsOf(note?.id ?? '');
    const byEmail = new Map(mails.map((m) => [m.toEmail, m]));
    expect([...byEmail.keys()].sort()).toEqual(
      [own.A.users.tenant_admin.email, second.email, noLocale.email].sort(),
    );
    expect(byEmail.has(own.A.users.dispatcher.email)).toBe(false);
    expect(byEmail.has(disabled.email)).toBe(false);
    expect(byEmail.get(second.email)).toMatchObject({
      template: EmailTemplate.core_tenant_suspended,
      tenantId: null,
      locale: StaffLocale.pl,
      payload: {
        orgName: expect.stringContaining('Tenant A'),
        reason: 'Unpaid since March',
        recipient: { salutation: null, givenName: 'Mara', familyName: 'Engel' },
      },
    });
    expect(byEmail.get(own.A.users.tenant_admin.email)?.locale).toBe(StaffLocale.en);
    // The platform default, `de` in code; no test changes it.
    expect(byEmail.get(noLocale.email)?.locale).toBe(StaffLocale.de);
    expect(byEmail.get(noLocale.email)?.payload).toMatchObject({
      recipient: { salutation: null, givenName: `Member ${noLocale.email}`, familyName: '' },
    });
  });

  it('a second suspension writes no note and no email and keeps the first time', async () => {
    const own = await world();
    expect((await suspend(own.A.tenantId)).status).toBe(200);
    const [first] = await notesOf(own.A.tenantId);
    clock.advance(60_000);
    try {
      const res = await suspend(own.A.tenantId, 'Clicked twice');
      expect(res.status).toBe(200);
      expect(((await res.json()) as TenantDetail).status).toBe(TenantStatus.suspended);
    } finally {
      clock.set(WORLD_NOW);
    }
    expect(await suspendedAtOf(own.A.tenantId)).toEqual(WORLD_NOW);
    expect((await notesOf(own.A.tenantId)).map((n) => n.id)).toEqual([first?.id]);
    const mails = await ownerDb()
      .select()
      .from(outboxMessage)
      .where(eq(outboxMessage.toEmail, own.A.users.tenant_admin.email));
    expect(mails).toHaveLength(1);
  });

  it('two concurrent suspensions on two connections write one note and one email set', async () => {
    const own = await world();
    const answers = await Promise.all([suspend(own.A.tenantId), suspend(own.A.tenantId)]);
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    const notes = await notesOf(own.A.tenantId);
    expect(notes).toHaveLength(1);
    expect(await mailsOf(notes[0]?.id ?? '')).toHaveLength(1);
  });

  it('reactivates to active, or to onboarding for a tenant never activated, with a note and emails', async () => {
    const own = await world();
    await suspend(own.A.tenantId);
    const res = await reactivate(own.A.tenantId, 'Paid');
    expect(res.status).toBe(200);
    expect(((await res.json()) as TenantDetail).status).toBe(TenantStatus.active);
    expect(await suspendedAtOf(own.A.tenantId)).toBeNull();
    const notes = await notesOf(own.A.tenantId);
    const reactivated = notes.find((n) => n.kind === TenantNoteKind.reactivated);
    expect(reactivated).toMatchObject({ body: 'Paid', authorId: w.platformAdmin.id });
    expect(await mailsOf(reactivated?.id ?? '')).toEqual([
      expect.objectContaining({
        template: EmailTemplate.core_tenant_reactivated,
        toEmail: own.A.users.tenant_admin.email,
        payload: expect.not.objectContaining({ reason: expect.anything() }),
      }),
    ]);

    const fresh = await onboardingTenant();
    await suspend(fresh.tenantId);
    const back = await reactivate(fresh.tenantId);
    expect(((await back.json()) as TenantDetail).status).toBe(TenantStatus.onboarding);
  });

  it('reactivating a tenant that is not suspended writes no note and no email', async () => {
    const own = await world();
    const res = await reactivate(own.A.tenantId);
    expect(res.status).toBe(200);
    expect(((await res.json()) as TenantDetail).status).toBe(TenantStatus.active);
    expect(await notesOf(own.A.tenantId)).toEqual([]);
    const mails = await ownerDb()
      .select()
      .from(outboxMessage)
      .where(eq(outboxMessage.toEmail, own.A.users.tenant_admin.email));
    expect(mails).toEqual([]);
  });

  it('answers 422 at ["reason"] for an empty reason and leaves the tenant active', async () => {
    const own = await world();
    for (const reason of ['', '   ']) {
      const res = await suspend(own.A.tenantId, reason);
      expect(res.status).toBe(422);
      const error = await errorOf(res);
      expect(error.details?.issues).toEqual([expect.objectContaining({ path: ['reason'] })]);
    }
    const tooLong = await suspend(own.A.tenantId, 'x'.repeat(501));
    expect(tooLong.status).toBe(422);
    expect(await suspendedAtOf(own.A.tenantId)).toBeNull();
    expect(await notesOf(own.A.tenantId)).toEqual([]);
  });

  it('answers 404 for a carrier org and an unknown id', async () => {
    expect((await suspend(w.A.carrierId)).status).toBe(404);
    expect((await reactivate(w.A.carrierId)).status).toBe(404);
    expect((await suspend(randomUUID())).status).toBe(404);
    expect(await suspendedAtOf(w.A.carrierId)).toBeNull();
  });

  it('queues no email for a tenant whose only admin has not accepted the invitation', async () => {
    const adminEmail = inviteeEmail('elbe-admin');
    const created = await platform().post('/api/platform/tenants', {
      body: { name: `Elbe ${adminEmail}`, package: PackageId.pro, adminEmail },
    });
    const { id } = (await created.json()) as TenantDetail;
    expect((await suspend(id)).status).toBe(200);
    const [note] = await notesOf(id);
    expect(note?.kind).toBe(TenantNoteKind.suspended);
    expect(await mailsOf(note?.id ?? '')).toEqual([]);
  });

  it('changes no booking, driver link, carrier link, member or invitation', async () => {
    const own = await world();
    const tenantId = own.A.tenantId;
    const invited = inviteeEmail('pending');
    await as(app, own.A.users.tenant_admin).post(`/api/t/${tenantId}/staff/invitations`, {
      body: { email: invited, role: Role.dispatcher },
    });
    const snapshot = async () => ({
      bookings: await ownerDb()
        .select()
        .from(booking)
        .where(eq(booking.tenantId, tenantId))
        .orderBy(asc(booking.id)),
      links: await ownerDb()
        .select()
        .from(driverAccess)
        .where(eq(driverAccess.tenantId, tenantId))
        .orderBy(asc(driverAccess.id)),
      carriers: await ownerDb()
        .select()
        .from(tenantCarrierLink)
        .where(eq(tenantCarrierLink.tenantId, tenantId))
        .orderBy(asc(tenantCarrierLink.carrierId)),
      members: await ownerDb()
        .select()
        .from(membership)
        .where(eq(membership.orgId, tenantId as string as OrgId))
        .orderBy(asc(membership.id)),
      invitations: await ownerDb()
        .select()
        .from(invitation)
        .where(eq(invitation.orgId, tenantId as string as OrgId))
        .orderBy(asc(invitation.id)),
    });
    const before = await snapshot();
    expect(before.bookings.length).toBeGreaterThan(0);
    expect(before.invitations).toHaveLength(1);
    await suspend(tenantId);
    expect(await snapshot()).toEqual(before);
    await reactivate(tenantId);
    expect(await snapshot()).toEqual(before);
  });
});

describe('PL-07 what a suspended tenant refuses', () => {
  const tenantPath = (side: World['A'], rest: string) => `/api/t/${side.tenantId}${rest}`;
  const bookingRow = async (id: string) => {
    const [row] = await ownerDb()
      .select()
      .from(booking)
      .where(eq(booking.id, id as BookingId));
    return row;
  };

  it('refuses the staff context with 403 tenant_suspended, and the same session works after reactivation', async () => {
    const dispatcher = as(app, w.A.users.dispatcher);
    await whileSuspended(w.A.tenantId, async () => {
      const res = await dispatcher.get(tenantPath(w.A, '/context'));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: { code: ErrorCode.tenant_suspended, message: 'The organisation is suspended' },
      });
    });
    expect((await dispatcher.get(tenantPath(w.A, '/context'))).status).toBe(200);
  });

  it('refuses a gate check-in with 403 and leaves the booking unchanged', async () => {
    const own = w.A.bookings.own;
    const before = await bookingRow(own.id);
    expect(before?.status).toBe(BookingStatus.confirmed);
    await whileSuspended(w.A.tenantId, async () => {
      const res = await as(app, w.A.users.gate_operator).post(
        tenantPath(w.A, `/yard/bookings/${own.id}/check-in`),
        { body: {} },
      );
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe(ErrorCode.tenant_suspended);
    });
    expect(await bookingRow(own.id)).toEqual(before);
  });

  it("leaves the user's membership of another tenant working", async () => {
    const user = w.A.users.dispatcher;
    await ownerDb()
      .insert(membership)
      .values({
        userId: user.id,
        orgId: w.B.tenantId as string as OrgId,
        orgKind: OrgKind.tenant,
        role: Role.dispatcher,
      });
    try {
      await whileSuspended(w.A.tenantId, async () => {
        expect((await as(app, user).get(tenantPath(w.A, '/context'))).status).toBe(403);
        expect((await as(app, user).get(tenantPath(w.B, '/context'))).status).toBe(200);
      });
    } finally {
      await ownerDb()
        .delete(membership)
        .where(and(eq(membership.userId, user.id), eq(membership.orgId, w.B.tenantId as never)));
    }
  });

  it('refuses carrier availability at the tenant with 403 and keeps its bookings in the carrier list', async () => {
    const carrier = as(app, w.A.users.carrier_user);
    const s = w.A.sites[0];
    await whileSuspended(w.A.tenantId, async () => {
      const res = await carrier.get(
        `/api/c/${w.A.carrierId}/at/${w.A.tenantId}/availability?siteId=${s.id}&loadTypeId=${s.loadTypeId}&date=2026-11-02`,
      );
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe(ErrorCode.tenant_suspended);
      const list = await carrier.get(`/api/c/${w.A.carrierId}/bookings?tenantId=${w.A.tenantId}`);
      expect(list.status).toBe(200);
      const page = (await list.json()) as PortalBookingPage;
      expect(page.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: w.A.bookings.own.id, status: BookingStatus.confirmed }),
        ]),
      );
    });
  });

  it('answers a driver 401 while suspended and 200 with the same link after reactivation', async () => {
    const driver = as(app, w.A.bookings.own);
    expect((await driver.get('/api/driver/booking')).status).toBe(200);
    await whileSuspended(w.A.tenantId, async () => {
      const res = await driver.get('/api/driver/booking');
      expect(res.status).toBe(401);
      expect((await errorOf(res)).code).toBe(ErrorCode.unauthorized);
    });
    expect((await driver.get('/api/driver/booking')).status).toBe(200);
  });

  it('keeps every platform route open on the suspended tenant', async () => {
    await whileSuspended(w.A.tenantId, async () => {
      const base = `/api/platform/tenants/${w.A.tenantId}`;
      const detail = await platform().get(base);
      expect(detail.status).toBe(200);
      expect(((await detail.json()) as TenantDetail).status).toBe(TenantStatus.suspended);
      const override = await platform().put(`${base}/overrides/safety.quiz`, {
        body: { value: true, expiresAt: null, note: 'while suspended' },
      });
      expect(override.status).toBe(200);
      const listed = (await (await platform().get(base)).json()) as TenantDetail;
      expect(listed.overrides).toEqual([expect.objectContaining({ key: 'safety.quiz' })]);
      expect((await platform().delete(`${base}/overrides/safety.quiz`)).status).toBe(204);
      const note = await platform().post(`${base}/notes`, {
        body: { body: 'Called the operator' },
      });
      expect(note.status).toBe(201);
      const notes = (await (await platform().get(`${base}/notes`)).json()) as TenantNoteList;
      expect(notes.items.map((n) => n.kind)).toEqual(
        expect.arrayContaining([TenantNoteKind.note, TenantNoteKind.suspended]),
      );
    });
  });
});
