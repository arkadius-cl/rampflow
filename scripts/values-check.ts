// Finds string literals checked against a closed value set and names the set member to use
// (design D7 of openspec/changes/00-central-value-sets):
//   pnpm values:check [package ...]          report, exit 1 when anything is found
//   pnpm values:check --fix [package ...]    rewrite literals that have a set to `X.member`
//   pnpm values:check --summary              also print the sets used and the unions without one
// Packages are paths such as `apps/web`. `// values-check-ignore: <reason>` on the line or the
// line above suppresses one report. Each package is checked in its own process.
import { execFile } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { check } from './values-check/check.ts';
import { fix } from './values-check/fix.ts';

/** One finding as printed, plain data so that it crosses the process boundary. */
interface Row {
  pkg: string;
  where: string;
  literal: string;
  /** `BookingStatus.no_show`, or absent when no set fits. */
  access?: string;
  set?: string;
  setFile?: string;
  union?: string[];
  ignored?: string;
  fixed?: boolean;
  /** Why `--fix` left a literal that has a set. */
  clash?: string;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const SELF = fileURLToPath(import.meta.url);
const PACKAGES = [
  'packages/shared',
  'packages/i18n',
  'apps/api',
  'apps/web',
  'apps/driver',
  'e2e',
] as const;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const named = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\/+$/, ''));
const unknown = named.filter((n) => !(PACKAGES as readonly string[]).includes(n));
if (unknown.length) {
  console.error(`values:check: unknown package ${unknown.join(', ')}; use ${PACKAGES.join(', ')}`);
  process.exit(2);
}
const packages = named.length ? named : [...PACKAGES];
const fixing = flags.includes('--fix');

if (flags.includes('--child')) {
  process.stdout.write(JSON.stringify(rowsOf(packages)));
} else {
  const started = performance.now();
  const rows =
    packages.length === 1 ? rowsOf(packages) : (await Promise.all(packages.map(child))).flat();
  report(rows, ((performance.now() - started) / 1000).toFixed(1));
}

function rowsOf(pkgs: string[]): Row[] {
  const result = check({ root: ROOT, packages: pkgs });
  const fixed = fixing ? fix(ROOT, result) : undefined;
  return result.findings.map((f) => ({
    pkg: f.pkg,
    where: `${relative(ROOT, f.file)}:${f.line}:${f.col}`,
    literal: f.literal,
    ...(f.verdict.kind === 'set'
      ? {
          access: f.verdict.access,
          set: f.verdict.set.name,
          setFile: relative(ROOT, f.verdict.set.file),
        }
      : { union: [...f.verdict.union] }),
    ...(f.ignored === undefined ? {} : { ignored: f.ignored }),
    ...(fixed?.done.has(f) ? { fixed: true } : {}),
    ...(fixed?.clashes.has(f) ? { clash: fixed.clashes.get(f) } : {}),
  }));
}

async function child(pkg: string): Promise<Row[]> {
  const run = promisify(execFile);
  const options = { maxBuffer: 256 * 1024 * 1024 };
  const { stdout } = await run(process.execPath, [SELF, '--child', ...flags, pkg], options);
  return JSON.parse(stdout) as Row[];
}

function report(rows: Row[], seconds: string) {
  const open = rows.filter((r) => !r.ignored && !r.fixed);
  const ignored = rows.filter((r) => r.ignored);
  for (const r of open) {
    const target = r.access
      ? `→ ${r.access}  (${r.setFile})`
      : `→ create a value set for ${unionText(r.union ?? [])}`;
    console.log(
      `${r.where}  '${r.literal}'  ${target}${r.clash ? `  [not fixed: ${r.clash}]` : ''}`,
    );
  }
  for (const r of ignored) console.log(`${r.where}  '${r.literal}'  ignored: ${r.ignored}`);
  if (flags.includes('--summary')) summary(open);

  console.log('');
  for (const pkg of packages) {
    const own = open.filter((r) => r.pkg === pkg);
    const withSet = own.filter((r) => r.access).length;
    const parts = [
      `${own.length} reported (${withSet} with a set, ${own.length - withSet} without)`,
      `${ignored.filter((r) => r.pkg === pkg).length} ignored`,
    ];
    if (fixing) parts.push(`${rows.filter((r) => r.pkg === pkg && r.fixed).length} fixed`);
    console.log(`${pkg.padEnd(16)} ${parts.join(', ')}`);
  }
  console.log(`values:check: ${open.length} reported, ${ignored.length} ignored in ${seconds} s`);
  process.exitCode = open.length ? 1 : 0;
}

function unionText(union: readonly string[]) {
  return union.map((v) => `'${v}'`).join(' | ');
}

function summary(open: Row[]) {
  const count = (keys: string[]) => {
    const counts = new Map<string, number>();
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  };
  console.log('\nSets used:');
  for (const [name, n] of count(open.flatMap((r) => (r.set ? [r.set] : [])))) {
    console.log(`  ${String(n).padStart(5)}  ${name}`);
  }
  console.log('\nUnions without a set:');
  for (const [text, n] of count(open.flatMap((r) => (r.union ? [unionText(r.union)] : [])))) {
    console.log(`  ${String(n).padStart(5)}  ${text}`);
  }
}
