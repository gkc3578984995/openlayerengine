import { createRouter, createWebHistory } from 'vue-router';
import DocsLayout from '../layouts/DocsLayout.vue';
import HomeView from '../views/HomeView.vue';
import LayerCommonView from '../views/LayerCommonView.vue';
import PointLayerView from '../views/PointLayerView.vue';
import QuickStartView from '../views/QuickStartView.vue';
import EarthCreateView from '../views/EarthCreateView.vue';
import GlobalMethodsView from '../views/GlobalMethodsView.vue';
import GlobalEventView from '../views/GlobalEventView.vue';
import GlobalEventGlobalMouseView from '../views/GlobalEventGlobalMouseView.vue';
import GlobalEventModuleEventsView from '../views/GlobalEventModuleEventsView.vue';
import GlobalEventKeyboardView from '../views/GlobalEventKeyboardView.vue';
import ContextMenuOverviewView from '../views/ContextMenuOverviewView.vue';
import ContextMenuDefaultMenuView from '../views/ContextMenuDefaultMenuView.vue';
import ContextMenuModuleMenuView from '../views/ContextMenuModuleMenuView.vue';
import ContextMenuCascadeMenuView from '../views/ContextMenuCascadeMenuView.vue';
import ContextMenuStateView from '../views/ContextMenuStateView.vue';
import ContextMenuCleanupView from '../views/ContextMenuCleanupView.vue';
import DynamicDrawView from '../views/DynamicDrawView.vue';
import MeasureView from '../views/MeasureView.vue';
import MeasureDistanceView from '../views/MeasureDistanceView.vue';
import MeasureAreaView from '../views/MeasureAreaView.vue';
import MeasureRemoveView from '../views/MeasureRemoveView.vue';

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
          path: 'components/global-event/global-mouse',
          name: 'global-event-global-mouse',
          component: GlobalEventGlobalMouseView
        },
        {
          path: 'components/global-event/module-events',
          name: 'global-event-module-events',
          component: GlobalEventModuleEventsView
        },
        {
          path: 'components/global-event/keyboard',
          name: 'global-event-keyboard',
          component: GlobalEventKeyboardView
        },
        {
          path: 'components/context-menu',
          name: 'context-menu',
          component: ContextMenuOverviewView
        },
        {
          path: 'components/context-menu/default-menu',
          name: 'context-menu-default-menu',
          component: ContextMenuDefaultMenuView
        },
        {
          path: 'components/context-menu/module-menu',
          name: 'context-menu-module-menu',
          component: ContextMenuModuleMenuView
        },
        {
          path: 'components/context-menu/cascade-menu',
          name: 'context-menu-cascade-menu',
          component: ContextMenuCascadeMenuView
        },
        {
          path: 'components/context-menu/menu-state',
          name: 'context-menu-menu-state',
          component: ContextMenuStateView
        },
        {
          path: 'components/context-menu/cleanup',
          name: 'context-menu-cleanup',
          component: ContextMenuCleanupView
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
        },
        {
          path: 'components/measure/distance',
          name: 'measure-distance',
          component: MeasureDistanceView
        },
        {
          path: 'components/measure/area',
          name: 'measure-area',
          component: MeasureAreaView
        },
        {
          path: 'components/measure/remove',
          name: 'measure-remove',
          component: MeasureRemoveView
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
