// `pnpm --filter @rampflow/driver size`: fails when the initial JavaScript of the built PWA,
// the entry script and every module it preloads, exceeds 150 KB gzip (ADR-0008). Lazy chunks
// (briefing, quiz, catalogs) do not count.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 150 * 1024;
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const initial = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="\/d\/([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/d\/([^"]+)"/g),
].map((m) => m[1] as string);
if (initial.length === 0) throw new Error('No entry script found in dist/index.html');

let total = 0;
for (const file of new Set(initial)) {
  const gzip = gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
  total += gzip;
  console.log(`${(gzip / 1024).toFixed(1).padStart(7)} KB  ${file}`);
}
const line = `${(total / 1024).toFixed(1)} KB gzip initial JavaScript, budget ${BUDGET_BYTES / 1024} KB`;
if (total > BUDGET_BYTES) {
  console.error(`Over budget: ${line}`);
  process.exit(1);
}
console.log(line);
