import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnyModuleManifest,
  DRIVER_LOCALES,
  SOURCE_LOCALE,
  STAFF_LOCALES,
} from '@rampflow/shared';
import { LocaleSet } from '@rampflow/shared/values';

// The CI check of ADR-0009, point 6. Catalogs live in <dir>/<locale>/<namespace>/<part>.json.

export type Part = ReadonlyMap<string, unknown>;
/** locale -> namespace -> part -> flattened key -> value */
export type Catalogs = ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, Part>>>;

export type CatalogProblem =
  | { kind: 'invalid_json'; file: string }
  | { kind: 'unknown_namespace'; locale: string; ns: string }
  | { kind: 'missing_part' | 'extra_part'; locale: string; ns: string; part: string }
  | { kind: 'missing_key' | 'extra_key'; locale: string; ns: string; part: string; key: string }
  | { kind: 'empty_value'; locale: string; ns: string; part: string; key: string }
  | { kind: 'missing_derived_part'; ns: string; part: string }
  | { kind: 'missing_derived_key'; ns: string; part: string; key: string }
  | { kind: 'missing_status'; locale: string };

export interface DerivedPart {
  ns: string;
  part: string;
  keys: readonly string[];
}

export interface CheckOptions {
  /**
   * Whether every module must already ship `module.json`, `nav.json`, `entitlements.json` and
   * `settings.json`.
   * When false, derived keys are checked only in parts that exist.
   */
  requireDerivedParts: boolean;
  /** Further derived parts, for example `core:errors` with every API error code. */
  extraDerived?: readonly DerivedPart[];
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, value);
  }
}

const dirs = (path: string) =>
  existsSync(path) ? readdirSync(path).filter((n) => statSync(join(path, n)).isDirectory()) : [];

export function readCatalogs(dir: string, problems: CatalogProblem[] = []): Catalogs {
  const catalogs = new Map<string, Map<string, Map<string, Part>>>();
  for (const locale of dirs(dir)) {
    const namespaces = new Map<string, Map<string, Part>>();
    for (const ns of dirs(join(dir, locale))) {
      const parts = new Map<string, Part>();
      for (const file of readdirSync(join(dir, locale, ns))) {
        if (!file.endsWith('.json')) continue;
        const path = join(dir, locale, ns, file);
        try {
          const keys = new Map<string, unknown>();
          flatten(JSON.parse(readFileSync(path, 'utf8')), '', keys);
          parts.set(file.slice(0, -'.json'.length), keys);
        } catch {
          problems.push({ kind: 'invalid_json', file: path });
        }
      }
      namespaces.set(ns, parts);
    }
    catalogs.set(locale, namespaces);
  }
  return catalogs;
}

/** Keys of one part, with plural forms folded, so pl's `_few` matches en's `_one`. */
const baseKeys = (part: Part | undefined) =>
  new Set([...(part?.keys() ?? [])].map((k) => k.replace(PLURAL_SUFFIX, '')));

export function derivedParts(catalog: readonly AnyModuleManifest[]): DerivedPart[] {
  const strip = (id: string, key: string) => key.slice(id.length + 1);
  return catalog.flatMap((m) => [
    { ns: m.id, part: 'module', keys: ['name'] },
    { ns: m.id, part: 'nav', keys: m.nav.map((n) => n.id) },
    {
      ns: m.id,
      part: 'entitlements',
      keys: Object.entries(m.entitlements)
        .filter(([, def]) => !def.reserved)
        .map(([k]) => strip(m.id, k)),
    },
    {
      ns: m.id,
      part: 'settings',
      keys: Object.keys(m.settings).flatMap((k) => [
        `${strip(m.id, k)}.label`,
        `${strip(m.id, k)}.description`,
      ]),
    },
  ]);
}

export function checkCatalogs(
  dir: string,
  catalog: readonly AnyModuleManifest[],
  options: CheckOptions,
): CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  const catalogs = readCatalogs(dir, problems);
  const modules = new Map(catalog.map((m) => [m.id, m]));
  const localesOf = (m: AnyModuleManifest): readonly string[] =>
    m.locales === LocaleSet.driver ? DRIVER_LOCALES : STAFF_LOCALES;

  for (const [locale, namespaces] of catalogs) {
    for (const ns of namespaces.keys()) {
      const m = modules.get(ns);
      if (!m || !localesOf(m).includes(locale))
        problems.push({ kind: 'unknown_namespace', locale, ns });
    }
  }

  for (const m of catalog) {
    const source = catalogs.get(SOURCE_LOCALE)?.get(m.id) ?? new Map<string, Part>();
    for (const locale of localesOf(m)) {
      const parts = catalogs.get(locale)?.get(m.id) ?? new Map<string, Part>();
      for (const part of source.keys()) {
        if (!parts.has(part)) problems.push({ kind: 'missing_part', locale, ns: m.id, part });
      }
      for (const [part, keys] of parts) {
        if (!source.has(part)) {
          problems.push({ kind: 'extra_part', locale, ns: m.id, part });
          continue;
        }
        const expected = baseKeys(source.get(part));
        const actual = baseKeys(keys);
        for (const key of expected) {
          if (!actual.has(key)) problems.push({ kind: 'missing_key', locale, ns: m.id, part, key });
        }
        for (const key of actual) {
          if (!expected.has(key)) problems.push({ kind: 'extra_key', locale, ns: m.id, part, key });
        }
        for (const [key, value] of keys) {
          if (typeof value !== 'string' || value.trim() === '') {
            problems.push({ kind: 'empty_value', locale, ns: m.id, part, key });
          }
        }
      }
    }
  }

  for (const derived of [...derivedParts(catalog), ...(options.extraDerived ?? [])]) {
    const part = catalogs.get(SOURCE_LOCALE)?.get(derived.ns)?.get(derived.part);
    if (!part) {
      if (options.requireDerivedParts && derived.keys.length > 0) {
        problems.push({ kind: 'missing_derived_part', ns: derived.ns, part: derived.part });
      }
      continue;
    }
    for (const key of derived.keys) {
      if (!part.has(key)) {
        problems.push({ kind: 'missing_derived_key', ns: derived.ns, part: derived.part, key });
      }
    }
  }

  const statusPath = join(dir, 'status.json');
  const status: Record<string, unknown> = existsSync(statusPath)
    ? JSON.parse(readFileSync(statusPath, 'utf8'))
    : {};
  for (const locale of DRIVER_LOCALES) {
    if (!['source', 'machine', 'reviewed'].includes(String(status[locale]))) {
      problems.push({ kind: 'missing_status', locale });
    }
  }
  return problems;
}

export function formatProblem(p: CatalogProblem): string {
  const where = 'ns' in p ? `${'locale' in p ? `${p.locale}/` : ''}${p.ns}` : '';
  switch (p.kind) {
    case 'invalid_json':
      return `invalid JSON: ${p.file}`;
    case 'missing_status':
      return `status.json has no source, machine or reviewed entry for ${p.locale}`;
    case 'unknown_namespace':
      return `${where}: no module ships this namespace in this locale`;
    case 'missing_part':
    case 'extra_part':
    case 'missing_derived_part':
      return `${where}/${p.part}.json: ${p.kind.replaceAll('_', ' ')}`;
    default:
      return `${where}/${p.part}.json: ${p.kind.replaceAll('_', ' ')} ${p.key}`;
  }
}
