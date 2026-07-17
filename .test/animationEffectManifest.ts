import type { AnimationSpec, AnimationType, ShapeType } from '@vrsim/earth-engine-ol';

export type AnimationManifestTargetCapability = 'structured-presentation' | 'closed-surface' | 'reveal-geometry' | 'radial-frame';
export type AnimationManifestWriteDomain = 'target-opacity' | 'target-geometry' | 'overlay';
export type AnimationDemoTargetKey = 'point' | 'area' | 'line' | 'arrow' | 'circle' | 'sector';

export interface AnimationManifestDemoControls {
  readonly fadeDirection: 'in' | 'out';
  readonly growDirection: 'forward' | 'reverse';
  readonly radarDirection: 'clockwise' | 'counterclockwise';
}

export interface AnimationEffectManifestEntry {
  readonly animationType: AnimationType;
  readonly label: string;
  readonly targetCapability: readonly AnimationManifestTargetCapability[];
  readonly supportedShapeTypes: readonly ShapeType[];
  readonly writeDomains: readonly AnimationManifestWriteDomain[];
  readonly implementation: string;
  readonly testFiles: readonly string[];
  readonly websitePage: {
    readonly route: string;
    readonly source: string;
  };
  readonly acceptanceScenario: string;
  readonly nativeStylePolicy: 'unsupported';
  readonly demoTargets: readonly AnimationDemoTargetKey[];
  readonly acceptanceTarget: AnimationDemoTargetKey;
  createDefaultSpec(): AnimationSpec;
  createDemoSpec(controls: AnimationManifestDemoControls): AnimationSpec;
}

export const defaultAnimationManifestDemoControls = Object.freeze({
  fadeDirection: 'out',
  growDirection: 'forward',
  radarDirection: 'clockwise'
}) satisfies AnimationManifestDemoControls;

const structuredShapeTypes = [
  'point',
  'polyline',
  'polygon',
  'circle',
  'ellipse',
  'attack-arrow',
  'tailed-attack-arrow',
  'fine-arrow',
  'tailed-squad-combat-arrow',
  'assault-direction-arrow',
  'double-arrow',
  'rectangle',
  'triangle',
  'equilateral-triangle',
  'assemble-polygon',
  'closed-curve-polygon',
  'sector',
  'lune-polygon',
  'lune-polyline',
  'curve-polyline'
] as const satisfies readonly ShapeType[];

const closedSurfaceShapeTypes = [
  'polygon',
  'circle',
  'ellipse',
  'attack-arrow',
  'tailed-attack-arrow',
  'fine-arrow',
  'tailed-squad-combat-arrow',
  'assault-direction-arrow',
  'double-arrow',
  'rectangle',
  'triangle',
  'equilateral-triangle',
  'assemble-polygon',
  'closed-curve-polygon',
  'sector',
  'lune-polygon'
] as const satisfies readonly ShapeType[];

const polylineShapeTypes = ['polyline', 'lune-polyline', 'curve-polyline'] as const satisfies readonly ShapeType[];
const revealShapeTypes = [
  ...polylineShapeTypes,
  'attack-arrow',
  'tailed-attack-arrow',
  'fine-arrow',
  'tailed-squad-combat-arrow',
  'assault-direction-arrow',
  'double-arrow'
] as const satisfies readonly ShapeType[];
const radialShapeTypes = ['circle', 'sector'] as const satisfies readonly ShapeType[];

const websiteSource = 'website/src/views/AnimationView.vue';
const acceptanceScenario = '.test/scenarios/animations.ts';

