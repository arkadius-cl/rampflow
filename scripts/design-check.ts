// Fails when web or driver code bypasses the design tokens (ADR-0021, docs/reference/design-system.md):
//   pnpm design:check                 scan apps/web/src and apps/driver/src, exit 1 on any finding
//   pnpm design:check --root <dir>    scan the same paths below another checkout (used to test it)
// `design-check-ignore: <reason>` on the line or the line above suppresses one line.
import { globSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesignRule, FIX, type Finding, scan } from './design-check/rules.ts';

const SCANNED = ['apps/web/src', 'apps/driver/src'];
/** Token files are the one place where raw colour values and font families belong. */
const SKIPPED = ['apps/web/src/styles/**', '**/*.gen.ts', '**/node_modules/**'];

const args = process.argv.slice(2);
const rootAt = args.indexOf('--root');
const ROOT =
  rootAt >= 0 && args[rootAt + 1]
    ? resolve(args[rootAt + 1] as string)
    : fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

const started = performance.now();
const files = SCANNED.flatMap((dir) =>
  globSync(`${dir}/**/*.{ts,tsx,css}`, { cwd: ROOT, exclude: SKIPPED }),
).sort();
const findings: Finding[] = files.flatMap((file) =>
  scan(file, readFileSync(join(ROOT, file), 'utf8')),
);

for (const f of findings) console.log(`${f.file}:${f.line}:${f.col}  ${f.rule}  ${f.text}`);
if (findings.length) {
  console.log('');
  for (const rule of Object.values(DesignRule)) {
    const count = findings.filter((f) => f.rule === rule).length;
    if (count) console.log(`${rule.padEnd(17)} ${String(count).padStart(4)}  ${FIX[rule]}`);
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `design:check: ${findings.length} reported in ${files.length} files under ${relative(process.cwd(), ROOT) || '.'} in ${seconds} s`,
);
process.exitCode = findings.length ? 1 : 0;
