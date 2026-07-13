/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import TransformInteraction from '../extends/transform-interaction/TransformInteraction';
import type Earth from '../Earth';
import { ISetOverlayParam, ITransformCallback, ITransformParams, ModifyType } from '../interface';
import { ECursor, ETransform, ETranslateType } from '../enum';
import { Feature } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Coordinate } from 'ol/coordinate';
import { LineString, Point, Polygon, Circle as CircleGeom, MultiPoint, MultiLineString, MultiPolygon } from 'ol/geom';
import { Base, BillboardLayer, CircleLayer, OverlayLayer, PointLayer, PolygonLayer, PolylineLayer } from '../base';
import { unByKey } from 'ol/Observable';
import { EventsKey } from 'ol/events';
import { Icon, Style } from 'ol/style';
import { Utils } from '../common';
import cloneDeep from 'lodash/cloneDeep';
import { IToolbarItem, Toolbar } from '../extends/toolbar/Toolbar';
import DynamicDraw from './DynamicDraw';
import { resolveEarth } from '../earthContext';
import { extractGeometryInfo, geometriesEqual } from './transform/geometry';
import { TransformHistory } from './transform/history';
import { cloneStyleSnapshot } from './transform/styleSnapshot';

export default class Transform {
  /**
   * 地图实例（由外部注入或回退到全局单例）
   */
  private earth: Earth;
  /**
   * 参数
   */
  private options: ITransformParams;
  /**
   * 实列
   */
  private transforms: any;
  /**
   * 提示牌
   */
  private overlay: OverlayLayer<unknown>;
  /**
   * 提示覆盖物监听器key
   */
  private overlayKey: EventsKey | EventsKey[] | undefined = undefined;
  /**
   * 校验选中状态
   */
  private checkSelect: Feature | null = null;
  /**
   * 选中的图层
   */
  public checkLayer: Base | null = null;
  /**
   * 校验鼠标进入状态
   */
  private checkEnterHandle: boolean = false;
  /**
   * 默认参数
   */
  private defaultParams: ITransformParams = {
    hitTolerance: 2,
    translateType: ETranslateType.Feature,
    scale: true,
    stretch: true,
    rotate: true,
    historyLimit: 10
  };
  /**
   * 外部监听器缓存
   */
  private listenerMap: Map<ETransform, Set<(e: ITransformCallback) => void>> = new Map();
  /** 当前选中周期内的变换历史。 */
  private history: TransformHistory;
  /**
   * Tooltip DOM 元素（复用避免内存泄漏）
   */
  private helpTooltipEl: HTMLDivElement | null = null;
  /** 基础提示标识（用于动态拼接快捷键及撤销重做数量） */
  private readonly baseTransformTipFlag = '选择控制点进行变换操作';
  /**
   * 是否已销毁
   */
  private disposed = false;
  /**
   * 变换工具条
   */
  private toolbar: Toolbar | null | undefined;
  /**
   * 键盘事件处理函数（用于销毁时解绑）
   */
  private keyDownFun: (() => void) | undefined;
  /** 复制预览阶段的鼠标移动监听释放器 */
  private copyMoveDisposer?: () => void;
  /** 复制预览阶段的左键确认监听释放器 */
  private copyConfirmDisposer?: () => void;
  /** 复制预览阶段的右键取消监听释放器 */
  private copyCancelDisposer?: () => void;
  /**
   * 是否进入复制状态
   */
  private copyStatus: any = null;
  /**
   * 复制的要素
   */
  private copyFeature: any = null;
  /** 最近一次 pointermove 的像素坐标（相对地图容器）。用于纯键盘事件（如 Ctrl+V）需要定位时 */
  private lastPointerPixel: number[] | null = null;
  /** pointermove 监听 key，用于销毁解绑 */
  private pointerMoveKey: EventsKey | undefined;
  /** 工具栏位置随地图缩放 / 平移 / 旋转同步的监听 key */
  private toolbarSyncKeys: EventsKey[] = [];
  /** 平移开始时针对 plotPoints 的快照（用于在平移过程中同步控制点） */
  private translatePlotSnapshot: { featureId: string; basePlotPoints: Coordinate[]; baseCenter: Coordinate } | null = null;
  /** 绑定后的右键监听，确保销毁时可精确解除。 */
  private readonly boundHandleContextMenu = this.handleContextMenu.bind(this);

  constructor(options: ITransformParams) {
    this.options = options;
    this.history = new TransformHistory(() => this.options.historyLimit ?? this.defaultParams.historyLimit ?? 10);
    this.earth = resolveEarth(options.earth);
    this.overlay = new OverlayLayer(this.earth);
    this.transforms = this.createTransform();
    // 初始化统一事件管线（内部数据处理 + 外部监听分发）
    this.setupEventPipeline();
    this.watchContextMenu();
    // 初始化键盘事件
    this.setupKeyDownEvent();
    // 跟踪鼠标位置，供键盘触发操作使用
    this.setupPointerTrack();
    // 工具栏位置随地图缩放 / 平移 / 旋转同步
    this.setupToolbarSync();
  }
  /**
   * 创建变换实例
   */
  private createTransform() {
    // 初始化参数
    const { params, translate, translateFeature } = this.initParams();
    const mergedFilter = (feature: Feature): boolean => {
      if (typeof params.beforeTransform === 'function') {
        return params.beforeTransform(feature);
      }
      return true;
    };
    // 添加 Transform 交互
    const transforms = new TransformInteraction({
      hitTolerance: params.hitTolerance,
      translate: translate,
      translateFeature: translateFeature,
      stretch: params.stretch,
      scale: params.scale,
      rotate: params.rotate,
      filter: mergedFilter,
      layers: params.transformLayers,
      features: params.transformFeatures,
      graticule: this.earth.graticule
    });
    this.earth.map.addInteraction(transforms);
    return transforms;
  }
  /**
   * 初始化参数
   */
  private initParams() {
    const params = {
      ...this.defaultParams,
      ...this.options
    };
    let translate = false;
    let translateFeature = false;
    // 处理平移参数
    if (params.translateType == ETranslateType.None) {
      translate = false;
      translateFeature = false;
    } else if (params.translateType == ETranslateType.Center) {
      translate = true;
      translateFeature = false;
    } else if (params.translateType == ETranslateType.Feature) {
      translate = true;
      translateFeature = true;
    }
    return { params, translate, translateFeature };
  }
  /**
   * 建立统一事件管线：一次性注册内部逻辑 -> 转换统一数据结构 -> 分发给外部
   */
  private setupEventPipeline() {
    const events: ETransform[] = [
      ETransform.Select,
      ETransform.SelectEnd,
      ETransform.EnterHandle,
      ETransform.LeaveHandle,
      ETransform.TranslateStart,
      ETransform.Translating,
      ETransform.TranslateEnd,
      ETransform.RotateStart,
      ETransform.Rotating,
      ETransform.RotateEnd,
      ETransform.ScaleStart,
      ETransform.Scaling,
      ETransform.ScaleEnd,
      ETransform.Undo,
      ETransform.Redo,
      ETransform.Remove,
      ETransform.Copy,
      ETransform.ModifyStart,
      ETransform.Modifying,
      ETransform.ModifyEnd
    ];
    events.forEach((ev) => {
      this.transforms.on(ev, (raw: any) => this.handleRawEvent(ev, raw));
    });
  }
  /** 编辑状态下优先消费右键，用于退出编辑而非打开地图菜单。 */
  private watchContextMenu(): void {
    this.earth.map.getViewport()?.addEventListener('contextmenu', this.boundHandleContextMenu, true);
  }
  private handleContextMenu(event: MouseEvent): void {
    if (!this.checkSelect) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.transforms.exitEdit(this.earth.map.getEventPixel(event));
  }
  /**
   * 初始化键盘事件
   */
  private setupKeyDownEvent() {
    this.keyDownFun = this.earth.useGlobalEvent().addKeyDownEventByGlobal((event) => {
      const key = event.key.toLowerCase();
      if (key === 'escape' && this.checkSelect) {
        let extent: any = this.checkSelect.getGeometry()?.getExtent();
        extent = extent ? this.earth.map.getPixelFromCoordinate([extent[0], extent[3]]) : [0, 0];
        // 退出编辑
        this.transforms.exitEdit(extent);
      }
      if (key === 'z' && event.ctrlKey && this.checkSelect) {
        // 回退
        this.undo();
        // 阻止默认行为，例如防止浏览器保存页面
        event.preventDefault();
      }
      if (key === 'y' && event.ctrlKey && this.checkSelect) {
        // 重做
        this.redo();
        // 阻止默认行为，例如防止浏览器保存页面
        event.preventDefault();
      }
      if (key === 'delete' && this.checkSelect) {
        let extent: any = this.checkSelect.getGeometry()?.getExtent();
        extent = extent ? this.earth.map.getPixelFromCoordinate([extent[0], extent[3]]) : [0, 0];
        // 删除
        this.handleRemoveEvent(extent);
        // 阻止默认行为，例如防止浏览器保存页面
        event.preventDefault();
      }
      if (key.toLowerCase() === 'c' && event.ctrlKey && this.checkSelect) {
        // 复制
        this.copyFeature = cloneDeep(this.checkSelect);
        // 设置标牌
        this.helpTooltipEl!.innerHTML = this.buildTransformBaseTooltip();
        // 阻止默认行为，例如防止浏览器保存页面
        event.preventDefault();
      }
      if (key.toLowerCase() === 'v' && event.ctrlKey && this.copyFeature) {
        // 粘贴
        if (this.checkSelect) {
          let extent: any = this.checkSelect.getGeometry()?.getExtent();
          extent = extent ? this.earth.map.getPixelFromCoordinate([extent[0], extent[3]]) : [0, 0];
          this.transforms.exitEdit(extent);
        }
        // 优先使用最近一次 pointermove 记录的像素
        let pixel: number[] | undefined = this.lastPointerPixel ? [...this.lastPointerPixel] : undefined;
        if (!pixel) {
          // 回退：使用地图中心像素
          try {
            const size = this.earth.map.getSize();
            if (size) pixel = [size[0] / 2, size[1] / 2];
          } catch (_) {
            pixel = [0, 0];
          }
        }
        if (pixel) this.handleCopyEvent(this.copyFeature, pixel);
        // 阻止默认行为，例如防止浏览器保存页面
        event.preventDefault();
      }
      if (key.toLowerCase() === 'x' && event.ctrlKey && this.checkSelect) {
        // 剪切
        this.copyFeature = cloneDeep(this.checkSelect);
        let extent: any = this.checkSelect.getGeometry()?.getExtent();
        extent = extent ? this.earth.map.getPixelFromCoordinate([extent[0], extent[3]]) : [0, 0];
        // 删除
        this.handleRemoveEvent(extent);
        // 设置鼠标默认样式
        this.earth.setMouseStyleToDefault();
        // 阻止默认行为，例如防止浏览器保存页面
        event.preventDefault();
      }
    });
  }

