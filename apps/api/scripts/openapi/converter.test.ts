import { JsonSchemaType } from '@rampflow/shared/values';
import ts from 'typescript-6';
import { describe, expect, it } from 'vitest';
import { ConversionError, Converter } from './converter.ts';

const SHARED = '/virtual/packages/shared/src/modules/toy/api.ts';
const TIME = '/virtual/packages/shared/src/time/index.ts';
const PROBE = '/virtual/apps/api/src/probe.ts';

const files: Record<string, string> = {
  [TIME]: `
    declare const brand: unique symbol;
    export type LocalDate = string & { [brand]: 'LocalDate' };
    export type LocalTime = string & { [brand]: 'LocalTime' };`,
  [SHARED]: `
    import type { LocalDate, LocalTime } from '../../time/index.ts';
    export type Kind = 'pool' | 'single';
    export interface Hours { day: LocalDate; opens: LocalTime }
    export interface ResourceView {
      id: string & { readonly __brand: 'ResourceId' };
      kind: Kind;
      name: string;
      cap: number | null;
      active: boolean;
      note?: string | null;
      createdAt: Date;
      hours: Hours[];
      pair: [number, string];
      tags: Record<string, number>;
      level: 1 | 2 | 3;
      flag: true;
    }
    export interface Node { name: string; children: Node[] }
    export interface Generic<T> { value: T }`,
  [PROBE]: `
    import type { ResourceView, Node, Generic, Kind } from '../../../packages/shared/src/modules/toy/api.ts';
    interface Local { id: string; at: Date }
    export type Named = ResourceView;
    export type Recursive = Node;
    export type Inline = { items: ResourceView[]; total: number };
    export type Nullable = Kind | null;
    export type Unknown = { value: unknown };
    export type LocalOnly = Local;
    export type OfGeneric = Generic<string>;
    export type WithAny = { a: { b: any } };
    export type WithFunction = { run: () => void };
    export type WithBytes = { bytes: Uint8Array };
    export type WithSymbol = { [Symbol.iterator]: number };
    export type Loop = { next: Loop };`,
};

function load() {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2023,
    lib: ['lib.es2023.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const real = host.getSourceFile;
  host.getSourceFile = (name, lang, ...rest) =>
    files[name] !== undefined
      ? ts.createSourceFile(name, files[name], lang)
      : real(name, lang, ...rest);
  const realExists = host.fileExists;
  host.fileExists = (name) => files[name] !== undefined || realExists(name);
  host.directoryExists = (name) => name.startsWith('/virtual') || ts.sys.directoryExists(name);
  const program = ts.createProgram({ rootNames: [PROBE], options, host });
  const checker = program.getTypeChecker();
  const probe = program.getSourceFile(PROBE);
  if (!probe) throw new Error('probe missing');
  const types = new Map<string, ts.Type>();
  for (const s of probe.statements) {
    if (ts.isTypeAliasDeclaration(s)) types.set(s.name.text, checker.getTypeAtLocation(s.name));
  }
  const converter = new Converter(program, {
    isShared: (f) => f.includes('/packages/shared/src/'),
    isTime: (f) => f.includes('/packages/shared/src/time/'),
  });
  const convert = (name: string) => converter.toSchema(types.get(name) as ts.Type, name);
  return { converter, convert };
}

const failure = (run: () => unknown) => {
  try {
    run();
  } catch (err) {
    if (err instanceof ConversionError) return { path: err.path, reason: err.reason };
    throw err;
  }
  throw new Error('expected a ConversionError');
};

describe('Converter', () => {
  it('turns a named shared type into a component with every supported kind', () => {
    const { converter, convert } = load();
    expect(convert('Named')).toEqual({ $ref: '#/components/schemas/ResourceView' });
    expect(converter.components.ResourceView).toEqual({
      type: JsonSchemaType.object,
      properties: {
        id: { type: JsonSchemaType.string },
        kind: { $ref: '#/components/schemas/Kind' },
        name: { type: JsonSchemaType.string },
        cap: { type: ['number', 'null'] },
        active: { type: JsonSchemaType.boolean },
        note: { type: ['string', 'null'] },
        createdAt: { type: JsonSchemaType.string, format: 'date-time' },
        hours: { type: JsonSchemaType.array, items: { $ref: '#/components/schemas/Hours' } },
        pair: {
          type: JsonSchemaType.array,
          prefixItems: [{ type: JsonSchemaType.number }, { type: JsonSchemaType.string }],
          minItems: 2,
          maxItems: 2,
        },
        tags: {
          type: JsonSchemaType.object,
          additionalProperties: { type: JsonSchemaType.number },
        },
        level: { type: JsonSchemaType.number, enum: [1, 2, 3] },
        flag: { type: JsonSchemaType.boolean, const: true },
      },
      required: [
        'id',
        'kind',
        'name',
        'cap',
        'active',
        'createdAt',
        'hours',
        'pair',
        'tags',
        'level',
        'flag',
      ],
    });
    expect(converter.components.Kind).toEqual({
      type: JsonSchemaType.string,
      enum: ['pool', 'single'],
    });
    expect(converter.components.Hours).toEqual({
      type: JsonSchemaType.object,
      properties: {
        day: { type: JsonSchemaType.string, format: 'date' },
        opens: { type: JsonSchemaType.string, pattern: '^(([01]\\d|2[0-3]):[0-5]\\d|24:00)$' },
      },
      required: ['day', 'opens'],
    });
  });

  it('references recursive named types and inlines unnamed or local ones', () => {
    const { converter, convert } = load();
    expect(convert('Recursive')).toEqual({ $ref: '#/components/schemas/Node' });
    expect(converter.components.Node?.properties?.children).toEqual({
      type: JsonSchemaType.array,
      items: { $ref: '#/components/schemas/Node' },
    });
    expect(convert('Inline')).toEqual({
      type: JsonSchemaType.object,
      properties: {
        items: { type: JsonSchemaType.array, items: { $ref: '#/components/schemas/ResourceView' } },
        total: { type: JsonSchemaType.number },
      },
      required: ['items', 'total'],
    });
    expect(convert('Nullable')).toEqual({
      type: ['string', 'null'],
      enum: ['pool', 'single', null],
    });
    expect(convert('Unknown')).toEqual({
      type: JsonSchemaType.object,
      properties: { value: {} },
      required: ['value'],
    });
    expect(convert('LocalOnly')).toEqual({
      type: JsonSchemaType.object,
      properties: {
        id: { type: JsonSchemaType.string },
        at: { type: JsonSchemaType.string, format: 'date-time' },
      },
      required: ['id', 'at'],
    });
    expect(convert('OfGeneric')).toEqual({
      type: JsonSchemaType.object,
      properties: { value: { type: JsonSchemaType.string } },
      required: ['value'],
    });
  });

  it('fails on what JSON cannot carry, naming the property path', () => {
    const { convert } = load();
    expect(failure(() => convert('WithAny'))).toEqual({
      path: 'WithAny.a.b',
      reason: 'any is not a JSON shape',
    });
    expect(failure(() => convert('WithFunction'))).toEqual({
      path: 'WithFunction.run',
      reason: 'a function is not a JSON shape',
    });
    expect(failure(() => convert('WithBytes'))).toEqual({
      path: 'WithBytes.bytes',
      reason: expect.stringMatching(/^unsupported built-in Uint8Array/),
    });
    expect(failure(() => convert('WithSymbol')).path).toBe('WithSymbol');
    expect(failure(() => convert('Loop'))).toEqual({
      path: 'Loop.next',
      reason: 'recursive unnamed type',
    });
  });
});
