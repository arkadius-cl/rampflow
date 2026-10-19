import { afterAll, describe, expect, it } from 'vitest';
import { app } from './app.ts';
import { sql } from './db/client.ts';

afterAll(() => sql.end());

describe('api', () => {
  it('reports ok health against the real database', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('answers unknown routes with the JSON error envelope', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'No route for /api/nope' },
    });
  });
});
