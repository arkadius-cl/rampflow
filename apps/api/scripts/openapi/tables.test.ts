import {
  ApiParty,
  ApiSection,
  GuardKind,
  HttpMethod,
  Limit,
  Module,
  Permission,
  StoryId,
} from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { type } from '../../src/kernel/describe.ts';
import type { Operation } from './document.ts';
import { markers } from './sections.ts';
import { applyTables, renderTables } from './tables.ts';

const checkIn: Operation = {
  file: 'modules/yard/routes.tenant.ts',
  section: ApiSection.yard,
  endpoint: {
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/check-in',
    party: ApiParty.tenant,
    meta: {
      id: 'yard.gate.checkIn',
      stories: [StoryId.YD_02],
      description: '`{ plateSeen? }`; 409 `safety_missing` | under enforcement',
      limits: [Limit.core.max_sites],
      responses: { 200: type<unknown>() },
    },
    validators: {},
    guards: [
      { kind: GuardKind.module, id: Module.yard },
      { kind: GuardKind.permission, key: Permission.yard.gate },
    ],
  },
};

const inspect: Operation = {
  file: 'modules/core/invitations/routes.public.ts',
  section: ApiSection.auth,
  endpoint: {
    method: HttpMethod.POST,
    path: '/api/public/invitations/inspect',
    party: ApiParty.public,
    meta: { id: 'core.invitations.inspect', stories: [], description: 'Inspect.', responses: {} },
    validators: { json: z.object({ token: z.string() }) },
    guards: [],
  },
};

describe('renderTables', () => {
  it('renders the uniform columns from the guards and the op() metadata', () => {
    const tables = renderTables([checkIn, inspect]);
    expect(tables.get(ApiSection.yard)?.split('\n').slice(2)).toEqual([
      '| POST | `/api/t/:orgId/yard/bookings/:bookingId/check-in` | tenant | `yard.gate` | module `yard`; limit `core.max_sites` | YD-02 | `yard/routes.tenant.ts` | `{ plateSeen? }`; 409 `safety_missing` \\| under enforcement |',
    ]);
    expect(tables.get(ApiSection.auth)).toContain(
      '| POST | `/api/public/invitations/inspect` | public | token |  |  | `core/invitations/routes.public.ts` | Inspect. |',
    );
  });
});

describe('applyTables', () => {
  const yard = markers(ApiSection.yard);
  const doc = `# API\n\nProse before.\n\n${yard.start}\n\n| old |\n\n${yard.end}\n\nProse after.\n`;

  it('rewrites only what lies between the markers', () => {
    const tables = new Map([['Yard', '| new |']] as const);
    expect(applyTables(doc, tables)).toEqual({
      text: `# API\n\nProse before.\n\n${yard.start}\n\n| new |\n\n${yard.end}\n\nProse after.\n`,
      problems: [],
    });
  });

  it('reports a section whose markers are missing', () => {
    const tables = new Map([['Driver', '| new |']] as const);
    expect(applyTables(doc, tables).problems).toEqual([
      'api-routes.md: missing <!-- routes:driver:start --> … <!-- routes:driver:end -->',
    ]);
  });
});
