import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { publicApiManifest } from './fixtures/v2PublicApiManifest.js';

type ExportKind = 'type' | 'value';

interface RootExportInspection {
  readonly typeExports: readonly string[];
  readonly valueExports: readonly string[];
  readonly duplicates: readonly string[];
  readonly unsupported: readonly string[];
}

const repositoryRoot = process.cwd();
const sourceRoot = path.join(repositoryRoot, 'src');
const sourceEntry = path.join(sourceRoot, 'index.ts');
const declarationRoot = path.join(repositoryRoot, 'dist', 'types');
const declarationEntry = path.join(declarationRoot, 'index.d.ts');
const runtimeEntry = path.join(repositoryRoot, 'dist', 'esm', 'index.mjs');
const expectedValues: string[] = [...publicApiManifest.valueExports].sort();
const expectedTypes: string[] = [...publicApiManifest.typeExports].sort();
const publicNames: ReadonlySet<string> = new Set([...expectedValues, ...expectedTypes]);
const forbiddenRootNames = [
  'AnimationRegistry',
  'Base',
  'Billboard',
  'BillboardLayer',
  'ContextMenuFacade',
  'DrawFacade',
  'ElementStore',
  'FeatureBinding',
  'GeometryAdapter',
  'GlobalEvent',
  'InputAdapter',
  'LayerRenderPass',
  'NativeRefRegistry',
  'PlotDraw',
  'PlotEdit',
  'PointLayer',
  'PolygonLayer',
  'PolylineLayer',
  'ShapeDefinition',
  'ShapeRegistry',
  'StyleCompiler',
  'Transform',
  'destroyEarth',
  'nativeStyleRefBrand'
] as const;

describe('2.0 公共 API 白名单', () => {
  it('源码入口仅导出冻结的值与类型集合', () => {
    const program = createSourceProgram();
    assertNoDiagnostics(program);
    assertProgramContract(program, sourceEntry, sourceRoot);
  });

  it('构建声明保持相同白名单且公共类型闭包不泄漏内部声明', () => {
    expect(existsSync(declarationEntry), '请先运行 npm run build 生成 dist/types/index.d.ts').toBe(true);
    const program = createDeclarationProgram();
    assertNoDiagnostics(program);
    assertProgramContract(program, declarationEntry, declarationRoot);
  });

  it('构建产物仅包含冻结的运行时导出', async () => {
    expect(existsSync(runtimeEntry), '请先运行 npm run build 生成 dist/esm/index.mjs').toBe(true);
    const runtime = (await import(`${pathToFileURL(runtimeEntry).href}?public-api=${Date.now()}`)) as Record<string, unknown>;
    expect(Object.keys(runtime).sort()).toEqual(expectedValues);
    for (const name of expectedTypes) expect(Object.prototype.hasOwnProperty.call(runtime, name), `${name} 不应产生运行时导出`).toBe(false);
    for (const name of forbiddenRootNames) expect(Object.prototype.hasOwnProperty.call(runtime, name), `${name} 属于禁止导出的旧或内部 API`).toBe(false);
  });
});

function createSourceProgram(): ts.Program {
  const parsed = readRepositoryConfig();
  return ts.createProgram({ rootNames: [sourceEntry], options: { ...parsed.options, noEmit: true } });
}

function createDeclarationProgram(): ts.Program {
  const parsed = readRepositoryConfig();
  return ts.createProgram({
    rootNames: [declarationEntry],
    options: {
      ...parsed.options,
      declaration: false,
      declarationDir: undefined,
      noEmit: true,
      outDir: undefined,
      rootDir: undefined
    }
  });
}

function readRepositoryConfig(): ts.ParsedCommandLine {
  const configPath = path.join(repositoryRoot, 'tsconfig.json');
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error !== undefined) throw new Error(formatDiagnostics([loaded.error]));
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, repositoryRoot, undefined, configPath);
  if (parsed.errors.length > 0) throw new Error(formatDiagnostics(parsed.errors));
  return parsed;
}

