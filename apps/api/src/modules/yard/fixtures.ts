import { sql } from 'drizzle-orm';
import { ownerDb } from '../../../test/db.ts';
import { type World, world } from '../../../test/world.ts';

/**
 * A world whose sessions stay valid under a pinned test clock: world() opens them at the real
 * now, and the yard tests run on fixed days around the slots and DST changes they check.
 */
export async function yardWorld(options?: Parameters<typeof world>[0]): Promise<World> {
  const w = await world(options);
  const ids = [w.A, w.B].flatMap((side) => Object.values(side.users).map((u) => u.id));
  await ownerDb().execute(
    sql`update session set expires_at = '2100-01-01Z', last_seen_at = '2100-01-01Z'
        where user_id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
  );
  return w;
}
