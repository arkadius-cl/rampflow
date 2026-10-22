import { randomBytes, randomUUID } from 'node:crypto';
import type { TenantNoteList, TenantNoteView } from '@rampflow/shared/modules/core/api.platform';
import { TenantNoteKind } from '@rampflow/shared/modules/core/values';
import { OrgKind, Role, SortOrder } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { WORLD_NOW, type World, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { OrgId, UserId } from '../../../db/ids.ts';
import { hashToken } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { appUser, membership, org, session } from '../schema.ts';
import { errorOf } from '../staff/fixtures.ts';

// PL-08 through /api/platform/tenants/:tenantId/notes against Postgres.

const clock = testClock(WORLD_NOW);
const app = createApp({ clock });

let w: World;
beforeAll(async () => {
  w = await world();
});

const notesPath = (tenantId: string) => `/api/platform/tenants/${tenantId}/notes`;
const add = (actor: WorldUser, tenantId: string, body: string) =>
  as(app, actor).post(notesPath(tenantId), { body: { body } });
const list = async (tenantId: string, query: Record<string, string> = {}) => {
  const res = await as(app, w.platformAdmin).get(
    `${notesPath(tenantId)}?${new URLSearchParams(query)}`,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as TenantNoteList;
};

/** A second platform admin with a session, so deleting it leaves the world's admin. */
async function platformAdmin(): Promise<WorldUser> {
  const [platform] = await ownerDb()
    .select({ id: org.id })
    .from(org)
    .where(eq(org.kind, OrgKind.platform));
  if (!platform) throw new Error('no platform org');
  const id = randomUUID() as UserId;
  const email = `notes-${randomBytes(4).toString('hex')}@platform.test`;
  const sessionToken = randomBytes(32).toString('base64url');
  await ownerDb().insert(appUser).values({ id, email, name: 'Jana Kurz' });
  await ownerDb()
    .insert(membership)
    .values({
      userId: id,
      orgId: platform.id as OrgId,
      orgKind: OrgKind.platform,
      role: Role.platform_admin,
    });
  await ownerDb()
    .insert(session)
    .values({
      id: hashToken(sessionToken),
      userId: id,
      expiresAt: new Date('2100-01-01T00:00:00Z'),
      lastSeenAt: new Date('2100-01-01T00:00:00Z'),
    });
  return { id, email, role: Role.platform_admin, sessionToken };
}

describe('PL-08 tenant notes', () => {
  it('adds a note: 201 with the text, kind note, author and time', async () => {
    const own = await world();
    const res = await add(w.platformAdmin, own.A.tenantId, '  Called Anna, onboarding on Monday ');
    expect(res.status).toBe(201);
    const [admin] = await ownerDb()
      .select({ name: appUser.name })
      .from(appUser)
      .where(eq(appUser.id, w.platformAdmin.id));
    expect((await res.json()) as TenantNoteView).toEqual({
      id: expect.any(String),
      kind: TenantNoteKind.note,
      body: 'Called Anna, onboarding on Monday',
      author: { id: w.platformAdmin.id, name: admin?.name },
      createdAt: WORLD_NOW.toISOString(),
    });
  });

  it('answers 422 at ["body"] for a note of only spaces and stores nothing', async () => {
    const own = await world();
    const res = await add(w.platformAdmin, own.A.tenantId, '   ');
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['body'] }),
    ]);
    expect((await add(w.platformAdmin, own.A.tenantId, 'x'.repeat(2001))).status).toBe(422);
    expect((await list(own.A.tenantId)).total).toBe(0);
  });

  it('lists newest first, filters by kind with counts that ignore it, and searches the body', async () => {
    const own = await world();
    const tenantId = own.A.tenantId;
    const base = `/api/platform/tenants/${tenantId}`;
    const step = async (fn: () => Promise<Response>) => {
      clock.advance(60_000);
      expect((await fn()).status).toBeLessThan(300);
    };
    try {
      await step(() =>
        as(app, w.platformAdmin).post(`${base}/suspend`, { body: { reason: 'Fake bookings' } }),
      );
      await step(() =>
        as(app, w.platformAdmin).post(`${base}/reactivate`, { body: { reason: 'Confirmed' } }),
      );
      await step(() => add(w.platformAdmin, tenantId, 'Asked for a second site'));
    } finally {
      clock.set(WORLD_NOW);
    }

    const all = await list(tenantId);
    expect(all.items.map((n) => [n.kind, n.body])).toEqual([
      [TenantNoteKind.note, 'Asked for a second site'],
      [TenantNoteKind.reactivated, 'Confirmed'],
      [TenantNoteKind.suspended, 'Fake bookings'],
    ]);
    expect(all).toMatchObject({ total: 3, page: 1, pageSize: 25 });
    const oldest = await list(tenantId, { order: SortOrder.asc });
    expect(oldest.items.map((n) => n.kind)).toEqual([
      TenantNoteKind.suspended,
      TenantNoteKind.reactivated,
      TenantNoteKind.note,
    ]);

    const suspended = await list(tenantId, { kind: TenantNoteKind.suspended });
    expect(suspended.items.map((n) => n.body)).toEqual(['Fake bookings']);
    expect(suspended.total).toBe(1);
    expect(suspended.facets.kind).toEqual({
      [TenantNoteKind.note]: 1,
      [TenantNoteKind.suspended]: 1,
      [TenantNoteKind.reactivated]: 1,
    });

    const searched = await list(tenantId, { q: 'SECOND' });
    expect(searched.items.map((n) => n.body)).toEqual(['Asked for a second site']);
    expect(searched.facets.kind).toEqual({
      [TenantNoteKind.note]: 1,
      [TenantNoteKind.suspended]: 0,
      [TenantNoteKind.reactivated]: 0,
    });
    expect((await list(own.B.tenantId)).total).toBe(0);
  });

  it("reads a deleted author's note with author null", async () => {
    const own = await world();
    const author = await platformAdmin();
    expect((await add(author, own.A.tenantId, 'Written by Jana')).status).toBe(201);
    await ownerDb().delete(appUser).where(eq(appUser.id, author.id));
    const { items } = await list(own.A.tenantId);
    expect(items).toEqual([expect.objectContaining({ body: 'Written by Jana', author: null })]);
  });

  it('answers 404 for a carrier org id and writes no note', async () => {
    const before = await ownerCount('tenant_note');
    expect((await add(w.platformAdmin, w.A.carrierId, 'Not a tenant')).status).toBe(404);
    const res = await as(app, w.platformAdmin).get(notesPath(w.A.carrierId));
    expect(res.status).toBe(404);
    expect(await ownerCount('tenant_note')).toBe(before);
  });

  it('is not reachable for a tenant admin', async () => {
    const res = await add(w.A.users.tenant_admin, w.A.tenantId, 'From the tenant');
    expect(res.status).toBe(404);
  });
});
