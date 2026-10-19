import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { onError, onNotFound } from './errors.ts';
import { health } from './routes/health.ts';

export const app = new Hono()
  .use(logger())
  .basePath('/api')
  .route('/health', health)
  .onError(onError)
  .notFound(onNotFound);

export type AppType = typeof app;
