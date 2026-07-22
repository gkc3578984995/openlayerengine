import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website interaction examples', () => {
  it('drives the Draw catalog from every public ShapeType and the shared shape manifest', () => {
    const demo = read('website/src/examples/interactions/DrawSessionDemo.vue');
    const view = read('website/src/views/interactions/DrawView.vue');

    expect(demo).toContain('Earth, shapeTypes');
    expect(demo).toContain("import { shapeExampleByType } from '../../config/shapeExamples';");
    expect(demo).toContain('shapeTypes.map((type) =>');
    expect(demo).toContain("id: 'basic' as const");
    expect(demo).toContain("id: 'parameter' as const");
    expect(demo).toContain("id: 'plot' as const");
    expect(demo).toContain('输入规则');
    expect(demo).toContain('完成方式');
    expect(demo).toContain('最终 geometry');
    expect(demo).toContain('const limit = ref<DrawLimit>(0)');
    expect(demo).toContain('const keepGraphics = ref(true)');
    expect(demo).toContain('limit: sessionLimit');
    expect(demo).toContain("session.on('complete', ({ element }) =>");
    expect(demo).toContain('complete 同步观测');
    expect(view).toContain("option: 'keepGraphics: false'");
    expect(view).toContain('Ctrl/Cmd + Shift + Z');
    expect(demo).toContain('defineExpose({ reset, focus })');
  });

  it('shares a six-target capability manifest across Edit and Transform', () => {
    const manifest = read('website/src/config/interactionExamples.ts');
    const edit = read('website/src/examples/interactions/EditSessionDemo.vue');
    const transform = read('website/src/examples/interactions/TransformSessionDemo.vue');

    for (const id of ['point-icon', 'polyline', 'polygon', 'circle', 'rectangle', 'tailed-attack-arrow']) expect(manifest).toContain(`id: '${id}'`);
    for (const demo of [edit, transform]) {
      expect(demo).toContain('interactionTargetExamples');
      expect(demo).toContain('目标支持矩阵');
      expect(demo).toContain('— 不支持');
      expect(demo).toContain('defineExpose({ reset, focus })');
    }
    expect(manifest).toContain("type: 'rectangle'");
    expect(transform).toContain("type TransformOptionPresetId = 'full' | 'rectangle' | 'translate-only'");
    expect(transform).toMatch(/Pick<[\s\S]*?'hitTolerance'[\s\S]*?'pointRadius'/u);
    expect(transform).toContain('// #region transform-options-lab');
    const transformView = read('website/src/views/interactions/TransformView.vue');
    expect(transformView).toContain("extractExampleSnippet(transformSessionSource, 'transform-options-lab')");
    expect(transformView).toContain('PC 快捷键与提交边界');
  });

  it('runs replace and reject through all four exclusive interaction services', () => {
    const demo = read('website/src/examples/interactions/InteractionPolicyDemo.vue');

    expect(demo).toContain("policy.value === 'replace'");
    expect(demo).toContain('error instanceof InteractionConflictError');
    expect(demo).toContain('startDraw');
    expect(demo).toContain('startMeasure');
    expect(demo).toContain('startEdit');
    expect(demo).toContain('startTransform');
    expect(demo).toContain('earth.map.getInteractions().getLength()');
    expect(demo).toContain('资源数量已恢复');
  });

  it('triggers and recovers all stable errors through real public APIs', () => {
    const demo = read('website/src/examples/reference/ErrorsDemo.vue');
    const view = read('website/src/views/reference/ErrorsView.vue');

    expect(demo).not.toMatch(/throw\s+new\s+(?:Invalid|Duplicate|Object|Capability|Interaction|Unsupported)/u);
    expect(demo).toContain('earth.elements.add(');
    expect(demo).toContain('earth.elements.remove({} as never)');
    expect(demo).toContain("earth.animations.play({ id: TARGET_ID }, { type: 'path-travel' })");
    expect(demo).toContain("earth.measure.start({ type: 'area', policy: 'reject' })");
    expect(demo).toContain('earth.elements.setProtection(TARGET_ID, {');
    expect(demo).toContain('earth.draw.edit(target');
    expect(demo).toContain("name: 'ElementProtectedError'");
    expect(demo).toContain('earth.styles.set({ id: TARGET_ID }, { nativeStyle: new Style() })');
    expect(demo).toContain('definition.recover(earth)');
    expect(demo).toContain('defineExpose({ reset, focus })');
    expect(view).toContain('useEarth 的结构校验使用原生 TypeError');
    expect(view).toMatch(/不属于下方 8\s*个包根错误类/u);
  });

  it('documents the actual independent Edit keyboard contract', () => {
    const view = read('website/src/views/interactions/EditView.vue');

    expect(view).toContain("input: 'Ctrl/Cmd + Z'");
    expect(view).toContain("input: 'Ctrl/Cmd + Y / Ctrl/Cmd + Shift + Z'");
    expect(view).toMatch(/独立 Edit\s+Session 不绑定\s+Esc/u);
    expect(view).not.toContain("input: 'Esc / cancel()'");
  });

  it('wires reset and focus controls into every destructive interaction example', () => {
    for (const path of [
      'website/src/views/interactions/DrawView.vue',
      'website/src/views/interactions/EditView.vue',
      'website/src/views/interactions/TransformView.vue',
      'website/src/views/reference/ErrorsView.vue'
    ]) {
      const view = read(path);
      expect(view, path).toContain('show-reset');
      expect(view, path).toContain('show-focus');
      expect(view, path).toContain('@reset=');
      expect(view, path).toContain('@focus=');
    }
  });
});
