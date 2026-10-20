import { readFileSync } from 'node:fs';
import { Feature, Module, Permission, ValidationTarget } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { requireEntitlement, requireModule, requirePermission } from './access.ts';
import { describedBy, noBody, op, STORY_IDS, type } from './describe.ts';
import { onError } from './errors.ts';
import { validate } from './validate.ts';

const meta = {
  id: 'toy.things.listThings',
  stories: ['MD-03'],
  description: 'Lists the things.',
  responses: { 200: type<{ items: string[] }>(), 204: noBody },
} as const;

describe('op()', () => {
  it('passes the request through and records its metadata', async () => {
    const mw = op(meta);
    const app = new Hono().get('/things', mw, (c) => c.json({ items: ['a'] }, 200));
    const res = await app.request('/things');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: ['a'] });
    expect(describedBy(mw)).toEqual({ kind: 'op', meta });
  });

  it('knows exactly the story IDs of mvp-scope.md', () => {
    const scope = readFileSync(
      new URL('../../../../docs/explanation/mvp-scope.md', import.meta.url),
      'utf8',
    );
    const inDocs = new Set(scope.match(/\b[A-Z]{2}-\d{2}\b/g));
    expect([...STORY_IDS].sort()).toEqual([...inDocs].sort());
  });
});

describe('validate()', () => {
  const Param = z.object({ thingId: z.uuid() });
  const Query = z.object({ limit: z.coerce.number().int().min(1) });
  const Body = z.object({ name: z.string().min(1) });
  const byParam = validate(ValidationTarget.param, Param);
  const byQuery = validate(ValidationTarget.query, Query);
  const byJson = validate(ValidationTarget.json, Body);
  const app = new Hono()
    .post('/things/:thingId', byParam, byQuery, byJson, (c) =>
      c.json(
        {
          ...c.req.valid(ValidationTarget.param),
          ...c.req.valid(ValidationTarget.query),
          ...c.req.valid(ValidationTarget.json),
        },
        200,
      ),
    )
    .onError(onError);
  const thingId = '01a1553d-581a-73e8-9dab-91b3572905c5';
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('answers 404 not_found for a malformed path parameter', async () => {
    const res = await post('/things/nope?limit=1', { name: 'x' });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('answers 422 with the zod paths for a bad query and a bad body', async () => {
    const query = await post(`/things/${thingId}?limit=0`, { name: 'x' });
    expect(query.status).toBe(422);
    expect(await query.json()).toMatchObject({
      error: { code: 'validation_failed', details: { issues: [{ path: ['limit'] }] } },
    });
    const body = await post(`/things/${thingId}?limit=1`, { name: '' });
    expect(body.status).toBe(422);
    expect(await body.json()).toMatchObject({
      error: { code: 'validation_failed', details: { issues: [{ path: ['name'] }] } },
    });
  });

  it('lets a valid request through', async () => {
    const res = await post(`/things/${thingId}?limit=2`, { name: 'x' });
    expect(await res.json()).toEqual({ thingId, limit: 2, name: 'x' });
  });

  it('records the target and the schema', () => {
    expect(describedBy(byParam)).toEqual({ kind: 'validator', target: 'param', schema: Param });
    expect(describedBy(byQuery)).toEqual({ kind: 'validator', target: 'query', schema: Query });
    expect(describedBy(byJson)).toEqual({ kind: 'validator', target: 'json', schema: Body });
  });
});

describe('guards', () => {
  it('record their key on the middleware Hono stores in app.routes', () => {
    const app = new Hono()
      .use('/yard/*', requireModule(Module.yard))
      .post(
        '/yard/check-in',
        requirePermission(Permission.yard.gate),
        requireEntitlement(Feature.yard.call_to_dock),
        (c) => c.body(null, 204),
      );
    expect(app.routes.map((r) => describedBy(r.handler))).toEqual([
      { kind: 'guard', guard: { kind: 'module', id: 'yard' } },
      { kind: 'guard', guard: { kind: 'permission', key: 'yard.gate' } },
      { kind: 'guard', guard: { kind: 'entitlement', key: 'yard.call_to_dock' } },
      undefined,
    ]);
  });
});
