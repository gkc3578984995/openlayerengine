import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const websiteOutputDirectory = join(repositoryRoot, 'website', 'dist');
const releaseDirectory = join(repositoryRoot, 'release');
const releaseReadme = join(releaseDirectory, 'README.md');
const npmCli = process.env.npm_execpath;

assert(npmCli, '缺少 npm_execpath，请通过 npm run release 执行发布命令');

const stagingDirectory = await mkdtemp(join(repositoryRoot, '.release-staging-'));

try {
  console.log('开始构建代码与文档……');
  runNpm(['run', 'docs:build'], '构建代码与文档');
  await assertDocumentationOutput();

  console.log('开始生成代码发布包……');
  const packOutput = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', stagingDirectory], '生成代码发布包', true);
  const archiveName = parseArchiveName(packOutput);
  await assertFile(join(stagingDirectory, archiveName), '代码发布包');

  await copyFile(releaseReadme, join(stagingDirectory, 'README.md'));
  await rename(websiteOutputDirectory, join(stagingDirectory, 'dist'));
  await promoteRelease(stagingDirectory);

  console.log('发布产物已生成：');
  console.log(`- 文档站：${relative(repositoryRoot, join(releaseDirectory, 'dist'))}`);
  console.log(`- 代码包：${relative(repositoryRoot, join(releaseDirectory, archiveName))}`);
} catch (error) {
  try {
    await rm(stagingDirectory, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], `发布失败，且临时目录清理失败：${relative(repositoryRoot, stagingDirectory)}`);
  }
  throw error;
}

async function assertDocumentationOutput() {
  await assertFile(join(websiteOutputDirectory, 'index.html'), '文档入口');
  await assertDirectory(join(websiteOutputDirectory, 'assets'), '文档静态资源');
  await assertDirectory(join(websiteOutputDirectory, 'api'), 'API 文档');
  await assertFile(join(websiteOutputDirectory, 'map-sources.json'), '地图源配置');
}

async function assertFile(path, label) {
  const value = await statPath(path, label);
  assert(value.isFile(), `${label}不是文件：${relative(repositoryRoot, path)}`);
  assert(value.size > 0, `${label}为空：${relative(repositoryRoot, path)}`);
}

async function assertDirectory(path, label) {
  const value = await statPath(path, label);
  assert(value.isDirectory(), `${label}不是目录：${relative(repositoryRoot, path)}`);
}

async function statPath(path, label) {
  try {
    return await stat(path);
  } catch (error) {
    throw new Error(`缺少${label}：${relative(repositoryRoot, path)}`, { cause: error });
  }
}

function parseArchiveName(output) {
  let records;
  try {
    records = JSON.parse(output);
  } catch (error) {
    throw new Error(`npm pack 的 JSON 输出无法解析：${output}`, { cause: error });
  }

  assert(Array.isArray(records) && records.length === 1, 'npm pack 应返回一个包记录');
  const filename = records[0]?.filename;
  assert(typeof filename === 'string' && filename.length > 0, 'npm pack 未返回 tgz 文件名');
  assert(filename === basename(filename) && filename.endsWith('.tgz'), `npm pack 返回了无效文件名：${filename}`);
  return filename;
}

async function promoteRelease(staging) {
  const backup = `${staging}-previous`;
  const hasCurrentRelease = await pathExists(releaseDirectory);

  if (hasCurrentRelease) await rename(releaseDirectory, backup);
  try {
    await rename(staging, releaseDirectory);
  } catch (error) {
    if (!hasCurrentRelease) throw error;
    try {
      await rename(backup, releaseDirectory);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], `替换发布目录失败，旧产物保留在 ${relative(repositoryRoot, backup)}`);
    }
    throw error;
  }

  if (hasCurrentRelease) {
    try {
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      const reason = error instanceof Error ? `：${error.message}` : '';
      console.warn(`警告：新发布产物已经生效，但旧产物备份未能删除，请手工清理 ${relative(repositoryRoot, backup)}${reason}`);
    }
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function runNpm(arguments_, operation, captureOutput = false) {
  const result = spawnSync(process.execPath, [npmCli, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: captureOutput ? 'pipe' : 'inherit',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.error) throw new Error(`${operation}启动失败`, { cause: result.error });
  if (result.status !== 0) {
    const details = captureOutput ? `\n${result.stdout}\n${result.stderr}` : '';
    throw new Error(`${operation}失败（退出码 ${String(result.status)}）${details}`);
  }
  return captureOutput ? result.stdout.trim() : '';
}
