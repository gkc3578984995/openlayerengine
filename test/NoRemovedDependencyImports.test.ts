import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(__dirname, '..');
const sourceRoot = resolve(projectRoot, 'src');
const removedDependencies = ['heatmap.js', 'lodash', 'mitt', 'ol-wind', 'wind-core', '@types/lodash'] as const;
const centralizedRenderOwners: Readonly<Record<string, readonly string[]>> = {
  'src/adapters/openlayers/render/LayerRenderPass.ts': ['postrender', 'requestAnimationFrame', 'cancelAnimationFrame'],
  'src/adapters/openlayers/OverlayAdapter.ts': ['postrender'],
  'src/adapters/openlayers/ElementProtectionViewAdapter.ts': ['postrender'],
  'src/adapters/dom/ContextMenuViewAdapter.ts': ['postrender']
};

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function projectPath(path: string): string {
  return relative(projectRoot, path).replaceAll('\\', '/');
}

function isRemovedDependency(specifier: string): boolean {
  return removedDependencies.some((dependency) => specifier === dependency || specifier.startsWith(`${dependency}/`));
}

function moduleSpecifiers(path: string): readonly string[] {
  const source = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        specifiers.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function directDependencyNames(path: string): readonly string[] {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies'];
  const names: string[] = [];
  for (const section of sections) {
    const value = manifest[section];
    if (Array.isArray(value)) names.push(...value.filter((item): item is string => typeof item === 'string'));
    else if (value !== null && typeof value === 'object') names.push(...Object.keys(value));
  }
  return names;
}

function rootLockDependencyNames(): readonly string[] {
  const lock = JSON.parse(readFileSync(resolve(projectRoot, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, Record<string, unknown>>;
  };
  const rootPackage = lock.packages?.[''] ?? {};
  const names: string[] = [];
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const value = rootPackage[section];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) names.push(...Object.keys(value));
  }
  return names;
}

function renderLoopPrimitives(path: string): readonly string[] {
  const source = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const primitives: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const calledName = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : undefined;
      if (calledName === 'requestAnimationFrame' || calledName === 'cancelAnimationFrame') primitives.push(calledName);
      if (
        (calledName === 'on' || calledName === 'once' || calledName === 'addEventListener') &&
        node.arguments.length > 0 &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        node.arguments[0].text === 'postrender'
      ) {
        primitives.push('postrender');
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return primitives;
}

describe('removed dependency and per-element render-loop closure', () => {
  it('has no imports of removed runtime or type dependencies in source and Rollup configuration', () => {
    const files = [...listTypeScriptFiles(sourceRoot), resolve(projectRoot, 'rollup.config.mjs')];
    const violations = files.flatMap((file) =>
      moduleSpecifiers(file)
        .filter(isRemovedDependency)
        .map((specifier) => `${projectPath(file)}:${specifier}`)
    );

    expect(violations).toEqual([]);
  });

  it('has no removed direct dependency or bundling declaration in package metadata', () => {
    const declarations = [
      ...directDependencyNames(resolve(projectRoot, 'package.json')).map((name) => `package.json:${name}`),
      ...rootLockDependencyNames().map((name) => `package-lock.json:${name}`)
    ];

    expect(declarations.filter((declaration) => isRemovedDependency(declaration.slice(declaration.indexOf(':') + 1)))).toEqual([]);

    const rollupSource = readFileSync(resolve(projectRoot, 'rollup.config.mjs'), 'utf8');
    const rollupFile = ts.createSourceFile('rollup.config.mjs', rollupSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const removedBuildDeclarations: string[] = [];
    function visit(node: ts.Node): void {
      if (ts.isStringLiteralLike(node) && isRemovedDependency(node.text)) removedBuildDeclarations.push(node.text);
      ts.forEachChild(node, visit);
    }
    visit(rollupFile);
    expect(removedBuildDeclarations).toEqual([]);
  });

  it('allows render-loop primitives only in centralized map or layer render owners', () => {
    const violations: string[] = [];
    for (const file of listTypeScriptFiles(sourceRoot)) {
      const path = projectPath(file);
      const allowed = centralizedRenderOwners[path] ?? [];
      for (const primitive of renderLoopPrimitives(file)) {
        if (!allowed.includes(primitive)) violations.push(`${path}:${primitive}`);
      }
    }

    expect(violations).toEqual([]);
    expect(renderLoopPrimitives(resolve(projectRoot, 'src/adapters/openlayers/render/LayerRenderPass.ts'))).toContain('postrender');
  });
});
