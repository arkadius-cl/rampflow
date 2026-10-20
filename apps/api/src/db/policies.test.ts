import { randomUUID } from 'node:crypto';
import { BookingEventType, BookingStatus } from '@rampflow/shared/modules/booking/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import {
  CarrierRole,
  EmailTemplate,
  OrgKind,
  Role,
  ScopeParty,
  SqlState,
  StaffLocale,
  SystemActorName,
  TenantActorKind,
} from '@rampflow/shared/values';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { type World, world } from '../../test/world.ts';
import { bookableResource } from '../modules/booking/schema.resources.ts';
import { booking, bookingEvent } from '../modules/booking/schema.ts';
import { invitation, membership, org } from '../modules/core/schema.ts';
import { outboxMessage } from '../modules/notify/schema.ts';
import { hashToken, type OrgId, type TenantId } from './ids.ts';
import { asScope, type Scope, withScope } from './scope.ts';

/** Postgres 42501: a row-level security policy refused the row. */
const RLS_DENIED = { cause: { code: SqlState.insufficient_privilege } };

// Write paths of the party matrix: the commands a party needs succeed, the ones it must not
// have fail in the database even when the application forgets its own filter.

let w: World;
beforeAll(async () => {
  w = await world();
});

const driver = (): Scope => ({
  party: ScopeParty.driver,
  tenantId: w.A.tenantId,
  bookingId: w.A.bookings.own.id,
  channel: DriverChannel.link,
});
const carrierAt = (rival = false): Scope => ({
  party: ScopeParty.carrier_at_tenant,
  carrierId: rival ? w.A.rivalCarrierId : w.A.carrierId,
  tenantId: w.A.tenantId,
  userId: rival ? w.A.users.rival_user.id : w.A.users.carrier_user.id,
  role: CarrierRole.carrier_user,
});

const statusOf = async (id: string) =>
  (
    await ownerDb()
      .select({ status: booking.status })
      .from(booking)
      .where(eq(booking.id, id as never))
  )[0]?.status;

describe('driver', () => {
  it('locks its booking and appends an event, as link_acknowledgement does', async () => {
    const b = w.A.bookings.own;
    await withScope(driver(), async (tx) => {
      const locked = await tx.select({ id: booking.id }).from(booking).for('update');
      expect(locked).toEqual([{ id: b.id }]);
      await tx.insert(bookingEvent).values({
        tenantId: w.A.tenantId,
        siteId: b.siteId,
        bookingId: b.id,
        carrierId: b.carrierId,
        type: BookingEventType.safety_linked,
        at: new Date(),
        actorParty: 'driver',
      });
    });
    const events = await ownerDb()
      .select()
      .from(bookingEvent)
      .where(and(eq(bookingEvent.bookingId, b.id), eq(bookingEvent.type, 'safety_linked')));
    expect(events).toHaveLength(1);
  });

  it('cannot change its booking or write another booking event', async () => {
    const b = w.A.bookings.own;
    await expect(
      withScope(driver(), (tx) =>
        tx.update(booking).set({ status: BookingStatus.cancelled }).where(eq(booking.id, b.id)),
      ),
    ).rejects.toMatchObject(RLS_DENIED);
    await expect(
      withScope(driver(), (tx) =>
        tx.insert(bookingEvent).values({
          tenantId: w.A.tenantId,
          siteId: w.A.bookings.rival.siteId,
          bookingId: w.A.bookings.rival.id,
          type: BookingEventType.safety_linked,
          at: new Date(),
          actorParty: 'driver',
        }),
      ),
    ).rejects.toMatchObject(RLS_DENIED);
    expect(await statusOf(b.id)).toBe('confirmed');
  });
});

describe('carrier at a tenant', () => {
  it('updates its own booking and cannot touch the rival carrier booking without a filter', async () => {
    const updated = await withScope(carrierAt(), (tx) =>
      tx.update(booking).set({ version: sql`${booking.version} + 1` }),
    );
    expect(updated.rowCount).toBe(2);
    expect(
      (
        await ownerDb()
          .select({ v: booking.version })
          .from(booking)
          .where(eq(booking.id, w.A.bookings.rival.id))
      )[0]?.v,
    ).toBe(1);
  });

  it('cannot change a resource of the tenant', async () => {
    const resourceId = w.A.sites[0].resourceId;
    const updated = await withScope(carrierAt(), (tx) =>
      tx.update(bookableResource).set({ name: 'mine' }).where(eq(bookableResource.id, resourceId)),
    );
    expect(updated.rowCount).toBe(0);
  });

  it('reads no rival booking itself; the capacity read switches to the tenant (ADR-0004)', async () => {
    const resourceId = w.A.sites[0].resourceId;
    const rows = await withScope(carrierAt(), async (tx) => {
      const own = await tx
        .select({ id: booking.id })
        .from(booking)
        .where(eq(booking.resourceId, resourceId));
      expect(own).toEqual([{ id: w.A.bookings.own.id }]);
      return asScope(
        tx,
        {
          party: ScopeParty.tenant,
          tenantId: w.A.tenantId,
          siteIds: 'all',
          actor: { kind: TenantActorKind.system, job: SystemActorName.capacity },
        },
        (inner) =>
          inner
            .select({ startsAt: booking.startsAt, blocksUntil: booking.blocksUntil })
            .from(booking)
            .where(eq(booking.resourceId, resourceId)),
      );
    });
    expect(rows).toHaveLength(2);
  });
});

