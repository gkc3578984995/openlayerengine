import { existsSync, realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type ArchitectureArea = 'core' | 'services' | 'builtins' | 'adapters' | 'facade' | 'internal' | 'legacy' | 'ol';
type CheckedArea = Exclude<ArchitectureArea, 'legacy' | 'ol'>;

interface ImportReference {
  readonly kind: 'static' | 're-export' | 'import-type' | 'dynamic';
  readonly specifier?: string;
}

const discoveredConfigPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (discoveredConfigPath === undefined) throw new Error('Unable to find tsconfig.json');
const configPath: string = discoveredConfigPath;
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
const compilerOptions = parsedConfig.options;
const sourceRoot = normalizeRealPath(resolve('src'));
const checkedAreas: readonly CheckedArea[] = ['core', 'services', 'builtins', 'adapters', 'facade', 'internal'];
const forbiddenTargets: Readonly<Partial<Record<CheckedArea, readonly ArchitectureArea[]>>> = {
  core: ['services', 'builtins', 'adapters', 'facade', 'internal', 'legacy', 'ol'],
  services: ['adapters', 'facade', 'internal', 'legacy', 'ol'],
  builtins: ['adapters', 'facade', 'internal', 'legacy', 'ol'],
  adapters: ['builtins', 'facade', 'internal', 'legacy']
};

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      return extname(entry.name) === '.ts' ? [path] : [];
    })
  );
  return nested.flat();
}

function normalizeRealPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync.native(absolute) : absolute;
}

