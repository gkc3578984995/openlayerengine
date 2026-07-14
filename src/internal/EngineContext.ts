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

export interface EngineContext {
  readonly map: Map;
  readonly olView: View;
  readonly viewport: HTMLElement;
  readonly target: string | HTMLElement;
  readonly elements: ElementService;
  readonly layers: LayerService;
  readonly styles: StyleService;
  readonly animations: AnimationManager;
  readonly draw: DrawService;
  readonly transform: TransformService;
  readonly measure: MeasureService;
  readonly events: EventService;
  readonly contextMenu: ContextMenuService;
  readonly overlays: OverlayService;
  readonly view: ViewService;
  readonly controls: ControlService;
  destroy(): void;
}
