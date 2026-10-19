// Runs before every test file in its worker: points DATABASE_URL and MIGRATION_DATABASE_URL at
// this worker's clone of the template database, creating it on first use. It must run before
// anything imports src/kernel/env.ts, which reads DATABASE_URL once.
import { afterAll } from 'vitest';
import {
  databaseOf,
  ensureDatabase,
  requireUrl,
  withClient,
  withDatabase,
} from '../scripts/db-setup.ts';
import { templateDatabase, workerDatabase } from './names.ts';

const owner = requireUrl('MIGRATION_DATABASE_URL');
const app = requireUrl('DATABASE_URL');
const base = databaseOf(app).replace(/_test_\d+$/, '');
const worker = workerDatabase(base, process.env.VITEST_POOL_ID ?? '1');

if (databaseOf(app) !== worker) {
  await withClient(withDatabase(owner, 'postgres'), async (admin) => {
    // CREATE DATABASE ... TEMPLATE fails while another worker clones the same template.
    await admin.query(`select pg_advisory_lock(hashtext('rampflow:clone:' || $1))`, [base]);
    await ensureDatabase(admin, worker, templateDatabase(base));
  });
  process.env.DATABASE_URL = withDatabase(app, worker).toString();
  process.env.MIGRATION_DATABASE_URL = withDatabase(owner, worker).toString();
}

afterAll(async () => {
  const { pool } = await import('../src/db/pool.ts');
  const { closeOwnerDb } = await import('./db.ts');
  await Promise.all([pool.end(), closeOwnerDb()]);
});
