import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const sourceRoot = resolve(process.cwd(), 'src');
const dependencyRoots = ['core', 'services', 'adapters'] as const;

describe('Earth 内部显式上下文边界', () => {
  coversCapabilities('earth-default-context-resolution');

  it('core、services 与 adapters 不读取默认 Earth 或实例注册表', () => {
    const violations: string[] = [];
    for (const directory of dependencyRoots) {
      for (const file of sourceFiles(join(sourceRoot, directory))) {
        const source = readFileSync(file, 'utf8');
        if (/\b(?:useEarth|resolveEarth|getDefaultEarth|getRegisteredEarth|earthRegistry)\b/.test(source)) {
          violations.push(relative(sourceRoot, file).replaceAll('\\', '/'));
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('完整 EngineContext 只在 internal 组装根与 Earth facade 可见', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(sourceRoot)) {
      const path = relative(sourceRoot, file).replaceAll('\\', '/');
      const source = readFileSync(file, 'utf8');
      if (!/\bEngineContext\b/.test(source)) continue;
      if (path === 'internal/EngineContext.ts' || path === 'internal/createEngineContext.ts' || path === 'facade/Earth.ts') continue;
      violations.push(path);
    }

    expect(violations).toEqual([]);
  });

  it('公开 useEarth 只负责 facade 注册，不向内部服务泄漏上下文', () => {
    const useEarthSource = readFileSync(join(sourceRoot, 'facade/useEarth.ts'), 'utf8');
    const earthSource = readFileSync(join(sourceRoot, 'facade/Earth.ts'), 'utf8');

    expect(useEarthSource).toContain("from './earthRegistry.js'");
    expect(useEarthSource).not.toContain('EngineContext');
    expect(earthSource).toContain("from '../internal/EngineContext.js'");
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
