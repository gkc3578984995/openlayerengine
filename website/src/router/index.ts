import { createRouter, createWebHistory } from 'vue-router';
import ApiQueryLayout from '../layouts/ApiQueryLayout.vue';
import DocsLayout from '../layouts/DocsLayout.vue';
import HomeView from '../views/HomeView.vue';
import QuickStartView from '../views/QuickStartView.vue';
import EarthCreateView from '../views/EarthCreateView.vue';
import MigrationV2View from '../views/MigrationV2View.vue';
import { getDocumentTitle } from '../utils/documentTitle';

const EarthInstanceView = () => import('../views/EarthInstanceView.vue');
const ViewServiceView = () => import('../views/ViewServiceView.vue');
const LayerServiceView = () => import('../views/LayerServiceView.vue');
const ControlServiceView = () => import('../views/ControlServiceView.vue');
const ElementOverviewView = () => import('../views/elements/ElementOverviewView.vue');
const ElementCreateView = () => import('../views/elements/ElementCreateView.vue');
const ElementQueryView = () => import('../views/elements/ElementQueryView.vue');
const ElementUpdateView = () => import('../views/elements/ElementUpdateView.vue');
const ElementProtectionView = () => import('../views/elements/ElementProtectionView.vue');
const ElementCleanupView = () => import('../views/elements/ElementCleanupView.vue');
const ShapesView = () => import('../views/elements/ShapesView.vue');
const StylesView = () => import('../views/elements/StylesView.vue');
const LineworkView = () => import('../views/elements/LineworkView.vue');
const DrawView = () => import('../views/interactions/DrawView.vue');
const EditView = () => import('../views/interactions/EditView.vue');
const MeasureView = () => import('../views/interactions/MeasureView.vue');
const TransformView = () => import('../views/interactions/TransformView.vue');
const AnimationsView = () => import('../views/presentation/AnimationsView.vue');
const ContextMenuView = () => import('../views/services/ContextMenuView.vue');
const EventsView = () => import('../views/services/EventsView.vue');
const OverlaysView = () => import('../views/services/OverlaysView.vue');
const DescriptorView = () => import('../views/services/DescriptorView.vue');
const UtilsView = () => import('../views/reference/UtilsView.vue');
const ErrorsView = () => import('../views/reference/ErrorsView.vue');
const ApiMethodsView = () => import('../views/api/ApiMethodsView.vue');
const ApiTypesView = () => import('../views/api/ApiTypesView.vue');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: DocsLayout,
      children: [
        { path: '', name: 'home', component: HomeView },
        { path: 'guide/quick-start', name: 'quick-start', component: QuickStartView },
        { path: 'guide/earth-create', name: 'earth-create', component: EarthCreateView },
        { path: 'guide/migration-v2', name: 'migration-v2', component: MigrationV2View },
        { path: 'components/core/earth', name: 'core-earth', component: EarthInstanceView },
        { path: 'components/core/view', name: 'core-view', component: ViewServiceView },
        { path: 'components/core/layers', name: 'core-layers', component: LayerServiceView },
        { path: 'components/core/controls', name: 'core-controls', component: ControlServiceView },
        {
          path: 'components/reference/types',
          redirect: (to) => ({ path: '/api/types', query: to.query, hash: to.hash })
        },
        { path: 'components/elements/overview', name: 'element-overview', component: ElementOverviewView },
        { path: 'components/elements/create', name: 'element-create', component: ElementCreateView },
        { path: 'components/elements/query', name: 'element-query', component: ElementQueryView },
        { path: 'components/elements/update', name: 'element-update', component: ElementUpdateView },
        { path: 'components/elements/protection', name: 'element-protection', component: ElementProtectionView },
        { path: 'components/elements/cleanup', name: 'element-cleanup', component: ElementCleanupView },
        { path: 'components/elements/shapes', name: 'element-shapes', component: ShapesView },
        { path: 'components/elements/styles', name: 'element-styles', component: StylesView },
        { path: 'components/elements/linework', name: 'element-linework', component: LineworkView },
        { path: 'components/interactions/draw', name: 'interaction-draw', component: DrawView },
        { path: 'components/interactions/edit', name: 'interaction-edit', component: EditView },
        { path: 'components/interactions/measure', name: 'interaction-measure', component: MeasureView },
        { path: 'components/interactions/transform', name: 'interaction-transform', component: TransformView },
        { path: 'components/presentation/animations', name: 'presentation-animations', component: AnimationsView },
        { path: 'components/services/context-menu', name: 'service-context-menu', component: ContextMenuView },
        { path: 'components/services/events', name: 'service-events', component: EventsView },
        { path: 'components/services/overlays', name: 'service-overlays', component: OverlaysView },
        { path: 'components/services/descriptor', name: 'service-descriptor', component: DescriptorView },
        { path: 'components/services/overlays/descriptor', redirect: '/components/services/descriptor' },
        { path: 'components/reference/utils', name: 'reference-utils', component: UtilsView },
        { path: 'components/reference/errors', name: 'reference-errors', component: ErrorsView },
        { path: 'components/point-layer', redirect: '/components/elements/create' },
        { path: 'components/measure', redirect: '/components/interactions/measure' },
        { path: 'components/dynamic-draw', redirect: '/components/interactions/draw' },
        { path: 'components/elements/list', redirect: '/components/elements/overview' },
        { path: 'components/elements/destroy', redirect: '/components/elements/cleanup' },
        { path: 'components/animation', redirect: '/components/presentation/animations' },
        { path: 'components/interactions/animations', redirect: '/components/presentation/animations' },
        { path: 'components/tools/context-menu', redirect: '/components/services/context-menu' },
        { path: 'components/tools/events', redirect: '/components/services/events' },
        { path: 'components/tools/overlays', redirect: '/components/services/overlays' },
        { path: 'components/calculations/utils', redirect: '/components/reference/utils' }
      ]
    },
    {
      path: '/api',
      component: ApiQueryLayout,
      children: [
        { path: '', redirect: '/api/methods' },
        { path: 'methods', name: 'api-methods', component: ApiMethodsView },
        { path: 'types', name: 'api-types', component: ApiTypesView }
      ]
    }
  ],
  scrollBehavior() {
    return false;
  }
});

router.afterEach((to) => {
  document.title = getDocumentTitle(to.path);
});

export default router;
