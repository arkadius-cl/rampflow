import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';

const generated = JSON.parse(
  readFileSync(new URL('../../openapi.gen.json', import.meta.url), 'utf8'),
) as unknown;

describe('API docs', () => {
  it('answers 404 not_found on both paths without the flag', async () => {
    const app = createApp({ apiDocs: false });
    for (const path of ['/api/docs', '/api/docs/init.js', '/api/openapi.json']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(404);
      expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
    }
  });

  describe('with the flag', () => {
    const app = createApp({ apiDocs: true });

    it('serves openapi.gen.json as JSON', async () => {
      const res = await app.request('/api/openapi.json');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
      expect(await res.json()).toEqual(generated);
    });

    it('serves our page and init script, with no absolute URLs and no inline script', async () => {
      const page = await app.request('/api/docs');
      expect(page.status).toBe(200);
      expect(page.headers.get('Content-Type')).toMatch(/^text\/html/);
      const html = await page.text();
      expect(html).toContain('<script src="/api/docs/init.js"></script>');
      expect(html).not.toMatch(/<script>/);

      const init = await app.request('/api/docs/init.js');
      expect(init.status).toBe(200);
      const js = await init.text();
      expect(js).toContain("url: '/api/openapi.json'");
      expect(js).toContain('withCredentials: true');

      for (const text of [html, js]) expect(text).not.toMatch(/https?:\/\//);
    });

    it('serves the Swagger UI assets from swagger-ui-dist', async () => {
      const res = await app.request('/api/docs/swagger-ui-bundle.js');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^(text|application)\/javascript/);
      expect((await app.request('/api/docs/swagger-ui.css')).status).toBe(200);
    });

    it("does not serve the package's petstore initializer or other files", async () => {
      for (const path of ['/api/docs/swagger-initializer.js', '/api/docs/package.json']) {
        const res = await app.request(path);
        expect(res.status, path).toBe(404);
        expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
      }
    });

    it('keeps the security headers on the page', async () => {
      const res = await app.request('/api/docs');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    });
  });
});
