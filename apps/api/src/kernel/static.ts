import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

export interface StaticRoots {
  /** `apps/web/dist`: the back office SPA at `/`. */
  web: string;
  /** `apps/driver/dist`: the driver PWA at `/d/` (ADR-0008). */
  driver: string;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
/** ADR-0008: no third-party scripts, images or connections in the driver PWA. */
export const DRIVER_CSP = "default-src 'self'; img-src 'self' data:; connect-src 'self'";

/** The driver PWA's path prefix; the staff app serves everything else. */
const DRIVER_PREFIX = '/d';

/**
 * Serves the built SPAs in production: files as they are, every other path gets the app's
 * `index.html`. Hashed assets are immutable; `index.html` is always revalidated.
 */
export function staticFiles(roots: StaticRoots): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    await next();
    if (!c.res.ok) return;
    c.res.headers.set('Cache-Control', c.req.path.includes('/assets/') ? IMMUTABLE : 'no-cache');
    if (c.req.path === DRIVER_PREFIX || c.req.path.startsWith(`${DRIVER_PREFIX}/`)) {
      c.res.headers.set('Referrer-Policy', 'no-referrer');
      c.res.headers.set('Content-Security-Policy', DRIVER_CSP);
    }
  });
  const spa = (prefix: string, root: string) => {
    const rel = relative(process.cwd(), root);
    app.use(
      `${prefix}/*`,
      serveStatic({
        root: rel,
        rewriteRequestPath: (p) => (prefix ? p.slice(prefix.length) || '/' : p),
      }),
    );
    app.get(`${prefix}/*`, async (c, next) => {
      if (c.req.path.startsWith('/api/') || !existsSync(join(root, 'index.html'))) return next();
      return serveStatic({ root: rel, path: 'index.html' })(c, next);
    });
  };
  spa(DRIVER_PREFIX, roots.driver);
  spa('', roots.web);
  return app;
}
