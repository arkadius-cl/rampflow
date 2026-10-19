import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/driver` by modules/index.ts. U10 adds its routes. */
export const driver = new Hono<AppEnv>();
