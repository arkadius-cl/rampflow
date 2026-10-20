import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import type {
  Instruction,
  VersionDetail,
  VersionSummary,
} from '@rampflow/shared/modules/safety/api.authoring';
import { isAcknowledgementValid } from '@rampflow/shared/modules/safety/validity';
import { BlockKind } from '@rampflow/shared/modules/safety/values';
import {
  DriverLocale,
  PackageId,
  ScopeParty,
  TenantActorKind,
  TenantRole,
  values,
} from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { asParty, ownerCount, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldSide, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { SiteId } from '../../../db/ids.ts';
import type { Scope } from '../../../db/scope.ts';
import { testClock } from '../../../kernel/clock.ts';
import { recordAcknowledgement } from '../register/acknowledgements.ts';
import { bookingAcknowledgement, safetyAcknowledgement, safetyInstruction } from '../schema.ts';
import { contentFixture, QUIZ } from './fixtures.ts';
import { type ApplicableInstruction, applicableInstructions } from './published.ts';

// Near real time: world sessions expire a day after seeding.
const clock = testClock(new Date());
const app = createApp({ clock });

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: PackageId.pro, B: PackageId.start } });
});

const base = (side: WorldSide) => `/api/t/${side.tenantId}/safety`;
const admin = (side: WorldSide) => as(app, side.users.tenant_admin);

async function json<T>(res: Response, status: number): Promise<T> {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
}

async function create(side: WorldSide, name = 'Rules'): Promise<Instruction> {
  const res = await admin(side).post(`${base(side)}/instructions`, {
    body: { name, allSites: true, siteIds: [] },
  });
  return json<Instruction>(res, 201);
}

const draftOf = async (side: WorldSide, i: Instruction) =>
  json<VersionDetail>(
    await admin(side).get(`${base(side)}/versions/${i.draft?.id ?? 'missing'}`),
    200,
  );

const publish = (side: WorldSide, versionId: string, materialChange = false) =>
  admin(side).post(`${base(side)}/versions/${versionId}/publish`, { body: { materialChange } });

const tenantScope = (side: WorldSide): Scope => ({
  party: ScopeParty.tenant,
  tenantId: side.tenantId,
  siteIds: 'all',
  actor: {
    kind: TenantActorKind.user,
    userId: side.users.dispatcher.id,
    role: TenantRole.dispatcher,
  },
});
const driverScope = (side: WorldSide): Scope => ({
  party: ScopeParty.driver,
  tenantId: side.tenantId,
  bookingId: side.bookings.own.id,
  channel: DriverChannel.link,
});

const applicable = (scope: Scope, side: WorldSide, siteId: SiteId = side.sites[0].id) =>
  asParty(scope, (tx) => applicableInstructions(tx, { tenantId: side.tenantId, siteId }));

