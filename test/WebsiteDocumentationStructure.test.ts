import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const documentationPages = [
  'QuickStartView.vue',
  'EarthCreateView.vue',
  'MigrationV2View.vue',
  'EarthInstanceView.vue',
  'ViewServiceView.vue',
  'LayerServiceView.vue',
  'ControlServiceView.vue',
  'elements/ElementOverviewView.vue',
  'elements/ElementCreateView.vue',
  'elements/ElementQueryView.vue',
  'elements/ElementUpdateView.vue',
  'elements/ElementCleanupView.vue',
  'elements/ShapesView.vue',
  'elements/StylesView.vue',
  'elements/LineworkView.vue',
  'interactions/DrawView.vue',
  'interactions/EditView.vue',
  'interactions/MeasureView.vue',
  'interactions/TransformView.vue',
  'presentation/AnimationsView.vue',
  'services/ContextMenuView.vue',
  'services/EventsView.vue',
  'services/OverlaysView.vue',
  'services/DescriptorView.vue',
  'reference/UtilsView.vue',
  'reference/ErrorsView.vue'
] as const;

const pagesWithoutRunnableExample = new Set(['QuickStartView.vue']);
const pagesWithoutPublicApi = new Set(['QuickStartView.vue', 'MigrationV2View.vue']);

const readPage = (page: string) => readFile(`website/src/views/${page}`, 'utf8');

describe('website documentation structure', () => {
  it('keeps every active documentation page on the same readable scaffold', async () => {
    for (const page of documentationPages) {
      const source = await readPage(page);

      expect(source, page).toContain('class="doc-page-layout"');
      expect(source, page).toContain('class="doc-hero"');
      expect(source, page).toContain('<PageAnchor');
    }
  });

  it('shows runnable, same-source examples before the complete public API', async () => {
    for (const page of documentationPages) {
      const source = await readPage(page);

      if (!pagesWithoutRunnableExample.has(page)) {
        expect(source, page).toContain('<ExampleBlock');
        expect(source, page).toContain('?raw');
      }

      if (!pagesWithoutPublicApi.has(page)) {
        expect(source, page).toContain('<PublicApiSection');
        expect(source.indexOf('<ExampleBlock'), page).toBeLessThan(source.indexOf('<PublicApiSection'));
      }
    }
  });
});
