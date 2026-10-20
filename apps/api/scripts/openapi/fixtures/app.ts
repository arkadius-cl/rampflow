import { Hono } from 'hono';
import { noBody, op, type } from '../../../src/kernel/describe.ts';
import type { CountView, ThingView } from './types.ts';

// One route per check of static.ts; static.test.ts asserts the problems they cause.

interface LocalView {
  id: string;
}

const thing: ThingView = { id: 't1', name: 'Thing', createdAt: new Date(0) };
const meta = { stories: ['MD-03'], description: 'Fixture.' } as const;

export const fixtureApp = new Hono()
  .get(
    '/api/t/:orgId/things',
    op({ ...meta, id: 'toy.things.list', responses: { 200: type<ThingView>() } }),
    (c) => c.json(thing, 200),
  )
  .get(
    '/api/t/:orgId/things/extra',
    op({ ...meta, id: 'toy.things.extra', responses: { 200: type<ThingView>() } }),
    (c) => c.json({ ...thing, extra: 1 }, 200),
  )
  .post(
    '/api/t/:orgId/things',
    op({ ...meta, id: 'toy.things.create', responses: { 201: type<ThingView>() } }),
    (c) => (c.req.query('again') ? c.json(thing, 200) : c.json(thing, 201)),
  )
  .get('/api/t/:orgId/inline', op({ ...meta, id: 'toy.things.inline', responses: {} }), (c) =>
    c.json({ n: 1 }, 200),
  )
  .get(
    '/api/t/:orgId/listed',
    op({ ...meta, id: 'toy.things.listed', responses: { 200: type<CountView>() } }),
    (c) => c.json({ count: 1 } satisfies CountView, 200),
  )
  .get('/api/t/:orgId/legacy', op({ ...meta, id: 'toy.things.legacy', responses: {} }), (c) =>
    c.json({ items: [thing], at: new Date(0) }, 200),
  )
  .delete(
    '/api/t/:orgId/things/:thingId',
    op({ ...meta, id: 'toy.things.delete', responses: { 200: type<ThingView>() } }),
    (c) => c.body(null, 204),
  )
  .put(
    '/api/t/:orgId/things/:thingId',
    op({ ...meta, id: 'toy.things.put', responses: { 200: type<LocalView>(), 202: noBody } }),
    (c) => (c.req.query('later') ? c.body(null, 202) : c.json({ id: 'x' }, 200)),
  );

export type FixtureApp = typeof fixtureApp;
