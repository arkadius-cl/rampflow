import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// lint/value-literals.grit (design D6 of openspec/changes/00-central-value-sets) run on its
// fixtures: each `// expect: <rule>` marker must get that rule's diagnostic on its line, and no
// other line may get one.

const root = join(import.meta.dirname, '../../..');
const fixtures = join(root, 'lint/fixtures');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');

/** A fragment of each rule's message, which is all that tells the plugin's diagnostics apart. */
const ruleMessages = {
  comparison: 'Compare against the central value set member',
  'case-label': 'as the case label (`case X.member:`',
  'zod-enum': '(`z.enum(X)`',
  'zod-literal': '(`z.literal(X.member)`',
  'const-array': 'Define the value set once as a self-keyed object',
  member: 'Use the central value set member for this field',
  'self-keyed': 'Value sets live in a `values.ts` of `packages/shared`',
} as const;
type Rule = keyof typeof ruleMessages;

type Diagnostic = {
  category: string;
  message: string;
  location: { path: string; start: { line: number } };
};

async function fixtureFiles(): Promise<string[]> {
  const entries = await readdir(fixtures, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

async function expectedHits(): Promise<string[]> {
  const hits: string[] = [];
  for (const file of await fixtureFiles()) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const rule = /\/\/ expect: ([\w-]+)/.exec(line)?.[1];
      if (rule) hits.push(`${relative(root, file)}:${index + 1} ${rule}`);
    });
  }
  return hits.sort();
}

async function lint(): Promise<Diagnostic[]> {
  const run = promisify(execFile);
  const args = [
    biome,
    'lint',
    '--config-path=lint/biome.fixtures.json',
    '--reporter=json',
    '--max-diagnostics=none',
    'lint/fixtures',
  ];
  // Biome exits 1 when it reports errors; the JSON report is on stdout either way.
  const { stdout } = await run(process.execPath, args, { cwd: root }).catch(
    (error: { stdout?: string }) => {
      if (!error.stdout) throw error;
      return { stdout: error.stdout };
    },
  );
  return (JSON.parse(stdout) as { diagnostics: Diagnostic[] }).diagnostics;
}

function ruleOf(message: string): Rule | undefined {
  return (Object.keys(ruleMessages) as Rule[]).find((rule) => message.includes(ruleMessages[rule]));
}

describe('lint/value-literals.grit', () => {
  it('fires each rule on its bad samples, names the fix, and stays silent on the good ones', async () => {
    const [expected, diagnostics] = await Promise.all([expectedHits(), lint()]);
    const actual = diagnostics
      .map((d) => `${d.location.path}:${d.location.start.line} ${ruleOf(d.message) ?? d.message}`)
      .sort();

    expect(actual).toEqual(expected);
    expect(diagnostics.every((d) => d.category.startsWith('plugin'))).toBe(true);
    expect(new Set(expected.map((hit) => hit.split(' ')[1]))).toEqual(
      new Set(Object.keys(ruleMessages)),
    );
    for (const { message } of diagnostics) {
      expect(message).toContain('@rampflow/shared/');
      expect(message).toContain('see AGENTS.md, Value sets');
    }
  });
});
