import { globSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath, sep } from 'node:path';
import ts from 'typescript-6';
import { VerdictKind } from '../../packages/shared/src/values/cli.ts';
import {
  type Context,
  contextOf,
  isConstAssertion,
  isLibraryAnnotation,
  isPropertyNames,
  isValuePosition,
} from './context.ts';
import { dependencies } from './imports.ts';
import { equalsSomeSet, indexSets, resolve, type ValueSet, type Verdict } from './sets.ts';

/** Where the packages and the value sets of a checkout live. */
export interface Layout {
  root: string;
  /** Package directories relative to `root`, each with a `tsconfig.json`. */
  packages: readonly string[];
}

/** A string literal checked against a union declared in project source. */
export interface Finding {
  pkg: string;
  /** The tsconfig whose program the finding comes from. */
  tsconfig: string;
  /** Absolute path. */
  file: string;
  line: number;
  col: number;
  /** The text `--fix` replaces: the literal, or `'x' as const` as a whole. */
  start: number;
  end: number;
  literal: string;
  /** A JSX attribute value (`status="x"`), which needs braces when rewritten. */
  jsx: boolean;
  verdict: Verdict;
  /** The reason of a `values-check-ignore` comment that suppresses this finding. */
  ignored?: string;
}

export interface CheckResult {
  sets: readonly ValueSet[];
  findings: Finding[];
  /** The programs the findings point into, for `--fix`. */
  programs: Map<string, ts.Program>;
}

const VALUE_FILES = ['packages/shared/src/values/*.ts', 'packages/shared/src/modules/*/values.ts'];
const IGNORE = /values-check-ignore:\s*(.*)$/;

export function valueFiles(root: string): string[] {
  return VALUE_FILES.flatMap((pattern) => globSync(pattern, { cwd: root }))
    .filter((f) => !/\.(test|typetest)\.ts$/.test(f) && !f.endsWith('index.ts'))
    .map((f) => resolvePath(root, f))
    .sort();
}

/** Project source: ours, not vendored, not generated. Unions declared here count as value sets. */
export function isProjectFile(root: string, file: string): boolean {
  const rel = relative(root, file);
  return (
    !rel.startsWith('..') &&
    !rel.split(sep).includes('node_modules') &&
    !rel.includes(`components${sep}ui${sep}`) &&
    !rel.endsWith('.gen.ts')
  );
}

/** The files whose literals are checked, as opposed to the files that declare the sets. */
function isScanned(root: string, file: string): boolean {
  return (
    isProjectFile(root, file) &&
    !file.endsWith('.d.ts') &&
    !file.endsWith(`${sep}values.ts`) &&
    !relative(root, file).startsWith(join('packages', 'shared', 'src', 'values') + sep)
  );
}

export function check(layout: Layout): CheckResult {
  const extra = valueFiles(layout.root);
  const findings: Finding[] = [];
  const programs = new Map<string, ts.Program>();
  let sets: ValueSet[] | undefined;
  for (const pkg of layout.packages) {
    for (const tsconfig of leafConfigs(join(layout.root, pkg, 'tsconfig.json'))) {
      const { program, roots } = createProgram(tsconfig, extra);
      programs.set(tsconfig, program);
      sets ??= indexSets(program, extra);
      const known = sets;
      for (const file of roots) {
        if (!isScanned(layout.root, file)) continue;
        const source = program.getSourceFile(file);
        if (source) findings.push(...scan(layout.root, pkg, tsconfig, program, source, known));
      }
    }
  }
  return { sets: sets ?? [], findings, programs };
}

/** A solution-style tsconfig (`files: []` with references) expands to its referenced configs. */
function leafConfigs(tsconfig: string): string[] {
  const config = parse(tsconfig);
  if (config.fileNames.length || !config.projectReferences?.length) return [tsconfig];
  const dir = dirname(tsconfig);
  return config.projectReferences
    .map((r) => (r.path.endsWith('.json') ? r.path : join(r.path, 'tsconfig.json')))
    .filter((p) => !relative(dir, p).startsWith('..'))
    .flatMap(leafConfigs);
}

function parse(tsconfig: string) {
  const config = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, configHost);
  if (!config) throw new Error(`cannot read ${tsconfig}`);
  return config;
}

/** One program per tsconfig, on sources rather than built references (as `api:docs` does). */
export function createProgram(tsconfig: string, extra: readonly string[]) {
  const config = parse(tsconfig);
  const options: ts.CompilerOptions = {
    ...config.options,
    noEmit: true,
    composite: false,
    emitDeclarationOnly: false,
    declaration: false,
    incremental: false,
    tsBuildInfoFile: undefined,
  };
  const roots = config.fileNames;
  const program = ts.createProgram({ rootNames: [...roots, ...extra], options });
  return { program, roots };
}

