import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript-6';
import type { CheckResult, Finding } from './check.ts';
import type { ValueSet } from './sets.ts';

export interface FixResult {
  done: Set<Finding>;
  /** Findings with a set that were left alone, and why. */
  clashes: Map<Finding, string>;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Rewrites each finding that has a set to `X.member` and adds the imports. */
export function fix(root: string, result: CheckResult): FixResult {
  const done = new Set<Finding>();
  const clashes = new Map<Finding, string>();
  const byFile = Map.groupBy(
    result.findings.filter((f) => f.verdict.kind === 'set' && !f.ignored),
    (f) => f.file,
  );
  for (const [file, findings] of byFile) {
    const program = result.programs.get(findings[0]?.tsconfig ?? '');
    const source = program?.getSourceFile(file);
    if (!program || !source) continue;
    const checker = program.getTypeChecker();
    const edits: Edit[] = [];
    const imports = new Map<string, ValueSet[]>();
    const usable = new Map<string, string | undefined>();
    for (const f of findings) {
      if (f.verdict.kind !== 'set') continue;
      const set = f.verdict.set;
      if (!usable.has(set.name)) {
        const binding = bindingOf(checker, source, set);
        usable.set(set.name, binding.clash);
        if (binding.convert) edits.push(...binding.convert);
        if (binding.missing) {
          const spec = specifier(root, file, set.file);
          imports.set(spec, [...(imports.get(spec) ?? []), set]);
        }
      }
      const clash = usable.get(set.name);
      if (clash) {
        clashes.set(f, clash);
        continue;
      }
      const access = f.verdict.access;
      edits.push({ start: f.start, end: f.end, text: f.jsx ? `{${access}}` : access });
      done.add(f);
    }
    if (!edits.length) continue;
    edits.push(...importEdits(source, imports));
    writeFileSync(file, apply(readFileSync(file, 'utf8'), edits));
  }
  return { done, clashes };
}

/** How the set's name is bound in the file: imported already, free to import, or taken. */
function bindingOf(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  set: ValueSet,
): { missing?: true; clash?: string; convert?: Edit[] } {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    if (!clause || !bindings || !ts.isNamedImports(bindings)) continue;
    const element = bindings.elements.find((e) => e.name.text === set.name);
    if (!element) continue;
    const symbol = checker.getSymbolAtLocation(element.name);
    const target = symbol && checker.getAliasedSymbol(symbol);
    const declared = target?.declarations?.some(
      (d) => d.getSourceFile().fileName === set.file && ts.isVariableDeclaration(d),
    );
    if (!declared) return { clash: `${set.name} is imported from elsewhere` };
    return { convert: valueImport(source, clause, element) };
  }
  let taken = false;
  const visit = (node: ts.Node): void => {
    if (taken) return;
    if (ts.isIdentifier(node) && node.text === set.name && declares(node)) taken = true;
    else ts.forEachChild(node, visit);
  };
  visit(source);
  return taken ? { clash: `${set.name} is a local name` } : { missing: true };
}

function declares(name: ts.Identifier): boolean {
  const parent = name.parent;
  if (!('name' in parent) || parent.name !== name) return false;
  return !(
    ts.isPropertyAssignment(parent) ||
    ts.isPropertyAccessExpression(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isJsxAttribute(parent) ||
    ts.isGetAccessor(parent) ||
    ts.isSetAccessor(parent) ||
    ts.isEnumMember(parent)
  );
}

/** Turns a type-only import of the set into a value import. */
function valueImport(
  source: ts.SourceFile,
  clause: ts.ImportClause,
  element: ts.ImportSpecifier,
): Edit[] {
  if (element.isTypeOnly) {
    return [{ start: element.getStart(source), end: element.name.getStart(source), text: '' }];
  }
  if (!clause.isTypeOnly) return [];
  const declaration = clause.parent;
  const start = declaration.getStart(source) + 'import'.length;
  const keyword = source.text.slice(start).match(/^\s+type\b/);
  const edits: Edit[] = [{ start, end: start + (keyword?.[0].length ?? 0), text: '' }];
  const elements = (clause.namedBindings as ts.NamedImports).elements;
  for (const other of elements) {
    if (other === element) continue;
    const at = other.getStart(source);
    edits.push({ start: at, end: at, text: 'type ' });
  }
  return edits;
}

function importEdits(source: ts.SourceFile, imports: Map<string, ValueSet[]>): Edit[] {
  const edits: Edit[] = [];
  const declarations = source.statements.filter(ts.isImportDeclaration);
  const fresh: string[] = [];
  for (const [spec, sets] of imports) {
    const names = sets.map((s) => s.name).sort();
    const existing = declarations.find((d) => {
      const clause = d.importClause;
      return (
        ts.isStringLiteral(d.moduleSpecifier) &&
        d.moduleSpecifier.text === spec &&
        clause &&
        !clause.isTypeOnly &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length
      );
    });
    const last = (
      existing?.importClause?.namedBindings as ts.NamedImports | undefined
    )?.elements.at(-1);
    if (last) edits.push({ start: last.end, end: last.end, text: `, ${names.join(', ')}` });
    else fresh.push(`import { ${names.join(', ')} } from '${spec}';`);
  }
  if (fresh.length) {
    const after = declarations.at(-1)?.end;
    edits.push(
      after === undefined
        ? { start: 0, end: 0, text: `${fresh.join('\n')}\n` }
        : { start: after, end: after, text: `\n${fresh.join('\n')}` },
    );
  }
  return edits;
}

/** The import path of a set: relative inside packages/shared, the package export elsewhere. */
export function specifier(root: string, from: string, setFile: string): string {
  const shared = join(root, 'packages', 'shared') + sep;
  const rel = relative(root, setFile).split(sep).join('/');
  if (!from.startsWith(shared)) {
    if (rel.startsWith('packages/shared/src/values/')) return '@rampflow/shared/values';
    const module = rel.match(/^packages\/shared\/src\/modules\/([^/]+)\/values\.ts$/)?.[1];
    if (module) return `@rampflow/shared/modules/${module}/values`;
  }
  const path = relative(dirname(from), setFile).split(sep).join('/');
  return path.startsWith('.') ? path : `./${path}`;
}

function apply(text: string, edits: Edit[]): string {
  let out = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}
