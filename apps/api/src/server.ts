import { serve } from '@hono/node-server';
import { APP_NAME } from '@rampflow/shared';
import { app } from './app.ts';
import { sql } from './db/client.ts';
import { env } from './env.ts';

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`${APP_NAME} api listening on http://localhost:${info.port}`);
});

function shutdown() {
  server.close();
  void sql.end({ timeout: 5 });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
