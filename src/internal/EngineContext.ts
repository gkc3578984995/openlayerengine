import type Map from 'ol/Map.js';
import type View from 'ol/View.js';
import type { AnimationManager } from '../services/animation/types.js';
import type { ContextMenuService } from '../facade/ContextMenuFacade.js';
import type { ControlService } from '../facade/ControlService.js';
import type { DrawService } from '../facade/drawTypes.js';
import type { EventService } from '../facade/EventFacade.js';
import type { MeasureService } from '../facade/measureTypes.js';
import type { OverlayService } from '../facade/overlayTypes.js';
import type { StyleService } from '../facade/styleTypes.js';
import type { TransformService } from '../facade/transformTypes.js';
import type { ElementService, LayerService } from '../facade/types.js';
import type { ViewService } from '../facade/ViewService.js';

/** 单个 Earth 显式持有的运行上下文，也是地图资源的生命周期边界。 */
export interface EngineContext {
  /** OpenLayers 地图实例。 */
  readonly map: Map;
  /** OpenLayers 视图实例。 */
  readonly olView: View;
  /** 地图视口元素。 */
  readonly viewport: HTMLElement;
  /** 创建地图时确定的挂载目标。 */
  readonly target: string | HTMLElement;
  /** Element 服务。 */
  readonly elements: ElementService;
  /** 图层服务。 */
  readonly layers: LayerService;
  /** 样式服务。 */
  readonly styles: StyleService;
  /** 动画服务。 */
  readonly animations: AnimationManager;
  /** 绘制服务。 */
  readonly draw: DrawService;
  /** 变换服务。 */
  readonly transform: TransformService;
  /** 测量服务。 */
  readonly measure: MeasureService;
  /** 事件服务。 */
  readonly events: EventService;
  /** 右键菜单服务。 */
  readonly contextMenu: ContextMenuService;
  /** Overlay 服务。 */
  readonly overlays: OverlayService;
  /** 视图服务。 */
  readonly view: ViewService;
  /** 地图控件服务。 */
  readonly controls: ControlService;
  /** 按依赖关系释放上下文内的服务和地图资源。 */
  destroy(): void;
}
