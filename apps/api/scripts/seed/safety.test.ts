import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../test/db.ts';
import { world } from '../../test/world.ts';
import { DEMO_BRIEFING, seedBriefing } from './safety.ts';

// The Acme lookup of `seed` is one line; the briefing runs against a world tenant, so this file
// never races core.test.ts for the demo orgs.

describe('pnpm db:seed, safety', () => {
  it('publishes one briefing in 12 locales, Polish reviewed, and leaves it alone on a rerun', async () => {
    const { tenantId } = (await world()).A;
    const run = () => ownerDb().transaction((tx) => seedBriefing(tx, tenantId));
    expect(await run()).toBe(true);
    expect(await run()).toBe(false);
    expect(
      await ownerCount(
        'safety_instruction',
        sql`tenant_id = ${tenantId} and name = ${DEMO_BRIEFING}`,
      ),
    ).toBe(1);
    const published = sql`version_id in (select v.id from safety_version v
      join safety_instruction i on i.id = v.instruction_id
      where i.tenant_id = ${tenantId} and v.status = 'published')`;
    expect(await ownerCount('safety_content', published)).toBe(12);
    expect(await ownerCount('safety_content', sql`${published} and translation = 'source'`)).toBe(
      2,
    );
    expect(
      await ownerCount(
        'safety_content',
        sql`${published} and locale = 'pl' and translation = 'reviewed'`,
      ),
    ).toBe(1);
  });
});
