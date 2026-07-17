import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { evaluateAnimationFrameBudget, summarizeAnimationFrameIntervals, type AnimationFrameBudget } from './animation-benchmark-metrics.js';

interface AnimationBenchmarkContract {
  readonly sampling: { readonly absoluteHardwareThresholds: boolean };
  readonly thresholds: AnimationFrameBudget & {
    readonly mode: string;
    readonly assertEnvironmentVariable: string;
    readonly idleSampling: { readonly warmupFrames: number; readonly sampleFrames: number };
  };
}

const manifest = JSON.parse(readFileSync(new URL('./animation-benchmark.manifest.json', import.meta.url), 'utf8')) as AnimationBenchmarkContract;

test('普通 CI 固定动画性能门槛算法，但不执行宿主硬件断言', () => {
  expect(manifest.sampling.absoluteHardwareThresholds).toBe(false);
  expect(manifest.thresholds).toMatchObject({
    mode: 'explicit-only',
    assertEnvironmentVariable: 'OL_ENGINE_ASSERT_ANIMATION_BENCHMARK_THRESHOLDS',
    averageFrameIntervalMs: 25,
    p95FloorMs: 35,
    idleP95Multiplier: 2.5,
    longFrameMs: 50,
    longFrameRatio: 0.05,
    idleSampling: { warmupFrames: 60, sampleFrames: 180 }
  });

  const idle = summarizeAnimationFrameIntervals([16, 16, 17, 17, 18], manifest.thresholds.longFrameMs);
  const passing = summarizeAnimationFrameIntervals([16, 17, 18, 24, 34], manifest.thresholds.longFrameMs);
  const passingResult = evaluateAnimationFrameBudget(passing, idle, manifest.thresholds);
  expect(passingResult.passed).toBe(true);
  expect(passingResult.limits).toEqual({ averageMs: 25, p95Ms: 42.5, longFrameRatio: 0.05 });

  const failing = summarizeAnimationFrameIntervals([16, 16, 60, 60, 60], manifest.thresholds.longFrameMs);
  const failingResult = evaluateAnimationFrameBudget(failing, idle, manifest.thresholds);
  expect(failingResult.passed).toBe(false);
  expect(failingResult.violations).toEqual(
    expect.arrayContaining([expect.stringContaining('平均帧间隔'), expect.stringContaining('P95'), expect.stringContaining('帧占比')])
  );
});
