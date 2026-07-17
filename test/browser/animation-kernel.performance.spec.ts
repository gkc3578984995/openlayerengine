import { readFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { expect, test } from '@playwright/test';
import { evaluateAnimationFrameBudget, summarizeAnimationFrameIntervals, type AnimationFrameBudget } from './animation-benchmark-metrics.js';

type BenchmarkVariant = 'onscreen' | 'offscreen' | 'world-copy';

interface BenchmarkManifest {
  readonly environment: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor: number;
    readonly seed: number;
    readonly view: { readonly projection: string; readonly resolution: number; readonly rotation: number };
  };
  readonly sampling: {
    readonly source: string;
    readonly warmupFrames: number;
    readonly sampleFrames: number;
    readonly absoluteHardwareThresholds: boolean;
  };
  readonly thresholds: AnimationFrameBudget & {
    readonly mode: 'explicit-only';
    readonly assertEnvironmentVariable: string;
    readonly idleSampling: { readonly warmupFrames: number; readonly sampleFrames: number };
  };
  readonly scenarios: readonly {
    readonly id: string;
    readonly variants?: readonly BenchmarkVariant[];
    readonly periodMs?: number;
    readonly minimumPeriods?: number;
  }[];
}

interface BenchmarkPreparation {
  readonly scenarioId: string;
  readonly variant: BenchmarkVariant;
  readonly elementCount: number;
  readonly animationHandleCount: number;
  readonly postrenderListenerCount: number;
  readonly screenCoverageRatio: number;
  readonly startupMs: number;
}

interface BenchmarkSample {
  readonly source: string;
  readonly warmupFrames: number;
  readonly sampleFrames: number;
  readonly warmupElapsedMs: number;
  readonly sampleElapsedMs: number;
  readonly frameIntervalsMs: readonly number[];
}

interface BrowserBenchmarkFixture {
  readonly ready: boolean;
  prepare(scenarioId: string, variant: BenchmarkVariant, seed: number): BenchmarkPreparation;
  sample(warmupFrames: number, sampleFrames: number): Promise<BenchmarkSample>;
  cleanup(): void;
}

const manifest = JSON.parse(readFileSync(new URL('./animation-benchmark.manifest.json', import.meta.url), 'utf8')) as BenchmarkManifest;
const enabled = process.env.OL_ENGINE_RUN_ANIMATION_BENCHMARK === '1';
const assertThresholds = process.env[manifest.thresholds.assertEnvironmentVariable] === '1';

