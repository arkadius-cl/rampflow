import { permissionsFor } from './contract/access.ts';
import { ROLES } from './contract/module.ts';
import { PACKAGE_IDS, packages } from './packages.ts';
import { catalog } from './registry.ts';
import { OrgKind } from './values/roles.ts';

export const CATALOG_DOC = 'docs/reference/module-contract.md';
export const START_MARKER = '<!-- catalog:start -->';
export const END_MARKER = '<!-- catalog:end -->';

const code = (s: string) => `\`${s}\``;
const list = (items: readonly string[], empty: string) =>
  items.length > 0 ? items.map(code).join(', ') : empty;

/** The catalog reference tables, rendered from the registry so the docs cannot drift. */
export function renderCatalogTables(): string {
  const out: string[] = [];
  const row = (cells: string[]) => out.push(`| ${cells.join(' | ')} |`);

  out.push('### Modules', '');
  row(['Module', 'Depends on', 'Enabled by', 'Locales', 'Implemented entitlements', 'Reserved']);
  row(['---', '---', '---', '---', '---', '---']);
  for (const m of catalog) {
    const entries = Object.entries(m.entitlements);
    const label = ([key, def]: (typeof entries)[number]) =>
      def.kind === 'limit' ? `${code(key)} (${'soft' in def ? 'soft limit' : 'limit'})` : code(key);
    const implemented = entries.filter(([, d]) => !('reserved' in d)).map(label);
    const reserved = entries.filter(([, d]) => 'reserved' in d).map(label);
    row([
      code(m.id),
      list(m.dependsOn, 'none'),
      m.enabledBy ? code(m.enabledBy) : 'always on',
      m.locales,
      implemented.join(', ') || 'none',
      reserved.join(', ') || 'none',
    ]);
  }

  out.push('', '### Permissions', '');
  row(['Permission', 'Declared for', 'Held by']);
  row(['---', '---', '---']);
  const held = new Map(ROLES.map((r) => [r, permissionsFor(catalog, r) as ReadonlySet<string>]));
  for (const m of catalog) {
    for (const [key, def] of Object.entries(m.permissions)) {
      const holders = ROLES.filter((r) => held.get(r)?.has(key));
      row([code(key), list(def.roles, ''), list(holders, '')]);
    }
  }

  out.push('', '### Settings', '');
  row(['Setting', 'Default', 'Scopes', 'Requires']);
  row(['---', '---', '---', '---']);
  for (const m of catalog) {
    for (const [key, def] of Object.entries(m.settings)) {
      row([
        code(key),
        code(JSON.stringify(def.default)),
        def.scopes.join(', '),
        def.requires ? code(def.requires) : '',
      ]);
    }
  }

  out.push('', '### Navigation', '');
  row(['Label key', 'Area', 'Path', 'Permission', 'Entitlement']);
  row(['---', '---', '---', '---', '---']);
  for (const m of catalog) {
    for (const n of m.nav) {
      const entitlement = n.area === OrgKind.tenant && n.entitlement ? code(n.entitlement) : '';
      row([code(`${m.id}:nav.${n.id}`), n.area, code(n.to), code(n.permission), entitlement]);
    }
  }

  out.push('', '### Packages', '');
  row(['Key', ...PACKAGE_IDS]);
  row(['---', ...PACKAGE_IDS.map(() => '---')]);
  const keys = [...new Set(PACKAGE_IDS.flatMap((p) => Object.keys(packages[p])))];
  const values: Readonly<Record<string, Readonly<Record<string, unknown>>>> = packages;
  for (const key of keys) {
    row([
      code(key),
      ...PACKAGE_IDS.map((p) =>
        key in (values[p] ?? {}) ? code(JSON.stringify(values[p]?.[key])) : '',
      ),
    ]);
  }
  return out.join('\n');
}

export function withCatalogTables(doc: string): string {
  const start = doc.indexOf(START_MARKER);
  const end = doc.indexOf(END_MARKER);
  if (start < 0 || end < start) throw new Error(`${CATALOG_DOC} lacks the catalog markers`);
  return `${doc.slice(0, start + START_MARKER.length)}\n\n${renderCatalogTables()}\n\n${doc.slice(end)}`;
}
