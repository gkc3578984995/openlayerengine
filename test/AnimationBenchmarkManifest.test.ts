import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface AnimationBenchmarkManifest {
  readonly runner: {
    readonly spec: string;
    readonly fixture: string;
    readonly powershell: string;
    readonly posix: string;
    readonly scenarioEnvironmentVariable: string;
  };
  readonly environment: {
    readonly browser: string;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor: number;
    readonly seed: number;
    readonly view: { readonly projection: string; readonly resolution: number; readonly rotation: number };
  };
  readonly sampling: {
    readonly source: string;
    readonly warmupFrames: number;
    readonly sampleFrames: number;
    readonly includeStartupInStableSample: boolean;
    readonly absoluteHardwareThresholds: boolean;
  };
  readonly record: readonly string[];
  readonly scenarios: readonly Record<string, unknown>[];
}

describe('动画浏览器性能基准 manifest', () => {
  it('锁定可复现环境、实际地图帧采样与可选的 Playwright 运行入口', async () => {
    const manifest = await readManifest();

    expect(manifest.environment).toEqual({
      browser: 'repository-locked-chromium',
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      seed: 20260717,
      view: { projection: 'EPSG:3857', resolution: 1, rotation: 0 }
    });
    expect(manifest.sampling).toEqual({
      source: 'actual-map-postrender',
      warmupFrames: 120,
      sampleFrames: 600,
      includeStartupInStableSample: false,
      absoluteHardwareThresholds: false
    });
    expect(manifest.record).toEqual(
      expect.arrayContaining([
        'chromiumVersion',
        'cpu',
        'operatingSystem',
        'screenCoverageRatio',
        'startupMs',
        'warmupFrames',
        'sampleFrames',
        'frameIntervalsMs'
      ])
    );
    expect(manifest.runner.scenarioEnvironmentVariable).toBe('OL_ENGINE_ANIMATION_BENCHMARK_SCENARIO');
    expect(manifest.runner.powershell).toContain("OL_ENGINE_RUN_ANIMATION_BENCHMARK='1'");
    expect(manifest.runner.posix).toContain('OL_ENGINE_RUN_ANIMATION_BENCHMARK=1');
    const projectRoot = new URL('../', import.meta.url);
    await Promise.all([access(new URL(manifest.runner.spec, projectRoot)), access(new URL(`test/browser${manifest.runner.fixture}`, projectRoot))]);
  });

  it('覆盖批准设计中的固定压力场景和离屏、跨世界变体', async () => {
    const manifest = await readManifest();
    const scenarios = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));

    expect(scenarios.get('points-blink')).toMatchObject({ elementCount: 1000, animation: 'blink', minimumPeriods: 20 });
    expect(scenarios.get('points-fade')).toMatchObject({ elementCount: 1000, animation: 'fade', durationMs: 20000 });
    expect(scenarios.get('polyline-grow')).toMatchObject({ elementCount: 500, verticesPerElement: 32, animation: 'grow', repeat: true });
    expect(scenarios.get('circle-radar')).toMatchObject({ elementCount: 128, radiusCssPx: 40, animation: 'radar-scan' });
    expect(scenarios.get('circle-center-spread')).toMatchObject({ elementCount: 128, radiusCssPx: 40, animation: 'center-spread' });
    expect(scenarios.get('static-mixed')).toMatchObject({ staticElementCount: 10000, replacementElementCount: 32, animations: ['fade', 'grow'] });
    expect(scenarios.get('effect-composition')).toMatchObject({
      elementCount: 256,
      combinations: ['fade+blink', 'grow+dash-flow', 'grow+alert'],
      fadeDurationMs: 20000,
      growRepeat: true
    });
    expect(scenarios.get('resource-cycle')).toMatchObject({ cycles: 100, samplePhase: 'startup-and-cleanup' });
    for (const id of ['points-blink', 'points-fade', 'polyline-grow', 'circle-radar', 'circle-center-spread', 'static-mixed', 'effect-composition']) {
      expect(scenarios.get(id)?.variants).toEqual(['onscreen', 'offscreen', 'world-copy']);
    }
  });
});

async function readManifest(): Promise<AnimationBenchmarkManifest> {
  return JSON.parse(await readFile(new URL('./browser/animation-benchmark.manifest.json', import.meta.url), 'utf8')) as AnimationBenchmarkManifest;
}
