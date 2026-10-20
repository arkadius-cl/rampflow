import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import { createApp } from '../src/app.ts';
import { buildDocument, operations } from './openapi/document.ts';
import { GeneratorError } from './openapi/model.ts';
import { collectEndpoints } from './openapi/runtime.ts';
import { analyze } from './openapi/static.ts';
import { applyTables, renderTables } from './openapi/tables.ts';

// `pnpm api:docs` writes apps/api/openapi.gen.json and the route tables of
// docs/reference/api-routes.md; `--check` fails when either is stale (ADR-0013).

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const API = at('../');
const SRC = at('../src/');
export const FILES = {
  document: at('../openapi.gen.json'),
  allowlist: at('../openapi.allowlist.json'),
  routes: at('../../../docs/reference/api-routes.md'),
};

const Allowlist = z.object({ $comment: z.string(), operations: z.array(z.string()) });

export interface Generated {
  document: string;
  routes: string;
  allowlistSize: number;
}

export function generate(): Generated {
  const endpoints = collectEndpoints(createApp({ testRoutes: false, apiDocs: false }).routes);
  const allowlist = Allowlist.parse(JSON.parse(readFileSync(FILES.allowlist, 'utf8'))).operations;
  const statics = analyze({
    tsconfig: `${API}tsconfig.json`,
    app: { file: `${SRC}app.ts`, type: 'AppType' },
    sources: globSync('**/*.ts', { cwd: SRC })
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) => `${SRC}${f}`),
    root: SRC,
    endpoints,
    allowlist: new Set(allowlist),
    isResponseFile: (file) => /\/packages\/shared\/src\/modules\/[^/]+\/api[^/]*\.ts$/.test(file),
    converter: {
      isShared: (file) => file.includes('/packages/shared/src/'),
      isTime: (file) => file.includes('/packages/shared/src/time/'),
    },
  });
  const { ops, problems } = operations(endpoints, statics);
  const tables = applyTables(readFileSync(FILES.routes, 'utf8'), renderTables(ops));
  const all = [...statics.problems, ...problems, ...tables.problems];
  if (all.length) throw new GeneratorError(all);
  return {
    document: `${JSON.stringify(buildDocument(ops, statics), null, 2)}\n`,
    routes: tables.text,
    allowlistSize: allowlist.length,
  };
}

function main() {
  const started = performance.now();
  const check = process.argv.includes('--check');
  const out = generate();
  const stale = [
    [FILES.document, out.document],
    [FILES.routes, out.routes],
  ].filter(([file, text]) => readFileSync(file as string, 'utf8') !== text);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (check && stale.length) {
    const names = stale.map(([file]) => (file as string).replace(at('../../../'), '')).join(', ');
    console.error(`api:docs: ${names} out of date; run pnpm api:docs`);
    process.exit(1);
  }
  if (!check) for (const [file, text] of stale) writeFileSync(file as string, text as string);
  const verb = check ? 'current' : stale.length ? 'written' : 'unchanged';
  console.log(`api:docs: ${verb} in ${seconds} s; ${out.allowlistSize} operation(s) on the allowlist`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    if (!(err instanceof GeneratorError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}
