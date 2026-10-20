import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import type { Instruction } from '@rampflow/shared/modules/safety/api.authoring';
import type {
  RegisterFilterOptions,
  RegisterPage,
} from '@rampflow/shared/modules/safety/api.register';
import { AckStatus } from '@rampflow/shared/modules/safety/values';
import { DriverLocale, ScopeParty, StaffLocale, values } from '@rampflow/shared/values';
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
    asParty(
      {
        party: ScopeParty.driver,
        tenantId: side.tenantId,
        bookingId: b.id,
        channel: DriverChannel.link,
      },
      (tx) =>
        recordAcknowledgement(tx, {
          tenantId: side.tenantId,
          bookingId: b.id,
          carrierId: b.carrierId,
          instructionId: rules.id as InstructionId,
          locale: DriverLocale.pl,
          driverName,
          channel: DriverChannel.link,
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
      status: AckStatus.valid,
      instruction: { id: rules.id, name: 'Site rules' },
      version: { version: 1 },
      booking: { id: side.bookings.own.id, code: side.bookings.own.code },
      carrierId: side.carrierId,
      site: { id: side.sites[0].id, timeZone: 'Europe/Berlin' },
      locale: DriverLocale.pl,
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
    expect(await ids({ status: AckStatus.expired })).toEqual(sorted(acks.expired));
    expect(await ids({ status: AckStatus.visit_only })).toEqual(sorted(acks.perVisit));
    expect(await ids({ status: AckStatus.valid })).toEqual(
      sorted(acks.kowalski, acks.rival, acks.otherSite),
    );
  });

  it('offers the non-draft versions and the carriers of the register as filter choices', async () => {
    const admin = as(app, side.users.tenant_admin);
    const draft = await admin.post(`${base()}/instructions/${rules.id}/versions`);
    expect(draft.status).toBe(201);
    const res = await as(app, side.users.dispatcher).get(`${base()}/acknowledgements/filters`);
    expect(res.status).toBe(200);
    const options = (await res.json()) as RegisterFilterOptions;
    expect(options.instructions).toEqual([
      { id: rules.id, name: 'Site rules', versions: [{ id: acks.kowalski.versionId, version: 1 }] },
    ]);
    expect(options.carriers.map((c) => c.id).sort()).toEqual(
      [side.carrierId, side.rivalCarrierId].sort(),
    );
    expect(options.carriers.find((c) => c.id === side.carrierId)?.name).toBe(
      `Carrier ${side.carrierId.slice(0, 4)}`,
    );
  });

  it('agrees between the expiry filter and the status of every row, after a material change', async () => {
    const admin = as(app, side.users.tenant_admin);
    const draft = (await (
      await admin.post(`${base()}/instructions/${rules.id}/versions`)
    ).json()) as { id: string };
    await admin.post(`${base()}/versions/${draft.id}/publish`, { body: { materialChange: true } });
    for (const status of values(AckStatus)) {
      const { items } = await page({ status });
      expect(items.every((i) => i.status === status)).toBe(true);
    }
    expect((await page({ status: AckStatus.outdated })).items).toHaveLength(5);
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
    const de = await csv(StaffLocale.de, { driverName: 'Jan' });
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

    const en = new TextDecoder().decode(
      await csv(StaffLocale.en, { carrierId: side.rivalCarrierId }),
    );
    const lines = en.split('\r\n');
    expect(lines[0]?.startsWith('Completed at,Valid until,Status,Driver,')).toBe(true);
    expect(lines[1]).toContain(`,"'=HYPERLINK(""x"")",`);
  });
});
