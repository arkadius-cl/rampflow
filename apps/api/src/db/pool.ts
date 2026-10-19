import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../kernel/env.ts';

// Only db/ and kernel/ import this file (Biome noRestrictedImports). Handlers use c.var.db.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool);

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
