import { describe, expect, it } from 'vitest';

// Vite's `import.meta.glob`, which vitest provides; shared has no vite types of its own.
declare global {
  interface ImportMeta {
    glob<T>(patterns: string | string[], options: { eager: true }): Record<string, T>;
  }
}

// Every value set of the repo: the exports of each `values.ts` and of `values/*.ts` whose
// members are all strings (ADR-0019). Key trees and tuples such as `everyScope` are not sets.
const files = {
  ...import.meta.glob<Record<string, unknown>>('../modules/*/values.ts', { eager: true }),
  ...import.meta.glob<Record<string, unknown>>(
    ['./*.ts', '!./index.ts', '!./*.test.ts', '!./*.typetest.ts'],
    {
      eager: true,
    },
  ),
};

const isSet = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((m) => typeof m === 'string');

const sets = Object.entries(files).flatMap(([file, exports]) =>
  Object.entries(exports)
    .filter(([, v]) => isSet(v))
    .map(([name, set]) => ({
      name: `${file.replace(/^\.\.?\//, '')}#${name}`,
      set: set as Record<string, string>,
    })),
);

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

describe('value sets', () => {
  it('are found', () => {
    expect(sets.map((s) => s.name)).toContain('modules/booking/values.ts#BookingStatus');
  });

  it('use the value as key whenever the value is an identifier', () => {
    const bad = sets.flatMap(({ name, set }) =>
      Object.entries(set)
        .filter(([key, value]) => identifier.test(value) && key !== value)
        .map(([key, value]) => `${name}.${key} = '${value}'`),
    );
    expect(bad).toEqual([]);
  });

  it('are never empty', () => {
    expect(sets.filter(({ set }) => Object.keys(set).length === 0).map((s) => s.name)).toEqual([]);
  });

  it('are pairwise different', () => {
    const byValues = new Map<string, string[]>();
    for (const { name, set } of sets) {
      const key = [...new Set(Object.values(set))].sort().join('|');
      byValues.set(key, [...(byValues.get(key) ?? []), name]);
    }
    expect([...byValues.values()].filter((names) => names.length > 1)).toEqual([]);
  });
});
