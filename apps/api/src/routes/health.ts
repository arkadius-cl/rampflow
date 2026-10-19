import { Hono } from 'hono';
import { sql } from '../db/client.ts';

export const health = new Hono().get('/', async (c) => {
  try {
    await sql`select 1`;
    return c.json({ status: 'ok', db: 'ok' } as const, 200);
  } catch (err) {
    console.error('health: database check failed', err);
    return c.json({ status: 'degraded', db: 'error' } as const, 503);
  }
});
