import assert from 'node:assert/strict';
import { cpSync, globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-6';
import { check, createProgram, type Finding } from './check.ts';
import { fix } from './fix.ts';

// Each fixture line that must be reported ends in `// → <expected>`: the member, `create <union>`
// or `ignored`. Lines marked `// → silent` and unmarked lines must not be reported.

const FIXTURE = fileURLToPath(new URL('./fixtures/project', import.meta.url));
const copies: string[] = [];
after(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'values-check-'));
  cpSync(FIXTURE, dir, { recursive: true });
  copies.push(dir);
  return dir;
}

const run = (root: string) => check({ root, packages: ['.'] });
const sources = (root: string) =>
  globSync('**/*.{ts,tsx}', { cwd: root, exclude: (f) => f === 'node_modules' }).sort();

function expected(root: string): Map<string, string> {
  const marks = new Map<string, string>();
  for (const file of sources(root)) {
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const mark = line.match(/\/\/ → (.+)$/)?.[1];
        if (mark && mark !== 'silent') marks.set(`${file}:${i + 1}`, mark);
      });
  }
  return marks;
}

function actual(root: string, findings: readonly Finding[]): Map<string, string> {
  return new Map(
    findings.map((f) => [
      `${relative(root, f.file)}:${f.line}`,
      f.ignored !== undefined
        ? 'ignored'
        : f.verdict.kind === 'set'
          ? f.verdict.access
          : `create ${f.verdict.union.map((v) => `'${v}'`).join(' | ')}`,
    ]),
  );
}

function diagnostics(root: string): string[] {
  const { program } = createProgram(join(root, 'tsconfig.json'), []);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

const snapshot = (root: string) =>
  new Map(sources(root).map((f) => [f, readFileSync(join(root, f), 'utf8')]));

test('the fixture type-checks as written', () => {
  assert.deepEqual(diagnostics(FIXTURE), []);
});

test('reports each literal with its set, and nothing from libraries or components/ui', () => {
  const result = run(FIXTURE);
  assert.deepEqual([...actual(FIXTURE, result.findings)].sort(), [...expected(FIXTURE)].sort());
});

test('records the reason of an ignore comment', () => {
  const ignored = run(FIXTURE).findings.filter((f) => f.ignored !== undefined);
  assert.deepEqual(
    ignored.map((f) => f.ignored),
    ['the fixture proves that a comment suppresses one report'],
  );
});

test('--fix rewrites literals to members, adds imports, and type-checks', () => {
  const root = copy();
  const fixed = fix(root, run(root));
  const read = (file: string) => readFileSync(join(root, file), 'utf8');

  assert.deepEqual(diagnostics(root), []);
  assert.match(read('apps/web/src/badge.tsx'), /status=\{BookingStatus\.checked_in\}/);
  assert.match(read('apps/web/src/badge.tsx'), /^import \{ BookingStatus, LoadStatus \} from/m);
  assert.match(read('apps/web/src/typed.ts'), /^import \{ BookingStatus, type LoadStatus \} from/m);
  assert.match(read('apps/web/src/usage.ts'), /requirePermission\(Permission\.booking\.view\)/);
  assert.match(
    read('apps/web/src/usage.ts'),
    /^import \{ Permission \} from '@rampflow\/shared\/values';$/m,
  );
  assert.match(read('apps/web/src/usage.ts'), /load: LoadStatus\.confirmed/);
  assert.match(read('apps/web/src/usage.ts'), /party: 'staff'/);
  assert.match(read('apps/web/src/usage.ts'), /b\.status === 'no_show'/);
  assert.match(
    read('apps/web/src/extend.ts'),
    /^import \{ LoadStatus, BookingStatus \} from '@rampflow\/shared\/modules\/booking\/values';$/m,
  );
  const rules = read('packages/shared/src/modules/booking/rules.ts');
  assert.match(rules, /^import \{ BookingStatus \} from '\.\/values\.ts';$/m);
  assert.match(rules, /^import \{ Permission \} from '\.\.\/\.\.\/values\/keys\.ts';$/m);
  assert.equal(
    read('apps/web/src/reexport.ts').split('\n').slice(0, 1).join(),
    "import { BookingStatus } from '@rampflow/shared/modules/booking/values';",
  );
  assert.match(read('apps/web/src/reexport.ts'), /= \[BookingStatus\.cancelled\];/);
  assert.match(read('apps/web/src/clash.ts'), /role: RoleName = 'admin'/);
  assert.match(read('packages/shared/src/modules/booking/manifest.ts'), /= 'booking\.view'/);
  assert.deepEqual([...fixed.clashes.values()], ['Role is a local name']);
});

test('a second --fix changes nothing', () => {
  const root = copy();
  fix(root, run(root));
  const before = snapshot(root);
  const again = run(root);
  assert.deepEqual(
    again.findings
      .map((f) => f.verdict.kind === 'set' && !f.ignored && f.verdict.access)
      .filter(Boolean)
      .sort(),
    ['Role.admin'],
  );
  fix(root, again);
  assert.deepEqual(snapshot(root), before);
});
