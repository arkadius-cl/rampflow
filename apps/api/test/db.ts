import { DatabaseUrlVar } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { requireUrl } from '../scripts/db-setup.ts';
import { db } from '../src/db/pool.ts';
import { type Scope, type Tx, withScope } from '../src/db/scope.ts';

// Two connections per worker database:
// - the app pool (rampflow_app, under RLS): everything the system under test does, and every
//   assertion about what a party can see;
// - the owner pool (bypasses RLS): seeding fixtures across tenants and peeking at absence.
// The system under test never uses the owner pool.

let ownerPool: pg.Pool | undefined;

export function ownerDb() {
  ownerPool ??= new pg.Pool({
    connectionString: requireUrl(DatabaseUrlVar.MIGRATION_DATABASE_URL).toString(),
    max: 4,
  });
  return drizzle(ownerPool);
}
export type OwnerDb = ReturnType<typeof ownerDb>;

export async function closeOwnerDb(): Promise<void> {
  await ownerPool?.end();
  ownerPool = undefined;
}

/** Runs `fn` as the app role under `scope`, like a request does. */
export const asParty = <T>(scope: Scope, fn: (tx: Tx) => Promise<T>) => withScope(scope, fn);

/** A transaction as the app role with no scope at all: every RLS table must look empty. */
export const unscoped = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

/** Row count of a table as the owner, past RLS. */
export async function ownerCount(table: string, where = sql`true`): Promise<number> {
  const { rows } = await ownerDb().execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${where}`,
  );
  return rows[0]?.n ?? 0;
}
