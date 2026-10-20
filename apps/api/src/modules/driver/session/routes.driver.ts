import { StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { noBody, op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { clearDriverCookie } from './cookie.ts';

/** Mounted at `/api/driver/session`: forgets this booking on this phone (DR-01). */
export const driver = new Hono<AppEnv>().delete(
  '/',
  op({
    id: 'driver.session.deleteSession',
    stories: [StoryId.DR_01],
    description: '204, clears the cookie',
    responses: { 204: noBody },
  }),
  (c) => {
    clearDriverCookie(c);
    return c.body(null, 204);
  },
);
