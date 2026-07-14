import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

interface ConditionalExport {
  readonly types: string;
  readonly import: string;
}

interface PackageJson {
  readonly version: string;
  readonly type: string;
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly bundleDependencies?: readonly string[];
  readonly bundledDependencies?: readonly string[];
  readonly peerDependencies: Record<string, string>;
  readonly peerDependenciesMeta: Record<string, { readonly optional: boolean }>;
  readonly devDependencies: Record<string, string>;
  readonly main: string;
  readonly module: string;
  readonly types: string;
  readonly style: string;
  readonly exports: Record<string, ConditionalExport | string>;
  readonly sideEffects: readonly string[];
}

const projectRoot = resolve(__dirname, '..');
const declarationRoot = resolve(projectRoot, 'dist/types');
const declarationEntry = resolve(declarationRoot, 'index.d.ts');
const runtimeEntry = resolve(projectRoot, 'dist/esm/index.mjs');
const styleEntry = resolve(projectRoot, 'dist/style.css');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as PackageJson;

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return listFiles(file, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [file] : [];
  });
}

describe('2.0 发布入口', () => {
  coversCapabilities(
    'public-root-api',
    'public-style-explicit-entry',
    'public-base-subclass-extension',
    'public-low-level-plot-api',
    'public-feature-metadata-keys',
    'public-legacy-type-only-ast'
  );

  it('只发布 ESM 根入口和样式入口', () => {
    expect(packageJson.version).toBe('2.0.0');
    expect(packageJson.type).toBe('module');
    expect(Object.keys(packageJson.exports)).toEqual(['.', './style.css']);
    expect(packageJson.exports['.']).toEqual({ types: './dist/types/index.d.ts', import: './dist/esm/index.mjs' });
    expect(packageJson.exports['./style.css']).toBe('./dist/style.css');
    expect(packageJson.main).toBe('./dist/esm/index.mjs');
    expect(packageJson.module).toBe('./dist/esm/index.mjs');
    expect(packageJson.types).toBe('./dist/types/index.d.ts');
    expect(packageJson.style).toBe('./dist/style.css');
    expect(packageJson.sideEffects).toEqual(['./dist/style.css']);
  });

  it('没有普通、可选或打包运行时依赖，并把 OL 保持为可选 peer', () => {
    expect(packageJson.dependencies ?? {}).toEqual({});
    expect(packageJson.optionalDependencies ?? {}).toEqual({});
    expect(packageJson.bundleDependencies ?? packageJson.bundledDependencies ?? []).toEqual([]);
    expect(packageJson.peerDependencies).toEqual({ ol: '^10.9.0' });
    expect(packageJson.peerDependenciesMeta).toEqual({ ol: { optional: true } });
    expect(packageJson.devDependencies.ol).toBe('10.9.0');
    expect(packageJson.devDependencies['@types/lodash']).toBeUndefined();
  });

  it('Rollup 只构建根入口并仅外置 OL', () => {
    const config = readFileSync(resolve(projectRoot, 'rollup.config.mjs'), 'utf8');

    expect(config).toMatch(/input:\s*\{\s*index:\s*['"]src\/index\.ts['"]\s*\}/s);
    expect(config).toContain("id === 'ol' || id.startsWith('ol/')");
    expect(config).not.toMatch(/\b(?:core|layers|draw|measure|transform|plot):\s*['"]src\//);
    expect(config).not.toContain('lodash');
    expect(config).not.toContain('externalDependencies');
  });

  it('只读取本次实际构建产物并确认入口完整', () => {
    for (const file of [runtimeEntry, declarationEntry, styleEntry]) expect(existsSync(file), `缺少构建产物：${file}`).toBe(true);
    for (const removed of ['core.mjs', 'layers.mjs', 'draw.mjs', 'measure.mjs', 'transform.mjs', 'plot.mjs']) {
      expect(existsSync(resolve(projectRoot, 'dist/esm', removed))).toBe(false);
    }
    const declarationLeaks = listFiles(declarationRoot, '.d.ts').filter((file) => readFileSync(file, 'utf8').includes('@/'));
    expect(declarationLeaks).toEqual([]);
  });

  it('公开声明闭包不泄漏内部引用，并明确允许 NativeStyleRef', () => {
    const inspection = inspectPublicDeclarationLeaks();

    expect(inspection.publicNames).toContain('NativeStyleRef');
    expect(inspection.leaks, inspection.leaks.join('\n')).toEqual([]);
  });

  it('严格类型消费者只通过根入口使用 v2 API', () => {
    expect(existsSync(declarationEntry), '请先运行 npm run build 生成声明入口').toBe(true);

    execFileSync(
      process.execPath,
      [
        resolve(projectRoot, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--types',
        'node',
        resolve(projectRoot, 'test/fixtures/PackageConsumer.ts')
      ],
      { cwd: projectRoot, encoding: 'utf8' }
    );
  });

  it('Node 可加载实际根 ESM，并拒绝所有旧 subpath', () => {
    expect(existsSync(runtimeEntry), '请先运行 npm run build 生成 ESM 入口').toBe(true);

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const api = await import('@vrsim/earth-engine-ol'); console.log(['Earth','Element','Layer','useEarth'].filter(name => name in api).join(','));"
      ],
      { cwd: projectRoot, encoding: 'utf8' }
    );
    expect(output.trim()).toBe('Earth,Element,Layer,useEarth');

    for (const subpath of ['core', 'layers', 'draw', 'measure', 'transform', 'plot']) {
      expect(() =>
        execFileSync(process.execPath, ['--input-type=module', '--eval', `await import('@vrsim/earth-engine-ol/${subpath}')`], {
          cwd: projectRoot,
          encoding: 'utf8',
          stdio: 'pipe'
        })
      ).toThrow();
    }
  });
});

function inspectPublicDeclarationLeaks(): { readonly publicNames: readonly string[]; readonly leaks: readonly string[] } {
  const configPath = resolve(projectRoot, 'tsconfig.json');
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error !== undefined) throw new Error(formatDiagnostics([loaded.error]));
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, projectRoot, undefined, configPath);
  if (parsed.errors.length > 0) throw new Error(formatDiagnostics(parsed.errors));
  const program = ts.createProgram({
    rootNames: [declarationEntry],
    options: { ...parsed.options, declaration: false, declarationDir: undefined, noEmit: true, outDir: undefined, rootDir: undefined }
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) throw new Error(formatDiagnostics(diagnostics));

  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(declarationEntry);
  if (entry === undefined) throw new Error(`无法读取声明入口：${declarationEntry}`);
  const moduleSymbol = checker.getSymbolAtLocation(entry);
  if (moduleSymbol === undefined) throw new Error(`无法解析声明入口模块：${declarationEntry}`);
  const rootExports = checker.getExportsOfModule(moduleSymbol);
  const publicNames = rootExports.map((symbol) => symbol.getName()).sort();
  const publicNameSet = new Set(publicNames);
  const leaks = new Set<string>();
  const visited = new Set<ts.Type>();
  const normalizedRoot = normalizePath(declarationRoot);

  const inspectNamedSymbol = (symbol: ts.Symbol | undefined, route: string): boolean => {
    if (symbol === undefined) return false;
    const resolved = resolveAlias(checker, symbol);
    const declarations = resolved.getDeclarations() ?? [];
    const owned = declarations.filter((declaration) => isPathWithin(normalizePath(declaration.getSourceFile().fileName), normalizedRoot));
    if (owned.length === 0) return false;
    const name = resolved.getName();
    if (name !== 'NativeStyleRef' && (name === 'NativeRef' || name === 'TransientNativeRef' || name.endsWith('Adapter') || name.endsWith('Registry'))) {
      leaks.add(`${route} 引用了内部声明 ${name}`);
    }
    for (const declaration of owned) {
      const file = normalizePath(declaration.getSourceFile().fileName);
      if (file.includes('/adapters/')) leaks.add(`${route} 引用了内部 Adapter 文件 ${file}`);
      const text = declaration.getSourceFile().text;
      if (/from\s+['"]lodash(?:\/|['"])/u.test(text)) leaks.add(`${route} 引用了 lodash 声明`);
      if (/from\s+['"]ol\/renderer\//u.test(text)) leaks.add(`${route} 引用了 OL renderer 私有声明`);
    }
    return true;
  };

  const walkSignature = (signature: ts.Signature, route: string): void => {
    for (const parameter of signature.getParameters()) {
      const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
      if (declaration !== undefined) walkType(checker.getTypeOfSymbolAtLocation(parameter, declaration), `${route} -> 参数 ${parameter.getName()}`);
    }
    walkType(signature.getReturnType(), `${route} -> 返回值`);
    for (const parameter of signature.typeParameters ?? []) {
      const constraint = checker.getBaseConstraintOfType(parameter);
      if (constraint !== undefined) walkType(constraint, `${route} -> 泛型约束`);
    }
  };

  const walkType = (type: ts.Type, route: string): void => {
    if (visited.has(type)) return;
    visited.add(type);

    const aliasOwned = inspectNamedSymbol(type.aliasSymbol, route);
    const symbolOwned = inspectNamedSymbol(type.getSymbol(), route);
    for (const argument of type.aliasTypeArguments ?? []) walkType(argument, `${route} -> 类型参数`);
    if ((type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0) {
      for (const argument of checker.getTypeArguments(type as ts.TypeReference)) walkType(argument, `${route} -> 类型参数`);
    }
    if (!aliasOwned && !symbolOwned && isExternalNamedType(type, normalizedRoot)) return;
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

  for (const exported of rootExports) {
    const symbol = resolveAlias(checker, exported);
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if ((symbol.flags & ts.SymbolFlags.Value) !== 0 && declaration !== undefined) {
      walkType(checker.getTypeOfSymbolAtLocation(symbol, declaration), exported.getName());
    }
    if ((symbol.flags & ts.SymbolFlags.Type) !== 0) walkType(checker.getDeclaredTypeOfSymbol(symbol), exported.getName());
  }

  for (const name of ['NativeRef', 'TransientNativeRef', 'NativeRefRegistry']) {
    if (publicNameSet.has(name)) leaks.add(`根入口导出了内部声明 ${name}`);
  }
  return { publicNames, leaks: [...leaks].sort() };
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

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function isExternalNamedType(type: ts.Type, ownedRoot: string): boolean {
  const declarations = [...(type.aliasSymbol?.getDeclarations() ?? []), ...(type.getSymbol()?.getDeclarations() ?? [])];
  return declarations.length > 0 && declarations.every((declaration) => !isPathWithin(normalizePath(declaration.getSourceFile().fileName), ownedRoot));
}

function isPublicSymbol(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations() ?? [];
  return (
    declarations.length === 0 ||
    declarations.some((declaration) => {
      const named = declaration as ts.Declaration & { readonly name?: ts.DeclarationName };
      if (named.name !== undefined && ts.isPrivateIdentifier(named.name)) return false;
      const flags = ts.getCombinedModifierFlags(declaration);
      return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) === 0;
    })
  );
}

function normalizePath(value: string): string {
  return resolve(value).replaceAll('\\', '/').toLowerCase();
}

function isPathWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => '\n'
  });
}
