// Creates what this checkout needs in the shared Postgres cluster, idempotently:
//   tsx scripts/db-setup.ts            the rampflow_app role and this checkout's database
//   tsx scripts/db-setup.ts --migrate  apply apps/api/drizzle as the owner role
//   tsx scripts/db-setup.ts --reset    drop and recreate this checkout's database, then migrate;
//                                      needed after db:regen rewrote an applied migration
// Roles are cluster-wide, so every checkout converges the same role. Databases are per checkout
// (scripts/checkout-env.mjs), so this never touches another checkout's database.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const APP_ROLE = 'rampflow_app';
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function requireUrl(name: 'DATABASE_URL' | 'MIGRATION_DATABASE_URL'): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run through scripts/checkout-env.mjs.`);
  return new URL(value);
}

export const databaseOf = (url: URL) => decodeURIComponent(url.pathname.slice(1));

export function withDatabase(url: URL, database: string): URL {
  const next = new URL(url);
  next.pathname = `/${encodeURIComponent(database)}`;
  return next;
}

export async function withClient<T>(url: URL, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Creates or converges `rampflow_app`: LOGIN, NOBYPASSRLS, no superuser, the URL's password. */
export async function ensureAppRole(admin: pg.Client, appUrl: URL): Promise<void> {
  const user = decodeURIComponent(appUrl.username);
  if (user !== APP_ROLE) throw new Error(`DATABASE_URL must connect as ${APP_ROLE}, not ${user}`);
  const password = quoteLiteral(decodeURIComponent(appUrl.password));
  const attrs = `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${password}`;
  await admin.query(`DO $$ BEGIN
      CREATE ROLE ${APP_ROLE} ${attrs};
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);
  await admin.query(`ALTER ROLE ${APP_ROLE} ${attrs}`);
}

export async function ensureDatabase(
  admin: pg.Client,
  name: string,
  template?: string,
): Promise<'created' | 'exists'> {
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
  if (rowCount) return 'exists';
  try {
    const from = template ? ` TEMPLATE ${quoteIdent(template)}` : '';
    await admin.query(`CREATE DATABASE ${quoteIdent(name)}${from}`);
    return 'created';
  } catch (e) {
    if ((e as { code?: string }).code === '42P04') return 'exists';
    throw e;
  }
}

export async function dropDatabase(admin: pg.Client, name: string): Promise<void> {
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
}

export async function migrateDatabase(ownerUrl: URL): Promise<void> {
  const pool = new pg.Pool({ connectionString: ownerUrl.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: MIGRATIONS,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await pool.end();
  }
}

async function main() {
  const owner = requireUrl('MIGRATION_DATABASE_URL');
  const app = requireUrl('DATABASE_URL');
  const name = databaseOf(owner);
  if (databaseOf(app) !== name) {
    throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must name the same database');
  }
  if (process.argv.includes('--migrate')) {
    await migrateDatabase(owner);
    console.log(`Migrated ${name}`);
    return;
  }
  const reset = process.argv.includes('--reset');
  await withClient(withDatabase(owner, 'postgres'), async (admin) => {
    await ensureAppRole(admin, app);
    if (reset) await dropDatabase(admin, name);
    console.log(`Role ${APP_ROLE} ready; database ${name} ${await ensureDatabase(admin, name)}`);
  });
  if (reset) {
    await migrateDatabase(owner);
    console.log(`Migrated ${name}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
