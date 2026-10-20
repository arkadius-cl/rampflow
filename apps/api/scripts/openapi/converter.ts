import { JsonSchemaType } from '@rampflow/shared/values';
import ts from 'typescript-6';
import type { JsonSchema } from './schema.ts';

// TypeScript types to JSON Schema for response bodies (design D5). Covers the subset the API
// returns and fails on everything else, naming the property path.

export class ConversionError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = 'ConversionError';
    this.path = path;
    this.reason = reason;
  }
}

/** The branded strings of packages/shared/src/time and their wire format (ADR-0012). */
const TIME_TYPES: Record<string, JsonSchema> = {
  LocalDate: { type: JsonSchemaType.string, format: 'date' },
  LocalTime: { type: JsonSchemaType.string, pattern: '^(([01]\\d|2[0-3]):[0-5]\\d|24:00)$' },
  LocalDateTime: {
    type: JsonSchemaType.string,
    pattern: '^\\d{4}-\\d{2}-\\d{2}T([01]\\d|2[0-3]):[0-5]\\d$',
  },
  TimeZone: {
    type: JsonSchemaType.string,
    description: 'IANA time zone, such as `Europe/Berlin`.',
  },
};

/** Code-point order, the same on every machine. */
export const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface ConverterOptions {
  /** Whether a declaration names a shared type, which becomes a component. */
  isShared(file: string): boolean;
  /** Whether a declaration is one of the branded time types. */
  isTime(file: string): boolean;
}

export class Converter {
  readonly components: Record<string, JsonSchema> = {};
  private readonly owners = new Map<string, ts.Symbol>();
  private readonly stack: ts.Type[] = [];
  private readonly checker: ts.TypeChecker;
  private readonly program: ts.Program;
  private readonly options: ConverterOptions;

  constructor(program: ts.Program, options: ConverterOptions) {
    this.program = program;
    this.options = options;
    this.checker = program.getTypeChecker();
  }

  /** The schema of `type`; a named shared type becomes a `$ref` to its component. */
  toSchema(type: ts.Type, path: string): JsonSchema {
    const time = this.timeType(type);
    if (time) return time;
    const named = this.namedSymbol(type);
    if (named) return this.reference(named, type, path);
    return this.structure(type, path);
  }

  /** A `$ref` to the component of `symbol`, the declaration a route names in `type<Name>()`. */
  reference(symbol: ts.Symbol, type: ts.Type, path: string): JsonSchema {
    const name = symbol.getName();
    const owner = this.owners.get(name);
    if (owner && owner !== symbol) {
      throw new ConversionError(path, `two different shared types are named ${name}`);
    }
    if (!owner) {
      this.owners.set(name, symbol);
      this.components[name] = {};
      this.components[name] = this.structure(type, name);
    }
    return { $ref: `#/components/schemas/${name}` };
  }

