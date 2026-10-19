import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/public/carrier-invitations` by modules/index.ts. U7 adds its routes. */
export const publicApi = new Hono<AppEnv>();
