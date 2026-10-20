import ts from 'typescript-6';

/** The type a string literal is checked against, and the declaration that type comes from. */
export interface Context {
  /** The union's members; `undefined` and `null` are not removed yet. */
  parts: readonly ts.Type[];
  /** The alias the union was written as (`BookingStatus`), when the checker kept it. */
  alias: ts.Type['aliasSymbol'];
  /** True when the alias is a generic one applied to arguments (`Exclude<BookingStatus, ...>`). */
  generic: boolean;
  /** The parameter, property, variable or signature the literal must satisfy, when one is found. */
  anchor: ts.Node | undefined;
  /** The contextual types before their unions are split into `parts`. */
  whole: readonly ts.Type[];
}

type Literal = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

const LOGICAL = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

/** False for literals that are names, module specifiers or types rather than values. */
export function isValuePosition(node: Literal): boolean {
  const parent = node.parent;
  if (ts.isLiteralTypeNode(parent)) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false;
  if (ts.isExternalModuleReference(parent) || ts.isModuleDeclaration(parent)) return false;
  if (ts.isImportAttribute(parent)) return false;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return false;
  }
  if ('name' in parent && parent.name === node) return false;
  return true;
}

export function contextOf(checker: ts.TypeChecker, node: Literal): Context | undefined {
  const { site, parent, element } = climb(node);

  if (ts.isBinaryExpression(parent) && EQUALITY.has(parent.operatorToken.kind)) {
    const other = parent.left === site ? parent.right : parent.left;
    if (ts.isTypeOfExpression(other) || ts.isStringLiteralLike(other)) return undefined;
    return of([declaredType(checker, other)], anchorOfExpression(checker, other));
  }
  if (ts.isCaseClause(parent) && parent.expression === site) {
    const subject = parent.parent.parent.expression;
    if (ts.isTypeOfExpression(subject)) return undefined;
    return of([declaredType(checker, subject)], anchorOfExpression(checker, subject));
  }

  const anchor = anchorOfSite(checker, site, parent);
  if (!element) {
    let property = propertyTypes(checker, site, parent, false);
    if (property.length === 1 && property[0]?.isStringLiteral()) {
      property = propertyTypes(checker, site, parent, true);
    }
    if (property.length) return of(property, anchor);
  }
  let type = checker.getContextualType(node);
  // A generic parameter infers its type from the literal itself; ask for it without that inference.
  if (type?.isStringLiteral() && type.value === node.text) {
    type = uninferred(checker, node) ?? type;
  }
  return type && of([type], anchor);
}

/**
 * The contextual type with inference from `node` blocked, as completions ask for it. The flags
 * parameter is internal; 4 is `ContextFlags.Completions` in TypeScript 6.
 */
function uninferred(checker: ts.TypeChecker, node: ts.Expression): ts.Type | undefined {
  const get = checker.getContextualType as (n: ts.Expression, flags: number) => ts.Type | undefined;
  return get.call(checker, node, 4);
}

/**
 * Where the union in a declaration's type annotation comes from: a library type such as
 * `Intl.DateTimeFormatPartTypes` or `CookieOptions['sameSite']` makes it the library's.
 */
export function isLibraryAnnotation(
  checker: ts.TypeChecker,
  anchor: ts.Node,
  isLibrary: (file: string) => boolean,
): boolean {
  const annotation = 'type' in anchor ? (anchor.type as ts.Node | undefined) : undefined;
  if (!annotation || !ts.isTypeNode(annotation)) return false;
  const origin = (node: ts.TypeNode): boolean => {
    if (ts.isParenthesizedTypeNode(node)) return origin(node.type);
    if (ts.isIndexedAccessTypeNode(node)) return origin(node.objectType);
    if (ts.isTypeOperatorNode(node)) return origin(node.type);
    if (ts.isUnionTypeNode(node)) return node.types.every(origin);
    if (!ts.isTypeReferenceNode(node) || node.typeArguments?.length) return false;
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol?.declarations?.[0];
    return declaration !== undefined && isLibrary(declaration.getSourceFile().fileName);
  };
  return origin(annotation);
}

