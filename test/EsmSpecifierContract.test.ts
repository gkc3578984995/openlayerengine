import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const assetExtensions = new Set(['.scss', '.css', '.svg', '.png', '.jpg', '.jpeg']);
const sourceFiles = collectTypeScriptFiles('src');

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

function relativeSpecifierViolation(file: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const [path, query] = specifier.split('?', 2);
  const extension = extname(path).toLowerCase();

  if (query === 'raw' && assetExtensions.has(extension)) return undefined;
  if (!query && assetExtensions.has(extension)) return undefined;
  if (query) return `${relative('.', file)}: unsupported resource query in ${specifier}`;
  if (extension !== '.js') return `${relative('.', file)}: relative TypeScript module must end in .js: ${specifier}`;

  const sourcePath = resolve(dirname(file), path.slice(0, -3));
  if (existsSync(`${sourcePath}.ts`)) return undefined;
  if (existsSync(sourcePath) && statSync(sourcePath).isDirectory()) {
    return `${relative('.', file)}: directory entry must explicitly end in /index.js: ${specifier}`;
  }
  return undefined;
}

describe('ESM specifier contract', () => {
  it('uses native .js specifiers for every relative TypeScript module boundary', () => {
    const violations = sourceFiles.flatMap((file) =>
      moduleSpecifiers(file)
        .map((specifier) => relativeSpecifierViolation(file, specifier))
        .filter(Boolean)
    );

    expect(violations).toEqual([]);
  });
});
