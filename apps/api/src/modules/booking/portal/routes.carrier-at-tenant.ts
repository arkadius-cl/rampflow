import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/c/:orgId/at/:tenantId` by modules/index.ts. U8 adds its routes. */
export const carrierAtTenant = new Hono<AppEnv>();
