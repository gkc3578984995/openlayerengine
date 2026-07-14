import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const allowedRootFiles = new Set(['package.json', 'readme', 'readme.md', 'license', 'license.md', 'licence', 'licence.md']);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'ol-engine-package-contract-'));

try {
  const dryRun = npmJson(['pack', '--dry-run', '--json', '--foreground-scripts=false'], repositoryRoot);
  const dryRunRecord = singlePackRecord(dryRun, 'npm pack --dry-run');
  const packedFiles = dryRunRecord.files.map(({ path }) => normalizePackagePath(path));

  assert(packedFiles.length > 0, 'npm pack --dry-run 没有返回任何文件');
  for (const path of packedFiles) {
    const lower = path.toLowerCase();
    assert(allowedRootFiles.has(lower) || lower.startsWith('dist/'), `发布包包含契约外文件：${path}`);
  }
  for (const required of ['package.json', 'dist/esm/index.mjs', 'dist/types/index.d.ts', 'dist/style.css']) {
    assert(packedFiles.includes(required), `发布包缺少必需文件：${required}`);
  }

  const packDirectory = join(temporaryRoot, 'pack');
  const extractDirectory = join(temporaryRoot, 'extract');
  await mkdir(packDirectory, { recursive: true });
  await mkdir(extractDirectory, { recursive: true });

  const packed = npmJson(['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], repositoryRoot);
  const packedRecord = singlePackRecord(packed, 'npm pack');
  const archivePath = resolve(packDirectory, packedRecord.filename);
  run('tar', ['-xzf', archivePath, '-C', extractDirectory], repositoryRoot, '解包发布 tgz');

  const packageJson = JSON.parse(await readFile(join(extractDirectory, 'package', 'package.json'), 'utf8'));
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.deepEqual(packageJson.optionalDependencies ?? {}, {});
  assert.deepEqual(packageJson.bundleDependencies ?? packageJson.bundledDependencies ?? [], []);
  assert.deepEqual(packageJson.peerDependencies, { ol: '^10.9.0' });
  assert.deepEqual(packageJson.peerDependenciesMeta, { ol: { optional: true } });
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.equal(packageJson.scripts?.[name], undefined, `发布包不得包含 ${name} 生命周期脚本`);
  }

  console.log(`发布包契约验证通过：${packedFiles.length} 个文件，普通、可选和打包运行时依赖均为空。`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function npmJson(arguments_, cwd) {
  const result = run(process.execPath, [npmCliPath(), ...arguments_], cwd, `npm ${arguments_.join(' ')}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm ${arguments_.join(' ')} 的 JSON 输出无法解析：${result.stdout}`, { cause: error });
  }
}

function npmCliPath() {
  const path = process.env.npm_execpath;
  assert(path, '缺少 npm_execpath；请通过 npm script 运行发布包验证');
  return path;
}

function singlePackRecord(value, operation) {
  assert(Array.isArray(value) && value.length === 1, `${operation} 应返回一个包记录`);
  const [record] = value;
  assert(record && typeof record === 'object', `${operation} 返回了无效记录`);
  assert(typeof record.filename === 'string' && record.filename.length > 0, `${operation} 未返回 tgz 文件名`);
  assert(Array.isArray(record.files), `${operation} 未返回文件清单`);
  return record;
}

function normalizePackagePath(path) {
  assert(typeof path === 'string' && path.length > 0, '发布包文件路径无效');
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function run(command, arguments_, cwd, operation) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw new Error(`${operation} 启动失败`, { cause: result.error });
  if (result.status !== 0) throw new Error(`${operation} 失败（退出码 ${String(result.status)}）\n${result.stdout}\n${result.stderr}`);
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
