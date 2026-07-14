import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer as createViteServer } from 'vite';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = join(repositoryRoot, 'test', 'fixtures');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'ol-engine-offline-install-'));

try {
  const archivePath = await packEngine();
  await verifyEngineOnlyInstall(archivePath);
  await verifyCompleteConsumer(archivePath);
  console.log('空缓存离线安装与完整消费者验证全部通过。');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function packEngine() {
  const destination = join(temporaryRoot, 'engine-pack');
  await mkdir(destination, { recursive: true });
  const output = npmJson(['pack', '--json', '--ignore-scripts', '--pack-destination', destination], repositoryRoot, '生成 engine tgz');
  assert(Array.isArray(output) && output.length === 1, 'npm pack 应返回一个包记录');
  assert(typeof output[0]?.filename === 'string', 'npm pack 未返回 tgz 文件名');
  return resolve(destination, output[0].filename);
}

async function verifyEngineOnlyInstall(archivePath) {
  console.log('\n=== engine-only 安装（全新空缓存、强制 offline）===');
  const consumer = join(temporaryRoot, 'engine-only-consumer');
  const emptyCache = join(temporaryRoot, 'engine-only-empty-cache');
  await mkdir(consumer, { recursive: true });
  await mkdir(emptyCache, { recursive: true });
  assert.deepEqual(await readdir(emptyCache), [], 'engine-only npm cache 在安装前必须为空');
  await writeJson(join(consumer, 'package.json'), { name: 'engine-only-consumer', private: true, version: '1.0.0' });

  npm(['install', '--offline', '--cache', emptyCache, '--no-audit', '--ignore-scripts', '--no-fund', archivePath], consumer, 'engine-only 强制离线安装');

  const nodeModules = join(consumer, 'node_modules');
  const topLevel = (await readdir(nodeModules)).filter((name) => name !== '.package-lock.json');
  assert.deepEqual(topLevel, ['@vrsim'], `engine-only node_modules 出现额外顶层条目：${topLevel.join(', ')}`);
  assert.deepEqual(await readdir(join(nodeModules, '@vrsim')), ['earth-engine-ol']);
  for (const name of ['ol', 'lodash', 'mitt', 'ol-wind', 'wind-core', 'heatmap.js']) {
    assert(!(await exists(join(nodeModules, name))), `engine-only 安装不应出现 ${name}`);
  }
  console.log('engine-only 安装通过：仅安装 @vrsim/earth-engine-ol。');
}

async function verifyCompleteConsumer(archivePath) {
  console.log('\n=== material preparation（允许联网）===');
  const materialDirectory = join(temporaryRoot, 'ol-material');
  const resolverDirectory = join(temporaryRoot, 'ol-resolver-material');
  const materialCache = join(temporaryRoot, 'ol-material-cache');
  const materialManifest = JSON.parse(await readFile(join(fixtureRoot, 'ol-material', 'package.json'), 'utf8'));
  assert.deepEqual(materialManifest.dependencies, { ol: '10.9.0' }, 'OL material 必须只包含精确的 ol@10.9.0 dependency');
  assert.deepEqual(materialManifest.optionalDependencies ?? {}, {}, 'OL material 不得包含 optionalDependencies');
  assert.deepEqual(materialManifest.devDependencies ?? {}, {}, 'OL material 不得包含 devDependencies');
  await cp(join(fixtureRoot, 'ol-material'), materialDirectory, { recursive: true });
  await mkdir(materialCache, { recursive: true });
  assert.deepEqual(await readdir(materialCache), [], 'OL material cache 在准备前必须为空');

  npm(['ci', '--cache', materialCache, '--ignore-scripts', '--no-audit', '--no-fund'], materialDirectory, '按冻结 lock 准备 OL 完整闭包');
  await rm(join(materialDirectory, 'node_modules'), { recursive: true, force: true });

  // 无 lock 的在线解析与后续 consumer 使用相同 npm 配置，补齐 registry 元数据及范围依赖可能选择的 tarball。
  await mkdir(resolverDirectory, { recursive: true });
  await writeJson(join(resolverDirectory, 'package.json'), { name: 'ol-material-resolver', private: true, version: '1.0.0' });
  npm(
    ['install', '--cache', materialCache, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', 'ol@10.9.0'],
    resolverDirectory,
    '准备无 lock consumer 所需的 OL 解析材料'
  );
  await rm(join(resolverDirectory, 'node_modules'), { recursive: true, force: true });

  console.log('\n=== consumer installation（使用 material cache、强制 offline）===');
  const consumer = join(temporaryRoot, 'complete-consumer');
  await cp(join(fixtureRoot, 'package-consumer'), consumer, { recursive: true });
  npm(
    ['install', '--offline', '--cache', materialCache, '--ignore-scripts', '--no-audit', '--no-fund', 'ol@10.9.0', archivePath],
    consumer,
    '完整 consumer 强制离线安装'
  );

  run(process.execPath, ['index.mjs'], consumer, 'Node ESM 消费验证');
  run(
    process.execPath,
    [join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '--project', 'tsconfig.json', '--noEmit'],
    consumer,
    'TypeScript 消费验证'
  );
  await verifyBrowserConsumer(consumer);
  verifyInstalledVersions(consumer);
}

async function verifyBrowserConsumer(consumer) {
  const port = await availablePort();
  const server = await createViteServer({
    root: consumer,
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true }
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__OL_ENGINE_PACKAGE_CONSUMER__?.rendered === true);
    assert.equal(await page.locator('#map .ol-viewport').count(), 1, '浏览器 consumer 未创建 OpenLayers viewport');
    const lifecycle = await page.evaluate(() => window.__OL_ENGINE_PACKAGE_CONSUMER__?.destroy());
    assert.equal(lifecycle, 'destroyed');
    assert.deepEqual(pageErrors, [], `浏览器 consumer 出现页面异常：${pageErrors.map(String).join('\n')}`);
  } finally {
    await browser?.close();
    await server.close();
  }
}

function verifyInstalledVersions(consumer) {
  const tree = npmJson(['ls', 'ol', '@vrsim/earth-engine-ol', '--json'], consumer, '检查 consumer 依赖树');
  const olVersions = collectVersions(tree, 'ol');
  const engineVersions = collectVersions(tree, '@vrsim/earth-engine-ol');
  assert.deepEqual([...olVersions], ['10.9.0'], `consumer 中的 OL 版本不唯一：${[...olVersions].join(', ')}`);
  assert.equal(engineVersions.size, 1, `consumer 中的 engine 版本不唯一：${[...engineVersions].join(', ')}`);
}

function collectVersions(root, packageName) {
  const versions = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    const dependencies = node.dependencies;
    if (!dependencies || typeof dependencies !== 'object') return;
    const selected = dependencies[packageName];
    if (selected && typeof selected.version === 'string') versions.add(selected.version);
    for (const dependency of Object.values(dependencies)) visit(dependency);
  };
  visit(root);
  return versions;
}

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert(address && typeof address === 'object', '无法分配浏览器测试端口');
  const { port } = address;
  await new Promise((resolvePromise, reject) => server.close((error) => (error ? reject(error) : resolvePromise())));
  return port;
}

function npmJson(arguments_, cwd, operation) {
  const result = npm(arguments_, cwd, operation, false);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${operation} 的 npm JSON 输出无法解析：${result.stdout}`, { cause: error });
  }
}

function npm(arguments_, cwd, operation, logOutput = true) {
  return run(process.execPath, [npmCliPath(), ...arguments_], cwd, operation, logOutput);
}

function npmCliPath() {
  const path = process.env.npm_execpath;
  assert(path, '缺少 npm_execpath；请通过 npm script 运行离线安装验证');
  return path;
}

function run(command, arguments_, cwd, operation, logOutput = true) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw new Error(`${operation} 启动失败`, { cause: result.error });
  if (result.status !== 0) throw new Error(`${operation} 失败（退出码 ${String(result.status)}）\n${result.stdout}\n${result.stderr}`);
  if (logOutput && result.stdout.trim().length > 0) console.log(result.stdout.trim());
  if (logOutput && result.stderr.trim().length > 0) console.error(result.stderr.trim());
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}
