import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/public/invitations` by modules/index.ts. U2 adds its routes. */
export const publicApi = new Hono<AppEnv>();