  private namedSymbol(type: ts.Type): ts.Symbol | null {
    const alias = type.aliasSymbol;
    const symbol = alias ?? (type.flags & ts.TypeFlags.Object ? type.getSymbol() : undefined);
    if (!symbol) return null;
    if (alias && type.aliasTypeArguments?.length) return null;
    if (!alias && (type as ts.TypeReference).typeArguments?.length) return null;
    const decl = symbol.declarations?.[0];
    if (!decl || !(ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl))) return null;
    return this.options.isShared(decl.getSourceFile().fileName) ? symbol : null;
  }

  private timeType(type: ts.Type): JsonSchema | null {
    const decl = type.aliasSymbol?.declarations?.[0];
    if (!decl || !this.options.isTime(decl.getSourceFile().fileName)) return null;
    return TIME_TYPES[type.aliasSymbol?.getName() ?? ''] ?? null;
  }

  private structure(type: ts.Type, path: string): JsonSchema {
    if (this.stack.includes(type)) throw new ConversionError(path, 'recursive unnamed type');
    this.stack.push(type);
    try {
      return this.convert(type, path);
    } finally {
      this.stack.pop();
    }
  }

  private convert(type: ts.Type, path: string): JsonSchema {
    const f = type.flags;
    const shown = () => this.checker.typeToString(type);
    if (f & ts.TypeFlags.Any) throw new ConversionError(path, 'any is not a JSON shape');
    if (f & ts.TypeFlags.Unknown) return {};
    if (f & ts.TypeFlags.String) return { type: JsonSchemaType.string };
    if (f & ts.TypeFlags.Number) return { type: JsonSchemaType.number };
    if (f & ts.TypeFlags.Boolean) return { type: JsonSchemaType.boolean };
    if (f & ts.TypeFlags.Null) return { type: JsonSchemaType.null };
    if (type.isStringLiteral()) return { type: JsonSchemaType.string, const: type.value };
    if (type.isNumberLiteral()) return { type: JsonSchemaType.number, const: type.value };
    if (f & ts.TypeFlags.BooleanLiteral)
      return { type: JsonSchemaType.boolean, const: type === this.checker.getTrueType() };
    if (f & ts.TypeFlags.TypeParameter) throw new ConversionError(path, `unresolved ${shown()}`);
    if (type.isUnion()) return this.union(type, path);
    if (type.isIntersection()) return this.intersection(type, path);
    if (f & ts.TypeFlags.Object) return this.object(type as ts.ObjectType, path);
    throw new ConversionError(path, `unsupported type ${shown()}`);
  }

  private union(type: ts.UnionType, path: string): JsonSchema {
    const members = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
    const literals = members.filter((t) => !(t.flags & ts.TypeFlags.Null));
    const nullable = literals.length < members.length;
    if (literals.length === 0) return { type: JsonSchemaType.null };
    if (literals.length === 2 && literals.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) {
      return nullable ? { type: ['boolean', 'null'] } : { type: JsonSchemaType.boolean };
    }
    if (literals.every((t) => t.isStringLiteral()) || literals.every((t) => t.isNumberLiteral())) {
      // Sorted: the checker's member order follows type ids, which shift with unrelated code.
      const values = literals
        .map((t) => (t as ts.StringLiteralType | ts.NumberLiteralType).value)
        .sort((a, b) =>
          typeof a === 'number' && typeof b === 'number' ? a - b : byText(`${a}`, `${b}`),
        );
      const kind = typeof values[0] === 'string' ? 'string' : 'number';
      return nullable
        ? { type: [kind, 'null'], enum: [...values, null] }
        : { type: kind, enum: values };
    }
    const schemas = literals
      .map((t) => this.toSchema(t, path))
      .sort((a, b) => byText(JSON.stringify(a), JSON.stringify(b)));
    const [only] = schemas;
    if (schemas.length === 1 && only) {
      if (!nullable) return only;
      if (typeof only.type === 'string' && !only.enum && only.const === undefined) {
        return { ...only, type: [only.type, 'null'] };
      }
    }
    return { anyOf: nullable ? [...schemas, { type: JsonSchemaType.null }] : schemas };
  }

  /** `string & z.$brand<'X'>` is a string on the wire; object intersections merge. */
  private intersection(type: ts.IntersectionType, path: string): JsonSchema {
    const primitive = type.types.find(
      (t) =>
        t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike),
    );
    if (primitive) return this.toSchema(primitive, path);
    return this.object(type, path);
  }

  private object(type: ts.Type, path: string): JsonSchema {
    const checker = this.checker;
    if (type.getCallSignatures().length || type.getConstructSignatures().length) {
      throw new ConversionError(path, 'a function is not a JSON shape');
    }
    const symbol = type.getSymbol();
    const file = symbol?.declarations?.[0]?.getSourceFile();
    // Lib interfaces such as Date or Uint8Array; lib mapped types such as Record are structural.
    const builtIn =
      symbol &&
      file &&
      this.program.isSourceFileDefaultLibrary(file) &&
      (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) !== 0;
    if (builtIn && symbol.getName() === Date.name)
      return { type: JsonSchemaType.string, format: 'date-time' };
    if (builtIn && !checker.isArrayType(type) && !checker.isTupleType(type)) {
      throw new ConversionError(path, `unsupported built-in ${checker.typeToString(type)}`);
    }
    if (checker.isArrayType(type)) {
      const [item] = checker.getTypeArguments(type as ts.TypeReference);
      return { type: JsonSchemaType.array, items: item ? this.toSchema(item, `${path}[]`) : {} };
    }
    if (checker.isTupleType(type)) {
      const items = checker.getTypeArguments(type as ts.TypeReference);
      return {
        type: JsonSchemaType.array,
        prefixItems: items.map((t, i) => this.toSchema(t, `${path}[${i}]`)),
        minItems: items.length,
        maxItems: items.length,
      };
    }
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const p of checker.getPropertiesOfType(type)) {
      const name = p.getName();
      if (name.startsWith('__@')) throw new ConversionError(path, `symbol key ${name}`);
      const optional = (p.flags & ts.SymbolFlags.Optional) !== 0;
      const valueType = checker.getTypeOfSymbol(p);
      if (valueType.flags & ts.TypeFlags.Undefined) {
        throw new ConversionError(`${path}.${name}`, 'undefined is not a JSON value');
      }
      properties[name] = this.toSchema(valueType, `${path}.${name}`);
      if (!optional) required.push(name);
    }
    return {
      type: JsonSchemaType.object,
      ...(Object.keys(properties).length ? { properties } : {}),
      ...(required.length ? { required } : {}),
      ...(index ? { additionalProperties: this.toSchema(index.type, `${path}[key]`) } : {}),
    };
  }
}
