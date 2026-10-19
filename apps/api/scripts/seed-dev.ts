// Seeds this checkout's development database with demo data, idempotently:
//   pnpm db:seed
// Runs as the owner role (MIGRATION_DATABASE_URL), past RLS. Each module's seed lives in
// scripts/seed/<module>.ts, exports `seed(ctx)`, and runs in its own transaction in the order
// below. A later seed finds earlier data by name (for example `findOrg(ctx.db, 'tenant', ...)`).
// Accounts and passwords are listed in docs/how-to/run-locally.md.
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { requireUrl } from './db-setup.ts';
import type { SeedContext } from './seed/context.ts';

/** Add one line per module, after the modules whose data it uses. */
const SEEDS = ['core', 'sites', 'safety', 'booking', 'carriers'] as const;

const pool = new pg.Pool({ connectionString: requireUrl('MIGRATION_DATABASE_URL').toString() });
try {
  const db = drizzle(pool);
  for (const name of SEEDS) {
    const mod: { seed: (ctx: SeedContext) => Promise<void> } = await import(`./seed/${name}.ts`);
    await db.transaction((tx) =>
      mod.seed({ db: tx, log: (line) => console.log(`${name}: ${line}`) }),
    );
  }
  console.log(`Seeded ${SEEDS.join(', ')}`);
} finally {
  await pool.end();
}
