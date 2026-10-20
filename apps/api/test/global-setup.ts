// Once per `vitest run`: converge the app role, then rebuild this checkout's template database
// `<db>_tpl` from the migrations and drop the worker databases of the previous run. Database
// names derive from DATABASE_URL, which scripts/checkout-env.mjs makes unique per checkout.

import { DatabaseUrlVar } from '@rampflow/shared/values';
import {
  databaseOf,
  dropDatabase,
  ensureAppRole,
  ensureDatabase,
  migrateDatabase,
  requireUrl,
  withClient,
  withDatabase,
} from '../scripts/db-setup.ts';
import { templateDatabase, workerPrefix } from './names.ts';

export default async function setup() {
  const owner = requireUrl(DatabaseUrlVar.MIGRATION_DATABASE_URL);
  const app = requireUrl(DatabaseUrlVar.DATABASE_URL);
  const base = databaseOf(app);
  await withClient(withDatabase(owner, 'postgres'), async (admin) => {
    await ensureAppRole(admin, app);
    const { rows } = await admin.query<{ datname: string }>(
      `select datname from pg_database where datname like $1 escape '!'`,
      [`${workerPrefix(base).replaceAll('_', '!_')}%`],
    );
    for (const { datname } of rows) await dropDatabase(admin, datname);
    await dropDatabase(admin, templateDatabase(base));
    await ensureDatabase(admin, templateDatabase(base));
  });
  await migrateDatabase(withDatabase(owner, templateDatabase(base)));
}