function of(types: ts.Type[], anchor: ts.Node | undefined): Context {
  const [first] = types;
  const same = types.every((t) => t === first);
  const alias = same ? first?.aliasSymbol : undefined;
  const generic = Boolean(same && first?.aliasTypeArguments?.length);
  const parts = types.flatMap((t) => (t.isUnion() ? t.types : [t]));
  return { parts, alias, generic, anchor, whole: types };
}

/**
 * True when `union` is the property names of an object type rather than values: `keyof T`, or a
 * generic applied to `T` whose members are `T`'s property paths, such as react-hook-form's
 * `Path<T>`. The literal names a field; the field's value is what a value set would hold.
 */
export function isPropertyNames(
  checker: ts.TypeChecker,
  context: Context,
  union: readonly string[],
): boolean {
  const pathsOf = (argument: ts.Type) =>
    Boolean(argument.flags & ts.TypeFlags.Object) &&
    union.every((path) => hasPath(checker, argument, path));
  // The checker drops `keyof` once the object type is resolved, so the annotation is read too.
  const annotation =
    context.anchor && 'type' in context.anchor ? (context.anchor.type as ts.Node) : undefined;
  if (annotation && ts.isTypeOperatorNode(annotation)) {
    return annotation.operator === ts.SyntaxKind.KeyOfKeyword;
  }
  if (annotation && ts.isTypeReferenceNode(annotation) && annotation.typeArguments) {
    if (annotation.typeArguments.some((a) => pathsOf(checker.getTypeFromTypeNode(a)))) return true;
  }
  return context.whole.some((type) => {
    const origin = (type as { origin?: ts.Type }).origin;
    if (type.flags & ts.TypeFlags.Index || (origin && origin.flags & ts.TypeFlags.Index)) {
      return true;
    }
    return (type.aliasTypeArguments ?? []).some(pathsOf);
  });
}

function hasPath(checker: ts.TypeChecker, type: ts.Type, path: string): boolean {
  let current = type;
  for (const name of path.split('.')) {
    const property = checker.getPropertyOfType(current, name);
    const next = property
      ? checker.getTypeOfSymbol(property)
      : /^\d+$/.test(name)
        ? checker.getIndexTypeOfType(current, ts.IndexKind.Number)
        : undefined;
    if (!next) return false;
    current = checker.getNonNullableType(next);
  }
  return true;
}

/**
 * For `{ type: 'check_in' }` the checker narrows the contextual type to the matching union member,
 * which leaves a single literal. The property's type in every member gives the whole set back.
 */
function propertyTypes(
  checker: ts.TypeChecker,
  site: ts.Node,
  parent: ts.Node,
  blockInference: boolean,
): ts.Type[] {
  const owner =
    ts.isPropertyAssignment(parent) && parent.initializer === site
      ? parent.parent
      : ts.isJsxAttribute(parent)
        ? parent.parent
        : undefined;
  if (!owner || !('name' in parent) || !parent.name) return [];
  let type = blockInference
    ? uninferred(checker, owner as ts.Expression)
    : checker.getContextualType(owner as ts.Expression);
  if (!type) return [];
  if (type.flags & ts.TypeFlags.TypeParameter) type = checker.getBaseConstraintOfType(type) ?? type;
  const name = (parent.name as ts.Node).getText();
  const found: ts.Type[] = [];
  for (const part of type.isUnion() ? type.types : [type]) {
    const property = checker.getPropertyOfType(part, name);
    if (property) found.push(checker.getTypeOfSymbol(property));
  }
  return found;
}

