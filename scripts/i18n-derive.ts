// Writes what derives from the manifests and the en catalogs:
// - the label parts of ADR-0009 point 5,
//     packages/i18n/locales/<locale>/<module>/{module,nav,entitlements,settings}.json
//   for every module and every locale of its set. Existing labels are kept, keys the manifests
//   no longer have are dropped, and new keys get a placeholder (the en label in other locales,
//   a humanized key in en) that a person then translates;
// - apps/web/src/lib/i18n-resources.gen.ts, the typed resources of every en part.
// Rerun after a manifest change or after adding a part file:
//   pnpm i18n:derive          write the files
//   pnpm i18n:derive --check  exit 1 when a file is out of date
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_LOCALE } from '../packages/shared/src/locales.ts';
import { catalog } from '../packages/shared/src/registry.ts';
import { isValueOf, values } from '../packages/shared/src/values/define.ts';
import {
  DerivedPart,
  DriverLocale,
  LabelPart,
  LocaleSet,
  StaffLocale,
} from '../packages/shared/src/values/locales.ts';

type Tree = { [key: string]: string | Tree };

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const LOCALES_DIR = join(ROOT, 'packages/i18n/locales');
const RESOURCES_FILE = join(ROOT, 'apps/web/src/lib/i18n-resources.gen.ts');
const check = process.argv.includes('--check');

const strip = (moduleId: string, key: string) => key.slice(moduleId.length + 1);
const humanize = (path: string) => {
  const last =
    path
      .split('.')
      .filter((p) => !isValueOf(LabelPart, p))
      .at(-1) ?? path;
  const words = last.replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${path.endsWith('.description') ? '.' : ''}`;
};

function flatten(tree: Tree, prefix = '', out = new Map<string, string>()) {
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else flatten(v, path, out);
  }
  return out;
}

function nest(entries: readonly (readonly [string, string])[]): Tree {
  const root: Tree = {};
  for (const [path, value] of entries) {
    const parts = path.split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const next = node[part];
      if (typeof next === 'object') node = next;
      else node = node[part] = {};
    }
    node[parts.at(-1) as string] = value;
  }
  return root;
}

const read = (path: string): Map<string, string> =>
  existsSync(path) ? flatten(JSON.parse(readFileSync(path, 'utf8')) as Tree) : new Map();

const stale: string[] = [];
for (const m of catalog) {
  const parts: Record<DerivedPart, string[]> = {
    module: ['name'],
    nav: m.nav.map((n) => n.id),
    entitlements: Object.entries(m.entitlements)
      .filter(([, def]) => !('reserved' in def && def.reserved))
      .map(([key]) => strip(m.id, key)),
    settings: Object.keys(m.settings).flatMap((key) => [
      `${strip(m.id, key)}.label`,
      `${strip(m.id, key)}.description`,
    ]),
  };
  const locales = m.locales === LocaleSet.driver ? values(DriverLocale) : values(StaffLocale);
  for (const part of values(DerivedPart)) {
    const keys = parts[part];
    if (keys.length === 0) continue;
    const en = read(join(LOCALES_DIR, SOURCE_LOCALE, m.id, `${part}.json`));
    // A module's name has no key of its own to humanize: its placeholder is the module id.
    const placeholder = (key: string) =>
      part === DerivedPart.module ? humanize(m.id) : humanize(key);
    const source = new Map(keys.map((key) => [key, en.get(key) ?? placeholder(key)]));
    for (const locale of locales) {
      const path = join(LOCALES_DIR, locale, m.id, `${part}.json`);
      const current = read(path);
      const entries = keys.map((key) => [key, current.get(key) ?? source.get(key) ?? key] as const);
      emit(path, `${JSON.stringify(nest(entries), null, 2)}\n`);
    }
  }
}

// The i18next resource type of apps/web (ADR-0009 point 7): every en part, so a key typo fails tsc.
const namespaces = readdirSync(join(LOCALES_DIR, SOURCE_LOCALE)).sort();
const imports: string[] = [];
const fields: string[] = [];
for (const ns of namespaces) {
  const files = readdirSync(join(LOCALES_DIR, SOURCE_LOCALE, ns))
    .filter((f) => f.endsWith('.json'))
    // By part name, as Biome orders the imports: `settings` before `settings-ui`.
    .sort((a, b) => a.slice(0, -'.json'.length).localeCompare(b.slice(0, -'.json'.length)));
  if (files.length === 0) continue;
  const parts = files.map((file) => {
    const part = file.slice(0, -'.json'.length);
    const name = `${ns}_${part}`.replaceAll('-', '_');
    imports.push(`import type ${name} from '@rampflow/i18n/locales/en/${ns}/${file}';`);
    const key = /^[A-Za-z_$][\w$]*$/.test(part) ? part : `'${part}'`; // single quotes, as Biome formats
    return `    ${key}: typeof ${name};`;
  });
  fields.push(`  ${ns}: {\n${parts.join('\n')}\n  };`);
}
emit(
  RESOURCES_FILE,
  `// Generated by pnpm i18n:derive from packages/i18n/locales/en. Do not edit.\n${imports.join('\n')}\n\nexport interface Resources {\n${fields.join('\n')}\n}\n`,
);

function emit(path: string, content: string) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return;
  stale.push(path.replace(`${ROOT}/`, ''));
  if (!check) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (check && stale.length > 0) {
  console.error(`Derived i18n files out of date; run pnpm i18n:derive:\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
console.log(stale.length ? `Wrote ${stale.join(', ')}` : 'Derived i18n files are current');