function assertNoDiagnostics(program: ts.Program): void {
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics, formatDiagnostics(diagnostics)).toEqual([]);
}

function assertProgramContract(program: ts.Program, entryPath: string, ownedRoot: string): void {
  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(entryPath);
  expect(entry, `无法读取公共入口 ${entryPath}`).toBeDefined();
  if (entry === undefined) return;

  const inspection = inspectRootExports(entry);
  expect(inspection.unsupported, `公共入口禁止 export *、namespace export 或 default export：${inspection.unsupported.join(', ')}`).toEqual([]);
  expect(inspection.duplicates, `公共入口存在同名重复导出：${inspection.duplicates.join(', ')}`).toEqual([]);
  expect(inspection.valueExports).toEqual(expectedValues);
  expect(inspection.typeExports).toEqual(expectedTypes);
  expect(inspection.valueExports.filter((name) => inspection.typeExports.includes(name))).toEqual([]);

  const moduleSymbol = checker.getSymbolAtLocation(entry);
  expect(moduleSymbol, `无法解析公共入口模块符号 ${entryPath}`).toBeDefined();
  if (moduleSymbol === undefined) return;
  const exportsByName = new Map(checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.getName(), symbol]));
  assertResolvedExportKinds(checker, exportsByName, inspection);

  for (const name of forbiddenRootNames) expect(exportsByName.has(name), `${name} 属于禁止导出的旧或内部 API`).toBe(false);
  const closureErrors = auditPublicTypeClosure(checker, exportsByName, inspection, ownedRoot);
  expect(closureErrors, closureErrors.join('\n')).toEqual([]);
}

function inspectRootExports(entry: ts.SourceFile): RootExportInspection {
  const values = new Set<string>();
  const types = new Set<string>();
  const duplicates = new Set<string>();
  const unsupported: string[] = [];
  const record = (name: string, kind: ExportKind): void => {
    if (values.has(name) || types.has(name)) duplicates.add(name);
    (kind === 'type' ? types : values).add(name);
  };

  for (const statement of entry.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined || ts.isNamespaceExport(statement.exportClause)) {
        unsupported.push(statement.getText(entry));
        continue;
      }
      for (const specifier of statement.exportClause.elements) {
        record(specifier.name.text, statement.isTypeOnly || specifier.isTypeOnly ? 'type' : 'value');
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      unsupported.push(statement.getText(entry));
      continue;
    }
    if (!hasExportModifier(statement)) continue;
    if (hasDefaultModifier(statement)) {
      unsupported.push(statement.getText(entry));
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      record(statement.name.text, 'type');
    } else if (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      if (statement.name === undefined) unsupported.push(statement.getText(entry));
      else record(statement.name.text, 'value');
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) record(name, 'value');
      }
    } else {
      unsupported.push(statement.getText(entry));
    }
  }

  return {
    valueExports: [...values].sort(),
    typeExports: [...types].sort(),
    duplicates: [...duplicates].sort(),
    unsupported
  };
}

function assertResolvedExportKinds(checker: ts.TypeChecker, exportsByName: ReadonlyMap<string, ts.Symbol>, inspection: RootExportInspection): void {
  for (const name of inspection.valueExports) {
    const symbol = exportsByName.get(name);
    expect(symbol, `无法解析值导出 ${name}`).toBeDefined();
    if (symbol === undefined) continue;
    const resolved = resolveAlias(checker, symbol);
    expect((resolved.flags & ts.SymbolFlags.Value) !== 0, `${name} 必须解析为运行时值`).toBe(true);
  }
  for (const name of inspection.typeExports) {
    const symbol = exportsByName.get(name);
    expect(symbol, `无法解析类型导出 ${name}`).toBeDefined();
    if (symbol === undefined) continue;
    const resolved = resolveAlias(checker, symbol);
    expect((resolved.flags & ts.SymbolFlags.Type) !== 0, `${name} 必须解析为类型`).toBe(true);
    expect((resolved.flags & ts.SymbolFlags.Value) !== 0, `${name} 必须是纯类型，不能产生运行时值`).toBe(false);
  }
}

