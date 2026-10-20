import { dirname, join, relative } from 'node:path';
import { BodyKind } from '@rampflow/shared/values';
import ts from 'typescript-6';
import type { SuccessStatus } from '../../src/kernel/describe.ts';
import { ConversionError, Converter, type ConverterOptions } from './converter.ts';
import { type Endpoint, endpointKey } from './model.ts';
import type { JsonSchema } from './schema.ts';

// The static half (design D2, D4): finds the op() declarations in the source, then builds one
// TypeScript 6 program with a probe file that compares each declared type with the handler output
// in ExtractSchema<AppType> and converts the response types to JSON Schema.

/** A `type<Name>()` in an op() call, resolved to the file that declares `Name`. */
interface DeclaredType {
  status: SuccessStatus;
  name: string;
  file: string;
}

export interface StaticOp {
  id: string;
  /** The router file, relative to the scan root. */
  file: string;
  declared: DeclaredType[];
}

export interface StaticInput {
  tsconfig: string;
  /** The module exporting the app type, and the type's name. */
  app: { file: string; type: string };
  /** Source files to look for op() calls in. */
  sources: readonly string[];
  /** Router file paths in the result are relative to this directory. */
  root: string;
  endpoints: readonly Endpoint[];
  allowlist: ReadonlySet<string>;
  /** Where a declared response type must live. */
  isResponseFile(file: string): boolean;
  converter: ConverterOptions;
}

export interface StaticResult {
  /** Per operation id and status, the JSON body schema: a `$ref`, or inline for the allowlist. */
  responses: Map<string, Map<number, JsonSchema>>;
  components: Record<string, JsonSchema>;
  /** Per operation id, its router file. */
  files: Map<string, string>;
  problems: string[];
}

const STATUSES = new Set<number>([200, 201, 202, 204]);