describe('carrier company creation', () => {
  it('lets a signed-in user create a carrier org and become its admin, but not a tenant', async () => {
    const userId = w.A.users.dispatcher.id;
    const carrierId = randomUUID() as OrgId;
    await withScope({ party: ScopeParty.user, userId }, async (tx) => {
      await tx.insert(org).values({ id: carrierId, kind: OrgKind.carrier, name: 'New Spedition' });
      await asScope(
        tx,
        {
          party: ScopeParty.carrier,
          carrierId: carrierId as never,
          userId,
          role: CarrierRole.carrier_admin,
        },
        (inner) =>
          inner
            .insert(membership)
            .values({ userId, orgId: carrierId, orgKind: 'carrier', role: Role.carrier_admin }),
      );
    });
    expect(
      await ownerDb().select().from(membership).where(eq(membership.orgId, carrierId)),
    ).toHaveLength(1);
    await expect(
      withScope({ party: ScopeParty.user, userId }, (tx) =>
        tx.insert(org).values({ kind: OrgKind.tenant, name: 'Sneaky' }),
      ),
    ).rejects.toMatchObject(RLS_DENIED);
  });
});

describe('outbox inserts', () => {
  const row = (tenantId: TenantId | null) => ({
    tenantId,
    template: EmailTemplate.core_magic_link,
    toEmail: `${randomUUID()}@policies.test`,
    locale: StaffLocale.en,
    payload: {},
  });

  it('accepts account emails from any party and tenant emails only for the own tenant', async () => {
    await withScope({ party: ScopeParty.anonymous }, (tx) =>
      tx.insert(outboxMessage).values(row(null)),
    );
    await withScope(driver(), (tx) => tx.insert(outboxMessage).values(row(w.A.tenantId)));
    await expect(
      withScope(driver(), (tx) => tx.insert(outboxMessage).values(row(w.B.tenantId))),
    ).rejects.toMatchObject(RLS_DENIED);
  });

  it('reads nothing back outside the system scope', async () => {
    await expect(
      withScope({ party: ScopeParty.anonymous }, (tx) =>
        tx.insert(outboxMessage).values(row(null)).returning(),
      ),
    ).rejects.toMatchObject(RLS_DENIED);
  });
});

describe('scope switching', () => {
  it('claims a token and writes as the tenant in one transaction, then restores the scope', async () => {
    const token = randomUUID();
    const tokenHash = hashToken(token);
    const invitationId = randomUUID();
    await ownerDb()
      .insert(invitation)
      .values({
        id: invitationId as never,
        orgId: w.A.tenantId,
        orgKind: 'tenant',
        email: `claim-${randomUUID()}@policies.test`,
        role: Role.dispatcher,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
      });
    const userId = w.B.users.dispatcher.id;
    const claim = () =>
      withScope({ party: ScopeParty.token, tokenHash, userId: null }, async (tx) => {
        const claimed = await tx
          .update(invitation)
          .set({ acceptedAt: new Date(), acceptedUserId: userId })
          .where(and(eq(invitation.tokenHash, tokenHash), sql`${invitation.acceptedAt} is null`))
          .returning({ id: invitation.id });
        if (claimed.length !== 1) return 'already used';
        await asScope(
          tx,
          {
            party: ScopeParty.tenant,
            tenantId: w.A.tenantId,
            siteIds: 'all',
            actor: { kind: TenantActorKind.system, job: SystemActorName.invitation },
          },
          (inner) =>
            inner
              .insert(membership)
              .values({ userId, orgId: w.A.tenantId, orgKind: 'tenant', role: Role.dispatcher }),
        );
        const { rows } = await tx.execute<{ party: string }>(sql`select app.party() as party`);
        return rows[0]?.party;
      });
    expect(await claim()).toBe('token');
    expect(await claim()).toBe('already used');
  });

  it('refuses a second scoped transaction inside one', async () => {
    await expect(
      withScope({ party: ScopeParty.anonymous }, () =>
        withScope({ party: ScopeParty.anonymous }, async () => 1),
      ),
    ).rejects.toThrow(/asScope/);
  });
});