function auditPublicTypeClosure(
  checker: ts.TypeChecker,
  exportsByName: ReadonlyMap<string, ts.Symbol>,
  inspection: RootExportInspection,
  ownedRoot: string
): readonly string[] {
  const errors = new Set<string>();
  const visited = new Set<ts.Type>();
  const normalizedOwnedRoot = normalizePath(ownedRoot);

  const isOwnedNode = (node: ts.Node): boolean => isPathWithin(normalizePath(node.getSourceFile().fileName), normalizedOwnedRoot);

  const auditNamedSymbol = (symbol: ts.Symbol | undefined, route: string, exportedName?: string): boolean => {
    if (symbol === undefined) return false;
    const declarations = symbol.getDeclarations() ?? [];
    const ownedDeclarations = declarations.filter(isOwnedNode);
    if (ownedDeclarations.length === 0) return false;
    for (const declaration of ownedDeclarations) {
      const name = namedDeclarationName(declaration) ?? exportedName;
      if (name === undefined || name.startsWith('__')) continue;
      if (name === 'nativeStyleRefBrand') continue;
      if (!publicNames.has(name)) {
        errors.add(`${route} 引用了未列入公共白名单的仓库声明 ${name}（${relativeDeclarationPath(declaration)}）`);
      }
    }
    return true;
  };

  const walkSignature = (signature: ts.Signature, route: string): void => {
    const declaration = signature.getDeclaration();
    if (declaration !== undefined && isOwnedNode(declaration) && isPublicDeclaration(declaration)) {
      for (const parameter of declaration.parameters) {
        const inline = parameter.type === undefined ? undefined : findInlineObjectType(parameter.type);
        if (inline !== undefined) {
          errors.add(`${route} 的参数 ${parameter.name.getText()} 使用了未命名的公共对象类型（${relativeDeclarationPath(inline)}）`);
        }
      }
      const returnTypeNode = declaration.type;
      const inlineReturn = returnTypeNode === undefined ? undefined : findInlineObjectType(returnTypeNode);
      if (inlineReturn !== undefined) errors.add(`${route} 的返回值使用了未命名的公共对象类型（${relativeDeclarationPath(inlineReturn)}）`);
    }

    for (const parameter of signature.getParameters()) {
      const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
      if (declaration !== undefined) walkType(checker.getTypeOfSymbolAtLocation(parameter, declaration), `${route} -> 参数 ${parameter.getName()}`);
    }
    walkType(signature.getReturnType(), `${route} -> 返回值`);
    for (const typeParameter of signature.typeParameters ?? []) {
      const constraint = checker.getBaseConstraintOfType(typeParameter);
      if (constraint !== undefined) walkType(constraint, `${route} -> 泛型约束`);
    }
  };

  const walkType = (type: ts.Type, route: string): void => {
    if (visited.has(type)) return;
    visited.add(type);

    const aliasOwned = auditNamedSymbol(type.aliasSymbol, route);
    const symbolOwned = auditNamedSymbol(type.getSymbol(), route);

    for (const argument of type.aliasTypeArguments ?? []) walkType(argument, `${route} -> 类型参数`);
    if ((type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0) {
      for (const argument of checker.getTypeArguments(type as ts.TypeReference)) walkType(argument, `${route} -> 类型参数`);
    }

    if (!aliasOwned && !symbolOwned && isExternalNamedType(type)) return;
    if (type.isUnionOrIntersection()) {
      for (const member of type.types) walkType(member, route);
      return;
    }
    if ((type.flags & primitiveTypeFlags) !== 0) return;
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint !== undefined) walkType(constraint, `${route} -> 泛型约束`);
      return;
    }

    const structured = type as ts.Type & {
      readonly checkType?: ts.Type;
      readonly extendsType?: ts.Type;
      readonly trueType?: ts.Type;
      readonly falseType?: ts.Type;
      readonly resolvedTrueType?: ts.Type;
      readonly resolvedFalseType?: ts.Type;
      readonly objectType?: ts.Type;
      readonly indexType?: ts.Type;
    };
    for (const nested of [
      structured.checkType,
      structured.extendsType,
      structured.trueType,
      structured.falseType,
      structured.resolvedTrueType,
      structured.resolvedFalseType,
      structured.objectType,
      structured.indexType
    ]) {
      if (nested !== undefined) walkType(nested, route);
    }

    if ((type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & (ts.ObjectFlags.Class | ts.ObjectFlags.Interface)) !== 0) {
      for (const base of checker.getBaseTypes(type as ts.InterfaceType)) walkType(base, `${route} -> 基类型`);
    }
    for (const property of checker.getPropertiesOfType(type)) {
      if (!isPublicSymbol(property)) continue;
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (declaration !== undefined) walkType(checker.getTypeOfSymbolAtLocation(property, declaration), `${route}.${property.getName()}`);
    }
    for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) walkSignature(signature, route);
    for (const indexInfo of checker.getIndexInfosOfType(type)) walkType(indexInfo.type, `${route} -> 索引值`);
  };

  for (const [kind, names] of [
    ['value', inspection.valueExports],
    ['type', inspection.typeExports]
  ] as const) {
    for (const name of names) {
      const exported = exportsByName.get(name);
      if (exported === undefined) continue;
      const symbol = resolveAlias(checker, exported);
      auditNamedSymbol(symbol, name, name);
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (kind === 'value' && declaration === undefined) {
        errors.add(`无法定位公共值 ${name} 的声明`);
        continue;
      }
      const type = kind === 'value' ? checker.getTypeOfSymbolAtLocation(symbol, declaration as ts.Declaration) : checker.getDeclaredTypeOfSymbol(symbol);
      walkType(type, name);
    }
  }

  return [...errors].sort();
}