function isWithin(directory: string, path: string): boolean {
  const child = relative(directory, path);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function classifyResolvedPath(path: string): ArchitectureArea | undefined {
  const normalized = normalizeRealPath(path);
  if (pathSegments(normalized).includes('node_modules')) return undefined;
  if (!isWithin(sourceRoot, normalized)) return 'legacy';

  const sourceRelative = relative(sourceRoot, normalized);
  const area = sourceRelative.split(sep)[0] as ArchitectureArea;
  return checkedAreas.includes(area as CheckedArea) ? area : 'legacy';
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

function isOpenLayersResolution(resolvedModule: ts.ResolvedModuleFull): boolean {
  if (resolvedModule.packageId?.name === 'ol') return true;
  const segments = pathSegments(normalizeRealPath(resolvedModule.resolvedFileName));
  return segments.some((segment, index) => segment === 'node_modules' && segments[index + 1] === 'ol');
}

function fallbackSourcePath(importer: string, specifier: string): string | undefined {
  if (specifier.startsWith('@/')) return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith('.')) return resolve(dirname(importer), specifier);
  const configuredBaseUrl = compilerOptions.baseUrl;
  if (configuredBaseUrl !== undefined) {
    const baseUrl = isAbsolute(configuredBaseUrl) ? configuredBaseUrl : resolve(dirname(configPath), configuredBaseUrl);
    const candidate = resolve(baseUrl, specifier);
    if (existsSync(candidate) || existsSync(`${candidate}.ts`) || existsSync(join(candidate, 'index.ts')) || specifier.includes('/../')) return candidate;
  }
  return undefined;
}

function classifyImport(importer: string, specifier: string): ArchitectureArea | undefined {
  if (specifier === 'ol' || specifier.startsWith('ol/')) return 'ol';

  const resolvedModule = ts.resolveModuleName(specifier, importer, compilerOptions, ts.sys).resolvedModule;
  if (resolvedModule !== undefined) {
    if (isOpenLayersResolution(resolvedModule)) return 'ol';
    const normalized = normalizeRealPath(resolvedModule.resolvedFileName);
    if (pathSegments(normalized).includes('node_modules')) return undefined;
    return classifyResolvedPath(normalized);
  }

  const fallback = fallbackSourcePath(importer, specifier);
  return fallback === undefined ? undefined : classifyResolvedPath(fallback);
}

function collectImportReferences(source: string, fileName = 'module.ts'): ImportReference[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const references: ImportReference[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      references.push({ kind: 'static', specifier: node.moduleSpecifier.text });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) {
      references.push({ kind: 're-export', specifier: node.moduleSpecifier.text });
    } else if (ts.isImportTypeNode(node)) {
      const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
      references.push({ kind: 'import-type', specifier: literal !== undefined && ts.isStringLiteralLike(literal) ? literal.text : undefined });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      references.push({ kind: 'dynamic', specifier: argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : undefined });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function findImportViolations(area: CheckedArea, file: string, source: string): string[] {
  const fileName = relative(sourceRoot, file).split(sep).join('/');
  const violations: string[] = [];
  for (const reference of collectImportReferences(source, file)) {
    if (reference.specifier === undefined) {
      if (reference.kind === 'dynamic' || reference.kind === 'import-type') violations.push(`${fileName}: ${area} -> non-static ${reference.kind}`);
      continue;
    }
    const target = classifyImport(file, reference.specifier);
    if (target && forbiddenTargets[area]?.includes(target)) {
      violations.push(`${fileName}: ${area} -> ${target} (${reference.specifier})`);
    }
  }
  return violations;
}

describe('architecture import graph', () => {
  it('collects every TypeScript module-reference form without regex bypasses', () => {
    const source = [
      "import value from './static.js';",
      "import type { Contract } from '../core/contract.js';",
      "import /* between import and specifier */ '../../common/legacy.js';",
      "export { helper } from '@/services/helper.js';",
      "export type { Port } from '../core/port.js';",
      "type Imported = import('./type-query.js').Imported;",
      "const lazy = import /* between keyword and call */ ('../adapters/lazy.js');",
      'const template = import(`../facade/template.js`);',
      'const computed = import(`../facade/${name}.js`);'
    ].join('\n');

    expect(collectImportReferences(source)).toEqual([
      { kind: 'static', specifier: './static.js' },
      { kind: 'static', specifier: '../core/contract.js' },
      { kind: 'static', specifier: '../../common/legacy.js' },
      { kind: 're-export', specifier: '@/services/helper.js' },
      { kind: 're-export', specifier: '../core/port.js' },
      { kind: 'import-type', specifier: './type-query.js' },
      { kind: 'dynamic', specifier: '../adapters/lazy.js' },
      { kind: 'dynamic', specifier: '../facade/template.js' },
      { kind: 'dynamic', specifier: undefined }
    ]);
  });

  it('rejects non-static dynamic imports in every checked architecture area', () => {
    const importer = join(sourceRoot, 'core', 'example.ts');
    expect(findImportViolations('core', importer, 'const module = import(target);')).toEqual(['core/example.ts: core -> non-static dynamic']);
  });

  it('classifies normalized aliases, baseUrl paths, source escapes, and external packages through TypeScript resolution', () => {
    const importer = join(sourceRoot, 'core', 'example.ts');
    expect(classifyImport(importer, '../common/Utils.js')).toBe('legacy');
    expect(classifyImport(importer, '@/core/../base')).toBe('legacy');
    expect(classifyImport(importer, 'core/../base')).toBe('legacy');
    expect(classifyImport(importer, '../../../outside.js')).toBe('legacy');
    expect(classifyImport(importer, '@/core/errors.js')).toBe('core');
    expect(classifyImport(importer, 'typescript')).toBeUndefined();
    expect(classifyImport(importer, 'node:fs')).toBeUndefined();
  });

  it('classifies OpenLayers reached through a relative node_modules path as OL', () => {
    const importer = join(sourceRoot, 'core', 'example.ts');
    const specifier = '../../node_modules/ol/Map.js';

    expect(classifyImport(importer, specifier)).toBe('ol');
    expect(findImportViolations('core', importer, `import Map from '${specifier}';`)).toEqual([`core/example.ts: core -> ol (${specifier})`]);
    expect(classifyImport(importer, 'typescript')).toBeUndefined();
  });

  it('prevents adapters from depending upward on composition or legacy modules', () => {
    expect(forbiddenTargets.adapters).toEqual(['builtins', 'facade', 'internal', 'legacy']);
  });

  it('keeps Core pure and confines integration dependencies to adapters and composition roots', async () => {
    const violations: string[] = [];
    let scannedCoreFiles = 0;

    for (const area of checkedAreas) {
      const files = await collectTypeScriptFiles(join(sourceRoot, area));
      if (area === 'core') scannedCoreFiles = files.length;
      for (const file of files) {
        const source = await readFile(file, 'utf8');
        violations.push(...findImportViolations(area, file, source));
      }
    }

    expect(scannedCoreFiles).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
