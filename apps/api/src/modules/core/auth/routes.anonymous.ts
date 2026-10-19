import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/auth` by modules/index.ts. U2 adds its routes. */
export const anonymous = new Hono<AppEnv>();
