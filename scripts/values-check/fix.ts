import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript-6';
import type { CheckResult, Finding } from './check.ts';
import { resolve } from './imports.ts';
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

/** The changes to one import declaration of a file. */
interface ImportPlan {
  /** Type-only imports of sets that become value imports. */
  converted: Set<ts.ImportSpecifier>;
  /** Sets imported through a re-export, which move to the set's own module. */
  removed: Set<ts.ImportSpecifier>;
  added: string[];
}

/** How a set's name is bound in a file. */
interface Binding {
  missing?: true;
  clash?: string;
  /** An import of the set that needs a change: a type-only one, or one through a re-export. */
  element?: ts.ImportSpecifier;
  moved?: true;
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
    const plans = new Map<ts.ImportDeclaration, ImportPlan>();
    const plan = (declaration: ts.ImportDeclaration) => {
      const found = plans.get(declaration) ?? {
        converted: new Set(),
        removed: new Set(),
        added: [],
      };
      plans.set(declaration, found);
      return found;
    };
    const missing = new Map<string, string[]>();
    const usable = new Map<string, string | undefined>();
    for (const f of findings) {
      if (f.verdict.kind !== 'set') continue;
      const set = f.verdict.set;
      if (!usable.has(set.name)) {
        const binding = bindingOf(program, checker, source, set);
        usable.set(set.name, binding.clash);
        if (binding.element) {
          const declaration = binding.element.parent.parent.parent as ts.ImportDeclaration;
          plan(declaration)[binding.moved ? 'removed' : 'converted'].add(binding.element);
        }
        if (binding.missing || binding.moved) {
          const spec = specifier(root, program, file, set.file);
          missing.set(spec, [...(missing.get(spec) ?? []), set.name]);
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
    edits.push(...additions(source, missing, plan));
    for (const [declaration, changes] of plans) edits.push(rewrite(source, declaration, changes));
    writeFileSync(file, apply(readFileSync(file, 'utf8'), edits));
  }
  return { done, clashes };
}

function bindingOf(
  program: ts.Program,
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  set: ValueSet,
): Binding {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.attributes) continue;
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
    const spec = (statement.moduleSpecifier as ts.StringLiteral).text;
    // A re-export may export the set as a type only (`export type { Role }`).
    if (resolve(program, spec, source.fileName)?.resolvedFileName !== set.file) {
      return { element, moved: true };
    }
    return clause.isTypeOnly || element.isTypeOnly ? { element } : {};
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

/** Adds names to an existing value import of the module, or as a new import line. */
function additions(
  source: ts.SourceFile,
  missing: Map<string, string[]>,
  plan: (declaration: ts.ImportDeclaration) => ImportPlan,
): Edit[] {
  const declarations = source.statements.filter(ts.isImportDeclaration);
  const fresh: string[] = [];
  for (const [spec, names] of missing) {
    const existing = declarations.find(
      (d) =>
        (d.moduleSpecifier as ts.StringLiteral).text === spec &&
        !d.attributes &&
        d.importClause &&
        !d.importClause.isTypeOnly &&
        d.importClause.namedBindings &&
        ts.isNamedImports(d.importClause.namedBindings),
    );
    if (existing) plan(existing).added.push(...names.sort());
    else fresh.push(`import { ${names.sort().join(', ')} } from '${spec}';`);
  }
  if (!fresh.length) return [];
  const after = declarations.at(-1)?.end;
  return [
    after === undefined
      ? { start: 0, end: 0, text: `${fresh.join('\n')}\n` }
      : { start: after, end: after, text: `\n${fresh.join('\n')}` },
  ];
}

/** The import declaration with the plan applied; `pnpm format` tidies it afterwards. */
function rewrite(source: ts.SourceFile, declaration: ts.ImportDeclaration, plan: ImportPlan): Edit {
  const clause = declaration.importClause as ts.ImportClause;
  const elements = (clause.namedBindings as ts.NamedImports).elements;
  const typeOnly = clause.isTypeOnly && !plan.converted.size;
  const names = elements
    .filter((e) => !plan.removed.has(e))
    .map((e) => {
      const name = e.propertyName
        ? `${e.propertyName.getText(source)} as ${e.name.text}`
        : e.name.text;
      const type = !plan.converted.has(e) && (e.isTypeOnly || (clause.isTypeOnly && !typeOnly));
      return `${type ? 'type ' : ''}${name}`;
    })
    .concat(plan.added);
  const start = declaration.getStart(source);
  if (!names.length && !clause.name) {
    const newline = source.text[declaration.end] === '\n' ? 1 : 0;
    return { start, end: declaration.end + newline, text: '' };
  }
  const head = clause.name ? `${clause.name.text}${names.length ? ', ' : ''}` : '';
  const body = names.length ? `{ ${names.join(', ')} }` : '';
  const from = declaration.moduleSpecifier.getText(source);
  return {
    start,
    end: declaration.end,
    text: `import ${typeOnly ? 'type ' : ''}${head}${body} from ${from};`,
  };
}

/**
 * The import path of a set: the package export where the file's package resolves it, else a
 * relative path (inside packages/shared, and in e2e, which is no workspace package).
 */
function specifier(root: string, program: ts.Program, from: string, setFile: string): string {
  const shared = join(root, 'packages', 'shared') + sep;
  const rel = relative(root, setFile).split(sep).join('/');
  const module = rel.match(/^packages\/shared\/src\/modules\/([^/]+)\/values\.ts$/)?.[1];
  const exported = rel.startsWith('packages/shared/src/values/')
    ? '@rampflow/shared/values'
    : module && `@rampflow/shared/modules/${module}/values`;
  if (exported && !from.startsWith(shared)) {
    const resolved = resolve(program, exported, from)?.resolvedFileName;
    if (resolved === setFile || (resolved && dirname(resolved) === dirname(setFile))) {
      return exported;
    }
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