describe('SF-01 author a briefing', () => {
  it('starts a new instruction from the 12-language template, non-de/en flagged machine', async () => {
    const instruction = await create(w.A);
    expect(instruction.published).toBeNull();
    expect(instruction.draft?.version).toBe(1);
    const draft = await draftOf(w.A, instruction);
    expect(draft.status).toBe('draft');
    expect(draft.content.map((c) => c.locale)).toEqual([...values(DriverLocale)]);
    const flags = Object.fromEntries(draft.content.map((c) => [c.locale, c.translation]));
    expect(flags).toEqual(
      Object.fromEntries(
        values(DriverLocale).map((l) => [
          l,
          l === DriverLocale.de || l === DriverLocale.en ? 'source' : 'machine',
        ]),
      ),
    );
    for (const c of draft.content) {
      expect(c.blocks.filter((b) => b.kind === BlockKind.pictogram)).toHaveLength(6);
      expect(c.questions).toHaveLength(3);
      expect(c.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(draft.content.map((c) => c.title)).size).toBe(12);
  });

  it('leaves the template questions out without safety.quiz', async () => {
    const draft = await draftOf(w.B, await create(w.B, 'No quiz'));
    expect(draft.content.every((c) => c.questions.length === 0)).toBe(true);
  });

  it('refuses edits of a published version and opens a draft copy instead', async () => {
    const instruction = await create(w.A);
    const v1 = instruction.draft?.id as string;
    await json(await publish(w.A, v1), 200);

    const edit = await admin(w.A).put(`${base(w.A)}/versions/${v1}/content/en`, {
      body: contentFixture(),
    });
    expect(await json(edit, 409)).toEqual({
      error: {
        code: 'conflict',
        message: 'Version is published',
        details: { reason: 'invalid_transition', status: 'published' },
      },
    });

    const opened = await admin(w.A).post(`${base(w.A)}/instructions/${instruction.id}/versions`);
    const v2 = await json<VersionDetail>(opened, 201);
    expect(v2).toMatchObject({ version: 2, status: 'draft', materialChange: false });
    const published = await json<VersionDetail>(
      await admin(w.A).get(`${base(w.A)}/versions/${v1}`),
      200,
    );
    expect(v2.content.map((c) => c.contentHash)).toEqual(
      published.content.map((c) => c.contentHash),
    );

    const again = await admin(w.A).post(`${base(w.A)}/instructions/${instruction.id}/versions`);
    expect((await json<VersionDetail>(again, 200)).id).toBe(v2.id);

    const saved = await admin(w.A).put(`${base(w.A)}/versions/${v2.id}/content/en`, {
      body: contentFixture({ title: 'New rules' }),
    });
    expect((await json<{ title: string }>(saved, 200)).title).toBe('New rules');
    const after = await json<VersionDetail>(
      await admin(w.A).get(`${base(w.A)}/versions/${v1}`),
      200,
    );
    expect(after.content.find((c) => c.locale === DriverLocale.en)?.title).toBe(
      published.content.find((c) => c.locale === DriverLocale.en)?.title,
    );

    await json(await publish(w.A, v2.id), 200);
    const versions = await json<{ items: VersionSummary[] }>(
      await admin(w.A).get(`${base(w.A)}/instructions/${instruction.id}/versions`),
      200,
    );
    expect(versions.items.map((v) => [v.version, v.status])).toEqual([
      [2, 'published'],
      [1, 'retired'],
    ]);
  });

  it('a material change makes earlier acknowledgements invalid, a minor one does not', async () => {
    const side = w.A;
    const instruction = await create(side, 'Material');
    await json(await publish(side, instruction.draft?.id as string), 200);
    const own = side.bookings.own;
    const ack = await asParty(tenantScope(side), (tx) =>
      recordAcknowledgement(tx, {
        tenantId: side.tenantId,
        bookingId: own.id,
        carrierId: own.carrierId,
        instructionId: instruction.id as never,
        locale: DriverLocale.pl,
        driverName: 'Jan Kowalski',
        channel: DriverChannel.link,
        score: 100,
        attempts: 1,
        completedAt: clock.now(),
        validityDays: 365,
      }),
    );
    const facts = { version: 1, bookingId: own.id, expiresAt: ack.expiresAt };
    const validNow = (i: ApplicableInstruction | undefined) =>
      isAcknowledgementValid(facts, {
        now: clock.now(),
        bookingId: null,
        materialFloor: i?.materialFloor ?? Number.NaN,
      });
    const find = (list: ApplicableInstruction[]) =>
      list.find((i) => i.instructionId === instruction.id);

    const openAndPublish = async (materialChange: boolean) => {
      const draft = await json<VersionDetail>(
        await admin(side).post(`${base(side)}/instructions/${instruction.id}/versions`),
        201,
      );
      await json(await publish(side, draft.id, materialChange), 200);
    };

    await openAndPublish(false);
    expect(validNow(find(await applicable(tenantScope(side), side)))).toBe(true);

    await openAndPublish(true);
    expect(find(await applicable(tenantScope(side), side))?.materialFloor).toBe(3);
    expect(validNow(find(await applicable(tenantScope(side), side)))).toBe(false);

    // Version 3 retires behind a minor version 4; a driver session still sees the floor.
    await openAndPublish(false);
    const asDriver = find(await applicable(driverScope(side), side));
    expect(asDriver).toMatchObject({ version: 4, materialFloor: 3, quiz: true });
    expect(validNow(asDriver)).toBe(false);
  });

  it('applies an instruction to its chosen sites only, and hides archived ones', async () => {
    const side = w.A;
    const res = await admin(side).post(`${base(side)}/instructions`, {
      body: { name: 'Site two only', allSites: false, siteIds: [side.sites[1].id] },
    });
    const instruction = await json<Instruction>(res, 201);
    expect(instruction.siteIds).toEqual([side.sites[1].id]);
    await json(await publish(side, instruction.draft?.id as string), 200);
    const at = async (siteId: SiteId) =>
      (await applicable(tenantScope(side), side, siteId)).some(
        (i) => i.instructionId === instruction.id,
      );
    expect(await at(side.sites[0].id)).toBe(false);
    expect(await at(side.sites[1].id)).toBe(true);

    await json(
      await admin(side).patch(`${base(side)}/instructions/${instruction.id}`, {
        body: { archived: true },
      }),
      200,
    );
    expect(await at(side.sites[1].id)).toBe(false);
  });

  it('rejects a foreign site with 404 and an inconsistent site choice with 422', async () => {
    const foreign = await admin(w.A).post(`${base(w.A)}/instructions`, {
      body: { name: 'Foreign', allSites: false, siteIds: [w.B.sites[0].id] },
    });
    expect(foreign.status).toBe(404);
    const both = await admin(w.A).post(`${base(w.A)}/instructions`, {
      body: { name: 'Both', allSites: true, siteIds: [w.A.sites[0].id] },
    });
    const body = await json<{ error: { details: { issues: { path: unknown[] }[] } } }>(both, 422);
    expect(body.error.details.issues.map((i) => i.path)).toEqual([['siteIds']]);
  });
});

describe('SF-02 quiz', () => {
  it('publishes only with 3 to 5 questions in every locale', async () => {
    const instruction = await create(w.A, 'Quiz');
    const draftId = instruction.draft?.id as string;
    const put = (locale: string, questions: unknown[]) =>
      admin(w.A).put(`${base(w.A)}/versions/${draftId}/content/${locale}`, {
        body: contentFixture({ questions: questions as never }),
      });

    await json(await put('ro', QUIZ.slice(0, 2)), 200);
    await json(await put('hu', []), 200);
    expect(await json(await publish(w.A, draftId), 409)).toMatchObject({
      error: {
        code: 'conflict',
        details: { reason: 'quiz_incomplete', locales: ['ro', 'hu'], min: 3, max: 5 },
      },
    });

    const six = [...QUIZ, ...QUIZ].map((q, i) => ({ ...q, id: `q${i}` }));
    const tooMany = await json<{ error: { details: { issues: { path: unknown[] }[] } } }>(
      await put('ro', six),
      422,
    );
    expect(tooMany.error.details.issues[0]?.path).toEqual(['questions']);

    const badAnswer = await put('ro', [...QUIZ.slice(0, 2), { ...QUIZ[2], correct: 2 }]);
    expect(badAnswer.status).toBe(422);

    await json(await put('ro', QUIZ), 200);
    await json(await put('hu', [...QUIZ, { ...QUIZ[0], id: 'q4' }]), 200);
    const published = await json<VersionDetail>(await publish(w.A, draftId), 200);
    expect(published.status).toBe('published');
  });

  it('rejects questions without safety.quiz, and publishes without them', async () => {
    const instruction = await create(w.B, 'Plain');
    const draftId = instruction.draft?.id as string;
    const res = await admin(w.B).put(`${base(w.B)}/versions/${draftId}/content/en`, {
      body: contentFixture(),
    });
    expect(await json(res, 403)).toMatchObject({
      error: { code: 'entitlement_required', details: { key: 'safety.quiz' } },
    });
    await json(
      await admin(w.B).put(`${base(w.B)}/versions/${draftId}/content/en`, {
        body: contentFixture({ questions: [] }),
      }),
      200,
    );
    await json(await publish(w.B, draftId), 200);
  });
});

describe('safety.max_briefing_templates', () => {
  it('answers 409 limit_reached beyond the limit, counting unarchived instructions', async () => {
    const side = (await world({ packages: { A: PackageId.start } })).A;
    const first = await create(side, 'One');
    await create(side, 'Two');
    const third = await admin(side).post(`${base(side)}/instructions`, {
      body: { name: 'Three', allSites: true, siteIds: [] },
    });
    expect(await json(third, 409)).toEqual({
      error: {
        code: 'limit_reached',
        message: 'Limit safety.max_briefing_templates of 2 reached',
        details: { key: 'safety.max_briefing_templates', limit: 2 },
      },
    });
    const count = () =>
      ownerCount('safety_instruction', eq(safetyInstruction.tenantId, side.tenantId));
    expect(await count()).toBe(2);

    const archive = (archived: boolean) =>
      admin(side).patch(`${base(side)}/instructions/${first.id}`, { body: { archived } });
    await json(await archive(true), 200);
    await create(side, 'Three');
    expect((await archive(false)).status).toBe(409);
    expect(await count()).toBe(3);
  });
});

describe('recordAcknowledgement', () => {
  it('stores the content hash and statement of the locale, and a driver may relink it', async () => {
    const side = w.A;
    const instruction = await create(side, 'Recorded');
    const draft = await draftOf(side, instruction);
    await json(await publish(side, draft.id), 200);
    const own = side.bookings.own;
    const record = (validityDays: number) =>
      asParty(driverScope(side), (tx) =>
        recordAcknowledgement(tx, {
          tenantId: side.tenantId,
          bookingId: own.id,
          carrierId: own.carrierId,
          instructionId: instruction.id as never,
          locale: DriverLocale.uk,
          driverName: 'Олег',
          channel: DriverChannel.link,
          score: 67,
          attempts: 2,
          completedAt: clock.now(),
          validityDays,
        }),
      );
    const first = await record(30);
    expect(first.expiresAt).toEqual(new Date(clock.now().getTime() + 30 * 86_400_000));
    const second = await record(0);
    expect(second.expiresAt).toBeNull();

    const [row] = await ownerDb()
      .select()
      .from(safetyAcknowledgement)
      .where(eq(safetyAcknowledgement.id, second.id));
    const uk = draft.content.find((c) => c.locale === DriverLocale.uk);
    expect(row).toMatchObject({
      versionId: draft.id,
      locale: 'uk',
      statementShown: uk?.statement,
      score: 67,
      attempts: 2,
      channel: 'link',
      expiresAt: null,
    });
    expect(row?.contentHash.toString('hex')).toBe(uk?.contentHash);
    // link_acknowledgement (U6a) upserts as the driver; a repeated briefing replaces the link.
    for (const ack of [first, second]) {
      await asParty(driverScope(side), (tx) =>
        tx
          .insert(bookingAcknowledgement)
          .values({
            bookingId: own.id,
            instructionId: instruction.id as never,
            acknowledgementId: ack.id,
            tenantId: side.tenantId,
            siteId: own.siteId,
            via: 'completed',
            linkedByParty: 'driver',
          })
          .onConflictDoUpdate({
            target: [bookingAcknowledgement.bookingId, bookingAcknowledgement.instructionId],
            set: { acknowledgementId: ack.id },
          }),
      );
    }
    const links = await ownerDb()
      .select({ id: bookingAcknowledgement.acknowledgementId })
      .from(bookingAcknowledgement)
      .where(
        and(
          eq(bookingAcknowledgement.bookingId, own.id),
          eq(bookingAcknowledgement.instructionId, instruction.id as never),
        ),
      );
    expect(links).toEqual([{ id: second.id }]);
  });
});
