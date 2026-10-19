import type { StaffLocale } from '@rampflow/shared';
import type { Instruction } from '@rampflow/shared/modules/safety/api.authoring';
import type { RegisterPage } from '@rampflow/shared/modules/safety/api.register';
import { ACK_STATUSES } from '@rampflow/shared/modules/safety/validity';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { asParty, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type WorldBooking, type WorldSide, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { appUser } from '../../core/schema.ts';
import type { InstructionId } from '../schema.ts';
import { safetyAcknowledgement } from '../schema.ts';
import { type RecordedAcknowledgement, recordAcknowledgement } from './acknowledgements.ts';

const DAY = 86_400_000;
const start = new Date();
const clock = testClock(start);
const app = createApp({ clock });

let side: WorldSide;
let rules: Instruction;
let acks: Record<
  'kowalski' | 'rival' | 'otherSite' | 'perVisit' | 'expired',
  RecordedAcknowledgement
>;

const base = () => `/api/t/${side.tenantId}/safety`;
const search = (body: object) =>
  as(app, side.users.dispatcher).post(`${base()}/acknowledgements/search`, { body });

async function page(body: object): Promise<RegisterPage> {
  const res = await search(body);
  const text = await res.text();
  expect(res.status, text).toBe(200);
  return JSON.parse(text) as RegisterPage;
}
const ids = async (body: object) => (await page(body)).items.map((i) => i.id).sort();

beforeAll(async () => {
  side = (await world()).A;
  const admin = as(app, side.users.tenant_admin);
  const created = await admin.post(`${base()}/instructions`, {
    body: { name: 'Site rules', allSites: true, siteIds: [] },
  });
  rules = (await created.json()) as Instruction;
  await admin.post(`${base()}/versions/${rules.draft?.id}/publish`, {
    body: { materialChange: false },
  });

  const record = (b: WorldBooking, driverName: string, completedAt: Date, validityDays: number) =>
    asParty({ party: 'driver', tenantId: side.tenantId, bookingId: b.id, channel: 'link' }, (tx) =>
      recordAcknowledgement(tx, {
        tenantId: side.tenantId,
        bookingId: b.id,
        carrierId: b.carrierId,
        instructionId: rules.id as InstructionId,
        locale: 'pl',
        driverName,
        channel: 'link',
        score: 100,
        attempts: 1,
        completedAt,
        validityDays,
      }),
    );
  const { own, rival, otherSite } = side.bookings;
  acks = {
    expired: await record(own, 'Piotr Nowak', new Date(start.getTime() - 40 * DAY), 30),
    kowalski: await record(own, 'Jan Kowalski', new Date(start.getTime() - 3 * DAY), 365),
    rival: await record(rival, '=HYPERLINK("x")', new Date(start.getTime() - 2 * DAY), 365),
    otherSite: await record(otherSite, 'Anna Kowalska', new Date(start.getTime() - DAY), 365),
    perVisit: await record(own, 'Ewa Zielińska', new Date(start.getTime() - 3600_000), 0),
  };
});

describe('SF-03 acknowledgement register', () => {
  it('lists newest first with instruction, version, booking, site and status', async () => {
    const { items, nextCursor } = await page({});
    expect(items.map((i) => i.id)).toEqual([
      acks.perVisit.id,
      acks.otherSite.id,
      acks.rival.id,
      acks.kowalski.id,
      acks.expired.id,
    ]);
    expect(nextCursor).toBeNull();
    expect(items[3]).toMatchObject({
      driverName: 'Jan Kowalski',
      status: 'valid',
      instruction: { id: rules.id, name: 'Site rules' },
      version: { version: 1 },
      booking: { id: side.bookings.own.id, code: side.bookings.own.code },
      carrierId: side.carrierId,
      site: { id: side.sites[0].id, timeZone: 'Europe/Berlin' },
      locale: 'pl',
    });
  });

  it('filters by site, carrier, driver name, version and expiry', async () => {
    const sorted = (...list: RecordedAcknowledgement[]) => list.map((a) => a.id).sort();
    expect(await ids({ siteId: side.sites[1].id })).toEqual(sorted(acks.otherSite));
    expect(await ids({ carrierId: side.rivalCarrierId })).toEqual(sorted(acks.rival));
    expect(await ids({ driverName: 'kowalsk' })).toEqual(sorted(acks.kowalski, acks.otherSite));
    expect(await ids({ driverName: '%' })).toEqual([]);
    expect(await ids({ versionId: acks.kowalski.versionId, siteId: side.sites[0].id })).toEqual(
      sorted(acks.expired, acks.kowalski, acks.rival, acks.perVisit),
    );
    expect(await ids({ status: 'expired' })).toEqual(sorted(acks.expired));
    expect(await ids({ status: 'visit_only' })).toEqual(sorted(acks.perVisit));
    expect(await ids({ status: 'valid' })).toEqual(
      sorted(acks.kowalski, acks.rival, acks.otherSite),
    );
  });

  it('agrees between the expiry filter and the status of every row, after a material change', async () => {
    const admin = as(app, side.users.tenant_admin);
    const draft = (await (
      await admin.post(`${base()}/instructions/${rules.id}/versions`)
    ).json()) as { id: string };
    await admin.post(`${base()}/versions/${draft.id}/publish`, { body: { materialChange: true } });
    for (const status of ACK_STATUSES) {
      const { items } = await page({ status });
      expect(items.every((i) => i.status === status)).toBe(true);
    }
    expect((await page({ status: 'outdated' })).items).toHaveLength(5);
  });

  it('pages with an opaque cursor', async () => {
    const first = await page({ limit: 2 });
    expect(first.items).toHaveLength(2);
    const second = await page({ limit: 2, cursor: first.nextCursor });
    const third = await page({ limit: 2, cursor: second.nextCursor });
    expect(third.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...third.items].map((i) => i.id);
    expect(all).toEqual((await page({})).items.map((i) => i.id));
    expect((await search({ cursor: 'nonsense' })).status).toBe(422);
  });

  it('leaves out restricted acknowledgements', async () => {
    await ownerDb()
      .update(safetyAcknowledgement)
      .set({ restrictedAt: start })
      .where(eq(safetyAcknowledgement.id, acks.expired.id));
    expect(await ids({})).not.toContain(acks.expired.id);
    await ownerDb()
      .update(safetyAcknowledgement)
      .set({ restrictedAt: null })
      .where(eq(safetyAcknowledgement.id, acks.expired.id));
  });

  it('exports CSV with a BOM, the user delimiter and header, and site-offset timestamps', async () => {
    const csv = async (locale: StaffLocale, body: object) => {
      await ownerDb()
        .update(appUser)
        .set({ locale })
        .where(eq(appUser.id, side.users.dispatcher.id));
      const res = await as(app, side.users.dispatcher).post(`${base()}/acknowledgements.csv`, {
        body,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      return new Uint8Array(await res.arrayBuffer());
    };
    const de = await csv('de', { driverName: 'Jan' });
    expect([...de.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // TextDecoder drops the BOM checked above.
    const [header, row, ...rest] = new TextDecoder().decode(de).split('\r\n');
    expect(header).toBe(
      'Abgeschlossen am;Gültig bis;Status;Fahrer;Spediteur;Buchung;Standort;Unterweisung;Version;Sprache;Quiz-Ergebnis (%);Versuche;Kanal',
    );
    expect(rest).toEqual(['']);
    const cells = row?.split(';') ?? [];
    expect(cells[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/);
    expect(new Date(cells[0] as string).getTime()).toBe(
      Math.floor((start.getTime() - 3 * DAY) / 1000) * 1000,
    );
    expect(cells.slice(3, 6)).toEqual([
      'Jan Kowalski',
      `Carrier ${side.carrierId.slice(0, 4)}`,
      side.bookings.own.code,
    ]);

    const en = new TextDecoder().decode(await csv('en', { carrierId: side.rivalCarrierId }));
    const lines = en.split('\r\n');
    expect(lines[0]?.startsWith('Completed at,Valid until,Status,Driver,')).toBe(true);
    expect(lines[1]).toContain(`,"'=HYPERLINK(""x"")",`);
  });
});
