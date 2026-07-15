import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type PackageContract = {
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const sourceFiles = collectTypeScriptFiles('src');
const packageContract = JSON.parse(readFileSync('package.json', 'utf8')) as PackageContract;
const forbiddenBarrels = new Set([
  'ol',
  'ol/geom',
  'ol/geom.js',
  'ol/style',
  'ol/style.js',
  'ol/source',
  'ol/source.js',
  'ol/layer',
  'ol/layer.js',
  'ol/control',
  'ol/control.js',
  'ol/interaction',
  'ol/interaction.js'
]);

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function moduleSpecifiers(file: string): string[] {
  const sourceText = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) specifiers.push(argument.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

describe('OpenLayers 10 contract', () => {
  it('pins the supported OL and TypeScript dependency contract', () => {
    expect(packageContract.devDependencies?.ol).toBe('10.9.0');
    expect(packageContract.devDependencies?.typescript).toBe('6.0.3');
    expect(packageContract.peerDependencies?.ol).toBe('^10.9.0');
    expect(packageContract.peerDependenciesMeta?.ol?.optional).toBe(true);
  });

  it('uses explicit public OpenLayers ESM modules', () => {
    const violations = sourceFiles.flatMap((file) =>
      moduleSpecifiers(file).flatMap((specifier) => {
        if (specifier !== 'ol' && !specifier.startsWith('ol/')) return [];
        if (forbiddenBarrels.has(specifier)) return [`${relative('.', file)}: forbidden OL barrel ${specifier}`];
        if (specifier === 'ol/ol.css' || specifier.endsWith('.js')) return [];
        return [`${relative('.', file)}: OL module must end in .js: ${specifier}`];
      })
    );

    expect(violations).toEqual([]);
  });

  it('does not depend on OpenLayers private fields or renderer internals', () => {
    const forbidden = [/\.anchor_\b/, /\.downPx_\b/, /\.context_\b/, /ol\/renderer\/Layer(?:\.js)?/];
    const violations = sourceFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden.flatMap((pattern) => (pattern.test(source) ? [`${relative('.', file)}: ${pattern.source}`] : []));
    });

    expect(violations).toEqual([]);
  });
});
