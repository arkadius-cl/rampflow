import ts from 'typescript-6';
import { VerdictKind } from '../../packages/shared/src/values/cli.ts';

/** An exported `{...} as const` of string literals, or a key tree such as `Permission`. */
export interface ValueSet {
  name: string;
  file: string;
  /** Each member value and how to reach it: `no_show` → `BookingStatus.no_show`. */
  members: ReadonlyMap<string, string>;
}

/** Every exported value set declared in `files`, read through the checker. */
export function indexSets(program: ts.Program, files: readonly string[]): ValueSet[] {
  const checker = program.getTypeChecker();
  const sets: ValueSet[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const symbol = checker.getSymbolAtLocation(declaration.name);
        if (!symbol) continue;
        const name = declaration.name.text;
        const members = new Map<string, string>();
        if (collect(checker, checker.getTypeOfSymbol(symbol), name, members, 0) && members.size) {
          sets.push({ name, file, members });
        }
      }
    }
  }
  return sets;
}

/** Fills `out` with the string leaves of an object type; false when anything else is in it. */
function collect(
  checker: ts.TypeChecker,
  type: ts.Type,
  path: string,
  out: Map<string, string>,
  depth: number,
): boolean {
  if (depth > 6 || type.getCallSignatures().length) return false;
  for (const property of checker.getPropertiesOfType(type)) {
    const member = checker.getTypeOfSymbol(property);
    const at = `${path}.${property.name}`;
    if (member.isStringLiteral()) {
      if (!out.has(member.value)) out.set(member.value, at);
    } else if (member.flags & ts.TypeFlags.Object) {
      if (!collect(checker, member, at, out, depth + 1)) return false;
    } else {
      return false;
    }
  }
  return true;
}

export type Verdict =
  | { kind: typeof VerdictKind.set; set: ValueSet; access: string }
  | { kind: typeof VerdictKind.create; union: readonly string[] };

/**
 * The set a literal belongs to under its contextual union: the smallest set covering the union
 * (the equal one when it exists), else the largest set the union contains, as for
 * `PermissionKey | 'member'`. `alias` (the union's type alias name) breaks ties.
 */
export function resolve(
  sets: readonly ValueSet[],
  literal: string,
  union: readonly string[],
  alias: string | undefined,
): Verdict {
  const own = sets.filter((s) => s.members.has(literal));
  const covering = own.filter((s) => union.every((v) => s.members.has(v)));
  const contained = own.filter((s) => [...s.members.keys()].every((v) => union.includes(v)));
  const set =
    pick(covering, alias, Math.min(...covering.map((s) => s.members.size))) ??
    pick(contained, alias, Math.max(...contained.map((s) => s.members.size)));
  if (!set) return { kind: VerdictKind.create, union };
  return { kind: VerdictKind.set, set, access: set.members.get(literal) as string };
}

function pick(sets: readonly ValueSet[], alias: string | undefined, size: number) {
  const best = sets.filter((s) => s.members.size === size);
  return best.find((s) => s.name === alias) ?? best[0];
}

/** True when the strings are exactly some set's members, which marks a union as ours. */
export function equalsSomeSet(sets: readonly ValueSet[], union: readonly string[]): boolean {
  return sets.some((s) => s.members.size === union.length && union.every((v) => s.members.has(v)));
}
