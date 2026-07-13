import { DefaultEntities, IEarthConstructorOptions, IFeatureAtPixel } from './interface';
import { Feature, Map, View } from 'ol';
import { defaults } from 'ol/control/defaults';
import { Coordinate } from 'ol/coordinate';
import BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import Graticule, { Options as GraticuleOptions } from 'ol/layer/Graticule';
import { fromLonLat } from 'ol/proj';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { TileCoord } from 'ol/tilecoord';
import { ViewOptions } from 'ol/View';
import { BillboardLayer, CircleLayer, OverlayLayer, PointLayer, PolygonLayer, PolylineLayer, WindLayer } from './base';
import Base from './base/Base';
import { ContextMenu, DynamicDraw, GlobalEvent, IContextMenuOption, Measure } from './components';
import { DoubleClickZoom, DragPan, MouseWheelZoom } from 'ol/interaction';
import { Geometry } from 'ol/geom';
import { Layer } from 'ol/layer';
import { Source } from 'ol/source';
import LayerRenderer from 'ol/renderer/Layer';
import ScaleLine, { Options as ScaleLineOptions } from 'ol/control/ScaleLine';
import { Camera, Controls } from './modules';
import Utils from './common/Utils';

/**
 * Earth 创建的底图标识（供 {@link Earth.removeLayer} 无参时识别）
 */
const BASE_LAYER_MARKER = 'olEngineBaseLayer';
/** Earth 分配给图层的唯一句柄属性 */
const ENGINE_LAYER_ID = 'olEngineLayerId';
/**
 * 地图基类
 */
