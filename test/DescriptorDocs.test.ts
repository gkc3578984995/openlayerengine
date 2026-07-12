import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Descriptor documentation', () => {
  it('documents the reliable Descriptor lifecycle in one canonical page', async () => {
    const view = await readFile('website/src/views/DescriptorView.vue', 'utf8');

    expect(view).toContain('<span class="doc-hero__eyebrow">地图交互</span>');
    expect(view).toContain('<h1>Descriptor 标牌</h1>');
    for (const id of ['overview', 'usage', 'examples', 'api', 'tips']) {
      expect(view).toContain(`id: '${id}'`);
      expect(view).toContain(`id="${id}"`);
    }
    expect(view).toContain("{ id: 'example-list-descriptor', label: '列表标牌生命周期' }");
    expect(view).toContain('id="example-list-descriptor"');
    expect(view).toContain('title="列表标牌生命周期"');
    expect(view).toContain("import DescriptorDemo from '../examples/DescriptorDemo.vue';");
    expect(view).toContain("import descriptorSource from '../examples/DescriptorDemo.vue?raw';");
    expect(view).toMatch(/:source="descriptorSource"\s*>\s*<template #preview>\s*<DescriptorDemo\s*\/>/s);
    expect(view).toContain('<PageAnchor title="Descriptor 标牌" :items="anchors" />');
  });

  it('presents the constructor, public types, and methods with stable anchors', async () => {
    const view = await readFile('website/src/views/DescriptorView.vue', 'utf8');

    expect(view).toContain('id="api-constructor"');
    expect(view).toContain('class="api-constructor"');
    expect(view).toContain('class="api-constructor__signature"');
    expect(view).toContain('new Descriptor(earth, options)');
    expect(view.indexOf('id="api-constructor"')).toBeLessThan(view.indexOf('id="api-types"'));
    expect(view.indexOf('id="api-types"')).toBeLessThan(view.indexOf('id="api-methods"'));
    expect(view).toContain("presentation: 'property'");
    expect(view).toContain("presentation: 'method'");

    for (const type of ['idescriptorparams', 'idescriptorsetparams', 'iproperties', 'ipropertiesbase', 'ikeyvalue']) {
      expect(view).toContain(`{ id: 'api-type-${type}'`);
      expect(view).toContain(`id="api-type-${type}"`);
    }
    expect(view).toContain("type: '((arg: { data?: T }) =&gt; void)?'");
    expect(view).toContain('type: \'(<a href="#api-type-iproperties">IProperties</a>&lt;string | number&gt;[] | string)?\'');
    for (const method of ['set', 'show', 'hide', 'destroy']) {
      expect(view).toMatch(new RegExp(`\\[\\s*'${method}',`));
      expect(view).toContain(`href="#api-method-${method}"`);
      expect(view).toContain(`id="api-method-${method}"`);
    }
    expect(view).not.toContain('useDescriptor');
  });

  it('states current behavior boundaries without promising unsupported features', async () => {
    const view = await readFile('website/src/views/DescriptorView.vue', 'utf8');

    expect(view).toContain("当前可靠用法是 <code>type: 'list'</code>");
    expect(view).toContain('必须先调用');
    expect(view).toContain('当前版本不会触发');
    expect(view).toContain('关闭图标资源');
    expect(view).toContain('当前版本不会渲染字符串内容');
  });

  it('runs the list demo from the configured map source and cleans up explicitly', async () => {
    const demo = await readFile('website/src/examples/DescriptorDemo.vue', 'utf8');

    expect(demo).toContain("import { Descriptor, Earth, type IProperties } from '@vrsim/earth-engine-ol';");
    expect(demo).toContain('createConfiguredLayer');
    expect(demo).not.toMatch(/https?:\/\//);
    expect(demo).toContain("type: 'list'");
    expect(demo).toContain('descriptor.set');
    expect(demo).toContain('descriptor.show');
    expect(demo).toContain('descriptor.hide');
    expect(demo).toContain('descriptor.destroy');
    expect(demo).toContain('earth.destroy');
    expect(demo.indexOf('descriptor.destroy', demo.indexOf('onBeforeUnmount'))).toBeLessThan(demo.indexOf('earth.destroy', demo.indexOf('onBeforeUnmount')));
  });
});
