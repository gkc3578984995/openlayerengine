import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const root = resolve(process.cwd(), 'src');
const boundaryRoots = ['core', 'services', 'adapters'];

describe('Earth v2 上下文边界', () => {
  coversCapabilities('earth-default-context-resolution');

  it('core、services 和 adapters 不读取默认 Earth 或实例注册表', () => {
    const violations: string[] = [];
    for (const directory of boundaryRoots) {
      for (const file of sourceFiles(join(root, directory))) {
        const source = readFileSync(file, 'utf8');
        if (/\b(?:useEarth|resolveEarth|getDefaultEarth|getRegisteredEarth|earthRegistry)\b/.test(source)) {
          violations.push(relative(root, file).replaceAll('\\', '/'));
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('完整 EngineContext 只在 internal 组合根和 Earth facade 中可见', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(root)) {
      const path = relative(root, file).replaceAll('\\', '/');
      const source = readFileSync(file, 'utf8');
      if (!/\bEngineContext\b/.test(source)) continue;
      if (path === 'internal/EngineContext.ts' || path === 'internal/createEngineContext.ts' || path === 'facade/Earth.ts') continue;
      violations.push(path);
    }

    expect(violations).toEqual([]);
  });
});

function sourceFiles(directory: string): readonly string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) result.push(...sourceFiles(path));
    else if (path.endsWith('.ts')) result.push(path);
  }
  return result;
}