function scan(
  root: string,
  pkg: string,
  tsconfig: string,
  program: ts.Program,
  source: ts.SourceFile,
  sets: readonly ValueSet[],
): Finding[] {
  const checker = program.getTypeChecker();
  const found: Finding[] = [];
  const lines = source.text.split('\n');
  const visit = (node: ts.Node): void => {
    const misplaced = misplacedMember(root, checker, node, sets);
    if (misplaced) {
      const start = node.getStart(source);
      const { line, character } = source.getLineAndCharacterOfPosition(start);
      const ignored = (lines[line]?.match(IGNORE) ?? lines[line - 1]?.match(IGNORE))?.[1];
      found.push({
        pkg,
        tsconfig,
        file: source.fileName,
        line: line + 1,
        col: character + 1,
        start,
        end: node.end,
        literal: misplaced.value,
        jsx: false,
        verdict: misplaced.verdict,
        ...(ignored === undefined ? {} : { ignored: ignored.trim() }),
      });
      return;
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text !== '' &&
      isValuePosition(node)
    ) {
      const context = contextOf(checker, node);
      const verdict = context && judge(root, checker, context, node.text, sets);
      // A manifest declares the keys that `Permission` is derived from; it keeps its literals.
      const defines =
        verdict?.kind === VerdictKind.set &&
        dependencies(program, verdict.set.file).has(source.fileName);
      if (verdict && !defines) {
        const start = node.getStart(source);
        const { line, character } = source.getLineAndCharacterOfPosition(start);
        const ignored = (lines[line]?.match(IGNORE) ?? lines[line - 1]?.match(IGNORE))?.[1];
        // `X.member as const` does not compile, and the member is a literal type already.
        const asConst =
          ts.isAsExpression(node.parent) && isConstAssertion(node.parent) ? node.parent : undefined;
        found.push({
          pkg,
          tsconfig,
          file: source.fileName,
          line: line + 1,
          col: character + 1,
          start,
          end: asConst ? asConst.end : node.end,
          literal: node.text,
          jsx: ts.isJsxAttribute(node.parent),
          verdict,
          ...(ignored === undefined ? {} : { ignored: ignored.trim() }),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * `X.member` where `X` is a value set that does not cover the union the member is checked against,
 * such as `ActorParty.tenant` in a switch over a `ScopeParty`: the member's value is right, its set
 * is not. The verdict names the set the literal itself would get. Only the outermost access of a
 * key tree path (`Permission.booking.view`) is looked at.
 */
function misplacedMember(
  root: string,
  checker: ts.TypeChecker,
  node: ts.Node,
  sets: readonly ValueSet[],
): { value: string; verdict: Verdict } | undefined {
  if (!ts.isPropertyAccessExpression(node) || ts.isPropertyAccessExpression(node.parent)) return;
  let head: ts.Expression = node;
  while (ts.isPropertyAccessExpression(head)) head = head.expression;
  if (!ts.isIdentifier(head)) return;
  const type = checker.getTypeAtLocation(node);
  if (!type.isStringLiteral()) return;
  const text = node.getText().replace(/\s+/g, '');
  const own = sets.find((s) => s.name === head.text && s.members.get(type.value) === text);
  if (!own) return;
  const context = contextOf(checker, node as unknown as Parameters<typeof contextOf>[1]);
  if (!context) return;
  const verdict = judge(root, checker, context, type.value, sets);
  if (!verdict) return;
  const union = verdict.kind === VerdictKind.set ? undefined : verdict.union;
  const covers = (set: ValueSet, values: readonly string[]) =>
    values.every((v) => set.members.has(v));
  if (verdict.kind === VerdictKind.set) {
    if (verdict.set === own) return;
    const parts = context.parts.filter((t) => t.isStringLiteral()) as ts.StringLiteralType[];
    if (
      covers(
        own,
        parts.map((t) => t.value),
      )
    )
      return;
  } else if (union && covers(own, union)) {
    return;
  }
  return { value: type.value, verdict };
}

/** The verdict for a literal whose contextual type is a union of string literals from our source. */
function judge(
  root: string,
  checker: ts.TypeChecker,
  context: Context,
  literal: string,
  sets: readonly ValueSet[],
): Verdict | undefined {
  const parts = context.parts
    .flatMap((t) => {
      if (!(t.flags & ts.TypeFlags.TypeParameter)) return [t];
      const constraint = checker.getBaseConstraintOfType(t);
      return constraint?.isUnion() ? constraint.types : [constraint ?? t];
    })
    .filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
  if (!parts.length || !parts.every((t) => t.isStringLiteral())) return undefined;
  const union = [...new Set(parts.map((t) => (t as ts.StringLiteralType).value))].sort();
  if (!union.includes(literal)) return undefined;
  if (!isOurs(root, checker, context, union, sets)) return undefined;
  const verdict = resolve(sets, literal, union, context.alias?.name);
  // Field names are not a set, unless the object is keyed by one (`keyof Record<BookingStatus, _>`).
  if (verdict.kind === VerdictKind.create && isPropertyNames(checker, context, union))
    return undefined;
  return verdict;
}

/**
 * A union is ours when it equals a value set, when its alias is declared in project source, or,
 * for an inline or library-generic union (`Exclude<BookingStatus, ...>`), when the parameter or
 * property it is checked against is.
 */
function isOurs(
  root: string,
  checker: ts.TypeChecker,
  context: Context,
  union: readonly string[],
  sets: readonly ValueSet[],
): boolean {
  if (equalsSomeSet(sets, union)) return true;
  const alias = context.alias?.declarations?.[0];
  if (alias) {
    if (isProjectFile(root, alias.getSourceFile().fileName)) return true;
    if (!context.generic) return false;
  }
  const anchor = context.anchor;
  if (!anchor || !isProjectFile(root, anchor.getSourceFile().fileName)) return false;
  return !isLibraryAnnotation(checker, anchor, (file) => !isProjectFile(root, file));
}

const configHost: ts.ParseConfigFileHost = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  },
};