/** Walks up through nodes that pass the contextual type through unchanged. */
function climb(node: ts.Node): { site: ts.Node; parent: ts.Node; element: boolean } {
  let site = node;
  let element = false;
  for (;;) {
    const parent = site.parent;
    if (ts.isArrayLiteralExpression(parent) || ts.isSpreadElement(parent)) element = true;
    const passes =
      ts.isParenthesizedExpression(parent) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isJsxExpression(parent) ||
      (ts.isConditionalExpression(parent) && parent.condition !== site) ||
      (ts.isBinaryExpression(parent) && LOGICAL.has(parent.operatorToken.kind)) ||
      (ts.isAsExpression(parent) && isConstAssertion(parent));
    if (!passes) return { site, parent, element };
    site = parent;
  }
}

export function isConstAssertion(node: ts.AsExpression) {
  return ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'const';
}

function anchorOfSite(
  checker: ts.TypeChecker,
  site: ts.Node,
  parent: ts.Node,
): ts.Node | undefined {
  if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression !== site) {
    const signature = checker.getResolvedSignature(parent);
    const parameters = signature?.getParameters() ?? [];
    const index = Math.min(
      parent.arguments?.indexOf(site as ts.Expression) ?? 0,
      parameters.length - 1,
    );
    return parameters[index]?.valueDeclaration ?? signature?.declaration;
  }
  if (ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent)) {
    return propertyOf(checker, parent.parent, parent.name.getText());
  }
  if (ts.isJsxAttribute(parent)) return propertyOf(checker, parent.parent, parent.name.getText());
  if (ts.isReturnStatement(parent) || ts.isArrowFunction(parent)) {
    const fn = ts.isArrowFunction(parent) ? parent : ts.findAncestor(parent, ts.isFunctionLike);
    if (!fn) return undefined;
    if (fn.type) return fn;
    const contextual = ts.isFunctionExpression(fn) || ts.isArrowFunction(fn);
    const type = contextual ? checker.getContextualType(fn) : undefined;
    return type?.getCallSignatures()[0]?.declaration;
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return anchorOfExpression(checker, parent.left);
  }
  if (
    ts.isVariableDeclaration(parent) ||
    ts.isParameter(parent) ||
    ts.isBindingElement(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isTypeAssertionExpression(parent)
  ) {
    return parent;
  }
  return undefined;
}

function propertyOf(checker: ts.TypeChecker, owner: ts.Expression, name: string) {
  const type = checker.getContextualType(owner);
  if (!type) return undefined;
  const parts = type.isUnion() ? type.types : [type];
  for (const part of parts) {
    const property = checker.getPropertyOfType(part, name);
    const declaration = property?.valueDeclaration ?? property?.declarations?.[0];
    if (declaration) return declaration;
  }
  return undefined;
}

/** The declaration behind an operand: a variable, parameter, property, or the called signature. */
function anchorOfExpression(checker: ts.TypeChecker, expression: ts.Expression) {
  const inner = skipOuter(expression);
  if (ts.isCallExpression(inner)) return checker.getResolvedSignature(inner)?.declaration;
  const symbol = symbolOf(checker, inner);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
}

function skipOuter(expression: ts.Expression): ts.Expression {
  let inner = expression;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner) ||
    ts.isNonNullExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

function symbolOf(checker: ts.TypeChecker, expression: ts.Expression) {
  const symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(expression) ? expression.name : expression,
  );
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) return checker.getAliasedSymbol(symbol);
  return symbol;
}

/** The declared type of an operand, so that `a === 'x' || a === 'y'` sees `a`'s full union. */
function declaredType(checker: ts.TypeChecker, expression: ts.Expression): ts.Type {
  const inner = skipOuter(expression);
  const symbol =
    ts.isIdentifier(inner) || ts.isPropertyAccessExpression(inner)
      ? symbolOf(checker, inner)
      : undefined;
  const typed =
    ts.SymbolFlags.Variable | ts.SymbolFlags.Property | ts.SymbolFlags.FunctionScopedVariable;
  if (symbol && symbol.flags & typed) return checker.getTypeOfSymbol(symbol);
  return checker.getTypeAtLocation(inner);
}
