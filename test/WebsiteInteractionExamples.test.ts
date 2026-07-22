import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('website interaction examples', () => {
  it('drives the Draw catalog from every public ShapeType and the shared shape manifest', () => {
    const demo = read('website/src/examples/interactions/DrawSessionDemo.vue');

    expect(demo).toContain('Earth, shapeTypes');
    expect(demo).toContain("import { shapeExampleByType } from '../../config/shapeExamples';");
    expect(demo).toContain('shapeTypes.map((type) =>');
    expect(demo).toContain("id: 'basic' as const");
    expect(demo).toContain("id: 'parameter' as const");
    expect(demo).toContain("id: 'plot' as const");
    expect(demo).toContain('输入规则');
    expect(demo).toContain('完成方式');
    expect(demo).toContain('最终 geometry');
    expect(demo).toContain('defineExpose({ reset, focus })');
  });

  it('shares a five-target capability manifest across Edit and Transform', () => {
    const manifest = read('website/src/config/interactionExamples.ts');
    const edit = read('website/src/examples/interactions/EditSessionDemo.vue');
    const transform = read('website/src/examples/interactions/TransformSessionDemo.vue');

    for (const id of ['point-icon', 'polyline', 'polygon', 'circle', 'tailed-attack-arrow']) expect(manifest).toContain(`id: '${id}'`);
    for (const demo of [edit, transform]) {
      expect(demo).toContain('interactionTargetExamples');
      expect(demo).toContain('目标支持矩阵');
      expect(demo).toContain('— 不支持');
      expect(demo).toContain('defineExpose({ reset, focus })');
    }
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
