import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorCode } from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { DRIVER_CSP } from './static.ts';

function dist(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), `<html>${label}</html>`);
  writeFileSync(join(dir, 'assets', 'main-abc123.js'), `console.log('${label}')`);
  return dir;
}

describe('static serving of the built SPAs', () => {
  const app = createApp({ static: { web: dist('web'), driver: dist('driver') } });

  it('serves the web app with an index fallback for client routes', async () => {
    for (const path of ['/', '/t/123/plan']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('<html>web</html>');
      expect(res.headers.get('Cache-Control')).toBe('no-cache');
    }
  });

  it('serves hashed assets as immutable', async () => {
    const res = await app.request('/assets/main-abc123.js');
    expect(await res.text()).toBe("console.log('web')");
    expect(res.headers.get('Cache-Control')).toContain('immutable');
  });

  it('serves the driver PWA under /d without a referrer and with its CSP', async () => {
    for (const path of ['/d', '/d/anything']) {
      const res = await app.request(path);
      expect(await res.text()).toBe('<html>driver</html>');
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('Content-Security-Policy')).toBe(
        "default-src 'self'; img-src 'self' data:; connect-src 'self'",
      );
    }
    expect(await (await app.request('/d/assets/main-abc123.js')).text()).toBe(
      "console.log('driver')",
    );
  });

  it('keeps unknown API paths as JSON 404s', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: ErrorCode.not_found } });
  });
});

describe('security headers', () => {
  const roots = { web: dist('web'), driver: dist('driver') };
  const baseline = (res: Response) => {
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  };

  it('go on JSON answers, errors and the SPA, without HSTS outside production', async () => {
    const app = createApp({ static: roots });
    for (const path of ['/api/health', '/api/nope', '/', '/t/123/plan']) {
      const res = await app.request(path);
      baseline(res);
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    }
  });

  it('keep the driver CSP and its no-referrer policy under /d', async () => {
    const res = await createApp({ static: roots }).request('/d/anything');
    baseline(res);
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Content-Security-Policy')).toBe(DRIVER_CSP);
  });

  it('add HSTS in production', async () => {
    const app = createApp({ static: roots, production: true });
    for (const path of ['/api/health', '/', '/d/anything']) {
      const res = await app.request(path);
      expect(res.headers.get('Strict-Transport-Security')).toBe(
        'max-age=31536000; includeSubDomains',
      );
    }
  });
});