export default class Earth {
  /**
   * 当前实例是否已被销毁
   */
  public isDestroyed = false;
  /**
   * `map`实例
   */
  public map: Map;
  /**
   * `view`实例
   */
  public view: View;
  /**
   * 动态绘制
   */
  private draw?: DynamicDraw;
  /**
   * 测量
   */
  private measure?: Measure;
  /**
   * 右键菜单
   */
  private contextMenu?: ContextMenu;
  /**
   * 默认中心点
   */
  public center: number[] = fromLonLat([119, 39]);
  /**
   * 地图容器id
   */
  public containerId: string;
  /**
   * Map mount target.
   */
  public target: string | HTMLElement;
  /**
   * 默认实例
   */
  private entities?: DefaultEntities;
  /**
   * 全局公共事件
   */
  private globalEvent?: GlobalEvent;
  /**
   * 自定义注册的图层（封装类实例，而不是 OpenLayers 原生图层）。
   * key -> Base 子类实例（如 PointLayer、PolygonLayer 等）
   */
  private customLayers: { [key: string]: Base } = {};
  /**
   * 关闭右键菜单监听方法
   * @param event 鼠标事件
   */
  private closeRightMenu(event: MouseEvent): void {
    event.preventDefault();
  }
  /**
   * 相机模块（视图动画 / 定位）
   */
  public camera: Camera;
  /**
   * 控件模块（网格线 / 比例尺）
   */
  public controls: Controls;
  /**
   * 网格图层（透传至 {@link Controls.graticule}）
   */
  get graticule(): Graticule | undefined {
    return this.controls?.graticule;
  }
  /**
   * 比例尺控件（透传至 {@link Controls.scaleLine}）
   */
  get scaleLine(): ScaleLine | undefined {
    return this.controls?.scaleLine;
  }
  /**
   * 内部方法：供 Base 构造器在提供 registryKey 时自动注册
   * @param key 注册名称
   * @param layer Base 子类实例
   */
  _autoRegisterLayer(key: string, layer: Base): void {
    if (!this.customLayers[key]) {
      this.customLayers[key] = layer;
    } else {
      console.warn(`自定义图层名称 ${key} 已存在，已忽略自动注册`);
    }
  }
  /**
   * 手动注册一个自定义封装图层实例
   * @param key 名称（建议唯一）
   * @param layer Base 子类实例
   * @param override 已存在时是否覆盖
   */
  registerLayer(key: string, layer: Base, override: boolean = false): void {
    if (this.customLayers[key] && !override) {
      console.warn(`自定义图层名称 ${key} 已存在，若需覆盖请传 override=true`);
      return;
    }
    this.customLayers[key] = layer;
  }
  /**
   * 获取已注册的自定义封装图层
   * @param key 名称
   */
  getLayer<T extends Base = Base>(key: string): T | undefined {
    return this.customLayers[key] as T | undefined;
  }
  /**
   * 移除注册引用（不会销毁图层，不会从地图中移除）
   * @param key 名称
   * @param destroy 是否同时销毁（调用 Base.destroy）
   */
  removeRegisteredLayer(key: string, destroy: boolean = false): boolean {
    const layer = this.customLayers[key];
    if (!layer) return false;
    if (destroy) layer.destroy();
    delete this.customLayers[key];
    return true;
  }
  /**
   * 列出所有已注册的自定义封装图层名称
   */
  listRegisteredLayers(): string[] {
    return Object.keys(this.customLayers);
  }
  /**
   * 关闭默认事件
   */
  private closeDefaultEvent(): void {
    // 删除默认的双击事件
    const dblClickInteraction = this.map
      .getInteractions()
      .getArray()
      .find((interaction) => {
        return interaction instanceof DoubleClickZoom;
      });
    if (dblClickInteraction) this.map.removeInteraction(dblClickInteraction);
    // 替换默认滚轮缩放：取消 timeout/duration，确保缩放反馈更实时
    const wheelZoomInteraction = this.map
      .getInteractions()
      .getArray()
      .find((interaction) => interaction instanceof MouseWheelZoom);
    if (wheelZoomInteraction) {
      this.map.removeInteraction(wheelZoomInteraction);
      this.map.addInteraction(
        new MouseWheelZoom({
          duration: 0,
          timeout: 0,
          useAnchor: true,
          constrainResolution: false
        })
      );
    }
    // 关闭浏览器右键菜单
    document.addEventListener('contextmenu', this.closeRightMenu);
  }
  /**
   * 构造器
   * @param viewOptions 视图参数，详见{@link ViewOptions}
   * @param options 自定义参数，详见{@link IEarthConstructorOptions}
   */
  constructor(viewOptions?: ViewOptions, options?: IEarthConstructorOptions) {
    const el = options?.target || 'olContainer';
    const map: Map = new Map({
      target: el,
      view: new View({
        center: this.center,
        zoom: 4,
        ...viewOptions
      }),
      controls: defaults({
        zoom: false,
        rotate: false,
        attribution: false,
        ...options
      })
    });
    this.map = map;
    this.view = map.getView();
    this.target = el;
    this.containerId = typeof el === 'string' ? el : el.id;
    // 相机与控件模块
    this.camera = new Camera(this.view, () => this.center);
    this.controls = new Controls(this.map);
    // 关闭默认事件
    this.closeDefaultEvent();
  }
  /**
   * @description: 8位字符串补0
   * @param {number} num
   * @param {number} len
   * @param {number} radix
   * @return {*}
   * @author: gkc
   */
  /**
   * 八进制字符串补0
   * @param num
   * @param len
   * @param radix
   */
  private zeroFill(num: number, len: number, radix: number): string {
    return num.toString(radix || 10).padStart(len, '0');
  }
  /**
   * 创建OSM底图图层
   * @returns `TileLayer<OSM>`实例
   */
  createOsmLayer(): TileLayer<OSM> {
    return new TileLayer({
      properties: {
        [BASE_LAYER_MARKER]: true
      },
      source: new OSM()
    });
  }
  /**
   * 创建瓦片地图图层
   * 
   * - 传入字符串 `url` 时，使用默认的切片路径拼接逻辑：`${url}/L{z}/R{y}/C{x}.jpg`
   * @example
   * ```
   * earth.createXyzLayer('http://your-tile-server/tiles');
   * ```
   * - 传入自定义 `tileUrlFunction` 时，直接透传给 `ol/source/XYZ` 使用
   * @example
   * ```
   * earth.createXyzLayer((coord) => {
   *  const [z, x, y] = coord;
   *  return `https://example.com/tiles/${z}/${x}/${y}.png`;
   * });
   * ```  
   * @param urlOrTileFn 瓦片地址或自定义 `tileUrlFunction`
   * @returns `TileLayer<XYZ>`实例
   */
  createXyzLayer(urlOrTileFn: string | ((coordinate: TileCoord) => string)): TileLayer<XYZ> {
    const tileUrlFunction =
      typeof urlOrTileFn === 'function'
        ? urlOrTileFn
        : (coordinate: TileCoord) => {
          const x = 'C' + this.zeroFill(coordinate[1], 8, 16).toUpperCase();
          const y = 'R' + this.zeroFill(coordinate[2], 8, 16).toUpperCase();
          const z = 'L' + this.zeroFill(coordinate[0], 2, 10).toUpperCase();
          return `${urlOrTileFn}/` + z + '/' + y + '/' + x + '.jpg';
        };
    return new TileLayer({
      properties: {
        [BASE_LAYER_MARKER]: true
      },
      source: new XYZ({
        tileUrlFunction,
        projection: 'EPSG:3857'
      })
    });
  }
  /**
   * 添加图层
   * @param layer `layer`图层
   * @returns 图层唯一句柄，可传入 {@link Earth.removeLayer} 精确移除
   */
  addLayer(layer: BaseLayer): string {
    const id = Utils.GetGUID();
    layer.set(ENGINE_LAYER_ID, id);
    this.map.addLayer(layer);
    return id;
  }
  /**
   * 移除图层
   *
   * - 传入 `layer` 时移除该图层
   * - 传入 `id` 时移除持有该唯一句柄的图层
   * - 不传时移除所有通过 {@link Earth.createOsmLayer} 或 {@link Earth.createXyzLayer} 创建的底图，返回最后一个被移除的图层
   * @returns 被移除的图层；无匹配时为 undefined
   */
  removeLayer(layer: BaseLayer): BaseLayer | undefined;
  removeLayer(id: string): BaseLayer | undefined;
  removeLayer(): BaseLayer | undefined;
  removeLayer(layerOrId?: BaseLayer | string): BaseLayer | undefined {
    if (typeof layerOrId === 'string') {
      const layer = this.map.getAllLayers().find((item) => item.get(ENGINE_LAYER_ID) === layerOrId);
      return layer ? this.map.removeLayer(layer) : undefined;
    }
    if (layerOrId) {
      return this.map.removeLayer(layerOrId);
    }
    // getAllLayers() 返回快照，遍历快照移除是安全的；反向遍历避免潜在的索引错位
    const layers = this.map.getAllLayers();
    let removed: BaseLayer | undefined;
    for (let i = layers.length - 1; i >= 0; i--) {
      const item = layers[i];
      if (item.get(BASE_LAYER_MARKER) === true) {
        const r = this.map.removeLayer(item);
        if (r) removed = r;
      }
    }
    return removed;
  }
  /**
   * 移动相机到默认位置
   */
  flyHome(): void {
    this.camera.flyHome();
  }
  /**
   * 移动相机到指定位置(动画)
   * @param position 位置
   * @param zoom 缩放
   * @param duration 动画时间(毫秒)
   */
  animateFlyTo(position: Coordinate, zoom?: number, duration?: number): void {
    this.camera.animateFlyTo(position, zoom, duration);
  }
  /**
   * 移动相机到指定位置(无动画)
   * @param position 位置
   * @param zoom 缩放
   */
  flyTo(position: Coordinate, zoom?: number): void {
    this.camera.flyTo(position, zoom);
  }
  /**
   * 设置鼠标样式
   * @param cursor 鼠标样式
   */
  setMouseStyle(cursor: string): void {
    this.map.getTargetElement().style.cursor = cursor;
  }
  /**
   * 设置鼠标在地图上的样式为十字准线
   */
  setMouseStyleToCrosshair(): void {
    this.setMouseStyle('crosshair');
  }
  /**
   * 根据元素获取元素所在的图层
   * @param feature
   */
  // NOTE: LayerRenderer 泛型此处无需精确约束，使用 any 更符合当前抽象层级
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLayerAtFeature(feature: Feature<Geometry>): Layer<Source, LayerRenderer<any>> | undefined {
    const layers = this.map.getAllLayers();
    const layerId = <string>feature.get('layerId');
    const filter = layers.filter((item) => {
      return item.get('id') == layerId;
    });
    if (filter.length) {
      return filter[0];
    } else {
      return undefined;
    }
  }
  /**
   * 设置鼠标在地图上的样式为默认
   */
  setMouseStyleToDefault(): void {
    this.setMouseStyle('auto');
  }
  /**
   * 获取默认实体对象
   */
  useDefaultLayer<T>(): DefaultEntities<T> {
    if (!this.entities) {
      this.entities = {
        billboard: new BillboardLayer<T>(this),
        circle: new CircleLayer<T>(this),
        overlay: new OverlayLayer<T>(this),
        point: new PointLayer<T>(this),
        polygon: new PolygonLayer<T>(this),
        polyline: new PolylineLayer<T>(this),
        wind: new WindLayer(this),
        reset: () => {
          this.entities?.billboard.remove();
          this.entities?.circle.remove();
          this.entities?.overlay.remove();
          this.entities?.point.remove();
          this.entities?.polygon.remove();
          this.entities?.polyline.remove();
          this.entities?.polyline.removeFlightLine();
          this.entities?.wind.remove();
        }
      };
      this.entities.billboard.allowDestroyed = false;
      this.entities.circle.allowDestroyed = false;
      this.entities.point.allowDestroyed = false;
      this.entities.polygon.allowDestroyed = false;
      this.entities.polyline.allowDestroyed = false;
    }
    return this.entities as DefaultEntities<T>;
  }
  /**
   * 使用地图事件
   */
  useGlobalEvent(): GlobalEvent {
    if (!this.globalEvent) {
      this.globalEvent = new GlobalEvent(this);
    }
    return this.globalEvent as GlobalEvent;
  }
  /**
   * 使用右键菜单。
   * @param option 菜单配置；已创建菜单时，仅会同步传入的主题配置。
   */
  useContextMenu(option?: IContextMenuOption): ContextMenu {
    if (!this.contextMenu) {
      this.contextMenu = new ContextMenu(this, option);
    } else if (option?.isDarkTheme !== undefined) {
      this.contextMenu.setTheme(option.isDarkTheme);
    }
    return this.contextMenu;
  }
  /**
   * 清理已永久删除要素的模块菜单状态；不会创建新的右键菜单实例。
   */
  clearContextMenuState(module: string, featureId: string): boolean {
    return this.contextMenu?.clearModuleMenuState(module, featureId) ?? false;
  }
  /**
   * 使用动态绘制工具
   */
  useDrawTool(): DynamicDraw {
    if (!this.draw) {
      this.draw = new DynamicDraw(this);
    }
    return this.draw;
  }
  /**
   * 使用测量工具
   */
  useMeasure(): Measure {
    if (!this.measure) {
      this.measure = new Measure(this);
    }
    return this.measure;
  }
  /**
   * 判断当前像素位置是否存在feature对象
   * @param pixel 像素坐标
   * @returns 返回该像素位置信息，详见{@link IFeatureAtPixel}
   */
  getFeatureAtPixel(pixel: number[]): IFeatureAtPixel {
    let data: IFeatureAtPixel = {
      isExists: false
    };
    if (this.map.hasFeatureAtPixel(pixel)) {
      const pixelData = this.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
        return {
          isExists: true,
          id: <string>feature.getId(),
          module: <string>feature.get('module'),
          feature: <Feature>feature,
          layer
        };
      });
      if (pixelData) {
        data = pixelData;
      }
    }
    return data;
  }
  /**
   * 禁用地图拖拽
   */
  disabledMapDrag() {
    this.map.getInteractions().forEach((interaction) => {
      if (interaction instanceof DragPan) {
        interaction.setActive(false);
      }
    });
  }
  /**
   * 启用地图拖拽
   */
  enableMapDrag() {
    this.map.getInteractions().forEach((interaction) => {
      if (interaction instanceof DragPan) {
        interaction.setActive(true);
      }
    });
  }
  /**
   * 启用网格线
   * @param options OpenLayers Graticule 配置；重复调用时会销毁旧网格并按新配置重建
   * @returns 新创建的网格图层
   */
  enableGraticule(options?: GraticuleOptions): Graticule {
    return this.controls.enableGraticule(options);
  }
  /**
   * 禁用网格线
   */
  disableGraticule() {
    this.controls.disableGraticule();
  }
  /**
   * 启用比例尺
   * @param options OpenLayers ScaleLine 配置；重复调用时会销毁旧比例尺并按新配置重建
   * @returns 新创建的比例尺控件
   */
  enableScaleLine(options?: ScaleLineOptions): ScaleLine {
    return this.controls.enableScaleLine(options);
  }
  /**
   * 禁用比例尺
   */
  disableScaleLine() {
    this.controls.disableScaleLine();
  }
  /**
   * 销毁地图实例及地图上所有元素
   *
   * - 清理动态绘制、测量、默认图层与自定义图层
   * - 清理网格线、比例尺、覆盖物、交互、控件、图层
   * - 解除全局事件和右键菜单监听
   * - 解除地图挂载目标，释放引用
   */
  destroy(): void {
    if (this.isDestroyed) return;
    // 1) 清理工具与图层封装对象
    this.draw?.destroy({ removeGraphics: true, removeLayers: true });
    this.draw = undefined;

    this.measure?.clear();
    this.measure = undefined;

    this.contextMenu?.destroy();
    this.contextMenu = undefined;

    this.entities?.reset();
    this.entities = undefined;

    Object.keys(this.customLayers).forEach((key) => {
      try {
        this.customLayers[key]?.destroy();
      } catch {
        // ignore
      }
    });
    this.customLayers = {};

    // 2) 清理事件监听
    if (this.globalEvent) {
      try {
        if (this.globalEvent.hasGlobalMouseMoveEvent()) this.globalEvent.disableGlobalMouseMoveEvent();
        if (this.globalEvent.hasGlobalMouseClickEvent()) this.globalEvent.disableGlobalMouseClickEvent();
        if (this.globalEvent.hasGlobalMouseLeftDownEvent()) this.globalEvent.disableGlobalMouseLeftDownEvent();
        if (this.globalEvent.hasGlobalMouseLeftUpEvent()) this.globalEvent.disableGlobalMouseLeftUpEvent();
        if (this.globalEvent.hasGlobalMouseDblClickEvent()) this.globalEvent.disableGlobalMouseDblClickEvent();
        if (this.globalEvent.hasGlobalMouseRightClickEvent()) this.globalEvent.disableGlobalMouseRightClickEvent();
        if (this.globalEvent.hasGlobalKeyDownEvent()) this.globalEvent.disableGlobalKeyDownEvent();
      } catch {
        // ignore
      }
      this.globalEvent = undefined;
    }
    document.removeEventListener('contextmenu', this.closeRightMenu);

    // 3) 清理地图可视元素与容器绑定
    this.disableGraticule();
    this.disableScaleLine();

    this.map.getOverlays().clear();
    this.map.getLayers().clear();
    this.map.getInteractions().clear();
    this.map.getControls().clear();
    this.map.setTarget(undefined);
    // 进一步释放 OpenLayers 内部资源
    try {
      this.map.dispose();
    } catch {
      // ignore
    }
    this.isDestroyed = true;
  }
}