export const animationEffectManifest = [
  {
    animationType: 'pulse',
    label: '脉冲（pulse）',
    targetCapability: ['structured-presentation'],
    supportedShapeTypes: ['point'],
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/pulse.ts',
    testFiles: ['test/AnimationBuiltins.test.ts', 'test/AnimationLifecycle.test.ts'],
    websitePage: { route: '/components/animation#api-type-pulseanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['point'],
    acceptanceTarget: 'point',
    createDefaultSpec: () => ({ type: 'pulse' }),
    createDemoSpec: () => ({ type: 'pulse', periodMs: 1200, color: '#ff3b30', radius: 8, repeat: true })
  },
  {
    animationType: 'dash-flow',
    label: '虚线流动（dash-flow）',
    targetCapability: ['structured-presentation'],
    supportedShapeTypes: polylineShapeTypes,
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/dashFlow.ts',
    testFiles: ['test/AnimationBuiltins.test.ts', 'test/AnimationLifecycle.test.ts'],
    websitePage: { route: '/components/animation#api-type-dashflowanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['line'],
    acceptanceTarget: 'line',
    createDefaultSpec: () => ({ type: 'dash-flow' }),
    createDemoSpec: () => ({ type: 'dash-flow', speed: 36, lineDash: [12, 8], color: '#00b8d9' })
  },
  {
    animationType: 'path-travel',
    label: '路径运动（path-travel）',
    targetCapability: ['structured-presentation'],
    supportedShapeTypes: polylineShapeTypes,
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/pathTravel.ts',
    testFiles: ['test/AnimationBuiltins.test.ts', 'test/AnimationLifecycle.test.ts'],
    websitePage: { route: '/components/animation#api-type-pathtravelanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['line'],
    acceptanceTarget: 'line',
    createDefaultSpec: () => ({ type: 'path-travel' }),
    createDemoSpec: () => ({
      type: 'path-travel',
      durationMs: 2400,
      repeat: true,
      trailLength: 0.35,
      gradient: [
        [0, 'rgba(0, 184, 217, 0)'],
        [1, '#00b8d9']
      ],
      width: 4,
      showStart: false,
      showEnd: false
    })
  },
  {
    animationType: 'blink',
    label: '阶跃闪烁（blink）',
    targetCapability: ['structured-presentation'],
    supportedShapeTypes: structuredShapeTypes,
    writeDomains: ['target-opacity'],
    implementation: 'src/builtins/animations/blink.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/AnimationEffectComposition.test.ts'],
    websitePage: { route: '/components/animation#api-type-blinkanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['area', 'line', 'arrow', 'point', 'circle', 'sector'],
    acceptanceTarget: 'area',
    createDefaultSpec: () => ({ type: 'blink' }),
    createDemoSpec: () => ({ type: 'blink', periodMs: 900, dutyCycle: 0.55, minOpacity: 0.12, maxOpacity: 1, repeat: true })
  },
  {
    animationType: 'highlight',
    label: '高亮（highlight）',
    targetCapability: ['structured-presentation', 'closed-surface'],
    supportedShapeTypes: closedSurfaceShapeTypes,
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/highlight.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/AnimationEffectComposition.test.ts'],
    websitePage: { route: '/components/animation#api-type-highlightanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['area', 'arrow', 'circle', 'sector'],
    acceptanceTarget: 'area',
    createDefaultSpec: () => ({ type: 'highlight' }),
    createDemoSpec: () => ({ type: 'highlight', mode: 'breathe', periodMs: 1400, color: '#ffc107', fillOpacity: 0.2, strokeWidth: 4 })
  },
  {
    animationType: 'alert',
    label: '双峰告警（alert）',
    targetCapability: ['structured-presentation', 'closed-surface'],
    supportedShapeTypes: closedSurfaceShapeTypes,
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/alert.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/AnimationEffectComposition.test.ts'],
    websitePage: { route: '/components/animation#api-type-alertanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['area', 'arrow', 'circle', 'sector'],
    acceptanceTarget: 'area',
    createDefaultSpec: () => ({ type: 'alert' }),
    createDemoSpec: () => ({ type: 'alert', periodMs: 1300, color: '#ff3b30', fillOpacity: 0.24, strokeWidth: 4, repeat: true })
  },
  {
    animationType: 'grow',
    label: '路径/箭头生长（grow）',
    targetCapability: ['structured-presentation', 'reveal-geometry'],
    supportedShapeTypes: revealShapeTypes,
    writeDomains: ['target-geometry'],
    implementation: 'src/builtins/animations/grow.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/AnimationEffectComposition.test.ts', 'test/ShapeAnimationProfile.test.ts'],
    websitePage: { route: '/components/animation#api-type-growanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['line', 'arrow'],
    acceptanceTarget: 'line',
    createDefaultSpec: () => ({ type: 'grow' }),
    createDemoSpec: ({ growDirection }) => ({ type: 'grow', durationMs: 1600, direction: growDirection, easing: 'ease-in-out', repeat: true })
  },
  {
    animationType: 'radar-scan',
    label: '雷达扫描（radar-scan）',
    targetCapability: ['structured-presentation', 'radial-frame'],
    supportedShapeTypes: radialShapeTypes,
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/radarScan.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/ShapeAnimationProfile.test.ts'],
    websitePage: { route: '/components/animation#api-type-radarscananimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['circle', 'sector'],
    acceptanceTarget: 'circle',
    createDefaultSpec: () => ({ type: 'radar-scan' }),
    createDemoSpec: ({ radarDirection }) => ({
      type: 'radar-scan',
      periodMs: 2200,
      direction: radarDirection,
      color: '#00e5ff',
      opacity: 0.42,
      beamWidthDeg: 52,
      repeat: true
    })
  },
  {
    animationType: 'center-spread',
    label: '中心扩散（center-spread）',
    targetCapability: ['structured-presentation', 'radial-frame'],
    supportedShapeTypes: radialShapeTypes,
    writeDomains: ['overlay'],
    implementation: 'src/builtins/animations/centerSpread.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/ShapeAnimationProfile.test.ts'],
    websitePage: { route: '/components/animation#api-type-centerspreadanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['circle', 'sector'],
    acceptanceTarget: 'circle',
    createDefaultSpec: () => ({ type: 'center-spread' }),
    createDemoSpec: () => ({ type: 'center-spread', periodMs: 1800, color: '#00e5ff', strokeWidth: 3, ringCount: 3, repeat: true })
  },
  {
    animationType: 'fade',
    label: '渐隐/渐显（fade）',
    targetCapability: ['structured-presentation'],
    supportedShapeTypes: structuredShapeTypes,
    writeDomains: ['target-opacity'],
    implementation: 'src/builtins/animations/fade.ts',
    testFiles: ['test/AnimationEffects.test.ts', 'test/AnimationEffectComposition.test.ts', 'test/AnimationLifecycle.test.ts'],
    websitePage: { route: '/components/animation#api-type-fadeanimationspec', source: websiteSource },
    acceptanceScenario,
    nativeStylePolicy: 'unsupported',
    demoTargets: ['point', 'area', 'line', 'arrow', 'circle', 'sector'],
    acceptanceTarget: 'area',
    createDefaultSpec: () => ({ type: 'fade', direction: 'out' }),
    createDemoSpec: ({ fadeDirection }) => ({ type: 'fade', direction: fadeDirection, durationMs: 1400, easing: 'ease-in-out' })
  }
] as const satisfies readonly AnimationEffectManifestEntry[];

export const animationEffectTypes = Object.freeze(animationEffectManifest.map(({ animationType }) => animationType));

export const animationEffectManifestByType = indexManifest(animationEffectManifest);

function indexManifest(entries: readonly AnimationEffectManifestEntry[]): Readonly<Record<AnimationType, AnimationEffectManifestEntry>> {
  const indexed = {} as Record<AnimationType, AnimationEffectManifestEntry>;
  for (const entry of entries) indexed[entry.animationType] = entry;
  return Object.freeze(indexed);
}