  /**
   * 监听 pointermove 记录最后的像素位置
   */
  private setupPointerTrack() {
    try {
      this.pointerMoveKey = this.earth.map.on('pointermove', (evt: any) => {
        if (evt && Array.isArray(evt.pixel)) {
          this.lastPointerPixel = evt.pixel.slice();
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * 工具栏位置同步：缩放 / 平移 / 旋转地图时，依据当前 bbox 重新定位工具栏。
   *
   * 点要素（如 Billboard 图标）的 bbox 角点由像素偏移换算而来、随分辨率变化；
   * 工具栏 Overlay 锚定在该角点，若仅在变换事件中更新，缩放时角点坐标已变而 Overlay 仍停在旧坐标，
   * 表现为"工具栏不跟随"。这里在 moveend / resolution / rotation 变化时按最新 bbox 重新定位。
   *
   * 依赖 TransformInteraction 在 resolution / rotation 变化时已先行重绘 bbox（其监听先注册、先触发）。
   */
  private setupToolbarSync() {
    const map = this.earth.map;
    const view = map.getView();
    const sync = () => this.syncToolbarPosition();
    this.toolbarSyncKeys.push(map.on('moveend', sync) as EventsKey);
    this.toolbarSyncKeys.push(view.on('change:resolution', sync) as EventsKey);
    this.toolbarSyncKeys.push(view.on('change:rotation', sync) as EventsKey);
  }

  /**
   * 按当前 bbox 角点重新定位工具栏（无工具栏或无 bbox 时跳过）
   */
  private syncToolbarPosition() {
    if (!this.toolbar) return;
    const bbox = this.transforms?.getBoundingBoxFeature?.();
    if (!bbox) return;
    const geom = bbox.getGeometry?.();
    if (!geom) return;
    const coords = geom.getCoordinates?.();
    const point = coords && coords[0] && coords[0][2];
    if (!point) return;
    this.toolbar.updateOptions({ point });
  }

  /**
   * 内部原子事件处理 + 组装回调参数 + 分发
   */
  private handleRawEvent(eventName: ETransform, e: any) {
    if (this.disposed) return; // 已销毁直接忽略事件
    let callbackParam: ITransformCallback | null = null;
    // 事件集合分类，避免多处重复判断
    const startEvents = new Set([ETransform.TranslateStart, ETransform.RotateStart, ETransform.ScaleStart]);
    const progressingEvents = new Set([ETransform.Translating, ETransform.Rotating, ETransform.Scaling]);
    const endEvents = new Set([ETransform.TranslateEnd, ETransform.RotateEnd, ETransform.ScaleEnd]);
    const modifyEvents = new Set([ETransform.ModifyStart, ETransform.Modifying, ETransform.ModifyEnd]);
    const otherEvents = new Set([ETransform.Undo, ETransform.Redo, ETransform.Remove, ETransform.Copy]);
    // 统一的 feature 参数构建（包含 feature / featurePosition / featureId 等）
    const buildFeatureParam = (): ITransformCallback => ({
      type: eventName,
      eventPosition: toLonLat(this.earth.map.getCoordinateFromPixel(e.pixel)),
      eventPixel: e.pixel,
      featureId: e.feature && e.feature.getId ? e.feature.getId() : '',
      featurePosition: e.feature && this.transformCoordinates(e.feature),
      feature: e.feature
    });
    if (eventName === ETransform.Select) {
      if (this.checkSelect) {
        // 已选中状态再次触发 select 则向 SelectEnd 通道派发一次上一要素的退出事件
        callbackParam = {
          type: ETransform.SelectEnd,
          eventPosition: toLonLat(this.earth.map.getCoordinateFromPixel(e.pixel)),
          eventPixel: e.pixel
        };
        this.dispatchTransformEvent(ETransform.SelectEnd, callbackParam);
      }
      this.checkSelect = e.feature;
      this.checkLayer = this.getLayerByFeature(e.feature);
      this.removeHelpTooltip();
      this.initHelpTooltip(this.baseTransformTipFlag);
      // 进入选中周期，初始化历史记录
      this.resetHistory();
      this.recordSnapshot(e.feature); // 记录初始状态
      // 创建工具栏
      this.createToolbar(e);
      callbackParam = buildFeatureParam();
    } else if (eventName === ETransform.SelectEnd) {
      if (this.checkSelect) {
        callbackParam = {
          type: eventName,
          eventPosition: toLonLat(this.earth.map.getCoordinateFromPixel(e.pixel)),
          eventPixel: e.pixel,
          featureId: this.checkSelect && this.checkSelect.getId() ? this.checkSelect.getId()?.toString() : '',
          featurePosition: this.checkSelect && this.transformCoordinates(this.checkSelect),
          feature: this.checkSelect
        };
      }
      if (this.toolbar) {
        this.toolbar.destroy();
      }
      this.checkSelect = null;
      this.toolbar = null;
      this.checkLayer = null;
      this.removeHelpTooltip();
      this.clearHistory(); // 清空历史
    } else if (eventName === ETransform.EnterHandle) {
      if (!this.checkEnterHandle) {
        this.updateHelpTooltipByCursorType(e);
        callbackParam = {
          type: eventName,
          cursor: e.cursor,
          eventPixel: e.pixel
        };
        this.checkEnterHandle = true;
      }
    } else if (eventName === ETransform.LeaveHandle) {
      if (this.checkEnterHandle) {
        if (this.overlayKey) this.updateHelpTooltip(this.baseTransformTipFlag);
        else this.removeHelpTooltip();
        callbackParam = {
          type: eventName,
          cursor: e.cursor,
          eventPixel: e.pixel
        };
        this.checkEnterHandle = false;
      }
    } else if (startEvents.has(eventName)) {
      // Start 类事件
      this.handleEventStart(eventName, e);
      callbackParam = buildFeatureParam();
    } else if (progressingEvents.has(eventName)) {
      // 中间进行中事件
      if (eventName === ETransform.Translating) {
        this.updateHelpTooltip('平移中...');
      } else if (eventName === ETransform.Rotating) {
        this.updateHelpTooltip(`旋转中...当前：${Utils.rad2deg(-e.angle).toFixed(0)}°`);
      } else if (eventName === ETransform.Scaling) {
        this.updateHelpTooltip('缩放中...');
      }
      this.handleEventing(eventName, e);
      // 更新工具栏位置
      if (this.toolbar) {
        this.toolbar.updateOptions({ point: e.bboxExtent[0][2] });
      }
      callbackParam = buildFeatureParam();
    } else if (endEvents.has(eventName)) {
      // 结束事件
      this.updateHelpTooltipByCursorType(e);
      this.handleEventEnd(eventName, e);
      callbackParam = buildFeatureParam();
      // 每次结束一次原子操作时，记录一次快照（避免在进行中大量记录）
      if (e.feature) this.recordSnapshot(e.feature, eventName);
      // 更新工具栏undo/redo状态
      if (this.toolbar) {
        this.toolbar.updateItem('undo', { disabled: !this.history.canUndo });
        this.toolbar.updateItem('redo', { disabled: !this.history.canRedo });
      }
    } else if (modifyEvents.has(eventName)) {
      callbackParam = {
        type: eventName,
        eventPosition: toLonLat(this.earth.map.getCoordinateFromPixel(e.pixel)),
        eventPixel: e.pixel,
        featureId: e.feature && e.feature.getId ? e.feature.getId() : '',
        featurePosition: e.position ? e.position : this.transformCoordinates(e.feature),
        feature: e.feature,
        plotParam: e.plotParam
      };
      // 线编辑过程中，同步更新平行叠加线
      const feature = e.feature as Feature | undefined;
      const layerType = feature?.get?.('layerType');
      if (feature && layerType === 'Polyline' && (eventName === ETransform.Modifying || eventName === ETransform.ModifyEnd)) {
        const layer = this.getLayerByFeature(feature) as PolylineLayer | null;
        const id = feature.getId?.();
        const geom = feature.getGeometry?.() as unknown as { getCoordinates?: () => Coordinate[] };
        const coords = (e.position || geom?.getCoordinates?.()) as Coordinate[] | undefined;
        if (layer && id && Array.isArray(coords) && coords.length) {
          layer.setPosition(String(id), coords);
        }
      }
    } else if (otherEvents.has(eventName)) {
      this.checkSelect = e.feature;
      callbackParam = {
        type: eventName,
        featureId: e.feature && e.feature.getId ? e.feature.getId() : '',
        featurePosition: e.feature && this.transformCoordinates(e.feature),
        feature: e.feature
      };
    }

    // 分发事件
    if (callbackParam) this.dispatchTransformEvent(eventName, callbackParam);
  }
  /**
   * 分发转换事件（包装错误处理，精简主流程）
   */
  private dispatchTransformEvent(eventName: ETransform, param: ITransformCallback) {
    const listeners = this.listenerMap.get(eventName);
    if (!listeners || !listeners.size) return;
    listeners.forEach((fn) => {
      try {
        fn(param);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Transform:on] listener error:', err);
      }
    });
  }
  /**
   * 处理变换事件开始前的逻辑
   */
  private handleEventStart(eventName: ETransform, e: any) {
    const type = e.feature?.getGeometry()?.getType();
    const param = e.feature?.get('param');
    if (eventName === ETransform.TranslateStart || eventName === ETransform.ScaleStart) {
      if (type && param && this.checkLayer) {
        let layer;
        if (type == 'Point' || type == 'MultiPoint') {
          layer = this.checkLayer as PointLayer;
          if (param.isFlash) layer.stopFlash(e.feature.getId());
        }
        // 记录平移开始时的 plotPoints 快照（仅在存在 plotPoints 时）
        if (eventName === ETransform.TranslateStart && param?.plotPoints && Array.isArray(param.plotPoints) && param.plotPoints.length) {
          try {
            const geom = e.feature.getGeometry();
            let center: Coordinate | null = null;
            if (geom) {
              const gType = geom.getType?.();
              if (gType === 'Circle') center = (geom as any).getCenter();
              else if (typeof geom.getExtent === 'function') {
                const extent = geom.getExtent();
                if (extent && extent.length === 4) center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
              }
            }
            if (center) {
              this.translatePlotSnapshot = {
                featureId: String(e.feature.getId?.() || ''),
                basePlotPoints: (param.plotPoints as Coordinate[]).map((p: Coordinate) => [p[0], p[1]] as Coordinate),
                baseCenter: [center[0], center[1]] as Coordinate
              };
            }
          } catch (_) {
            this.translatePlotSnapshot = null;
          }
        }
      }
    }
  }
  /**
   * 处理变换事件进行中的逻辑
   */
  private handleEventing(eventName: ETransform, e: any) {
    // const type = e.feature?.getGeometry()?.getType();
    // const param = e.feature?.get('param');
    // 平移进行中：同步 plotPoints
    if (eventName === ETransform.Translating && this.translatePlotSnapshot && e.feature) {
      const snap = this.translatePlotSnapshot;
      const fid = e.feature.getId?.();
      if (fid && String(fid) === snap.featureId) {
        const param = e.feature.get('param');
        if (param?.plotPoints && Array.isArray(param.plotPoints)) {
          try {
            const geom = e.feature.getGeometry();
            let newCenter: Coordinate | null = null;
            if (geom) {
              const gType = geom.getType?.();
              if (gType === 'Circle') newCenter = (geom as any).getCenter();
              else if (typeof geom.getExtent === 'function') {
                const extent = geom.getExtent();
                if (extent && extent.length === 4) newCenter = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
              }
            }
            if (newCenter) {
              param.plotPoints = this.translatePlotPoints(snap.basePlotPoints, snap.baseCenter, newCenter);
              // 回写最新 param
              e.feature.set('param', param);
            }
          } catch (_) {
            /* ignore */
          }
        }
      }
    }
    // 变换进行中：同步 Polyline
    if ((eventName === ETransform.Translating || eventName === ETransform.Rotating || eventName === ETransform.Scaling) && e.feature) {
      this.syncPolylineFeaturePosition(e.feature);
    }
  }
  /**
   * 处理变换事件结束的逻辑
   */
  private handleEventEnd(eventName: ETransform, e: any) {
    const type = e.feature?.getGeometry()?.getType();
    const param = e.feature?.get('param');
    if (eventName === ETransform.TranslateEnd || eventName === ETransform.ScaleEnd) {
      if (type && param && this.checkLayer) {
        let layer;
        if (type == 'Point' || type == 'MultiPoint') {
          layer = this.checkLayer as PointLayer;
          if (param.isFlash) {
            layer.continueFlash(e.feature.getId());
          }
        }
        // 平移结束后清理 plotPoints 快照
        if (eventName === ETransform.TranslateEnd) {
          this.translatePlotSnapshot = null;
        }
      }
    }
    if ((eventName === ETransform.TranslateEnd || eventName === ETransform.RotateEnd || eventName === ETransform.ScaleEnd) && e.feature) {
      this.syncPolylineFeaturePosition(e.feature);
    }
  }

  /**
   * 将 Transform 中的 Polyline 几何变更同步回图层
   */
  private syncPolylineFeaturePosition(feature?: Feature): void {
    if (!feature) return;
    if (feature.get?.('layerType') !== 'Polyline') return;
    const layer = this.getLayerByFeature(feature) as PolylineLayer | null;
    const id = feature.getId?.();
    if (!layer || !id) return;
    const geom = feature.getGeometry?.() as unknown as { getCoordinates?: () => Coordinate[] };
    const coords = geom?.getCoordinates?.();
    if (!Array.isArray(coords) || !coords.length) return;
    layer.setPosition(String(id), coords);
  }
  /**
   * 根据起始中心与当前中心计算偏移并将 basePlotPoints 平移（处理 world wrap 最短距离）
   */
  private translatePlotPoints(basePlotPoints: Coordinate[], baseCenter: Coordinate, newCenter: Coordinate): Coordinate[] {
    if (!basePlotPoints || !basePlotPoints.length) return [];
    const map = this.earth.map;
    let worldWidth: number | undefined;
    let minX: number | undefined;
    let maxX: number | undefined;
    try {
      const extent = map.getView().getProjection().getExtent?.();
      if (extent) {
        worldWidth = extent[2] - extent[0];
        minX = extent[0];
        maxX = extent[2];
      }
    } catch (_) {
      /* ignore */
    }
    const shortestDeltaX = (from: number, to: number): number => {
      if (!worldWidth || !isFinite(worldWidth)) return to - from;
      let dx = to - from;
      if (dx > worldWidth / 2) dx -= worldWidth;
      else if (dx < -worldWidth / 2) dx += worldWidth;
      return dx;
    };
    const dx = shortestDeltaX(baseCenter[0], newCenter[0]);
    const dy = newCenter[1] - baseCenter[1];
    // 目标 world 索引（以 newCenter 为准）
    const targetWorld = worldWidth ? Utils.getWorldIndex(this.earth.map, newCenter[0]) : undefined;
    return basePlotPoints.map((p) => {
      const nx = p[0] + dx;
      const ny = p[1] + dy;
      if (worldWidth && targetWorld !== undefined) {
        const curWorld = Utils.getWorldIndex(this.earth.map, nx);
        if (curWorld !== undefined && curWorld !== targetWorld) {
          const dw = targetWorld - curWorld;
          return [nx + dw * worldWidth, ny] as Coordinate;
        }
      }
      return [nx, ny] as Coordinate;
    });
  }

  /**
   * 计算复制场景下坐标平移结果（与拖拽平移一致，处理 world wrap 最短距离）
   * - Point/Billboard/Circle: Coordinate
   * - Polyline: Coordinate[]
   * - Polygon: Coordinate[][]
   */
  private translateGeometryByCenter(baseCoords: any, baseCenter: Coordinate, newCenter: Coordinate): any {
    if (!baseCoords) return baseCoords;
    const map = this.earth.map;
    let worldWidth: number | undefined;
    try {
      const extent = map.getView().getProjection().getExtent?.();
      if (extent) {
        worldWidth = extent[2] - extent[0];
      }
    } catch (_) {
      /* ignore */
    }
    const shortestDeltaX = (from: number, to: number): number => {
      if (!worldWidth || !isFinite(worldWidth)) return to - from;
      let dx = to - from;
      if (dx > worldWidth / 2) dx -= worldWidth;
      else if (dx < -worldWidth / 2) dx += worldWidth;
      return dx;
    };
    const dx = shortestDeltaX(baseCenter[0], newCenter[0]);
    const dy = newCenter[1] - baseCenter[1];
    const targetWorld = worldWidth ? Utils.getWorldIndex(this.earth.map, newCenter[0]) : undefined;

    const normalizeXToTargetWorld = (x: number): number => {
      if (!worldWidth || targetWorld === undefined) return x;
      const curWorld = Utils.getWorldIndex(this.earth.map, x);
      if (curWorld === undefined || curWorld === targetWorld) return x;
      return x + (targetWorld - curWorld) * worldWidth;
    };

    const shiftPoint = (p: Coordinate): Coordinate => {
      const nx = normalizeXToTargetWorld(p[0] + dx);
      const ny = p[1] + dy;
      return [nx, ny] as Coordinate;
    };

    // Coordinate
    if (Array.isArray(baseCoords) && baseCoords.length >= 2 && typeof baseCoords[0] === 'number') {
      return shiftPoint(baseCoords as Coordinate);
    }
    // Coordinate[]
    if (Array.isArray(baseCoords) && Array.isArray(baseCoords[0]) && typeof baseCoords[0][0] === 'number') {
      return (baseCoords as Coordinate[]).map((p) => shiftPoint(p));
    }
    // Coordinate[][]
    if (Array.isArray(baseCoords) && Array.isArray(baseCoords[0]) && Array.isArray(baseCoords[0][0])) {
      return (baseCoords as Coordinate[][]).map((ring) => ring.map((p) => shiftPoint(p as Coordinate)));
    }
    return baseCoords;
  }
  /**
   * 根据几何类型与坐标数组计算中心（复制时用于 plotPoints 平移）
   * 支持: Point / BillBoard 使用单点, Polygon/Polyline 使用包围盒中心, Circle 使用 center
   */
  private calcCenterByType(type: string, coords: any): Coordinate | null {
    try {
      if (!coords) return null;
      if (type === 'Point' || type === 'Billboard') {
        return coords as Coordinate;
      } else if (type === 'Circle') {
        // Circle 在复制逻辑里 baseCoords 即 center
        return coords as Coordinate;
      } else if (type === 'Polygon' || type === 'Polyline') {
        // 允许 positions 为 (Coordinate[]) 或包含洞的 (Coordinate[][]) 这里取第一层遍历
        const flat: Coordinate[] = Array.isArray(coords)
          ? Array.isArray(coords[0]) && typeof coords[0][0] !== 'number'
            ? (coords as Coordinate[][]).flat()
            : (coords as Coordinate[])
          : [];
        if (!flat.length) return null;
        let minX = flat[0][0];
        let maxX = flat[0][0];
        let minY = flat[0][1];
        let maxY = flat[0][1];
        for (let i = 1; i < flat.length; i++) {
          const [x, y] = flat[i];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        return [(minX + maxX) / 2, (minY + maxY) / 2];
      }
    } catch (_) {
      return null;
    }
    return null;
  }
  /**
   * 创建工具栏
   */
  private createToolbar(e: any) {
    if (this.toolbar) {
      this.toolbar.destroy();
    }
    const params = {
      point: e.bboxExtent[0][2],
      type: e.feature?.getGeometry()?.getType()
    };
    this.toolbar = new Toolbar(params, this.earth);
    const toolbarRoot = document.querySelector('.ol-toolbar');
    toolbarRoot?.addEventListener('toolbar:itementer', (e: any) => {
      this.updateHelpTooltip(e.detail.item.title);
    });
    toolbarRoot?.addEventListener('toolbar:itemleave', (e: any) => {
      this.updateHelpTooltip(this.baseTransformTipFlag);
    });
    toolbarRoot?.addEventListener('toolbar:itemclick', (e: any) => {
      this.handleToolbarClick(e.detail, e.detail.pixel);
    });
  }
  /**
   * 处理工具栏按钮点击事件
   */
  private handleToolbarClick(detail: any, pixel: number[]) {
    const key = detail.key;
    const menuItem = detail.item as IToolbarItem;
    this.updateHelpTooltip(this.baseTransformTipFlag);
    if (key === 'undo') {
      this.undo();
    } else if (key === 'redo') {
      this.redo();
    } else if (key === 'exit') {
      this.transforms.exitEdit(pixel);
    } else if (key === 'remove') {
      this.handleRemoveEvent(pixel);
    } else if (key === 'copy') {
      // 对选中要素做一次深拷贝作为“复制源快照”，避免后续对原图的编辑影响复制源。
      // 说明：lodash.cloneDeep 对 OL Feature 通过 Object.create(prototype) 保留原型，
      // get/getGeometry/getId 等方法及几何类型均可正常使用（实测安全），可放心读取几何与属性。
      this.copyFeature = cloneDeep(this.checkSelect);
      this.handleCopyEvent(this.copyFeature);
      this.transforms.exitEdit(pixel);
    } else if (key === 'edit') {
      // 开始要素编辑
      // 创建绘制工具
      const draw = new DynamicDraw(this.earth);
      // 获取元素类型
      const checkSelect = this.checkSelect;
      const geom = checkSelect?.getGeometry();
      const type = geom?.getType();
      this.handleRawEvent(ETransform.ModifyStart, { feature: checkSelect, pixel: pixel });
      if (type === 'Polygon') {
        const plotType = checkSelect?.get('param')?.plotType;
        if (plotType) {
          switch (plotType) {
            case 'attackArrow':
              draw.editAttackArrow({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'tailedAttackArrow':
              draw.editTailedAttackArrow({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'fineArrow':
              draw.editFineArrow({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'tailedSquadCombatArrow':
              draw.editTailedSquadCombatArrow({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'assaultDirectionArrow':
              draw.editAssaultDirectionArrow({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'doubleArrow':
              draw.editDoubleArrow({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'assemblePolygon':
              draw.editAssemblePolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'closedCurvePolygon':
              draw.editClosedCurvePolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'ellipse':
              draw.editEllipse({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'sectorPolygon':
              draw.editSectorPolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'lunePolygon':
              draw.editLunePolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'rectAnglePolygon':
              draw.editRectAnglePolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'trianglePolygon':
              draw.editTrianglePolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'equilateralTrianglePolygon':
              draw.editEquilateralTrianglePolygon({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
          }
        } else {
          draw.editPolygon({
            feature: checkSelect!,
            isShowUnderlay: true,
            callback: (ev) => {
              if (ev.type === ModifyType.Modifying) {
                const arr: Coordinate[] = [];
                for (const item of ev.position!) {
                  arr.push(fromLonLat(item as Coordinate));
                }
                this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, position: arr, pixel: pixel });
              } else if (ev.type === ModifyType.Modifyexit) {
                draw.remove();
                this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, pixel: pixel });
              }
            }
          });
        }
      } else if (type === 'LineString') {
        const plotType = checkSelect?.get('param')?.plotType;
        if (plotType) {
          switch (plotType) {
            case 'luneLine':
              draw.editLunePolyline({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
            case 'curvePolyline':
              draw.editCurvePolyline({
                feature: checkSelect!,
                callback: (ev) => {
                  if (ev.type === ModifyType.Modifying) {
                    this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  } else if (ev.type === ModifyType.Modifyexit) {
                    this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, plotParam: ev.plotParam, pixel: pixel });
                  }
                }
              });
              break;
          }
        } else {
          draw.editPolyline({
            feature: checkSelect!,
            isShowUnderlay: true,
            callback: (ev) => {
              if (ev.type === ModifyType.Modifying) {
                const arr: Coordinate[] = [];
                for (const item of ev.position!) {
                  arr.push(fromLonLat(item as Coordinate));
                }
                this.handleRawEvent(ETransform.Modifying, { feature: checkSelect, position: arr, pixel: pixel });
              } else if (ev.type === ModifyType.Modifyexit) {
                draw.remove();
                this.handleRawEvent(ETransform.ModifyEnd, { feature: checkSelect, pixel: pixel });
              }
            }
          });
        }
      }
      // 退出编辑模式
      this.transforms.exitEdit(pixel);
    }
  }
  /**
   * 处理元素复制
   */
  private handleCopyEvent(feature: any, pixel?: number[]) {
    this.clearCopyListeners();
    if (!feature) return;
    const type: string = feature.get('layerType');
    const originParam = cloneDeep(feature.get('param')) || {};
    const layer = this.getLayerByFeature(feature) as any;
    if (!layer) return;
    // 预取原始几何坐标，避免每帧读取 geometry
    const geom = feature.getGeometry();
    if (!geom) return;
    const baseCoords = type === 'Circle' ? (geom as any).getCenter() : (geom as any).getCoordinates ? (geom as any).getCoordinates() : null;
    if (!baseCoords) return;
    // 复制开始前记录 plotPoints 与 baseCenter 快照（供后续平移使用）
    const basePlotPoints: Coordinate[] | undefined = Array.isArray(originParam.plotPoints)
      ? originParam.plotPoints.map((p: Coordinate) => [p[0], p[1]] as Coordinate)
      : undefined;
    const baseCenter: Coordinate | null = this.calcCenterByType(type, baseCoords);
    // 节流（约 60fps -> wait ~16ms）
    const moveHandler = Utils.throttle(
      (evt: { pixel: number[] }) => {
        this.updateHelpTooltip('点击地图完成复制,右键地图退出复制');
        let newValue: any = null;
        const pixelCenter = this.earth.map.getCoordinateFromPixel(evt.pixel);
        if (type === 'Point' || type === 'Billboard') {
          newValue = Utils.getFeatureToPixel(this.earth.map, evt.pixel, baseCoords);
          originParam.center = newValue;
        } else if (type === 'Polygon' || type === 'Polyline') {
          if (baseCenter && pixelCenter) {
            newValue = this.translateGeometryByCenter(baseCoords, baseCenter, pixelCenter as Coordinate);
          } else {
            newValue = Utils.getFeatureToPixel(this.earth.map, evt.pixel, baseCoords);
          }
          originParam.positions = newValue;
        } else if (type === 'Circle') {
          newValue = Utils.getFeatureToPixel(this.earth.map, evt.pixel, baseCoords);
          originParam.center = newValue; // center
        }
        // 平移过程中同步 plotPoints（若存在）
        if (basePlotPoints && basePlotPoints.length && baseCenter) {
          const newCenter = this.calcCenterByType(type, newValue);
          if (newCenter) {
            originParam.plotPoints = this.translatePlotPoints(basePlotPoints, baseCenter, newCenter);
          }
        }
        if (!this.copyStatus) {
          originParam.id = Utils.GetGUID();
          // 初次创建：add 一次
          layer.add(originParam);
          this.copyStatus = { id: originParam.id };
        } else if (originParam.id) {
          // 更新位置（优先 center 否则 positions）
          layer.setPosition?.(originParam.id, originParam.center || originParam.positions);
        }
      },
      16,
      { leading: true, trailing: true }
    );
    if (!pixel) {
      const globalEvent = this.earth.useGlobalEvent();
      this.copyMoveDisposer = globalEvent.addMouseMoveEventByGlobal((event) => moveHandler(event));

      this.copyConfirmDisposer = globalEvent.addCancelableMouseOnceClickEventByGlobal((event) => {
        // 确定复制要素
        this.clearCopyListeners();
        moveHandler.flush?.();
        this.copyStatus = null;
        // 触发copy事件通知外部
        this.handleRawEvent(ETransform.Copy, { feature: layer.get(originParam.id) ? layer.get(originParam.id)[0] : null, pixel: event.pixel });
        this.removeHelpTooltip();
      });
      this.copyCancelDisposer = globalEvent.addCancelableMouseOnceRightClickEventByGlobal(() => {
        // 取消复制
        this.clearCopyListeners();
        moveHandler.cancel?.();
        // 仅在已创建副本（copyStatus 非 null）时才移除该副本；
        // 若用户未移动鼠标即右键取消，moveHandler 尚未执行、copyStatus 为 null，
        // 此时不可调用 layer.remove(undefined) —— 否则会触发 Base.remove 的清空整层逻辑，导致数据丢失。
        if (this.copyStatus?.id) {
          layer.remove(this.copyStatus.id);
        }
        this.copyStatus = null;
      });
    } else {
      let newValue: any = Utils.getFeatureToPixel(this.earth.map, pixel, baseCoords);
      const pixelCenter = this.earth.map.getCoordinateFromPixel(pixel);
      if (type === 'Point' || type === 'Billboard') {
        originParam.center = newValue;
      } else if (type === 'Polygon' || type === 'Polyline') {
        if (baseCenter && pixelCenter) {
          newValue = this.translateGeometryByCenter(baseCoords, baseCenter, pixelCenter as Coordinate);
        }
        originParam.positions = newValue;
      } else if (type === 'Circle') {
        originParam.center = newValue; // center
      }
      // 直接粘贴（一次性）也需要同步 plotPoints
      if (basePlotPoints && basePlotPoints.length && baseCenter) {
        const newCenter = this.calcCenterByType(type, newValue);
        if (newCenter) {
          originParam.plotPoints = this.translatePlotPoints(basePlotPoints, baseCenter, newCenter);
        }
      }
      originParam.id = Utils.GetGUID();
      // 初次创建：add 一次
      layer.add(originParam);
      // 触发copy事件通知外部
      this.handleRawEvent(ETransform.Copy, { feature: layer.get(originParam.id) ? layer.get(originParam.id)[0] : null, pixel: pixel });
    }
  }
  /** 释放复制预览阶段注册的全部全局监听 */
  private clearCopyListeners() {
    this.copyMoveDisposer?.();
    this.copyConfirmDisposer?.();
    this.copyCancelDisposer?.();
    this.copyMoveDisposer = undefined;
    this.copyConfirmDisposer = undefined;
    this.copyCancelDisposer = undefined;
  }
  /**
   * 外部替换当前正在编辑（已选中）的 feature
   * 使用场景：外部在某个事件（如 TranslateEnd）中删除原要素并重绘一个新要素，
   * 需让交互继续作用到新要素，避免后续旋转/缩放/编辑失效。
   *
   * 参数：
   * - newFeature: 新的要素实例（应当已添加到对应图层的 source 中）
   * - options.retainHistory: 是否保留当前历史栈（默认 true）。
   *   若为 false，将重置历史，只以 newFeature 的当前状态为初始快照。
   *
   * 返回：成功替换返回 true，失败返回 false。
   */
  public replaceEditingFeature(newFeature: Feature, options?: { retainHistory?: boolean }): boolean {
    if (this.disposed) return false;
    const retainHistory = options?.retainHistory !== false; // 默认保留历史
    if (!newFeature) return false;
    // 计算并更新内部选中引用
    const layer = this.getLayerByFeature(newFeature);
    if (!layer) return false;
    // 若配置了 transformFeatures，确保新要素在列表中，并移除旧要素引用
    try {
      if (Array.isArray(this.options.transformFeatures)) {
        const list = this.options.transformFeatures as Feature[];
        const newId = newFeature.getId?.();
        // 移除与当前选中 id 相同的旧项
        if (this.checkSelect?.getId && this.checkSelect.getId()) {
          const oldId = this.checkSelect.getId();
          this.options.transformFeatures = list.filter((ft) => ft && ft.getId?.() !== oldId);
        }
        // 若列表中没有新要素则追加
        const exists = list.some((ft) => ft && ft.getId?.() === newId);
        if (!exists) {
          this.options.transformFeatures = [...(this.options.transformFeatures || []), newFeature];
        }
      }
    } catch (_) {
      /* ignore */
    }
    this.checkSelect = newFeature;
    this.checkLayer = layer;

    // 尝试通知交互实例使用新的 feature
    // 兼容不同实现：优先公开方法，其次私有属性兜底，并强制刷新草图
    try {
      if (this.transforms) {
        // 使用交互的公开 API：直接设置当前选择集合为新要素
        if (typeof this.transforms.setSelection === 'function') {
          this.transforms.setSelection([newFeature]);
        } else if (typeof this.transforms.select === 'function') {
          this.transforms.select(newFeature, false);
        } else {
          // 兜底：强制重绘（不如 setSelection 可靠）
          if (typeof this.transforms.refreshSketch === 'function') this.transforms.refreshSketch();
        }
      }
    } catch (_) {
      // 忽略交互刷新异常
    }

    // 根据选择保留或重置历史
    if (!retainHistory) {
      this.resetHistory();
      this.recordSnapshot(newFeature);
    } else {
      // 保留已有历史，但追加一次当前要素的快照，保证撤销点正确对齐新要素
      this.recordSnapshot(newFeature);
    }

    // 刷新工具条位置与类型
    try {
      const geom = newFeature.getGeometry?.();
      const rawType = geom?.getType?.();
      const type: 'Point' | 'LineString' | 'Polygon' | 'Circle' | undefined =
        rawType === 'Point' || rawType === 'LineString' || rawType === 'Polygon' || rawType === 'Circle' ? (rawType as any) : undefined;
      let anchor: Coordinate | undefined;
      if (geom && typeof geom.getExtent === 'function') {
        const extent = geom.getExtent();
        if (extent && extent.length === 4) {
          anchor = [extent[2], extent[3]] as Coordinate; // 使用右上角近似位置
        }
      }
      // 优先使用交互的 bbox 信息
      let point: any = undefined;
      try {
        const bboxExtent = this.transforms?.getBoundingBoxFeature?.()?.getGeometry().getCoordinates?.();
        point = bboxExtent?.[0]?.[2] ?? bboxExtent?.[0]?.[0];
      } catch (_) {
        /* ignore */
      }
      // 重建或更新工具条
      const tbPoint = point ?? anchor;
      if (!this.toolbar) {
        const opts: any = { point: tbPoint };
        if (type) opts.type = type;
        this.toolbar = new Toolbar(opts, this.earth);
      } else {
        const opts: any = { point: tbPoint };
        if (type) opts.type = type;
        this.toolbar.updateOptions(opts);
      }
    } catch (_) {
      /* ignore */
    }

    // 刷新提示牌（仍处于编辑模式）
    try {
      this.updateHelpTooltipByCursorType({ type: ETransform.Select, eventPixel: this.lastPointerPixel } as any);
      this.refreshBaseTransformTooltipIfNeeded();
    } catch (_) {
      /* ignore */
    }

    // 无需手动派发 Select：setSelection/select 已在交互内部派发

    return true;
  }
  /**
   * 处理删除事件
   */
  private handleRemoveEvent(pixel: number[]) {
    if (this.checkSelect && this.checkLayer) {
      this.checkLayer.remove(this.checkSelect.getId() as string);
      this.handleRawEvent(ETransform.Remove, { feature: cloneDeep(this.checkSelect) });
      this.transforms.exitEdit(pixel);
    }
  }
  /**
   * 记录当前要素几何快照
   */
  private recordSnapshot(feature?: Feature, eventName?: ETransform) {
    if (!feature) return;
    const id = feature.getId?.();
    if (!id) return;
    // 创建要素深拷贝（clone 不会保留 id，需要手动设置）
    const featureClone = feature.clone();
    featureClone.set('param', cloneDeep(feature.get('param')));
    featureClone.setId(id);
    // 记录样式（用于点要素缩放/旋转等仅样式变化的撤销恢复）
    try {
      const style: any = feature.getStyle?.();
      if (style) {
        const styleClone = cloneStyleSnapshot(style);
        featureClone.set('styleSnapshot', styleClone);
        // 对 Point：若 param.size 缺失，补齐当前半径（避免初始 size 未写入导致撤销无法恢复）
        const geomType = feature.getGeometry()?.getType();
        if (geomType === 'Point' || geomType === 'MultiPoint') {
          const paramClone: any = featureClone.get('param');
          if (paramClone && paramClone.size == null) {
            const image = style.getImage?.();
            if (image) {
              // Circle / RegularShape 半径
              if (typeof image.getRadius === 'function') {
                const r = image.getRadius();
                if (r != null) paramClone.size = r;
              } else if (typeof image.getScale === 'function') {
                const sc: any = image.getScale();
                if (typeof sc === 'number') paramClone.size = sc; // 退化：无半径，使用缩放值记录
              }
              featureClone.set('param', paramClone);
            }
          }
        }
      }
    } catch (_) {
      /* 忽略样式克隆失败 */
    }
    // 如果与最近一次快照几何一致则跳过
    const last = this.history.current;
    if (last) {
      const lastGeom = last.feature.getGeometry();
      const currentGeom = featureClone.getGeometry();
      if (lastGeom && currentGeom) {
        const same = geometriesEqual(lastGeom, currentGeom);
        if (same) {
          const geomType = currentGeom.getType?.();
          const isPointLike = geomType === 'Point' || geomType === 'MultiPoint';
          const isCircle = geomType === 'Circle';
          const isScaleOrRotateEnd = eventName === ETransform.ScaleEnd || eventName === ETransform.RotateEnd;
          // 对 Point / Circle 的缩放或旋转操作，即使几何坐标未变化，也需要记录（样式 / 半径 / 旋转等可能变化）
          if (!(isScaleOrRotateEnd && (isPointLike || isCircle))) {
            return; // 其他类型或情况保持原逻辑：坐标未变不入栈
          }
        }
      }
    }
    // 控制栈长度
    this.history.record({ id: String(id), feature: featureClone });
    // 新的操作产生后，清空 redo 栈
    this.refreshBaseTransformTooltipIfNeeded();
  }
  /**
   * 重置（Select 开始时）
   */
  private resetHistory() {
    this.history.clear();
  }
  /**
   * SelectEnd 时清空
   */
  private clearHistory() {
    this.resetHistory();
  }
  /**
   * 撤销
   */
  public undo() {
    const previous = this.history.undo();
    if (!previous) return null;
    const feature = this.applySnapshot(previous);
    if (feature) {
      this.handleRawEvent(ETransform.Undo, { feature });
    }
    this.refreshBaseTransformTooltipIfNeeded();
  }
  /**
   * 重做
   */
  public redo() {
    const snapshot = this.history.takeRedo();
    if (!snapshot) return null;
    // 当前状态（应用前）入历史
    const currentFeature = this.getFeatureById(snapshot.id);
    if (currentFeature) {
      const currentClone = currentFeature.clone();
      currentClone.setId(snapshot.id);
      // 深拷贝 param，避免与当前要素共享引用而被后续修改污染撤销点
      currentClone.set('param', cloneDeep(currentFeature.get('param')));
      this.history.push({ id: snapshot.id, feature: currentClone });
    }
    const feature = this.applySnapshot(snapshot);
    if (feature) {
      this.handleRawEvent(ETransform.Redo, { feature });
    }
    this.refreshBaseTransformTooltipIfNeeded();
  }
  /**
   * 根据 id 获取要素
   */
  private getFeatureById(id: string): Feature | null {
    if (!id) return null;
    // 遍历地图图层（只针对 vector 图层）
    // 由于项目已有 this.earth.getLayer(id) 机制，优先尝试当前选中图层
    if (this.checkLayer) {
      const source: any = (this.checkLayer as any).source || (this.checkLayer as any).getSource?.();
      if (source?.getFeatureById) {
        const f = source.getFeatureById(id);
        if (f) return f;
      }
    }
    // 兜底：遍历 transformFeatures 配置
    const features = this.options.transformFeatures;
    if (features && features.length) {
      const f = features.find((ft) => ft.getId?.() == id);
      if (f) return f;
    }
    return null;
  }
  /**
   * 应用一个快照到对应要素
   */
  private applySnapshot(snapshot?: { id: string; feature: Feature }): Feature | null {
    if (!snapshot || !snapshot.feature) return null;
    const geomSnap = snapshot.feature.getGeometry?.();
    if (!geomSnap) return null;
    const { coords } = extractGeometryInfo(geomSnap);
    const type = snapshot.feature.get('layerType');
    const param = snapshot.feature.get('param');
    if (param && coords && type && this.checkLayer) {
      // 根据具体几何类型安全设置坐标
      let layer;
      if (type == 'Point') {
        layer = this.checkLayer as PointLayer;
        // 还原点的属性（包括缩放、旋转等 style 信息存放在 param 中）
        layer?.set(param);
        // 如果存在几何坐标（极少数情况下）也尝试同步（某些实现 set 不会更新坐标）
        if (coords && Array.isArray(coords) && typeof (coords as any)[0] === 'number') {
          try {
            (layer as any).setPosition?.(param.id, coords);
          } catch (_) {
            /* ignore */
          }
        }
        // 恢复样式快照（点缩放/旋转时几何不变，仅样式变化，需要强制）
        const styleSnapshot = snapshot.feature.get('styleSnapshot');
        if (styleSnapshot && param?.id) {
          const current = this.getFeatureById(param.id);
          if (current) {
            try {
              current.setStyle(styleSnapshot);
            } catch (_) {
              /* ignore */
            }
            // 兜底：若快照图像半径/scale 与现有 param 不一致，再次同步
            try {
              const snapImg: any = styleSnapshot.getImage?.();
              const curStyle: any = current.getStyle?.();
              const curImg = curStyle?.getImage?.();
              if (snapImg && curImg) {
                if (typeof snapImg.getRadius === 'function' && typeof curImg.setRadius === 'function') {
                  const r = snapImg.getRadius?.();
                  if (r != null) curImg.setRadius(r);
                } else if (typeof snapImg.getScale === 'function' && typeof curImg.setScale === 'function') {
                  const sc = snapImg.getScale();
                  if (sc) curImg.setScale(sc);
                }
              }
            } catch (_) {
              /* ignore */
            }
            current.changed();
          }
        }
        // 重绘变换控制框
        try {
          if (this.transforms && typeof this.transforms.refreshSketch === 'function') {
            this.transforms.refreshSketch();
          }
        } catch (_) {
          /* 忽略内部刷新失败 */
        }
      } else if (type == 'Polygon') {
        layer = this.checkLayer as PolygonLayer;
        layer?.setPosition(param.id, coords as Coordinate[][]);
      } else if (type == 'Polyline') {
        layer = this.checkLayer as PolylineLayer;
        layer?.setPosition(param.id, coords as Coordinate[]);
      } else if (type == 'Circle') {
        layer = this.checkLayer as CircleLayer;
        layer?.set(param);
      } else if (type == 'Billboard') {
        layer = this.checkLayer as BillboardLayer;
        // Billboard 的 size 应该是 [width,height]，如果被误写成 number（可能与 Point 混淆）则丢弃让 set 使用旧值
        if (param.size && !Array.isArray(param.size)) {
          delete (param as any).size;
        }
        // anchor 缺失时使用默认 [0.5,0.5]，避免回退时出现错误像素锚点
        if (param.anchor == null) {
          (param as any).anchor = [0.5, 0.5];
        } else if (Array.isArray(param.anchor) && param.anchor.length === 2) {
          // 过滤掉出现异常大值（例如 128,128 误作为像素锚点传入），这里做一个启发式：如果两值都大于 10 认为可能是像素值而非 fraction，转为 fraction
          const [ax, ay] = param.anchor as number[];
          if (ax > 10 && ay > 10) {
            // 不知道原始尺寸时无法精确转换，直接回落默认
            (param as any).anchor = [0.5, 0.5];
          }
        }
        // rotation 若缺失且样式快照里存在则回填
        if (param.rotation == null && (snapshot.feature as any).get('styleSnapshot')) {
          try {
            const sty: any = (snapshot.feature as any).get('styleSnapshot');
            const img = sty?.getImage?.();
            const rot = img?.getRotation?.();
            if (typeof rot === 'number') {
              param.rotation = Utils.rad2deg(rot);
            }
          } catch (_) {
            /* ignore */
          }
        }
        layer?.set(param);
      }
      if (this.toolbar) {
        // 更新工具栏undo/redo状态
        this.toolbar.updateItem('undo', { disabled: !this.history.canUndo });
        this.toolbar.updateItem('redo', { disabled: !this.history.canRedo });
        // 更新工具栏位置
        if (this.transforms?.getBoundingBoxFeature?.()) {
          const bboxExtent = this.transforms.getBoundingBoxFeature()?.getGeometry().getCoordinates();
          this.toolbar.updateOptions({ point: bboxExtent[0][2] });
        }
      }
      return snapshot.feature;
    } else {
      return null;
    }
  }
  /**
   * 根据要素安全获取所属图层
   * 说明：
   *  - 避免多层 if 嵌套
   *  - 统一空值与类型保护
   *  - 返回 null 表示未找到
   */
  private getLayerByFeature(feature?: Feature | null): Base | null {
    if (!feature) return null;
    // 兼容性：某些要素可能不存在 get 方法或未附加属性
    const layerId = feature.get && feature.get('layerId');
    if (!layerId) return null;
    const layer = this.earth.getLayer(layerId);
    return (layer as Base) || null;
  }
  /**
   * 提示牌初始化方法
   */
  private initHelpTooltip(str: string) {
    if (typeof document === 'undefined') return; // SSR 安全
    if (!this.helpTooltipEl) {
      this.helpTooltipEl = document.createElement('div');
      this.helpTooltipEl.className = 'ol-tooltip';
      document.body.appendChild(this.helpTooltipEl);
    }
    if (str === this.baseTransformTipFlag) {
      this.helpTooltipEl.innerHTML = this.buildTransformBaseTooltip();
    } else {
      this.helpTooltipEl.textContent = str;
    }
    // 初次添加 overlay
    if (!this.overlayKey) {
      this.overlay.add({
        id: 'help_tooltip',
        position: this.earth.map.getCoordinateFromPixel([0, -100]),
        element: this.helpTooltipEl,
        offset: [15, -11]
      });
      this.overlayKey = this.earth.map.on('pointermove', (evt) => {
        this.overlay.setPosition('help_tooltip', evt.coordinate);
      });
    } else {
      this.overlay.set({ id: 'help_tooltip', element: this.helpTooltipEl });
    }
  }
  /**
   * 更新提示牌
   */
  private updateHelpTooltip(str: string, pixel?: number[]) {
    if (!this.overlayKey || !this.helpTooltipEl) return;
    if (str === this.baseTransformTipFlag) {
      this.helpTooltipEl.innerHTML = this.buildTransformBaseTooltip();
    } else {
      this.helpTooltipEl.textContent = str;
    }
    const params: ISetOverlayParam = { id: 'help_tooltip', element: this.helpTooltipEl };
    if (pixel) params['position'] = this.earth.map.getCoordinateFromPixel(pixel);
    this.overlay.set(params);
  }
  /**
   * 删除提示牌
   */
  private removeHelpTooltip() {
    if (this.overlayKey) {
      this.overlay.remove('help_tooltip');
      unByKey(this.overlayKey);
      this.overlayKey = undefined;
      if (this.helpTooltipEl && this.helpTooltipEl.parentNode) {
        this.helpTooltipEl.parentNode.removeChild(this.helpTooltipEl);
      }
      this.helpTooltipEl = null;
    }
  }
  /**
   * 转换坐标系
   */
  // 返回值包含多种几何（含 MultiPolygon 可能的 4 级嵌套 & Circle 特殊 center）
  private transformCoordinates(feature: Feature): any {
    const geometry = feature.getGeometry();
    const type = geometry?.getType();
    let coordinates: any = [];
    if (
      geometry instanceof Point ||
      geometry instanceof LineString ||
      geometry instanceof Polygon ||
      geometry instanceof MultiPoint ||
      geometry instanceof MultiLineString ||
      geometry instanceof MultiPolygon
    ) {
      coordinates = geometry.getCoordinates();
    } else if (geometry instanceof CircleGeom) {
      coordinates = geometry.getCenter();
    }
    if (type == 'Point' || type == 'MultiPoint') {
      coordinates = toLonLat(coordinates as Coordinate);
    } else if (type == 'Polygon') {
      coordinates = (coordinates as Coordinate[][]).map((item: Coordinate[]) => {
        item = item.map((items: Coordinate) => {
          items = toLonLat(items);
          return items;
        });
        return item;
      });
    } else if (type == 'MultiPolygon') {
      // MultiPolygon 坐标为 Coordinate[][][]（多面 -> 环 -> 点），需三层遍历
      coordinates = (coordinates as Coordinate[][][]).map((polygon: Coordinate[][]) =>
        polygon.map((ring: Coordinate[]) => ring.map((pt: Coordinate) => toLonLat(pt)))
      );
    } else if (type == 'LineString' || type == 'MultiLineString') {
      coordinates = (coordinates as Coordinate[]).map((item: Coordinate) => {
        item = toLonLat(item);
        return item;
      });
    }
    return coordinates;
  }

  /** 构建基础提示：包含快捷键以及当前可撤销/重做次数 */
  private buildTransformBaseTooltip(): string {
    const undoCount = this.history.undoCount; // 初始快照不计入
    const redoCount = this.history.redoCount;
    const canPaste = !!this.copyFeature;
    const keySpan = (combo: string, label: string, color?: string, disabled?: boolean, extraDesc?: string): string => {
      const style: string[] = [];
      if (color) style.push(`color:${color}`);
      if (disabled) style.push('opacity:0.5');
      const desc = extraDesc ? `${label}${extraDesc}` : label;
      return `<span style="${style.join(';')}">${combo} ${desc}</span>`;
    };
    const baseItems: string[] = [
      keySpan('Ctrl+C', '复制', '#fff'),
      keySpan('Ctrl+V', '粘贴', canPaste ? '#fff' : '#999'),
      keySpan('Ctrl+X', '剪切', '#fff'),
      keySpan('Del', '删除', '#d9363fff'),
      keySpan('Esc', '退出', '#fc972bff')
    ];
    const staticLine = `${this.baseTransformTipFlag}<br/> ${baseItems.join(' | ')}`;
    const dyn: string[] = [];
    if (undoCount > 0) dyn.push(`<span style="color:#ff9800; font-weight: bold;">Ctrl+Z 撤销 (${undoCount})</span>`);
    if (redoCount > 0) dyn.push(`<span style="color:#00bfa5; font-weight: bold;">Ctrl+Y 重做 (${redoCount})</span>`);
    if (!dyn.length) return staticLine;
    return staticLine + '<br/>' + dyn.join(' | ');
  }
  /** 当当前显示基础提示时刷新撤销/重做计数 */
  private refreshBaseTransformTooltipIfNeeded() {
    if (!this.helpTooltipEl) return;
    const txt = this.helpTooltipEl.textContent || '';
    if (txt.startsWith(this.baseTransformTipFlag)) {
      this.updateHelpTooltip(this.baseTransformTipFlag);
    }
  }

  /**
   * 根据鼠标事件类型，更新标牌文本
   */
  private updateHelpTooltipByCursorType(e: ITransformCallback) {
    if (typeof window === 'undefined') return;
    const mapElement = this.earth.map.getTargetElement();
    if (!mapElement) return;
    // 兼容两种来源：对外回调 ITransformCallback 用 eventPixel；TransformInteraction 原始事件用 pixel
    const pixel: number[] | undefined = e.eventPixel ?? (e as any).pixel;
    const cursor = window.getComputedStyle(mapElement).cursor as ECursor;
    switch (cursor) {
      case ECursor.Move:
        this.updateHelpTooltip('鼠标左键按下平移', pixel);
        break;
      case ECursor.Pointer:
        if (this.options.translateType == ETranslateType.Feature || this.defaultParams.translateType == ETranslateType.Feature) {
          this.updateHelpTooltip('鼠标左键按下平移');
        } else {
          this.updateHelpTooltip(this.baseTransformTipFlag);
        }
        break;
      case ECursor.Grab:
        this.updateHelpTooltip('鼠标左键按下旋转', pixel);
        break;
      case ECursor.NsResize:
      case ECursor.EwResize: {
        const type = this.checkSelect?.getGeometry()?.getType();
        let str = '鼠标左键按下拉伸，Ctrl键以基准点拉伸';
        if (type == 'Point' || type == 'MultiPoint' || type == 'Circle') str = '鼠标左键按下拉伸';
        this.updateHelpTooltip(str, pixel);
        break;
      }
      case ECursor.NeswResize:
      case ECursor.NwseResize: {
        const type = this.checkSelect?.getGeometry()?.getType();
        let str = '鼠标左键按下缩放，Shift键保持比例缩放';
        if (type == 'Point' || type == 'MultiPoint' || type == 'Circle') {
          const style = <Style>this.checkSelect?.getStyle();
          const image = style?.getImage?.();
          if (style && image && !(image instanceof Icon)) str = '鼠标左键按下缩放';
        }
        this.updateHelpTooltip(str, pixel);
        break;
      }
      default:
        // 其它光标：保持或还原默认提示
        this.updateHelpTooltip(this.baseTransformTipFlag);
    }
  }
  /**
   * 注册外部事件监听（内部逻辑已统一处理）
   */
  public on(eventName: ETransform | ETransform[], callback: (e: ITransformCallback) => void): this {
    const events = Array.isArray(eventName) ? eventName : [eventName];
    events.forEach((ev) => {
      if (!Object.values(ETransform).includes(ev)) {
        throw new Error('事件类型错误');
      }
      if (!this.listenerMap.has(ev)) {
        this.listenerMap.set(ev, new Set());
      }
      this.listenerMap.get(ev)?.add(callback);
    });
    return this;
  }

  /**
   * 取消监听
   */
  public off(eventName: ETransform, callback?: (e: ITransformCallback) => void): this {
    const set = this.listenerMap.get(eventName);
    if (!set) return this;
    if (callback) {
      set.delete(callback);
    } else {
      set.clear();
    }
    return this;
  }
  /**
   * 移除变换实例
   */
  public remove(): boolean {
    if (this.disposed) return false;
    const interaction = this.earth.map.removeInteraction(this.transforms);
    return interaction ? true : false;
  }

  /**
   * 完整销毁，清理所有引用（供外部主动释放）
   */
  public destroy(): void {
    if (this.disposed) return;
    this.earth.setMouseStyleToDefault();
    this.earth.map.getViewport()?.removeEventListener('contextmenu', this.boundHandleContextMenu, true);
    this.remove();
    this.removeHelpTooltip();
    this.listenerMap.forEach((set) => set.clear());
    this.listenerMap.clear();
    this.keyDownFun && this.keyDownFun();
    this.clearCopyListeners();
    this.toolbar && this.toolbar.destroy();
    this.keyDownFun = undefined;
    this.toolbar = null;
    this.checkSelect = null;
    this.checkLayer = null;
    this.disposed = true;
    this.history.clear();
    this.copyStatus = null;
    this.copyFeature = null;
    if (this.pointerMoveKey) {
      unByKey(this.pointerMoveKey);
      this.pointerMoveKey = undefined;
    }
    if (this.toolbarSyncKeys.length) {
      this.toolbarSyncKeys.forEach((k) => unByKey(k));
      this.toolbarSyncKeys = [];
    }
  }
}
