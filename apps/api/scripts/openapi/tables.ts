import type { Operation } from './document.ts';
import { markers, SECTIONS, type Section } from './sections.ts';

// The route tables of docs/reference/api-routes.md, rendered between markers (design D11).

const HEADER = [
  '| Method | Path | Party | Permission | Entitlement | Story | Router | Notes |',
  '|---|---|---|---|---|---|---|---|',
];

const MEMBER_PARTIES = new Set(['user', 'platform', 'tenant', 'carrier', 'carrier_at_tenant']);

const code = (s: string) => `\`${s}\``;
const cell = (s: string) => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

function permissionCell({ endpoint: e }: Operation): string {
  const keys = e.guards.flatMap((g) => (g.kind === 'permission' ? [code(g.key)] : []));
  if (keys.length) return keys.join(' and ');
  if (MEMBER_PARTIES.has(e.party)) return 'member';
  if (e.party === 'driver') return 'driver';
  const body = e.validators.json;
  const shape = body && 'shape' in body ? (body.shape as Record<string, unknown>) : undefined;
  return shape && 'token' in shape ? 'token' : 'none';
}

function entitlementCell({ endpoint: e }: Operation): string {
  const parts = e.guards.flatMap((g) =>
    g.kind === 'module' ? [`module ${code(g.id)}`] : g.kind === 'entitlement' ? [code(g.key)] : [],
  );
  for (const key of e.meta.limits ?? []) parts.push(`limit ${code(key)}`);
  return parts.join('; ');
}

function row(op: Operation): string {
  const e = op.endpoint;
  const cells = [
    e.method,
    code(e.path),
    e.party,
    permissionCell(op),
    entitlementCell(op),
    e.meta.stories.join(', '),
    code(op.file.replace(/^modules\//, '')),
    cell(e.meta.description),
  ];
  return `| ${cells.join(' | ')} |`;
}

/** One table per section, rows in the order of the section's router files, then of the routes. */
export function renderTables(ops: readonly Operation[]): Map<Section, string> {
  const tables = new Map<Section, string>();
  for (const [section, files] of Object.entries(SECTIONS) as [Section, readonly string[]][]) {
    const rows = ops
      .filter((op) => op.section === section)
      .map((op, i) => ({ op, i }))
      .sort((a, b) => files.indexOf(a.op.file) - files.indexOf(b.op.file) || a.i - b.i)
      .map(({ op }) => row(op));
    tables.set(section, [...HEADER, ...rows].join('\n'));
  }
  return tables;
}

/** Replaces the content between each section's markers; the prose outside stays as written. */
export function applyTables(markdown: string, tables: Map<Section, string>) {
  const problems: string[] = [];
  let text = markdown;
  for (const [section, table] of tables) {
    const { start, end } = markers(section);
    const from = text.indexOf(start);
    const to = text.indexOf(end);
    if (from === -1 || to === -1 || to < from) {
      problems.push(`api-routes.md: missing ${start} … ${end}`);
      continue;
    }
    text = `${text.slice(0, from + start.length)}\n\n${table}\n\n${text.slice(to)}`;
  }
  return { text, problems };
}