const primitiveTypeFlags =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Never |
  ts.TypeFlags.Void |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.ESSymbolLike;

function isExternalNamedType(type: ts.Type): boolean {
  const declarations = [...(type.aliasSymbol?.getDeclarations() ?? []), ...(type.getSymbol()?.getDeclarations() ?? [])];
  return (
    declarations.length > 0 &&
    declarations.every(
      (declaration) =>
        !isPathWithin(normalizePath(declaration.getSourceFile().fileName), normalizePath(sourceRoot)) &&
        !isPathWithin(normalizePath(declaration.getSourceFile().fileName), normalizePath(declarationRoot))
    )
  );
}

function findInlineObjectType(node: ts.TypeNode): ts.TypeLiteralNode | undefined {
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) return undefined;
  if (ts.isTypeLiteralNode(node)) return node;
  let found: ts.TypeLiteralNode | undefined;
  node.forEachChild((child) => {
    if (found !== undefined || !ts.isTypeNode(child)) return;
    found = findInlineObjectType(child);
  });
  return found;
}

function isPublicSymbol(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations() ?? [];
  return declarations.length === 0 || declarations.some(isPublicDeclaration);
}

function isPublicDeclaration(declaration: ts.Declaration): boolean {
  const namedDeclaration = declaration as ts.Declaration & { readonly name?: ts.DeclarationName };
  if (namedDeclaration.name !== undefined && ts.isPrivateIdentifier(namedDeclaration.name)) return false;
  const flags = ts.getCombinedModifierFlags(declaration);
  return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) === 0;
}

function namedDeclarationName(declaration: ts.Declaration): string | undefined {
  if (
    ts.isClassDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration) ||
    ts.isFunctionDeclaration(declaration)
  ) {
    return declaration.name?.text;
  }
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) return declaration.name.text;
  return undefined;
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false);
}

function bindingNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)));
}

function relativeDeclarationPath(node: ts.Node): string {
  return path.relative(repositoryRoot, node.getSourceFile().fileName).replaceAll('\\', '/');
}

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase();
}

function isPathWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => '\n'
  });
}
