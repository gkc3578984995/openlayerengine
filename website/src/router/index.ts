import { createRouter, createWebHistory } from 'vue-router';
import DocsLayout from '../layouts/DocsLayout.vue';
import HomeView from '../views/HomeView.vue';
import LayerCommonView from '../views/LayerCommonView.vue';
import PointLayerView from '../views/PointLayerView.vue';
import QuickStartView from '../views/QuickStartView.vue';
import EarthCreateView from '../views/EarthCreateView.vue';
import GlobalMethodsView from '../views/GlobalMethodsView.vue';

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
