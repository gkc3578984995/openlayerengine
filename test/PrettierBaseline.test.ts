import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

interface PrettierBaselineEntry {
  path: string;
  sha256: string;
}

interface PrettierBaselineModule {
  normalizedSha256(content: string): string;
  verifyPrettierBaseline(options?: { rootDir?: string; ignorePath?: string; entries?: readonly PrettierBaselineEntry[] }): Promise<void>;
}

const baselineScript = resolve('scripts/check-prettier-baseline.mjs');
const temporaryDirectories: string[] = [];

async function loadBaselineModule(): Promise<PrettierBaselineModule> {
  expect(existsSync(baselineScript), 'prettier baseline guard script').toBe(true);
  const moduleUrl = `${pathToFileURL(baselineScript).href}?test=${Date.now()}-${Math.random()}`;
  return (await import(/* @vite-ignore */ moduleUrl)) as PrettierBaselineModule;
}

async function createTemporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ol-engine-prettier-baseline-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('prettier historical baseline', () => {
  it('hashes LF and CRLF content identically', async () => {
    const { normalizedSha256 } = await loadBaselineModule();

    expect(normalizedSha256('first\nsecond\n')).toBe(normalizedSha256('first\r\nsecond\r\n'));
  });

  it('rejects a baseline file after its normalized content changes', async () => {
    const { normalizedSha256, verifyPrettierBaseline } = await loadBaselineModule();
    const rootDir = await createTemporaryRoot();
    const original = 'const legacy = true;\n';
    const entries = [{ path: 'legacy.ts', sha256: normalizedSha256(original) }];
    await writeFile(join(rootDir, '.prettierignore'), 'legacy.ts\n', 'utf8');
    await writeFile(join(rootDir, 'legacy.ts'), original, 'utf8');

    await expect(verifyPrettierBaseline({ rootDir, entries })).resolves.toBeUndefined();

    await writeFile(join(rootDir, 'legacy.ts'), 'const legacy = false;\n', 'utf8');
    await expect(verifyPrettierBaseline({ rootDir, entries })).rejects.toThrow(/legacy\.ts[\s\S]*SHA-256 mismatch/);
  });

  it('requires the ignore and hash baseline sets to match exactly', async () => {
    const { normalizedSha256, verifyPrettierBaseline } = await loadBaselineModule();
    const rootDir = await createTemporaryRoot();
    const entries = [{ path: 'legacy.ts', sha256: normalizedSha256('legacy\n') }];
    await writeFile(join(rootDir, '.prettierignore'), 'legacy.ts\nuntracked.ts\n', 'utf8');
    await writeFile(join(rootDir, 'legacy.ts'), 'legacy\n', 'utf8');

    await expect(verifyPrettierBaseline({ rootDir, entries })).rejects.toThrow(/unexpected ignore entries[\s\S]*untracked\.ts/);
  });

  it('validates the current repository baseline', async () => {
    const { verifyPrettierBaseline } = await loadBaselineModule();

    await expect(verifyPrettierBaseline()).resolves.toBeUndefined();
  });
});
