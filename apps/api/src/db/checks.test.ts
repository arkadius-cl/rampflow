import { SqlState } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { type World, world } from '../../test/world.ts';
import { seedBriefing } from '../modules/safety/authoring/fixtures.ts';

// The closed columns that got their check with the central value sets (ADR-0019): the database
// rejects a value outside the set even for the table owner, who bypasses row-level security.

const CHECK_FAILED = { cause: { code: SqlState.check_violation } };

let w: World;
beforeAll(async () => {
  w = await world();
  await seedBriefing(ownerDb(), w.A);
});

describe('value set checks', () => {
  it('rejects an unknown booking event type', async () => {
    await expect(
      ownerDb().execute(sql`
        insert into booking_event (tenant_id, site_id, booking_id, carrier_id, type, at, actor_party)
        select tenant_id, site_id, id, carrier_id, 'forged', now(), 'system'
        from booking where id = ${w.A.bookings.own.id}`),
    ).rejects.toMatchObject(CHECK_FAILED);
  });

  it('rejects an unknown party that linked an acknowledgement', async () => {
    await expect(
      ownerDb().execute(sql`
        insert into booking_acknowledgement
          (booking_id, instruction_id, acknowledgement_id, tenant_id, site_id, via, linked_by_party)
        select booking_id, instruction_id, acknowledgement_id, tenant_id, site_id, via, 'staff'
        from booking_acknowledgement where booking_id = ${w.A.bookings.own.id} limit 1`),
    ).rejects.toMatchObject(CHECK_FAILED);
  });

  it('rejects an unknown email template in the outbox', async () => {
    await expect(
      ownerDb().execute(sql`
        insert into outbox_message (template, to_email, locale, payload)
        values ('core.probe', 'probe@checks.test', 'en', '{}')`),
    ).rejects.toMatchObject(CHECK_FAILED);
  });
});