/** The op() calls of the sources, read without a type checker. */
export function findOps(input: Pick<StaticInput, 'sources' | 'root' | 'tsconfig'>) {
  const problems: string[] = [];
  const ops = new Map<string, StaticOp>();
  const options =
    ts.getParsedCommandLineOfConfigFile(input.tsconfig, {}, configHost)?.options ?? {};
  for (const file of input.sources) {
    const text = ts.sys.readFile(file);
    if (text === undefined) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const imports = importsOf(source);
    const where = (node: ts.Node) => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      return `${relative(input.root, file)}:${line + 1}`;
    };
    const visit = (node: ts.Node): void => {
      const arg = isOpCall(node) ? node.arguments[0] : undefined;
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const id = stringProperty(arg, 'id');
        if (!id) {
          problems.push(`${where(node)}: op() needs a string literal id`);
          return;
        }
        if (ops.has(id)) problems.push(`${where(node)}: op() id ${id} is declared twice`);
        const declared: DeclaredType[] = [];
        for (const [status, typeNode] of declaredTypes(arg)) {
          const label = `${id} ${status}`;
          if (!ts.isTypeReferenceNode(typeNode) || typeNode.typeArguments?.length) {
            problems.push(`${label}: declare a named type, not ${typeNode.getText()}`);
            continue;
          }
          const name = typeNode.typeName.getText();
          const imported = imports.get(name);
          const resolved =
            imported &&
            ts.resolveModuleName(imported.specifier, file, options, ts.sys).resolvedModule;
          if (!imported || !resolved?.resolvedFileName) {
            problems.push(`${label}: ${name} must be imported from packages/shared`);
            continue;
          }
          declared.push({ status, name: imported.name, file: resolved.resolvedFileName });
        }
        ops.set(id, { id, file: relative(input.root, file), declared });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { ops, problems };
}

/** Checks the declared types against the handlers and converts every JSON response body. */
export function analyze(input: StaticInput): StaticResult {
  const { ops, problems } = findOps(input);
  const responses = new Map<string, Map<number, JsonSchema>>();
  const files = new Map<string, string>();
  const known = new Set<string>(input.endpoints.map((e) => e.meta.id));
  for (const id of input.allowlist) {
    if (!known.has(id)) problems.push(`${id}: on the allowlist but no such operation`);
  }

  const probe = new Probe(input.app);
  const plans = input.endpoints.map((e) => {
    const op = ops.get(e.meta.id);
    if (!op) problems.push(`${e.meta.id} (${endpointKey(e)}): op() not found in the sources`);
    else files.set(op.id, op.file);
    const entry = probe.entry(e);
    return { e, entry, declared: (op?.declared ?? []).map((d) => probe.declare(entry, d)) };
  });

  const program = probe.program(input.tsconfig);
  const checker = program.getTypeChecker();
  const converter = new Converter(program, input.converter);
  const mismatches = probe.mismatches(program);

  for (const { e, entry, declared } of plans) {
    const id = e.meta.id;
    const byStatus = new Map<number, JsonSchema>();
    responses.set(id, byStatus);
    const outputs = probe.outputs(checker, entry);
    if (outputs.size === 0) {
      problems.push(`${id}: the handler's output is untyped; return c.json() or c.body()`);
      continue;
    }
    for (const [status, out] of outputs) {
      if (!STATUSES.has(status)) continue;
      const meta = e.meta.responses[status as SuccessStatus];
      const json = out.format === 'json';
      if (!meta) {
        if (json && input.allowlist.has(id)) {
          const label = `${id} ${status}`;
          byStatus.set(
            status,
            convert(() => converter.toSchema(out.type, label), problems),
          );
        } else if (json) {
          problems.push(
            `${id} ${status}: the handler answers ${status} without a named type in op()`,
          );
        } else {
          problems.push(`${id} ${status}: the handler answers ${status}; declare noBody or file()`);
        }
        continue;
      }
      if (json !== (meta.kind === BodyKind.json)) {
        problems.push(
          `${id} ${status}: op() declares ${meta.kind}, the handler answers ${out.format}`,
        );
      }
    }
    for (const status of Object.keys(e.meta.responses).map(Number)) {
      if (!outputs.has(status))
        problems.push(`${id} ${status}: declared but the handler never answers it`);
    }
    for (const d of declared) {
      if (!outputs.has(d.status)) continue;
      const type = checker.getTypeAtLocation(probe.aliasNode(d.alias));
      const symbol = probe.declaredSymbol(checker, d.alias);
      if (!input.isResponseFile(d.file) || !symbol) {
        problems.push(
          `${id} ${d.status}: ${d.name} is not a named type of packages/shared/src/modules/<id>/api*.ts`,
        );
        continue;
      }
      for (const message of mismatches.get(d.alias) ?? []) {
        problems.push(`${id} ${d.status}: the handler output does not match ${d.name}: ${message}`);
      }
      const label = `${id} ${d.status}`;
      byStatus.set(
        d.status,
        convert(() => converter.reference(symbol, type, label), problems),
      );
    }
    const allJsonNamed = [...outputs].every(
      ([status, out]) =>
        out.format !== 'json' || !STATUSES.has(status) || declared.some((d) => d.status === status),
    );
    if (input.allowlist.has(id) && allJsonNamed) {
      problems.push(`${id}: every JSON response has a named type; remove it from the allowlist`);
    }
  }
  return { responses, components: converter.components, files, problems };
}

function convert(run: () => JsonSchema, problems: string[]): JsonSchema {
  try {
    return run();
  } catch (err) {
    if (!(err instanceof ConversionError)) throw err;
    problems.push(`${err.path}: ${err.reason}`);
    return {};
  }
}

interface Output {
  format: string;
  type: ts.Type;
}

/** The synthetic source file the checker answers the questions in. */
class Probe {
  readonly path: string;
  private readonly header: string[];
  private readonly imports = new Map<string, string>();
  private readonly body: string[] = [];
  /** Body line index of each assignability check, and the declared alias it checks. */
  private readonly checks = new Map<number, string>();
  private source: ts.SourceFile | undefined;
  private count = 0;

  constructor(app: StaticInput['app']) {
    this.path = join(dirname(app.file), '__openapi_probe__.ts');
    this.header = [
      `import type { ExtractSchema } from 'hono/types';`,
      `import type { JSONParsed } from 'hono/utils/types';`,
      `import type { ${app.type} as App } from './${relative(dirname(app.file), app.file)}';`,
      'type S = ExtractSchema<App>;',
      'type At<P, M> = P extends keyof S ? (M extends keyof S[P] ? S[P][M] : never) : never;',
      // `c.json(x, created ? 201 : 200)` gives one entry whose status is `200 | 201`.
      'type Out<E, St> = E extends { status: infer S; output: infer O } ? (St extends S ? O : never) : never;',
    ];
  }

  /** The union of `{ input, output, outputFormat, status }` Hono infers for the endpoint. */
  entry(e: Endpoint): string {
    const alias = `E${this.count++}`;
    this.body.push(`export type ${alias} = At<'${e.path}', '$${e.method.toLowerCase()}'>;`);
    return alias;
  }

  /** The declared type, and both assignability checks against the handler's output. */
  declare(entry: string, d: DeclaredType) {
    const local = this.importType(d);
    const alias = `D${this.count++}`;
    const output = `Out<${entry}, ${d.status}>`;
    this.body.push(`export type ${alias} = ${local};`);
    this.body.push(`declare const ${alias}_out: ${output};`);
    this.checks.set(this.body.length, alias);
    this.body.push(`export const ${alias}_a: JSONParsed<${local}> = ${alias}_out;`);
    this.body.push(`declare const ${alias}_json: JSONParsed<${local}>;`);
    this.checks.set(this.body.length, alias);
    this.body.push(`export const ${alias}_b: ${output} = ${alias}_json;`);
    return { ...d, alias };
  }

  private importType(d: DeclaredType) {
    const key = `${d.file}#${d.name}`;
    const known = this.imports.get(key);
    if (known) return known;
    const local = `T${this.imports.size}`;
    this.imports.set(key, local);
    return local;
  }

  private text(): string {
    const imports = [...this.imports].map(([key, local]) => {
      const [file, name] = key.split('#');
      return `import type { ${name} as ${local} } from '${file}';`;
    });
    return `${[...this.header, ...imports, ...this.body].join('\n')}\n`;
  }

  private get bodyStart() {
    return this.header.length + this.imports.size;
  }

  program(tsconfig: string): ts.Program {
    const config = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, configHost);
    const options: ts.CompilerOptions = {
      ...config?.options,
      noEmit: true,
      composite: false,
      emitDeclarationOnly: false,
      declaration: false,
      incremental: false,
      noUnusedLocals: false,
    };
    const text = this.text();
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile;
    host.getSourceFile = (file, lang, ...rest) =>
      file === this.path ? ts.createSourceFile(file, text, lang) : read(file, lang, ...rest);
    const exists = host.fileExists;
    host.fileExists = (file) => file === this.path || exists(file);
    const program = ts.createProgram({ rootNames: [this.path], options, host });
    this.source = program.getSourceFile(this.path);
    return program;
  }

  /** The interface or type alias a declared alias imports, unless it is something else. */
  declaredSymbol(checker: ts.TypeChecker, alias: string): ts.Symbol | null {
    const decl = this.source?.statements.find(
      (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === alias,
    );
    if (!decl || !ts.isTypeReferenceNode(decl.type)) return null;
    const local = checker.getSymbolAtLocation(decl.type.typeName);
    const target =
      local && local.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(local) : local;
    const declaration = target?.declarations?.[0];
    if (!target || !declaration) return null;
    const named = ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration);
    return named ? target : null;
  }

  aliasNode(alias: string): ts.Node {
    const decl = this.source?.statements.find(
      (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === alias,
    );
    if (!decl) throw new Error(`probe alias ${alias} missing`);
    return decl.name;
  }

  /** Per declared alias, the checker's messages where the two sides are not assignable. */
  mismatches(program: ts.Program): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (!this.source) return out;
    for (const d of program.getSemanticDiagnostics(this.source)) {
      const line =
        d.start === undefined ? -1 : this.source.getLineAndCharacterOfPosition(d.start).line;
      const alias = this.checks.get(line - this.bodyStart);
      const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
      if (!alias) throw new Error(`probe line ${line + 1} does not compile: ${message}`);
      out.set(alias, [...(out.get(alias) ?? []), message]);
    }
    return out;
  }

  /** The handler's answers by status, from the union ExtractSchema holds for the endpoint. */
  outputs(checker: ts.TypeChecker, entry: string): Map<number, Output> {
    const out = new Map<number, Output>();
    const type = checker.getTypeAtLocation(this.aliasNode(entry));
    for (const m of type.isUnion() ? type.types : [type]) {
      const status = m.getProperty('status');
      const format = m.getProperty('outputFormat');
      const output = m.getProperty('output');
      if (!status || !format || !output) continue;
      const statusType = checker.getTypeOfSymbol(status);
      const formatType = checker.getTypeOfSymbol(format);
      if (!formatType.isStringLiteral()) continue;
      for (const v of statusType.isUnion() ? statusType.types : [statusType]) {
        if (v.isNumberLiteral()) {
          out.set(v.value, { format: formatType.value, type: checker.getTypeOfSymbol(output) });
        }
      }
    }
    return out;
  }
}

