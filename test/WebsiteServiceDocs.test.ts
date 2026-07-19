import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

const servicePages = [
  {
    name: 'ContextMenu',
    view: 'website/src/views/services/ContextMenuView.vue',
    demo: 'website/src/examples/services/ContextMenuDemo.vue',
    region: 'context-menu-register',
    types: [
      'ContextMenuService',
      'ContextMenuHandle',
      'ContextMenuTarget',
      'ContextMenuStateTarget',
      'ContextMenuSpec',
      'ContextMenuItemSpec',
      'ContextMenuItemContext',
      'ContextMenuItemState'
    ]
  },
  {
    name: 'Events',
    view: 'website/src/views/services/EventsView.vue',
    demo: 'website/src/examples/services/EventsDemo.vue',
    region: 'event-subscriptions',
    types: ['EventService', 'EarthEventType', 'EarthEventMap', 'EarthPointerEvent', 'EarthKeyboardEvent', 'EventSubscriptionOptions']
  },
  {
    name: 'Overlays',
    view: 'website/src/views/services/OverlaysView.vue',
    demo: 'website/src/examples/services/OverlaysDemo.vue',
    region: 'overlay-create',
    types: ['OverlayService', 'OverlayHandle', 'OverlaySpec', 'OverlayPatch', 'OverlaySelector', 'OverlayOwnership', 'OverlayPositioning', 'PanIntoViewSpec']
  },
  {
    name: 'Descriptor',
    view: 'website/src/views/services/DescriptorView.vue',
    demo: 'website/src/examples/services/DescriptorDemo.vue',
    region: 'descriptor-create',
    types: ['DescriptorHandle', 'DescriptorSpec', 'DescriptorPatch', 'DescriptorContent', 'DescriptorListItem', 'DescriptorEvent', 'OverlayService']
  }
] as const;

describe('website service documentation', () => {
  it('keeps each runnable example, highlighted snippet and full API list on the same page', async () => {
    for (const page of servicePages) {
      const [view, demo] = await Promise.all([read(page.view), read(page.demo)]);

      expect(view, page.name).toContain('<PublicApiSection');
      expect(view, page.name).toContain("{ id: 'api', label: '完整 API' }");
      expect(view, page.name).toContain(
        `extractExampleSnippet(${page.name === 'ContextMenu' ? 'contextMenu' : page.name.toLowerCase()}Source, '${page.region}')`
      );
      expect(view, page.name).toContain('source-lang="vue"');
      expect(view, page.name).toContain('snippet-lang="typescript"');

      for (const type of page.types) expect(view, `${page.name} should own ${type}`).toContain(`'${type}'`);

      expect(demo, page.name).toContain(`// #region ${page.region}`);
      expect(demo, page.name).toContain(`// #endregion ${page.region}`);
      expect(demo, page.name).toContain('createConfiguredLayer');
      expect(demo, page.name).toContain('<el-');
      expect(demo, page.name).toContain('onBeforeUnmount');
      expect(demo, page.name).toMatch(/\.destroy\(\)/u);
      expect(demo, page.name).not.toMatch(/<(?:button|input|select|textarea)\b/u);
      expect(demo, page.name).not.toMatch(/\bconsole\.|\u65e5\u5fd7/u);
    }
  });

  it('makes every map result visually identifiable', async () => {
    const [contextMenu, events, overlays, descriptor] = await Promise.all([
      read(servicePages[0].demo),
      read(servicePages[1].demo),
      read(servicePages[2].demo),
      read(servicePages[3].demo)
    ]);

    expect(contextMenu).toContain("text: '右键这个标记'");
    expect(events).toContain("text: '移动指针到这里'");
    expect(overlays).toContain('background: var(--el-color-primary);');
    expect(overlays).toContain("overlayElement('外部所有权 Overlay')");
    expect(descriptor).toContain("text: 'Descriptor 定位点'");
    expect(descriptor).toContain('fixedLine: true');
  });

  it('assigns all service methods without duplicating OverlayService members', async () => {
    const [contextMenu, events, overlays, descriptor] = await Promise.all([
      read(servicePages[0].view),
      read(servicePages[1].view),
      read(servicePages[2].view),
      read(servicePages[3].view)
    ]);

    for (const method of ['register', 'getItemState', 'setItemState', 'toggleItem', 'setTheme', 'toggleTheme', 'clearElementState', 'close']) {
      expect(contextMenu).toContain(`name: '${method}'`);
    }
    for (const method of ['on', 'once', 'has', 'clearModule']) expect(events).toContain(`name: '${method}'`);
    for (const method of ['add', 'get', 'query', 'remove', 'clear', 'update', 'setPosition', 'show', 'hide', 'panIntoView', 'destroy']) {
      expect(overlays).toContain(`name: '${method}'`);
    }
    for (const method of ['OverlayService.createDescriptor', 'update', 'setPosition', 'show', 'hide', 'close', 'on', 'destroy']) {
      expect(descriptor).toContain(`name: '${method}'`);
    }

    expect(overlays).toContain("const apiMembers = { OverlayService: ['add', 'get', 'query', 'remove', 'clear'] } as const;");
    expect(descriptor).toContain("const apiMembers = { OverlayService: ['createDescriptor'] } as const;");
  });
});
