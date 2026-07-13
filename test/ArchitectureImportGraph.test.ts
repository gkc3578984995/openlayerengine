import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

type ArchitectureArea = 'core' | 'services' | 'builtins' | 'adapters' | 'facade' | 'internal' | 'legacy' | 'ol';

const sourceRoot = resolve('src');
const checkedAreas: readonly Exclude<ArchitectureArea, 'ol'>[] = ['core', 'services', 'builtins', 'adapters', 'facade', 'internal'];
const forbiddenTargets: Readonly<Partial<Record<ArchitectureArea, readonly ArchitectureArea[]>>> = {
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

function classifyImport(importer: string, specifier: string): ArchitectureArea | undefined {
  if (specifier === 'ol' || specifier.startsWith('ol/')) return 'ol';

  let sourceRelative: string;
  if (specifier.startsWith('@/')) {
    sourceRelative = specifier.slice(2);
  } else if (specifier.startsWith('.')) {
    sourceRelative = relative(sourceRoot, resolve(dirname(importer), specifier));
  } else if (resolvesFromSourceRoot(specifier)) {
    sourceRelative = specifier;
  } else {
    return undefined;
  }

  if (sourceRelative === '..' || sourceRelative.startsWith(`..${sep}`)) return 'legacy';
  const area = sourceRelative.split(/[\\/]/)[0] as ArchitectureArea;
  return checkedAreas.includes(area as Exclude<ArchitectureArea, 'ol'>) ? area : 'legacy';
}

function resolvesFromSourceRoot(specifier: string): boolean {
  const candidate = resolve(sourceRoot, specifier);
  const candidates = [candidate];
  if (candidate.endsWith('.js')) candidates.push(`${candidate.slice(0, -3)}.ts`);
  if (extname(candidate) === '') candidates.push(`${candidate}.ts`, join(candidate, 'index.ts'));
  return candidates.some((path) => existsSync(path));
}

function extractImportSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])([^'"]+)\1/g), (match) => match[2]);
}

describe('architecture import graph', () => {
  it('recognizes static, type-only, re-export, dynamic, and side-effect imports', () => {
    const source = [
      "import value from './static.js';",
      "import type { Contract } from '../core/contract.js';",
      "export { helper } from '@/services/helper.js';",
      "const lazy = import('../adapters/lazy.js');",
      "import '../../common/legacy.js';"
    ].join('\n');

    expect(extractImportSpecifiers(source)).toEqual([
      './static.js',
      '../core/contract.js',
      '@/services/helper.js',
      '../adapters/lazy.js',
      '../../common/legacy.js'
    ]);
  });

  it('classifies any repository source outside the architecture areas as legacy', () => {
    const importer = join(sourceRoot, 'core', 'example.ts');
    expect(classifyImport(importer, '../common/Utils.js')).toBe('legacy');
    expect(classifyImport(importer, '@/base/Base.js')).toBe('legacy');
    expect(classifyImport(importer, 'common/Utils.js')).toBe('legacy');
    expect(classifyImport(importer, 'base/Base.js')).toBe('legacy');
    expect(classifyImport(importer, '../../../outside.js')).toBe('legacy');
    expect(classifyImport(importer, 'vitest')).toBeUndefined();
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
        const specifiers = extractImportSpecifiers(source);
        for (const specifier of specifiers) {
          const target = classifyImport(file, specifier);
          if (target && forbiddenTargets[area]?.includes(target)) {
            violations.push(`${relative(sourceRoot, file).split(sep).join('/')}: ${area} -> ${target} (${specifier})`);
          }
        }
      }
    }

    expect(scannedCoreFiles).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
