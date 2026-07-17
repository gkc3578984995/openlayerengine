import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const assertThresholds = process.argv.includes('--assert');
const root = fileURLToPath(new URL('../..', import.meta.url));
const playwrightCli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url));
const environment = {
  ...process.env,
  OL_ENGINE_RUN_ANIMATION_BENCHMARK: '1',
  OL_ENGINE_ASSERT_ANIMATION_BENCHMARK_THRESHOLDS: assertThresholds ? '1' : '0',
  ...(!process.env.OL_ENGINE_ANIMATION_BENCHMARK_SCENARIO && assertThresholds ? { OL_ENGINE_ANIMATION_BENCHMARK_SCENARIO: 'all' } : {})
};
const child = spawn(
  process.execPath,
  [playwrightCli, 'test', 'test/browser/animation-kernel.performance.spec.ts', '--config', 'playwright.performance.config.ts'],
  { cwd: root, env: environment, stdio: 'inherit' }
);

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal !== null) {
    console.error(`动画性能基准被信号 ${signal} 终止`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
