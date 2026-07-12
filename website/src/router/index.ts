import { createRouter, createWebHistory } from 'vue-router';
import DocsLayout from '../layouts/DocsLayout.vue';
import HomeView from '../views/HomeView.vue';
import LayerCommonView from '../views/LayerCommonView.vue';
import PointLayerView from '../views/PointLayerView.vue';
import QuickStartView from '../views/QuickStartView.vue';
import EarthCreateView from '../views/EarthCreateView.vue';
import GlobalMethodsView from '../views/GlobalMethodsView.vue';
import GlobalEventView from '../views/GlobalEventView.vue';
import ContextMenuView from '../views/ContextMenuView.vue';
import DynamicDrawView from '../views/DynamicDrawView.vue';
import MeasureView from '../views/MeasureView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: DocsLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: HomeView
        },
        {
          path: 'guide/quick-start',
          name: 'quick-start',
          component: QuickStartView
        },
        {
          path: 'guide/earth-create',
          name: 'earth-create',
          component: EarthCreateView
        },
        {
          path: 'guide/global-methods',
          name: 'global-methods',
          component: GlobalMethodsView
        },
        {
          path: 'components/layer-common',
          name: 'layer-common',
          component: LayerCommonView
        },
        {
          path: 'components/point-layer',
          name: 'point-layer',
          component: PointLayerView
        },
        {
          path: 'components/global-event',
          name: 'global-event',
          component: GlobalEventView
        },
        {
          path: 'components/context-menu',
          name: 'context-menu',
          component: ContextMenuView
        },
        {
          path: 'components/dynamic-draw',
          name: 'dynamic-draw',
          component: DynamicDrawView
        },
        {
          path: 'components/measure',
          name: 'measure',
          component: MeasureView
        }
      ]
    }
  ],
  scrollBehavior(to) {
    if (to.hash) {
      return {
        el: to.hash,
        top: 88,
        behavior: 'smooth'
      };
    }
    return { top: 0 };
  }
});

export default router;
