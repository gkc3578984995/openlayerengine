import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Transform documentation', () => {
  it('provides one canonical page with stable sections, anchors, and a source-synced demo', async () => {
    const view = await readFile('website/src/views/TransformView.vue', 'utf8');

    expect(view).toContain('<span class="doc-hero__eyebrow">地图交互</span>');
    expect(view).toContain('<h1>Transform 图形变换</h1>');
    for (const id of ['overview', 'usage', 'examples', 'api', 'tips']) {
      expect(view).toContain(`id="${id}"`);
    }
    expect(view).toContain("{ id: 'example-transform-workflow', label: '交互变换与历史记录' }");
    expect(view).toContain('id="example-transform-workflow"');
    expect(view).toContain('title="交互变换与历史记录"');
    expect(view).toContain("import TransformDemo from '../examples/TransformDemo.vue';");
    expect(view).toContain("import transformSource from '../examples/TransformDemo.vue?raw';");
    expect(view).toMatch(/:source="transformSource"\s*>\s*<template #preview>\s*<TransformDemo\s*\/>/s);
    expect(view).toContain('<PageAnchor title="Transform 图形变换"');
  });

  it('documents the constructor, public property, owned types, enums, and every public method', async () => {
    const view = await readFile('website/src/views/TransformView.vue', 'utf8');

    expect(view).toContain('class="api-constructor"');
    expect(view).toContain('id="api-constructor"');
    expect(view).toContain('class="api-constructor__signature"');
    expect(view).toContain('new Transform(options)');
    expect(view.indexOf('id="api-constructor"')).toBeLessThan(view.indexOf('id="api-types"'));
    expect(view.indexOf('id="api-types"')).toBeLessThan(view.indexOf('id="api-properties"'));
    expect(view.indexOf('id="api-properties"')).toBeLessThan(view.indexOf('id="api-methods"'));

    for (const [anchor, label] of [
      ['api-type-itransformparams', 'ITransformParams'],
      ['api-type-itransformcallback', 'ITransformCallback'],
      ['api-type-etransform', 'ETransform'],
      ['api-type-etranslatetype', 'ETranslateType']
    ]) {
      expect(view).toContain(`id="${anchor}"`);
      expect(view).toContain(`{ id: '${anchor}', label: '${label}' }`);
    }
    expect(view).toContain("presentation: 'property'");
    expect(view).toContain("presentation: 'method'");
    expect(view).toContain("name: 'checkLayer'");
    for (const method of ['replaceEditingFeature', 'undo', 'redo', 'on', 'off', 'remove', 'destroy']) {
      expect(view).toMatch(new RegExp(`name: '${method}'`));
    }
    expect(view).not.toContain('useTransform');
  });

  it('runs a real transform workflow and cleans listeners before map resources', async () => {
    const demo = await readFile('website/src/examples/TransformDemo.vue', 'utf8');

    expect(demo).toContain('createConfiguredLayer');
    expect(demo).not.toMatch(/https?:\/\//);
    expect(demo).toContain('new Transform({');
    expect(demo).toContain('new PolygonLayer');
    expect(demo).toContain('ETransform.TranslateEnd');
    expect(demo).toContain('transform.undo()');
    expect(demo).toContain('transform.redo()');
    expect(demo).toContain('事件记录');
    expect(demo).toContain('var(--doc-border)');
    expect(demo).toContain('var(--doc-code-background)');
    expect(demo).not.toContain('var(--docs-');
    expect(demo).toContain('onBeforeUnmount(() => {');
    const cleanup = demo.indexOf('onBeforeUnmount(() => {');
    const off = demo.indexOf('transform.off(', cleanup);
    const destroyTransform = demo.indexOf('transform.destroy()', cleanup);
    const destroyEarth = demo.indexOf('earthRef.value?.destroy()', cleanup);
    expect(off).toBeGreaterThan(cleanup);
    expect(destroyTransform).toBeGreaterThan(off);
    expect(destroyEarth).toBeGreaterThan(destroyTransform);
  });
});
