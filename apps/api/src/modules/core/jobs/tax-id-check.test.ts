import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TaxIdStatus, TaxIdType, ViesError } from '@rampflow/shared/modules/core/values';
import { JobName, OrgKind, values } from '@rampflow/shared/values';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import type { TenantId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { type RunnableJob, runJobTick } from '../../../kernel/jobs.ts';
import { jobRun, org } from '../schema.ts';
import { makeTaxIdCheckJob, viesClient } from './tax-id-check.ts';

// Design decision 12 through the job runner, against a fake VIES on a local port.

/** How the fake VIES answers one VAT number. */
type Behavior = { valid: boolean } | { error: ViesError; status: number } | { hang: true };

const behaviors = new Map<string, Behavior>();
const asked: string[] = [];
let server: Server;
let url = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const { countryCode, vatNumber } = JSON.parse(raw) as {
        countryCode: string;
        vatNumber: string;
      };
      asked.push(`${countryCode}${vatNumber}`);
      const b = behaviors.get(`${countryCode}${vatNumber}`) ?? { valid: true };
      if ('hang' in b) return;
      res.setHeader('Content-Type', 'application/json');
      if ('valid' in b) {
        res.end(JSON.stringify({ countryCode, vatNumber, valid: b.valid, name: '---' }));
        return;
      }
      res.statusCode = b.status;
      res.end(JSON.stringify({ actionSucceed: false, errorWrappers: [{ error: b.error }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// Older than every tenant other test files create, so a batch of 50 reaches these first.
const T0 = new Date('2001-03-05T08:00:00Z');
const HOUR = 60 * 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);
const clock = testClock(T0);
const mailer = { send: async () => undefined };

const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const uniqueVat = () => `DE9${randomDigits(8)}`;

async function tenantWith(type: TaxIdType, value: string, behavior?: Behavior) {
  if (behavior) behaviors.set(value, behavior);
  const id = randomUUID() as TenantId;
  await ownerDb()
    .insert(org)
    .values({
      id,
      kind: OrgKind.tenant,
      name: `VIES ${id.slice(0, 8)}`,
      createdAt: T0,
      taxIdType: type,
      taxIdValue: value,
      taxIdStatus: type === TaxIdType.eu_vat ? TaxIdStatus.pending : TaxIdStatus.unverified,
    });
  return { id, value };
}

const taxIdOf = async (id: TenantId) => {
  const [row] = await ownerDb()
    .select({ status: org.taxIdStatus, checkedAt: org.taxIdCheckedAt })
    .from(org)
    .where(eq(org.id, id));
  return row;
};

async function tick(job: RunnableJob, now: Date) {
  clock.set(now);
  const result = await runJobTick(job, { clock, mailer });
  expect(result.ran).toBe(true);
  return result.ran ? result.stats : {};
}

const vies = () => makeTaxIdCheckJob(viesClient(url, 300));

describe('VIES tax id check', () => {
  it('stores verified for valid: true and unverified for valid: false and INVALID_INPUT', async () => {
    const valid = await tenantWith(TaxIdType.eu_vat, uniqueVat(), { valid: true });
    const invalid = await tenantWith(TaxIdType.eu_vat, uniqueVat(), { valid: false });
    const malformed = await tenantWith(TaxIdType.eu_vat, uniqueVat(), {
      error: ViesError.INVALID_INPUT,
      status: 400,
    });
    const now = at(5 * 60_000);
    await tick(vies(), now);
    expect(await taxIdOf(valid.id)).toEqual({ status: TaxIdStatus.verified, checkedAt: now });
    expect(await taxIdOf(invalid.id)).toEqual({ status: TaxIdStatus.unverified, checkedAt: now });
    expect(await taxIdOf(malformed.id)).toEqual({
      status: TaxIdStatus.unverified,
      checkedAt: now,
    });
    // A decided number is never asked again.
    asked.length = 0;
    await tick(vies(), at(2 * HOUR));
    expect(asked).not.toContain(valid.value);
    expect(asked).not.toContain(invalid.value);
  });

  it('stores unavailable for MS_UNAVAILABLE and a timeout, retried only after an hour', async () => {
    const down = await tenantWith(TaxIdType.eu_vat, uniqueVat(), {
      error: ViesError.MS_UNAVAILABLE,
      status: 500,
    });
    const slow = await tenantWith(TaxIdType.eu_vat, uniqueVat(), { hang: true });
    const first = at(10 * 60_000);
    await tick(vies(), first);
    expect(await taxIdOf(down.id)).toEqual({ status: TaxIdStatus.unavailable, checkedAt: first });
    expect(await taxIdOf(slow.id)).toEqual({ status: TaxIdStatus.unavailable, checkedAt: first });

    asked.length = 0;
    await tick(vies(), new Date(first.getTime() + 59 * 60_000));
    expect(asked).not.toContain(down.value);

    behaviors.set(down.value, { valid: true });
    const later = new Date(first.getTime() + 61 * 60_000);
    await tick(vies(), later);
    expect(asked).toContain(down.value);
    expect(await taxIdOf(down.id)).toEqual({ status: TaxIdStatus.verified, checkedAt: later });
  });

  it('stops retrying 7 days after the tenant was created', async () => {
    const down = await tenantWith(TaxIdType.eu_vat, uniqueVat(), {
      error: ViesError.SERVICE_UNAVAILABLE,
      status: 500,
    });
    await tick(vies(), at(6 * 24 * HOUR));
    expect((await taxIdOf(down.id))?.status).toBe(TaxIdStatus.unavailable);
    behaviors.set(down.value, { valid: true });
    asked.length = 0;
    const late = at(7 * 24 * HOUR + HOUR);
    await tick(vies(), late);
    expect(asked).not.toContain(down.value);
    expect(await taxIdOf(down.id)).toEqual({
      status: TaxIdStatus.unavailable,
      checkedAt: at(6 * 24 * HOUR),
    });
  });

  it('leaves de_stn and pl_nip tenants untouched', async () => {
    const stn = await tenantWith(TaxIdType.de_stn, `DE9${randomDigits(8)}00001`);
    const nip = await tenantWith(TaxIdType.pl_nip, randomDigits(10));
    asked.length = 0;
    await tick(vies(), at(20 * 60_000));
    expect(asked).not.toContain(stn.value);
    expect(asked.some((v) => v.endsWith(nip.value))).toBe(false);
    for (const t of [stn, nip]) {
      expect(await taxIdOf(t.id)).toEqual({ status: TaxIdStatus.unverified, checkedAt: null });
    }
  });

  it('checks nothing with an empty VIES_URL', async () => {
    const pending = await tenantWith(TaxIdType.eu_vat, uniqueVat(), { valid: true });
    asked.length = 0;
    const stats = await tick(makeTaxIdCheckJob(viesClient('')), at(30 * 60_000));
    expect(asked).toEqual([]);
    expect(Object.values(stats).every((n) => n === 0)).toBe(true);
    expect(await taxIdOf(pending.id)).toEqual({ status: TaxIdStatus.pending, checkedAt: null });
  });

  it('logs counts per result only', async () => {
    const vat = uniqueVat();
    await tenantWith(TaxIdType.eu_vat, vat, { valid: true });
    const stats = await tick(vies(), at(40 * 60_000));
    expect(Object.keys(stats).sort()).toEqual(
      [TaxIdStatus.unavailable, TaxIdStatus.unverified, TaxIdStatus.verified].sort(),
    );
    expect(Object.values(stats).every((n) => Number.isInteger(n))).toBe(true);
    expect(stats[TaxIdStatus.verified]).toBeGreaterThanOrEqual(1);
    const [logged] = await ownerDb()
      .select({ stats: jobRun.stats })
      .from(jobRun)
      .where(and(eq(jobRun.job, JobName.core_tax_id_check), eq(jobRun.startedAt, at(40 * 60_000))))
      .orderBy(desc(jobRun.finishedAt))
      .limit(1);
    expect(logged?.stats).toEqual(stats);
    expect(JSON.stringify(logged)).not.toContain(vat.slice(2));
    expect(values(TaxIdStatus)).toEqual(expect.arrayContaining(Object.keys(stats)));
  });
});
