import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { animationTypes, shapeTypes, type AnimationSpec, type AnimationType } from '../src/index.js';
import { animationEffectManifest, animationEffectTypes, defaultAnimationManifestDemoControls } from '../.test/animationEffectManifest.js';
import { animationDemoElementsByType } from '../.test/scenarios/animations.js';
import { builtinAnimationDefinitions } from '../src/builtins/animations/index.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const requiredFields = [
  'animationType',
  'targetCapability',
  'supportedShapeTypes',
  'writeDomains',
  'implementation',
  'testFiles',
  'websitePage',
  'acceptanceScenario',
  'nativeStylePolicy'
] as const;

describe('2.0 动画效果 manifest', () => {
  it('按公共 animationTypes 顺序闭合全部内置 Definition 元数据', () => {
    expect(animationEffectTypes).toEqual(animationTypes);
    expect(new Set(animationEffectTypes).size).toBe(animationTypes.length);
    expect(builtinAnimationDefinitions.map(({ type }) => type)).toEqual(animationEffectTypes);

    const definitions = new Map(builtinAnimationDefinitions.map((definition) => [definition.type, definition]));
    for (const entry of animationEffectManifest) {
      for (const field of requiredFields) expect(Object.hasOwn(entry, field), `${entry.animationType}.${field}`).toBe(true);
      const definition = definitions.get(entry.animationType);
      expect(definition, entry.animationType).toBeDefined();
      expect([...(definition?.requirements ?? [])], `${entry.animationType}.targetCapability`).toEqual(entry.targetCapability);
      expect([...(definition?.writeDomains ?? [])], `${entry.animationType}.writeDomains`).toEqual(entry.writeDomains);
      expect(entry.createDefaultSpec().type).toBe(entry.animationType);
      expect(entry.createDemoSpec(defaultAnimationManifestDemoControls).type).toBe(entry.animationType);
      expect(entry.demoTargets).toContain(entry.acceptanceTarget);
      expect(entry.nativeStylePolicy).toBe('unsupported');
    }
  });

  it('本地验收台只传启动内核默认效果所需的最小 Spec', () => {
    const expectedDefaultSpecs = {
      pulse: { type: 'pulse' },
      'dash-flow': { type: 'dash-flow' },
      'path-travel': { type: 'path-travel' },
      blink: { type: 'blink' },
      highlight: { type: 'highlight' },
      alert: { type: 'alert' },
      grow: { type: 'grow' },
      'radar-scan': { type: 'radar-scan' },
      'center-spread': { type: 'center-spread' },
      fade: { type: 'fade', direction: 'out' }
    } as const satisfies Readonly<Record<AnimationType, AnimationSpec>>;

    for (const entry of animationEffectManifest) {
      expect(entry.createDefaultSpec(), entry.animationType).toEqual(expectedDefaultSpecs[entry.animationType]);
    }
  });

  it('雷达运行示例覆盖单向与往复扫描、可调绿色渐变及对应文档语义', () => {
    const radarEntry = animationEffectManifest.find(({ animationType }) => animationType === 'radar-scan');
    const demoSpec = radarEntry?.createDemoSpec(defaultAnimationManifestDemoControls);
    const roundTripSpec = radarEntry?.createDemoSpec({ ...defaultAnimationManifestDemoControls, radarScanMode: 'round-trip' });
    const solidSpec = radarEntry?.createDemoSpec({ ...defaultAnimationManifestDemoControls, radarTrailStyle: 'solid', radarColor: '#14c86a' });

    expect(demoSpec).toMatchObject({
      type: 'radar-scan',
      direction: 'clockwise',
      scanMode: 'one-way',
      gradient: [
        [0, 'rgba(0, 230, 118, 0.05)'],
        [0.6, 'rgba(0, 230, 118, 0.45)'],
        [1, 'rgba(0, 230, 118, 1)']
      ]
    });
    expect(demoSpec).not.toHaveProperty('color');
    expect(roundTripSpec).toMatchObject({ type: 'radar-scan', direction: 'clockwise', scanMode: 'round-trip' });
    expect(solidSpec).toMatchObject({ type: 'radar-scan', color: '#14c86a' });
    expect(solidSpec).not.toHaveProperty('gradient');

    const acceptanceSource = sourceOf('.test/scenarios/animations.ts');
    expect(acceptanceSource).toContain("radarTrailStyle.value === 'gradient'");
    expect(acceptanceSource).toContain('radarGradientTail.value');

    const websiteDemoSource = sourceOf('website/src/examples/presentation/AnimationManagerDemo.vue');
    expect(websiteDemoSource).toContain("'radar-scan': 'Sector'");
    expect(websiteDemoSource).toContain('radarScanMode');
    expect(websiteDemoSource).toContain('<el-radio-button value="one-way">单向</el-radio-button>');
    expect(websiteDemoSource).toContain('<el-radio-button value="round-trip">往复</el-radio-button>');
    expect(websiteDemoSource).toContain('radarTrailStyle');
    expect(websiteDemoSource).toContain('radarGradientFront');

    const websiteSource = sourceOf('website/src/views/presentation/AnimationsView.vue');
    expect(websiteSource).toMatch(/field\(\s*'RadarScanAnimationSpec',\s*'scanMode'/u);
    expect(websiteSource).toContain('periodMs / 2 到达对侧边界并折返');
    expect(websiteSource).toContain('direction 只表示首程方向');
    expect(websiteSource).toContain("field('RadarScanAnimationSpec', 'color', \"'#00e676'\"");
    expect(websiteSource).toContain('0 表示最旧尾端、1 表示扫描前沿');
    expect(websiteSource).toContain('gradient 不能与 color 同时设置');
    expect(websiteSource).toContain('纯色模式对全部可见槽恒定应用');
  });

  it('中心扩散在 Sector 上演示可调绿色波纹带，并记录默认值与退化行为', () => {
    const centerSpreadEntry = animationEffectManifest.find(({ animationType }) => animationType === 'center-spread');
    const demoSpec = centerSpreadEntry?.createDemoSpec(defaultAnimationManifestDemoControls);
    const solidSpec = centerSpreadEntry?.createDemoSpec({
      ...defaultAnimationManifestDemoControls,
      centerSpreadTrailStyle: 'solid',
      centerSpreadColor: '#14c86a'
    });

    expect(centerSpreadEntry?.acceptanceTarget).toBe('sector');
    expect(animationDemoElementsByType['center-spread'].geometry.type).toBe('sector');
    expect(demoSpec).toMatchObject({
      type: 'center-spread',
      gradient: [
        [0, 'rgba(0, 230, 118, 0.05)'],
        [0.6, 'rgba(0, 230, 118, 0.45)'],
        [1, 'rgba(0, 230, 118, 1)']
      ],
      opacity: 0.7,
      trailLength: 0.18,
      strokeWidth: 0
    });
    expect(demoSpec).not.toHaveProperty('color');
    expect(solidSpec).toMatchObject({ type: 'center-spread', color: '#14c86a', strokeWidth: 0 });
    expect(solidSpec).not.toHaveProperty('gradient');

    const acceptanceSource = sourceOf('.test/scenarios/animations.ts');
    expect(acceptanceSource).toContain("centerSpreadTrailStyle.value === 'gradient'");
    expect(acceptanceSource).toContain('centerSpreadTrailLength.valueAsNumber');

    const websiteDemoSource = sourceOf('website/src/examples/presentation/AnimationManagerDemo.vue');
    expect(websiteDemoSource).toContain('centerSpreadGradientFront');
    expect(websiteDemoSource).toContain('centerSpreadTrailLength');
    expect(websiteDemoSource).toContain("strokes: [{ color: 'rgba(16,185,129,0.72)', width: 1.5 }]");

    const websiteSource = sourceOf('website/src/views/presentation/AnimationsView.vue');
    expect(websiteSource).toContain('内侧最旧尾迹');
    expect(websiteSource).toContain('外侧波纹前沿');
    expect(websiteSource).toContain("field('CenterSpreadAnimationSpec', 'trailLength', '0.18'");
    expect(websiteSource).toContain('0 只保留前沿线环或裁剪弧');
    expect(websiteSource).toContain('纯色模式在整个传播生命周期内恒定应用');
  });

  it('每项实现、Shape、测试证据、网站锚点和验收场景都真实存在', () => {
    const knownShapeTypes = new Set<string>(shapeTypes);
    const routerSource = sourceOf('website/src/router/index.ts');
    const acceptanceSources = new Map<string, string>();

    for (const entry of animationEffectManifest) {
      expect(entry.targetCapability.length, `${entry.animationType}.targetCapability`).toBeGreaterThan(0);
      expect(entry.supportedShapeTypes.length, `${entry.animationType}.supportedShapeTypes`).toBeGreaterThan(0);
      expect(new Set(entry.supportedShapeTypes).size, `${entry.animationType}.supportedShapeTypes`).toBe(entry.supportedShapeTypes.length);
      expect(
        entry.supportedShapeTypes.every((shapeType) => knownShapeTypes.has(shapeType)),
        `${entry.animationType}.supportedShapeTypes`
      ).toBe(true);
      expect(entry.writeDomains.length, `${entry.animationType}.writeDomains`).toBeGreaterThan(0);

      const implementation = sourceOf(entry.implementation);
      expect(implementation, entry.implementation).toContain(`type: '${entry.animationType}'`);

      expect(entry.testFiles.length, `${entry.animationType}.testFiles`).toBeGreaterThan(0);
      const testEvidence = entry.testFiles.map((file) => sourceOf(file)).join('\n');
      expect(testEvidence, `${entry.animationType}.testFiles`).toContain(`type: '${entry.animationType}'`);

      const websiteSource = sourceOf(entry.websitePage.source);
      const [route, anchor] = entry.websitePage.route.split('#');
      expect(route).toBe('/components/presentation/animations');
      expect(anchor, `${entry.animationType}.websitePage`).toBeTruthy();
      expect(anchor).toBe(`effect-${entry.animationType}`);
      expect(entry.websitePage.source).toBe('website/src/views/presentation/AnimationsView.vue');
      expect(routerSource).toContain("path: 'components/presentation/animations'");
      expect(routerSource).toContain("import('../views/presentation/AnimationsView.vue')");
      expect(websiteSource, `${entry.animationType}.websitePage`).toContain(':id="`effect-${effect.animationType}`"');

      const acceptanceSource = acceptanceSources.get(entry.acceptanceScenario) ?? sourceOf(entry.acceptanceScenario);
      acceptanceSources.set(entry.acceptanceScenario, acceptanceSource);
      expect(acceptanceSource).toContain('animationEffectManifest');
    }
  });

  it('验收台和网站示例的效果选项都由同一 manifest 生成', () => {
    const acceptanceSource = sourceOf('.test/scenarios/animations.ts');
    const websiteDemoSource = sourceOf('website/src/examples/presentation/AnimationManagerDemo.vue');

    expect(acceptanceSource).toContain('animationEffectManifest.map');
    expect(acceptanceSource).toContain('entry.createDefaultSpec');
    expect(acceptanceSource).not.toContain('entry.createDemoSpec');
    expect(acceptanceSource).toContain("gallery.dataset.animationGallery = ''");
    expect(acceptanceSource).toContain('card.dataset.animationDemo = entry.animationType');
    expect(acceptanceSource).toContain("playButton.dataset.animationAction = 'play'");
    expect(acceptanceSource).toContain('warning.dataset.animationPhotosensitivityWarning');
    expect(websiteDemoSource).toContain("from '../../../../.test/animationEffectManifest'");
    expect(websiteDemoSource).toContain('animationEffectManifest.map');
    expect(websiteDemoSource).toContain('animationEffectManifestByType[type].createDemoSpec');
    expect(websiteDemoSource).not.toContain('animationDemoManifest');
  });

  it('活动动画页用十个隔离目标和显式组合模式展示全部公开效果', () => {
    const websiteSource = sourceOf('website/src/views/presentation/AnimationsView.vue');
    const websiteDemoSource = sourceOf('website/src/examples/presentation/AnimationManagerDemo.vue');

    expect(websiteSource).toContain('const effectCards = animationTypes.map');
    expect(websiteSource).toContain('animationEffectManifestByType[animationType]');
    expect(websiteSource).toContain('effect.targetSummary');
    expect(websiteSource).toContain('effect.writeDomains');
    expect(websiteSource).toContain('effect.minimalCall');
    expect(websiteSource).toContain('show-reset');
    expect(websiteSource).toContain('show-focus');
    expect(websiteSource).toContain("extractExampleSnippet(animationManagerSource, 'animation-handle-lifecycle')");
    expect(websiteSource).toContain(':snippet="animationManagerSnippet"');
    expect(websiteDemoSource).toContain('// #region animation-handle-lifecycle');
    expect(websiteDemoSource).toContain('// #endregion animation-handle-lifecycle');

    for (const type of animationTypes) {
      const escapedType = type.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      expect(websiteDemoSource, type).toMatch(new RegExp(`(?:${escapedType}|'${escapedType}'): \\[`, 'u'));
    }
    expect(websiteDemoSource).toContain("grow: 'FineArrow'");
    expect(websiteDemoSource).toContain("'radar-scan': 'Sector'");
    expect(websiteDemoSource).toContain('if (!compositionMode.value) stopAll()');
    expect(websiteDemoSource).toContain("new Set<AnimationType>(['blink', 'highlight', 'alert', 'fade'])");
    expect(websiteDemoSource).toContain("play('highlight', id, { channel: 'composition-highlight'");
    expect(websiteDemoSource).toContain("play('alert', id, { channel: 'composition-alert' });");
    expect(websiteDemoSource).toContain("play('grow', id, { channel: 'grow-reverse', direction: 'reverse' });");
    expect(websiteDemoSource).toContain('defineExpose({ reset, focusSelected })');
    expect(websiteDemoSource).toContain('本示例不会自动播放');
  });

  it('本地验收台为每种动画提供独立、兼容且不重复的目标', () => {
    const elements = animationTypes.map((animationType) => animationDemoElementsByType[animationType]);
    const ids = elements.map(({ id }) => id);

    expect(Object.keys(animationDemoElementsByType).sort()).toEqual([...animationTypes].sort());
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(animationTypes.length);
    for (const entry of animationEffectManifest) {
      const target = animationDemoElementsByType[entry.animationType];
      expect(entry.supportedShapeTypes, `${entry.animationType}.${target.geometry.type}`).toContain(target.geometry.type);
      expect(target.module).toBe('animation-demo');
    }
  });

  it('迁移与发布说明覆盖全部效果和源码兼容约束', () => {
    const migrationSources = [sourceOf('MIGRATION.txt'), sourceOf('website/src/views/MigrationV2View.vue')];

    for (const source of migrationSources) {
      for (const type of animationEffectTypes) expect(source, type).toContain(type);
      expect(source).toContain('earth.animations.play');
      expect(source).toContain('NativeStyleRef');
      expect(source).toContain('target-geometry');
      expect(source).toContain('AnimationType');
      expect(source).toContain('未知成员兜底');
    }
  });
});

function sourceOf(relativePath: string): string {
  const absolutePath = resolve(repositoryRoot, relativePath);
  expect(existsSync(absolutePath), relativePath).toBe(true);
  return readFileSync(absolutePath, 'utf8');
}
