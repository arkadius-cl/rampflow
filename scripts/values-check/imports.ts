import ts from 'typescript-6';

export function resolve(program: ts.Program, spec: string, from: string) {
  return ts.resolveModuleName(spec, from, program.getCompilerOptions(), ts.sys).resolvedModule;
}

const closures = new WeakMap<ts.Program, Map<string, Set<string>>>();

/** Every project file `file` imports, directly or not. */
export function dependencies(program: ts.Program, file: string): Set<string> {
  const cache = closures.get(program) ?? new Map<string, Set<string>>();
  closures.set(program, cache);
  const cached = cache.get(file);
  if (cached) return cached;
  const seen = new Set<string>();
  const pending = [file];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const statement of program.getSourceFile(next)?.statements ?? []) {
      const spec =
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      const resolved = spec === undefined ? undefined : resolve(program, spec, next);
      if (resolved && !resolved.isExternalLibraryImport && !seen.has(resolved.resolvedFileName)) {
        seen.add(resolved.resolvedFileName);
        pending.push(resolved.resolvedFileName);
      }
    }
  }
  cache.set(file, seen);
  return seen;
}
