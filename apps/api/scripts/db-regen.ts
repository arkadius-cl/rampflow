// Keeps exactly one migration per unit branch (ADR-0001, "Regenerate on rebase"): deletes
// every file under apps/api/drizzle that the base does not have, restores the base's meta/,
// and runs `drizzle-kit generate --name <unit>` once. The base is the merge-base with main, so
// `pnpm db:generate --name u4` during work and `pnpm db:regen --name u4` after a rebase are the
// same command. A rebase conflict in drizzle/meta needs no hand merge: run it and continue.
//   pnpm db:regen --name u4 [--base <ref>]
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { name: { type: 'string' }, base: { type: 'string' } },
});
if (!values.name || !/^u\d+[a-z0-9_]*$/.test(values.name)) {
  console.error('usage: pnpm db:regen --name <unit id, for example u4> [--base main]');
  process.exit(2);
}

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const drizzleDir = join(apiDir, 'drizzle');
const git = (...args: string[]) => execFileSync('git', args, { cwd: apiDir, encoding: 'utf8' });
const repoPath = (file: string) => relative(git('rev-parse', '--show-toplevel').trim(), file);

const base = values.base ?? git('merge-base', 'HEAD', 'main').trim();
const onBase = new Set(
  git('ls-tree', '-r', '--name-only', base, '--', repoPath(drizzleDir)).split('\n').filter(Boolean),
);
if (onBase.size === 0) {
  console.error(`${base} has no apps/api/drizzle yet; the baseline (U1) must merge first.`);
  process.exit(1);
}

for (const entry of readdirSync(drizzleDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  if (!onBase.has(repoPath(file))) {
    rmSync(file);
    console.log(`removed ${repoPath(file)}`);
  }
}
git('checkout', base, '--', repoPath(join(drizzleDir, 'meta')));
execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--name', values.name], {
  cwd: apiDir,
  stdio: 'inherit',
});