const configHost: ts.ParseConfigFileHost = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  },
};

function importsOf(source: ts.SourceFile) {
  const map = new Map<string, { specifier: string; name: string }>();
  for (const s of source.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const bindings = s.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const name = (el.propertyName ?? el.name).text;
      map.set(el.name.text, { specifier: s.moduleSpecifier.text, name });
    }
  }
  return map;
}

function isOpCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'op'
  );
}

function property(obj: ts.ObjectLiteralExpression, name: string) {
  return obj.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name,
  );
}

function stringProperty(obj: ts.ObjectLiteralExpression, name: string): string | null {
  const init = property(obj, name)?.initializer;
  return init && ts.isStringLiteral(init) ? init.text : null;
}

/** `responses: { 200: type<T>() }` entries, by status. */
function declaredTypes(obj: ts.ObjectLiteralExpression): [SuccessStatus, ts.TypeNode][] {
  const responses = property(obj, 'responses')?.initializer;
  if (!responses || !ts.isObjectLiteralExpression(responses)) return [];
  const out: [SuccessStatus, ts.TypeNode][] = [];
  for (const p of responses.properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isNumericLiteral(p.name)) continue;
    const init = p.initializer;
    if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) continue;
    if (init.expression.text !== 'type') continue;
    const [typeNode] = init.typeArguments ?? [];
    if (typeNode) out.push([Number(p.name.text) as SuccessStatus, typeNode]);
  }
  return out;
}
