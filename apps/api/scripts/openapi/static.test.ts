import { fileURLToPath } from 'node:url';
import { JsonSchemaType } from '@rampflow/shared/values';
import { describe, expect, it } from 'vitest';
import { fixtureApp } from './fixtures/app.ts';
import { collectEndpoints } from './runtime.ts';
import { analyze } from './static.ts';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const fixtures = at('./fixtures/');

function run(allowlist: string[]) {
  return analyze({
    tsconfig: at('../../tsconfig.json'),
    app: { file: at('./fixtures/app.ts'), type: 'FixtureApp' },
    sources: [at('./fixtures/app.ts')],
    root: fixtures,
    endpoints: collectEndpoints(fixtureApp.routes),
    allowlist: new Set(allowlist),
    isResponseFile: (file) => file === at('./fixtures/types.ts'),
    converter: { isShared: (file) => file.startsWith(fixtures), isTime: () => false },
  });
}

describe('analyze', () => {
  const result = run(['toy.things.listed', 'toy.things.legacy', 'toy.missing.op']);

  it('reports every check with the operation and the reason', () => {
    expect(result.problems).toEqual([
      'toy.things.put 200: LocalView must be imported from packages/shared',
      'toy.missing.op: on the allowlist but no such operation',
      expect.stringMatching(
        /^toy\.things\.extra 200: the handler output does not match ThingView: Property 'extra' is missing/,
      ),
      'toy.things.create 200: the handler answers 200 without a named type in op()',
      'toy.things.inline 200: the handler answers 200 without a named type in op()',
      'toy.things.listed: every JSON response has a named type; remove it from the allowlist',
      'toy.things.delete 204: the handler answers 204; declare noBody or file()',
      'toy.things.delete 200: declared but the handler never answers it',
    ]);
  });

  it('references named types and inlines the allowlisted output', () => {
    expect(result.responses.get('toy.things.list')).toEqual(
      new Map([[200, { $ref: '#/components/schemas/ThingView' }]]),
    );
    expect(result.components.ThingView).toEqual({
      type: JsonSchemaType.object,
      properties: {
        id: { type: JsonSchemaType.string },
        name: { type: JsonSchemaType.string },
        createdAt: { type: JsonSchemaType.string, format: 'date-time' },
      },
      required: ['id', 'name', 'createdAt'],
    });
    expect(result.responses.get('toy.things.legacy')?.get(200)).toEqual({
      type: JsonSchemaType.object,
      properties: {
        items: {
          type: JsonSchemaType.array,
          items: {
            type: JsonSchemaType.object,
            properties: {
              id: { type: JsonSchemaType.string },
              name: { type: JsonSchemaType.string },
              createdAt: { type: JsonSchemaType.string },
            },
            required: ['id', 'name', 'createdAt'],
          },
        },
        at: { type: JsonSchemaType.string },
      },
      required: ['items', 'at'],
    });
    expect(result.files.get('toy.things.list')).toBe('app.ts');
  });
});
