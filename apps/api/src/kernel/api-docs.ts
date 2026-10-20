import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { AppEnv } from './env.ts';

const DOCUMENT = fileURLToPath(new URL('../../openapi.gen.json', import.meta.url));
const OWN = fileURLToPath(new URL('./api-docs/', import.meta.url));
const SWAGGER = dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));

/**
 * The files under `/api/docs/` and the directory each comes from. Only what our page loads:
 * the package's own `index.html` and `swagger-initializer.js` open the petstore demo.
 */
const FILES = new Map([
  ['index.html', OWN],
  ['init.js', OWN],
  ['swagger-ui.css', SWAGGER],
  ['swagger-ui-bundle.js', SWAGGER],
  ['swagger-ui-standalone-preset.js', SWAGGER],
  ['favicon-32x32.png', SWAGGER],
]);

/** Swagger UI at `/docs` and the OpenAPI document at `/openapi.json`; development only (D9). */
export function apiDocs() {
  const document = readFileSync(DOCUMENT, 'utf8');
  const app = new Hono<AppEnv>()
    .get('/openapi.json', (c) => c.body(document, 200, { 'Content-Type': 'application/json' }))
    .get('/docs', serveStatic({ root: OWN, path: 'index.html' }));
  for (const [file, root] of FILES) app.get(`/docs/${file}`, serveStatic({ root, path: file }));
  return app;
}
