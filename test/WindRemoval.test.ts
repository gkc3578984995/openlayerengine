import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(__dirname, '..');
const sourceRoot = resolve(projectRoot, 'src');

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(file);
    return entry.isFile() && entry.name.endsWith('.ts') ? [file] : [];
  });
}

function findReferences(files: string[], references: readonly string[]): string[] {
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return references.filter((reference) => source.includes(reference)).map((reference) => `${relative(projectRoot, file).replaceAll('\\', '/')}:${reference}`);
  });
}

describe('Wind capability removal', () => {
  it('removes Wind runtime and package references', () => {
    const files = [...listTypeScriptFiles(sourceRoot), resolve(projectRoot, 'rollup.config.mjs'), resolve(projectRoot, 'package.json')];

    expect(findReferences(files, ['WindLayer', 'ol-wind', 'wind-core'])).toEqual([]);
  });

  it('removes Wind parameters from the public source contract', () => {
    const files = listTypeScriptFiles(sourceRoot);

    expect(findReferences(files, ['IWindOptions', 'ISetWindParam', 'ISetWindOptions', 'IWindParam'])).toEqual([]);
  });

  it('does not export Wind from the root or package entry map', () => {
    const rootEntry = readFileSync(resolve(sourceRoot, 'index.ts'), 'utf8');
    const packageManifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> };

    expect(rootEntry).not.toMatch(/export[^;]*\bWind(?:Layer)?\b/);
    expect(Object.keys(packageManifest.exports ?? {}).some((entry) => /wind/i.test(entry))).toBe(false);
  });
});
