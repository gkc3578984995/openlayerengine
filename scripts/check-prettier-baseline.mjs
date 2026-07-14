import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRETTIER_BASELINE_ENTRIES = [
  { path: 'scripts/docs/api-docs.mjs', sha256: 'aabba92e799db47637c8fed11b737fe6b7edc390978303958b92855aaeaa698c' },
  { path: 'test/ApiDocGenerator.test.ts', sha256: 'ee4835e7e1320a48da628b67bbbd300b3ff31a1da6b610f68ff9f5e85b8fd387' },
  { path: 'test/Base.test.ts', sha256: 'c08e709e291a74e2f0b90858402b113fb7a511763028fa95982fd46e816dceab' },
  { path: 'test/LayerCommonDemoCoverage.test.ts', sha256: '9f6bce69d22ceea8f07c285aad240038db76ad07f14264157a7ad67b73f0df2a' },
  { path: 'test/PatternFill.test.ts', sha256: '076dca7c6a24713db95c610722a29a2d8879f9a378fd487f7ed623cf94f46f27' },
  { path: 'test/Utils.test.ts', sha256: 'f8ca1cb12e97f66d43b0baa321be2a3ddfb2ee40dc2b37657ee95c25884dbf23' },
  { path: 'typedoc.json', sha256: '56e5138c6302b8d8d9af910c048e3b99db6f717eb021b4a805b9a2dc0e0aa260' }
];

export class PrettierBaselineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrettierBaselineError';
  }
}

export function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, '\n');
}

export function normalizedSha256(content) {
  return createHash('sha256').update(normalizeLineEndings(content), 'utf8').digest('hex');
}

function validateCanonicalPath(filePath) {
  const forbiddenCharacters = ['!', '#', '*', '?', '[', ']', '\\', ':'];
  if (!filePath || filePath !== filePath.trim()) return 'must be non-empty without leading or trailing whitespace';
  if (filePath.startsWith('/') || filePath.endsWith('/')) return 'must be a repository-relative file path without leading or trailing slash';
  if (forbiddenCharacters.some((character) => filePath.includes(character)))
    return 'must be an exact POSIX path without glob, negation, escape, or drive syntax';
  if (filePath.split('/').some((segment) => !segment || segment === '.' || segment === '..'))
    return 'must not contain empty, current-directory, or parent-directory segments';
  return undefined;
}

export function parseCanonicalIgnoreFile(content) {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  const entries = [];
  const errors = [];
  const seen = new Set();

  for (const [index, filePath] of lines.entries()) {
    const pathError = validateCanonicalPath(filePath);
    if (pathError) {
      errors.push(`.prettierignore line ${index + 1}: ${pathError}`);
      continue;
    }
    if (seen.has(filePath)) {
      errors.push(`.prettierignore line ${index + 1}: duplicate path ${filePath}`);
      continue;
    }
    seen.add(filePath);
    entries.push(filePath);
  }

  if (errors.length > 0) throw new PrettierBaselineError(`Invalid canonical .prettierignore:\n- ${errors.sort().join('\n- ')}`);
  return entries;
}

export async function verifyPrettierBaseline({ rootDir = process.cwd(), ignorePath = '.prettierignore', entries = PRETTIER_BASELINE_ENTRIES } = {}) {
  const errors = [];
  const baselineByPath = new Map();

  for (const entry of entries) {
    const pathError = validateCanonicalPath(entry.path);
    if (pathError) errors.push(`baseline entry ${entry.path || '<empty>'}: ${pathError}`);
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) errors.push(`baseline entry ${entry.path}: invalid SHA-256 ${entry.sha256}`);
    if (baselineByPath.has(entry.path)) errors.push(`duplicate baseline entry: ${entry.path}`);
    baselineByPath.set(entry.path, entry.sha256);
  }

  let ignoreEntries = [];
  try {
    ignoreEntries = parseCanonicalIgnoreFile(await readFile(resolve(rootDir, ignorePath), 'utf8'));
  } catch (error) {
    if (error instanceof PrettierBaselineError) errors.push(error.message);
    else errors.push(`unable to read ${ignorePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const ignoreSet = new Set(ignoreEntries);
  const baselinePaths = [...baselineByPath.keys()];
  const missingIgnoreEntries = baselinePaths.filter((filePath) => !ignoreSet.has(filePath)).sort();
  const unexpectedIgnoreEntries = ignoreEntries.filter((filePath) => !baselineByPath.has(filePath)).sort();
  if (missingIgnoreEntries.length > 0) errors.push(`missing ignore entries: ${missingIgnoreEntries.join(', ')}`);
  if (unexpectedIgnoreEntries.length > 0) errors.push(`unexpected ignore entries: ${unexpectedIgnoreEntries.join(', ')}`);

  for (const filePath of baselinePaths.sort()) {
    const absolutePath = resolve(rootDir, filePath);
    const relativePath = relative(rootDir, absolutePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      errors.push(`${filePath}: resolves outside the repository root`);
      continue;
    }

    try {
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        errors.push(`${filePath}: baseline path must be a regular non-symlink file`);
        continue;
      }
      const actualSha256 = normalizedSha256(await readFile(absolutePath, 'utf8'));
      const expectedSha256 = baselineByPath.get(filePath);
      if (actualSha256 !== expectedSha256) {
        errors.push(
          `${filePath}: SHA-256 mismatch (expected ${expectedSha256}, received ${actualSha256}); format the file and remove it from both .prettierignore and PRETTIER_BASELINE_ENTRIES`
        );
      }
    } catch (error) {
      errors.push(`${filePath}: unable to verify baseline file (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (errors.length > 0) throw new PrettierBaselineError(`Prettier historical baseline verification failed:\n- ${errors.sort().join('\n- ')}`);
}

const invokedAsScript = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url : false;
if (invokedAsScript) {
  try {
    await verifyPrettierBaseline();
    console.log(`Prettier historical baseline verified (${PRETTIER_BASELINE_ENTRIES.length} files).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