test.describe('动画内核性能基准', () => {
  test.skip(!enabled, '显式设置 OL_ENGINE_RUN_ANIMATION_BENCHMARK=1 后运行，不进入普通性能套件');
  test.use({
    viewport: manifest.environment.viewport,
    deviceScaleFactor: manifest.environment.deviceScaleFactor
  });

  test('按 manifest 预热 120 个实际 map 帧并采样 600 个实际 map 帧', async ({ page, browser }, testInfo) => {
    test.setTimeout(30 * 60_000);
    await page.goto('/animation-benchmark.html');
    await page.waitForFunction(
      () => (window as unknown as { __OL_ENGINE_ANIMATION_BENCHMARK__?: BrowserBenchmarkFixture }).__OL_ENGINE_ANIMATION_BENCHMARK__?.ready
    );
    const idleSample = await page.evaluate(async ({ warmupFrames, sampleFrames }) => {
      const fixture = (window as unknown as { __OL_ENGINE_ANIMATION_BENCHMARK__: BrowserBenchmarkFixture }).__OL_ENGINE_ANIMATION_BENCHMARK__;
      fixture.cleanup();
      return fixture.sample(warmupFrames, sampleFrames);
    }, manifest.thresholds.idleSampling);
    expect(idleSample.source).toBe('actual-map-postrender');
    expect(idleSample.warmupFrames).toBe(manifest.thresholds.idleSampling.warmupFrames);
    expect(idleSample.sampleFrames).toBe(manifest.thresholds.idleSampling.sampleFrames);
    expect(idleSample.frameIntervalsMs).toHaveLength(manifest.thresholds.idleSampling.sampleFrames - 1);
    const idleFrameStats = summarizeAnimationFrameIntervals(idleSample.frameIntervalsMs, manifest.thresholds.longFrameMs);
    const selections = selectedScenarios(manifest, process.env.OL_ENGINE_ANIMATION_BENCHMARK_SCENARIO);
    const records: unknown[] = [];
    const thresholdFailures: string[] = [];

    for (const selection of selections) {
      const preparation = await page.evaluate(
        ({ scenarioId, variant, seed }) =>
          (window as unknown as { __OL_ENGINE_ANIMATION_BENCHMARK__: BrowserBenchmarkFixture }).__OL_ENGINE_ANIMATION_BENCHMARK__.prepare(
            scenarioId,
            variant,
            seed
          ),
        { ...selection, seed: manifest.environment.seed }
      );
      const sample = await page.evaluate(
        ({ warmupFrames, sampleFrames }) =>
          (window as unknown as { __OL_ENGINE_ANIMATION_BENCHMARK__: BrowserBenchmarkFixture }).__OL_ENGINE_ANIMATION_BENCHMARK__.sample(
            warmupFrames,
            sampleFrames
          ),
        manifest.sampling
      );

      expect(sample.source).toBe('actual-map-postrender');
      expect(sample.warmupFrames).toBe(120);
      expect(sample.sampleFrames).toBe(600);
      expect(sample.frameIntervalsMs).toHaveLength(599);
      expect(sample.frameIntervalsMs.every((duration) => Number.isFinite(duration) && duration >= 0)).toBe(true);
      expect(preparation.screenCoverageRatio).toBeGreaterThanOrEqual(0);
      expect(preparation.screenCoverageRatio).toBeLessThanOrEqual(1);
      expect(preparation.postrenderListenerCount).toBeLessThanOrEqual(1);
      if (selection.scenarioId === 'resource-cycle') {
        expect(preparation.animationHandleCount).toBe(0);
        expect(preparation.postrenderListenerCount).toBe(0);
      } else {
        expect(preparation.animationHandleCount).toBeGreaterThan(0);
        expect(preparation.postrenderListenerCount).toBe(1);
      }
      const scenario = manifest.scenarios.find(({ id }) => id === selection.scenarioId);
      if (scenario?.minimumPeriods !== undefined && scenario.periodMs !== undefined) {
        expect(sample.warmupElapsedMs + sample.sampleElapsedMs).toBeGreaterThanOrEqual(scenario.minimumPeriods * scenario.periodMs);
      }
      const frameStats = summarizeAnimationFrameIntervals(sample.frameIntervalsMs, manifest.thresholds.longFrameMs);
      const thresholdEvaluation = evaluateAnimationFrameBudget(frameStats, idleFrameStats, manifest.thresholds);
      thresholdFailures.push(...thresholdEvaluation.violations.map((violation) => `${selection.scenarioId}:${selection.variant}：${violation}`));

      records.push(
        Object.freeze({
          chromiumVersion: browser.version(),
          cpu: cpus()[0]?.model ?? 'unknown',
          operatingSystem: `${platform()} ${release()} ${arch()}`,
          viewport: manifest.environment.viewport,
          deviceScaleFactor: manifest.environment.deviceScaleFactor,
          seed: manifest.environment.seed,
          view: manifest.environment.view,
          ...preparation,
          ...sample,
          idleFrameStats,
          frameStats,
          thresholdEvaluation,
          thresholdAssertionsEnabled: assertThresholds
        })
      );
      await page.evaluate(() =>
        (window as unknown as { __OL_ENGINE_ANIMATION_BENCHMARK__: BrowserBenchmarkFixture }).__OL_ENGINE_ANIMATION_BENCHMARK__.cleanup()
      );
    }

    expect(manifest.sampling.absoluteHardwareThresholds).toBe(false);
    expect(manifest.thresholds.mode).toBe('explicit-only');
    await testInfo.attach('动画内核性能基准.json', {
      body: Buffer.from(JSON.stringify({ thresholdAssertionsEnabled: assertThresholds, idleSample, idleFrameStats, records }, null, 2)),
      contentType: 'application/json'
    });
    if (assertThresholds) expect(thresholdFailures, '显式动画性能门槛失败').toEqual([]);
  });
});

function selectedScenarios(
  source: BenchmarkManifest,
  requested: string | undefined
): readonly { readonly scenarioId: string; readonly variant: BenchmarkVariant }[] {
  if (requested === undefined || requested.length === 0) return [{ scenarioId: 'points-fade', variant: 'onscreen' }];
  if (requested !== 'all') {
    const [scenarioId, candidateVariant = 'onscreen'] = requested.split(':');
    if (!isVariant(candidateVariant)) throw new Error(`未知动画基准 variant：${candidateVariant}`);
    if (!source.scenarios.some(({ id }) => id === scenarioId)) throw new Error(`未知动画基准场景：${scenarioId}`);
    return [{ scenarioId, variant: candidateVariant }];
  }
  return source.scenarios.flatMap(({ id, variants }) =>
    variants === undefined || variants.length === 0
      ? [{ scenarioId: id, variant: 'onscreen' as const }]
      : variants.map((variant) => ({ scenarioId: id, variant }))
  );
}

function isVariant(value: string): value is BenchmarkVariant {
  return value === 'onscreen' || value === 'offscreen' || value === 'world-copy';
}
