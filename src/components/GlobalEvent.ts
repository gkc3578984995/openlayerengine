/* eslint-disable @typescript-eslint/no-extra-semi */
import Maps from 'ol/Map.js';
import { Coordinate } from 'ol/coordinate.js';
import { EventsKey } from 'ol/events.js';
import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Layer from 'ol/layer/Layer.js';
import { unByKey } from 'ol/Observable.js';
import { toLonLat } from 'ol/proj.js';
import Source from 'ol/source/Source.js';
import Earth from '../Earth.js';
export type ModuleEventCallbackParams = { position: Coordinate; feature?: Feature<Geometry>; layer?: Layer<Source>; id?: any };
export type ModuleEventCallback = (param: ModuleEventCallbackParams) => void;
export type GlobalEventCallback = (param: { position: Coordinate; pixel: number[] }) => void;
export type GlobalKeyDownEventCallback = (param: KeyboardEvent) => void;

interface IEntity {
  id: any;
  module?: any;
  feature?: Feature<Geometry>;
  layer?: Layer<Source>;
}
/**
 * 地图事件类：分为`全局事件`和`模块事件`
 *
 * `全局事件`：返回当前鼠标坐标、像素信息，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素，获取元素信息
 *
 * `模块事件`：返回当前鼠标坐标、元素、元素图层、元素Id信息，详见{@link ModuleEventCallback}
 * @example
 * ```
 * // 全局事件：全局事件如何获取当前位置元素信息，下面以全局鼠标双击事件为例
 * // 启用全局下鼠标双击事件
 * useEarth().useGlobalEvent().enableGlobalMouseDblClickEvent();
 * // 添加全局下鼠标双击事件。全局下同类事件监听只可添加一个
 * useEarth().useGlobalEvent().addMouseDblClickEventByGlobal((param) => {
 *  // 触发事件回调函数
 *  // 调用`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
 *  const data = useEarth().getFeatureAtPixel(param.pixel);
 * })
 * // 关闭全局下鼠标双击事件
 * useEarth().useGlobalEvent().disableGlobalMouseDblClickEvent();
 * // 模块事件：必须传入`module`参数
 * // 启用模块下鼠标双击事件
 * useEarth().useGlobalEvent().enableModuleMouseDblClickEvent();
 * // 添加模块下鼠标双击事件。模块下同类事件监听可添加多个，但module不能相同
 * useEarth().useGlobalEvent().addMouseDblClickEventByModule("module1", (param) => {
 *  // 触发模块module1回调函数
 * })
 * useEarth().useGlobalEvent().addMouseDblClickEventByModule("module2", (param) => {
 *  // 触发模块module2回调函数
 * })
 * // 关闭模块下鼠标双击事件
 * useEarth().useGlobalEvent().disableModuleMouseDblClickEvent();
 * ```
 */
export default class GlobalEvent {
  /**
   * map实例
   */
  private map: Maps;
  /**
   * 鼠标指向的当前实体
   */
  private currentEntity?: IEntity;
  private eventKey?: Map<string, EventsKey | any> = new Map();
  /**
   * 模块的鼠标移动事件
   */
  private moduleMouseMoveEvent: Map<string, { callback: ModuleEventCallback }> = new Map();
  /**
   * 模块的鼠标点击事件
   */
  private moduleMouseClickEvent: Map<string, { callback: ModuleEventCallback }> = new Map();
  /**
   * 模块的鼠标左键按下事件
   */
  private moduleMouseLeftDownEvent: Map<string, { callback: ModuleEventCallback }> = new Map();
  /**
   * 模块的鼠标左键抬起事件
   */
  private moduleMouseLeftUpEvent: Map<string, { callback: ModuleEventCallback }> = new Map();
  /**
   * 模块的鼠标双击事件
   */
  private moduleMouseDblClickEvent: Map<string, { callback: ModuleEventCallback }> = new Map();
  /**
   * 模块的鼠标右击事件
   */
  private moduleMouseRightClickEvent: Map<string, { callback: ModuleEventCallback }> = new Map();
  /**
   * 全局鼠标移动事件
   */
  private globalMouseMoveEvents: Set<GlobalEventCallback> = new Set();
  /**
   * 全局鼠标点击事件
   */
  private globalMouseClickEvents: Set<GlobalEventCallback> = new Set();
  /**
   * 全局鼠标左键按下事件
   */
  private globalMouseLeftDownEvents: Set<GlobalEventCallback> = new Set();
  /**
   * 全局鼠标左键抬起事件
   */
  private globalMouseLeftUpEvents: Set<GlobalEventCallback> = new Set();
  /**
   * 全局鼠标双击事件
   */
  private globalMouseDblClickEvents: Set<GlobalEventCallback> = new Set();
  /**
   * 全局鼠标右键单击事件
   */
  private globalMouseRightClickEvents: Set<GlobalEventCallback> = new Set();
  /**
   * 全局下键盘按下事件
   */
  private globalKeyDownEvents: Set<GlobalKeyDownEventCallback> = new Set();
  /**
   * 当对应模块事件集合为空时自动关闭监听
   */
  private tryAutoDisableModuleListener(type: 'move' | 'click' | 'leftDown' | 'leftUp' | 'dblClick' | 'rightClick'): void {
    switch (type) {
      case 'move':
        if (this.moduleMouseMoveEvent.size === 0 && this.eventKey?.has('moduleMouseMove')) this.disableModuleMouseMoveEvent();
        break;
      case 'click':
        if (this.moduleMouseClickEvent.size === 0 && this.eventKey?.has('moduleMouseClick')) this.disableModuleMouseClickEvent();
        break;
      case 'leftDown':
        if (this.moduleMouseLeftDownEvent.size === 0 && this.eventKey?.has('moduleMouseLeftDown')) this.disableModuleMouseLeftDownEvent();
        break;
      case 'leftUp':
        if (this.moduleMouseLeftUpEvent.size === 0 && this.eventKey?.has('moduleMouseLeftUp')) this.disableModuleMouseLeftUpEvent();
        break;
      case 'dblClick':
        if (this.moduleMouseDblClickEvent.size === 0 && this.eventKey?.has('moduleMouseDblClick')) this.disableModuleMouseDblClickEvent();
        break;
      case 'rightClick':
        if (this.moduleMouseRightClickEvent.size === 0 && this.eventKey?.has('moduleMouseRightClick')) this.disableModuleMouseRightClickEvent();
        break;
    }
  }
  /**
   * 全局事件空集合时自动关闭监听
   */
  private tryAutoDisableGlobalListener(type: 'move' | 'click' | 'leftDown' | 'leftUp' | 'dblClick' | 'rightClick' | 'keyDown'): void {
    switch (type) {
      case 'move':
        if (this.globalMouseMoveEvents.size === 0 && this.eventKey?.has('globalMouseMove')) this.disableGlobalMouseMoveEvent();
        break;
      case 'click':
        if (this.globalMouseClickEvents.size === 0 && this.eventKey?.has('globalMouseClick')) this.disableGlobalMouseClickEvent();
        break;
      case 'leftDown':
        if (this.globalMouseLeftDownEvents.size === 0 && this.eventKey?.has('globalMouseLeftDown')) this.disableGlobalMouseLeftDownEvent();
        break;
      case 'leftUp':
        if (this.globalMouseLeftUpEvents.size === 0 && this.eventKey?.has('globalMouseLeftUp')) this.disableGlobalMouseLeftUpEvent();
        break;
      case 'dblClick':
        if (this.globalMouseDblClickEvents.size === 0 && this.eventKey?.has('globalMouseDblClick')) this.disableGlobalMouseDblClickEvent();
        break;
      case 'rightClick':
        if (this.globalMouseRightClickEvents.size === 0 && this.eventKey?.has('globalMouseRightClick')) this.disableGlobalMouseRightClickEvent();
        break;
      case 'keyDown':
        if (this.globalKeyDownEvents.size === 0 && this.eventKey?.has('globalKeyDown')) this.disableGlobalKeyDownEvent();
        break;
    }
  }
  /**
   * 模块下鼠标左键按下监听器处理方法
   * @param event 鼠标事件
   */
  private moduleMouseLeftDown(event: MouseEvent): void {
    if (event.button != 0) return;
    const pixel = this.map.getEventPixel({ clientX: event.x, clientY: event.y });
    const features = this.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
      return {
        id: feature.getId(),
        module: feature.get('module'),
        feature: <Feature>feature,
        layer
      };
    });
    if (features && features.feature.get('module')) {
      const moduleEvent = this.moduleMouseLeftDownEvent.get(features.feature.get('module'));
      const coordinate = this.map.getEventCoordinate(event);
      if (moduleEvent) {
        moduleEvent.callback.call(this, {
          position: toLonLat(coordinate),
          feature: features.feature,
          layer: features.layer,
          id: features.id
        });
      }
    }
  }
  /**
   * 模块下鼠标左键抬起监听器处理方法
   * @param event 鼠标事件
   */
  private moduleMouseLeftUp(event: MouseEvent): void {
    if (event.button != 0) return;
    const pixel = this.map.getEventPixel({ clientX: event.x, clientY: event.y });
    const features = this.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
      return {
        id: feature.getId(),
        module: feature.get('module'),
        feature: <Feature>feature,
        layer
      };
    });
    if (features && features.feature.get('module')) {
      const moduleEvent = this.moduleMouseLeftUpEvent.get(features.feature.get('module'));
      const coordinate = this.map.getEventCoordinate(event);
      if (moduleEvent) {
        moduleEvent.callback.call(this, {
          position: toLonLat(coordinate),
          feature: features.feature,
          layer: features.layer,
          id: features.id
        });
      }
    }
  }
  /**
   * 模块下鼠标右键单击监听器处理方法
   * @param event 鼠标事件
   */
  private moduleMouseRightClick(event: MouseEvent): void {
    const pixel = this.map.getEventPixel({ clientX: event.x, clientY: event.y });
    const features = this.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
      return {
        id: feature.getId(),
        module: feature.get('module'),
        feature: <Feature>feature,
        layer
      };
    });
    if (features && features.feature.get('module')) {
      const moduleEvent = this.moduleMouseRightClickEvent.get(features.feature.get('module'));
      const coordinate = this.map.getEventCoordinate(event);
      if (moduleEvent) {
        moduleEvent.callback.call(this, {
          position: toLonLat(coordinate),
          feature: features.feature,
          layer: features.layer,
          id: features.id
        });
      }
    }
  }
  /**
   * 全局下鼠标左键按下监听器处理方法
   * @param event 鼠标事件
   */
  private globalMouseLeftDown(event: MouseEvent): void {
    if (event.button != 0) return;
    if (this.globalMouseLeftDownEvents.size === 0) return;
    const coordinate = this.map.getEventCoordinate(event);
    this.globalMouseLeftDownEvents.forEach((cb) => {
      try {
        cb.call(this, { position: toLonLat(coordinate), pixel: [event.x, event.y] });
      } catch (e) {
        console.error('global mousedown callback error:', e);
      }
    });
  }
  /**
   * 全局下鼠标左键抬起监听器处理方法
   * @param event 鼠标事件
   */
  private globalMouseLeftUp(event: MouseEvent): void {
    if (event.button != 0) return;
    if (this.globalMouseLeftUpEvents.size === 0) return;
    const coordinate = this.map.getEventCoordinate(event);
    this.globalMouseLeftUpEvents.forEach((cb) => {
      try {
        cb.call(this, { position: toLonLat(coordinate), pixel: [event.x, event.y] });
      } catch (e) {
        console.error('global mouseup callback error:', e);
      }
    });
  }
  /**
   * 全局下鼠标右键单击监听器处理方法
   * @param event 鼠标事件
   */
  private globalMouseRightClick(event: MouseEvent): void {
    if (this.globalMouseRightClickEvents.size === 0) return;
    const coordinate = this.map.getEventCoordinate(event);
    this.globalMouseRightClickEvents.forEach((cb) => {
      try {
        cb.call(this, { position: toLonLat(coordinate), pixel: [event.x, event.y] });
      } catch (e) {
        console.error('global contextmenu callback error:', e);
      }
    });
  }
  /**
   * 全局下键盘按下监听器处理方法
   */
  private globalKeyDown(event: KeyboardEvent): void {
    if (!event.repeat) {
      if (this.globalKeyDownEvents.size === 0) return;
      this.globalKeyDownEvents.forEach((cb) => {
        try {
          cb.call(this, event);
        } catch (e) {
          // 单个回调报错不影响其它回调执行
          console.error('global keydown callback error:', e);
        }
      });
    }
  }

  /**
   * 构造器
   * @param earth 地图实例
   */
  constructor(earth: Earth) {
    this.map = earth.map;
  }
  /**
   * 启用模块下鼠标移动事件监听
   */
  enableModuleMouseMoveEvent(): void {
    if (!this.eventKey?.has('moduleMouseMove')) {
      const key = this.map.on('pointermove', (evt) => {
        if (this.map.hasFeatureAtPixel(evt.pixel)) {
          const features = this.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
            return {
              id: feature.getId(),
              module: feature.get('module'),
              feature: <Feature>feature,
              layer
            };
          });
          if (features && features.feature.get('module') && features.feature.getId() !== this.currentEntity?.feature?.getId()) {
            const moduleEvent = this.moduleMouseMoveEvent.get(features.feature.get('module'));
            if (moduleEvent) {
              this.currentEntity = features;
              moduleEvent.callback.call(this, {
                position: toLonLat(evt.coordinate),
                feature: features.feature,
                layer: features.layer,
                id: features.id
              });
            }
          }
        } else {
          if (this.currentEntity && this.currentEntity.module && this.currentEntity.feature) {
            const moduleEvent = this.moduleMouseMoveEvent.get(this.currentEntity.module);
            if (moduleEvent) {
              moduleEvent.callback.call(this, { position: toLonLat(evt.coordinate), id: this.currentEntity.id });
              this.currentEntity = undefined;
            }
          }
        }
      });
      this.eventKey?.set('moduleMouseMove', key);
    } else {
      console.warn('重复启用模块下鼠标移动事件监听,请检查');
    }
  }
  /**
   * 启用模块下鼠标点击事件监听
   */
  enableModuleMouseClickEvent(): void {
    if (!this.eventKey?.has('moduleMouseClick')) {
      const key = this.map.on('click', (evt) => {
        const features = this.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
          return {
            id: feature.getId(),
            module: feature.get('module'),
            feature: <Feature>feature,
            layer
          };
        });
        if (features && features.feature.get('module')) {
          const moduleEvent = this.moduleMouseClickEvent.get(features.feature.get('module'));
          if (moduleEvent) {
            moduleEvent.callback.call(this, {
              position: toLonLat(evt.coordinate),
              feature: features.feature,
              layer: features.layer,
              id: features.id
            });
          }
        }
      });
      this.eventKey?.set('moduleMouseClick', key);
    } else {
      console.warn('重复启用模块下鼠标点击事件监听,请检查');
    }
  }
  /**
   * 启用模块下鼠标左键按下事件监听
   */
  enableModuleMouseLeftDownEvent(): void {
    if (!this.eventKey?.has('moduleMouseLeftDown')) {
      const handler = this.moduleMouseLeftDown.bind(this);
      this.map.getViewport().addEventListener('mousedown', handler);
      this.eventKey?.set('moduleMouseLeftDown', handler);
    } else {
      console.warn('重复启用模块下鼠标左键按下事件监听,请检查');
    }
  }
  /**
   * 启用模块下鼠标左键抬起事件监听
   */
  enableModuleMouseLeftUpEvent(): void {
    if (!this.eventKey?.has('moduleMouseLeftUp')) {
      const handler = this.moduleMouseLeftUp.bind(this);
      this.map.getViewport().addEventListener('mouseup', handler);
      this.eventKey?.set('moduleMouseLeftUp', handler);
    } else {
      console.warn('重复启用模块下鼠标左键抬起事件监听,请检查');
    }
  }
  /**
   * 启用模块下鼠标双击事件
   */
  enableModuleMouseDblClickEvent(): void {
    if (!this.eventKey?.has('moduleMouseDblClick')) {
      const key = this.map.on('dblclick', (evt) => {
        const features = this.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
          return {
            id: feature.getId(),
            module: feature.get('module'),
            feature: <Feature>feature,
            layer
          };
        });
        if (features && features.feature.get('module')) {
          const moduleEvent = this.moduleMouseDblClickEvent.get(features.feature.get('module'));
          if (moduleEvent) {
            moduleEvent.callback.call(this, {
              position: toLonLat(evt.coordinate),
              feature: features.feature,
              layer: features.layer,
              id: features.id
            });
          }
        }
      });
      this.eventKey?.set('moduleMouseDblClick', key);
    } else {
      console.warn('重复启用模块下鼠标双击事件监听,请检查');
    }
  }
  /**
   * 启用模块下鼠标右键单击事件监听
   */
  enableModuleMouseRightClickEvent(): void {
    if (!this.eventKey?.has('moduleMouseRightClick')) {
      const handler = this.moduleMouseRightClick.bind(this);
      this.map.getViewport().addEventListener('contextmenu', handler);
      this.eventKey?.set('moduleMouseRightClick', handler);
    } else {
      console.warn('重复启用模块下鼠标右键点击事件监听,请检查');
    }
  }
  /**
   * 启用全局下鼠标移动事件监听
   */
  enableGlobalMouseMoveEvent(): void {
    if (!this.eventKey?.has('globalMouseMove')) {
      const key = this.map.on('pointermove', (evt) => {
        if (this.globalMouseMoveEvents.size === 0) return;
        this.globalMouseMoveEvents.forEach((cb) => {
          try {
            cb.call(this, { position: toLonLat(evt.coordinate), pixel: evt.pixel });
          } catch (e) {
            console.error('global pointermove callback error:', e);
          }
        });
      });
      this.eventKey?.set('globalMouseMove', key);
    } else {
      console.warn('重复启用全局鼠标移动事件监听,请检查');
    }
  }
  /**
   * 启用全局下鼠标点击事件监听
   */
  enableGlobalMouseClickEvent(): void {
    if (!this.eventKey?.has('globalMouseClick')) {
      const key = this.map.on('click', (evt) => {
        if (this.globalMouseClickEvents.size === 0) return;
        this.globalMouseClickEvents.forEach((cb) => {
          try {
            cb.call(this, { position: toLonLat(evt.coordinate), pixel: evt.pixel });
          } catch (e) {
            console.error('global click callback error:', e);
          }
        });
      });
      this.eventKey?.set('globalMouseClick', key);
    } else {
      console.warn('重复启用全局鼠标点击事件监听,请检查');
    }
  }
  /**
   * 启用全局下鼠标左键按下事件监听
   */
  enableGlobalMouseLeftDownEvent(): void {
    if (!this.eventKey?.has('globalMouseLeftDown')) {
      const handler = this.globalMouseLeftDown.bind(this);
      this.map.getViewport().addEventListener('mousedown', handler);
      this.eventKey?.set('globalMouseLeftDown', handler);
    } else {
      console.warn('重复启用全局下鼠标左键按下事件监听,请检查');
    }
  }
  /**
   * 启用全局下鼠标左键抬起事件监听
   */
  enableGlobalMouseLeftUpEvent(): void {
    if (!this.eventKey?.has('globalMouseLeftUp')) {
      const handler = this.globalMouseLeftUp.bind(this);
      this.map.getViewport().addEventListener('mouseup', handler);
      this.eventKey?.set('globalMouseLeftUp', handler);
    } else {
      console.warn('重复启用全局下鼠标左键抬起事件监听,请检查');
    }
  }
  /**
   * 启用全局下鼠标双击事件监听
   */
  enableGlobalMouseDblClickEvent(): void {
    if (!this.eventKey?.has('globalMouseDblClick')) {
      const key = this.map.on('dblclick', (evt) => {
        if (this.globalMouseDblClickEvents.size === 0) return;
        this.globalMouseDblClickEvents.forEach((cb) => {
          try {
            cb.call(this, { position: toLonLat(evt.coordinate), pixel: evt.pixel });
          } catch (e) {
            console.error('global dblclick callback error:', e);
          }
        });
      });
      this.eventKey?.set('globalMouseDblClick', key);
    } else {
      console.warn('重复启用全局鼠标双击事件监听,请检查');
    }
  }
  /**
   * 启用全局下鼠标右键单击事件监听
   */
  enableGlobalMouseRightClickEvent(): void {
    if (!this.eventKey?.has('globalMouseRightClick')) {
      const handler = this.globalMouseRightClick.bind(this);
      this.map.getViewport().addEventListener('contextmenu', handler);
      this.eventKey?.set('globalMouseRightClick', handler);
    } else {
      console.warn('重复启用全局下鼠标右键单击事件监听,请检查');
    }
  }
  /**
   * 启用全局下键盘监听
   */
  enableGlobalKeyDownEvent(): void {
    if (!this.eventKey?.has('globalKeyDown')) {
      const handler = this.globalKeyDown.bind(this);
      document.addEventListener('keydown', handler);
      this.eventKey?.set('globalKeyDown', handler);
    } else {
      console.warn('重复启用全局下键盘监听,请检查');
    }
  }
  /**
   * 停用全局下键盘按下事件监听
   */
  disableGlobalKeyDownEvent(): void {
    const handler = this.eventKey?.get('globalKeyDown');
    if (handler) {
      document.removeEventListener('keydown', handler);
      this.eventKey?.delete('globalKeyDown');
      this.globalKeyDownEvents.clear();
    } else {
      console.warn('未启用全局下键盘监听，关闭失败');
    }
  }
  /**
   * 停用模块下鼠标移动事件监听
   */
  disableModuleMouseMoveEvent(): void {
    const key = this.eventKey?.get('moduleMouseMove');
    if (key) {
      unByKey(key);
      this.eventKey?.delete('moduleMouseMove');
      this.moduleMouseMoveEvent.clear();
    } else {
      console.warn('未启用模块下鼠标移动事件监听，关闭失败');
    }
  }
  /**
   * 停用模块下鼠标点击事件监听
   */
  disableModuleMouseClickEvent(): void {
    const key = this.eventKey?.get('moduleMouseClick');
    if (key) {
      unByKey(key);
      this.eventKey?.delete('moduleMouseClick');
      this.moduleMouseClickEvent.clear();
    } else {
      console.warn('未启用模块下鼠标点击事件监听，关闭失败');
    }
  }
  /**
   * 停用模块下鼠标左键按下事件监听
   */
  disableModuleMouseLeftDownEvent(): void {
    const key = this.eventKey?.get('moduleMouseLeftDown');
    if (key) {
      this.map.getViewport().removeEventListener('mousedown', key);
      this.eventKey?.delete('moduleMouseLeftDown');
      this.moduleMouseLeftDownEvent.clear();
    } else {
      console.warn('未启用模块下鼠标左键按下事件监听，关闭失败');
    }
  }
  /**
   * 停用模块下鼠标左键抬起事件监听
   */
  disableModuleMouseLeftUpEvent(): void {
    const key = this.eventKey?.get('moduleMouseLeftUp');
    if (key) {
      this.map.getViewport().removeEventListener('mouseup', key);
      this.eventKey?.delete('moduleMouseLeftUp');
      this.moduleMouseLeftUpEvent.clear();
    } else {
      console.warn('未启用模块下鼠标左键抬起事件监听，关闭失败');
    }
  }
  /**
   * 停用模块下鼠标双击事件监听
   */
  disableModuleMouseDblClickEvent(): void {
    const key = this.eventKey?.get('moduleMouseDblClick');
    if (key) {
      unByKey(key);
      this.eventKey?.delete('moduleMouseDblClick');
      this.moduleMouseDblClickEvent.clear();
    } else {
      console.warn('未启用模块下鼠标双击击事件监听，关闭失败');
    }
  }
  /**
   * 停用模块下鼠标右键单击事件监听
   */
  disableModuleMouseRightClickEvent(): void {
    const key = this.eventKey?.get('moduleMouseRightClick');
    if (key) {
      this.map.getViewport().removeEventListener('contextmenu', key);
      this.eventKey?.delete('moduleMouseRightClick');
      this.moduleMouseRightClickEvent.clear();
    } else {
      console.warn('未启用模块下鼠标右键单击事件监听，关闭失败');
    }
  }
  /**
   * 停用全局下鼠标移动事件监听
   */
  disableGlobalMouseMoveEvent(): void {
    const key = this.eventKey?.get('globalMouseMove');
    if (key) {
      unByKey(key);
      this.eventKey?.delete('globalMouseMove');
      this.globalMouseMoveEvents.clear();
    } else {
      console.warn('未启用全局下鼠标移动事件监听，关闭失败');
    }
  }
  /**
   * 停用全局下鼠标点击事件监听
   */
  disableGlobalMouseClickEvent(): void {
    const key = this.eventKey?.get('globalMouseClick');
    if (key) {
      unByKey(key);
      this.eventKey?.delete('globalMouseClick');
      this.globalMouseClickEvents.clear();
    } else {
      console.warn('未启用全局下鼠标点击事件监听，关闭失败');
    }
  }
  /**
   * 停用全局下鼠标左键按下事件监听
   */
  disableGlobalMouseLeftDownEvent(): void {
    const key = this.eventKey?.get('globalMouseLeftDown');
    if (key) {
      this.map.getViewport().removeEventListener('mousedown', key);
      this.eventKey?.delete('globalMouseLeftDown');
      this.globalMouseLeftDownEvents.clear();
    } else {
      console.warn('未启用全局下鼠标左键按下事件监听，关闭失败');
    }
  }
  /**
   * 停用全局下鼠标左键抬起事件监听
   */
  disableGlobalMouseLeftUpEvent(): void {
    const key = this.eventKey?.get('globalMouseLeftUp');
    if (key) {
      this.map.getViewport().removeEventListener('mouseup', key);
      this.eventKey?.delete('globalMouseLeftUp');
      this.globalMouseLeftUpEvents.clear();
    } else {
      console.warn('未启用全局下鼠标左键抬起事件监听，关闭失败');
    }
  }
  /**
   * 停用全局下鼠标双击事件监听
   */
  disableGlobalMouseDblClickEvent(): void {
    const key = this.eventKey?.get('globalMouseDblClick');
    if (key) {
      unByKey(key);
      this.eventKey?.delete('globalMouseDblClick');
      this.globalMouseDblClickEvents.clear();
    } else {
      console.warn('未启用全局下鼠标双击事件监听，关闭失败');
    }
  }
  /**
   * 停用全局下鼠标右键单击事件监听
   */
  disableGlobalMouseRightClickEvent(): void {
    const key = this.eventKey?.get('globalMouseRightClick');
    if (key) {
      this.map.getViewport().removeEventListener('contextmenu', key);
      this.eventKey?.delete('globalMouseRightClick');
      this.globalMouseRightClickEvents.clear();
    } else {
      console.warn('未启用全局下鼠标右键单击事件监听，关闭失败');
    }
  }
  /**
   * 按模块追加事件的通用实现：自动启用监听、去重、返回注销函数。
   * 各 `addXxxEventByModule` 公共方法均为本方法的薄包装。
   */
  private addModuleEvent(
    target: Map<string, { callback: ModuleEventCallback }>,
    module: string,
    callback: ModuleEventCallback,
    ensure: () => void,
    autoDisable: () => void,
    label: string
  ): () => void {
    if (!module || module === '') {
      console.warn(`按模块追加${label}事件: module参数不能为空`);
      return () => void 0;
    }
    ensure(); // enable* 方法内部已做幂等判断
    if (target.get(module)) {
      console.warn(`按模块追加${label}事件: module参数重复`, module);
      return () => void 0;
    }
    target.set(module, { callback });
    return () => {
      const stored = target.get(module);
      if (stored && stored.callback === callback) {
        target.delete(module);
        autoDisable();
      }
    };
  }
  /**
   * 按模块添加鼠标移动事件（返回注销函数）
   * @param module 模块名称
   * @param callback 回调函数，详见{@link ModuleEventCallback}
   */
  addMouseMoveEventByModule(module: string, callback: ModuleEventCallback): () => void {
    return this.addModuleEvent(
      this.moduleMouseMoveEvent,
      module,
      callback,
      () => this.enableModuleMouseMoveEvent(),
      () => this.tryAutoDisableModuleListener('move'),
      '鼠标移动'
    );
  }
  /**
   * 按模块添加鼠标点击事件（返回注销函数）
   */
  addMouseClickEventByModule(module: string, callback: ModuleEventCallback): () => void {
    return this.addModuleEvent(
      this.moduleMouseClickEvent,
      module,
      callback,
      () => this.enableModuleMouseClickEvent(),
      () => this.tryAutoDisableModuleListener('click'),
      '鼠标点击'
    );
  }
  /**
   * 按模块添加鼠标左键按下事件（返回注销函数）
   */
  addMouseLeftDownEventByModule(module: string, callback: ModuleEventCallback): () => void {
    return this.addModuleEvent(
      this.moduleMouseLeftDownEvent,
      module,
      callback,
      () => this.enableModuleMouseLeftDownEvent(),
      () => this.tryAutoDisableModuleListener('leftDown'),
      '鼠标左键按下'
    );
  }
  /**
   * 按模块添加鼠标左键抬起事件（返回注销函数）
   */
  addMouseLeftUpEventByModule(module: string, callback: ModuleEventCallback): () => void {
    return this.addModuleEvent(
      this.moduleMouseLeftUpEvent,
      module,
      callback,
      () => this.enableModuleMouseLeftUpEvent(),
      () => this.tryAutoDisableModuleListener('leftUp'),
      '鼠标左键抬起'
    );
  }
  /**
   * 按模块添加鼠标双击事件（返回注销函数）
   */
  addMouseDblClickEventByModule(module: string, callback: ModuleEventCallback): () => void {
    return this.addModuleEvent(
      this.moduleMouseDblClickEvent,
      module,
      callback,
      () => this.enableModuleMouseDblClickEvent(),
      () => this.tryAutoDisableModuleListener('dblClick'),
      '鼠标双击'
    );
  }
  /**
   * 按模块添加鼠标右键单击事件（返回注销函数）
   */
  addMouseRightClickEventByModule(module: string, callback: ModuleEventCallback): () => void {
    return this.addModuleEvent(
      this.moduleMouseRightClickEvent,
      module,
      callback,
      () => this.enableModuleMouseRightClickEvent(),
      () => this.tryAutoDisableModuleListener('rightClick'),
      '鼠标右键单击'
    );
  }
  /**
   * 按全局追加事件的通用实现：自动启用监听、返回注销函数。
   * 各 `addXxxEventByGlobal` 公共方法均为本方法的薄包装。
   */
  private addGlobalEvent<T extends GlobalEventCallback | GlobalKeyDownEventCallback>(
    target: Set<T>,
    callback: T,
    ensure: () => void,
    autoDisable: () => void
  ): () => void {
    ensure(); // enable* 方法内部已做幂等判断
    target.add(callback);
    return () => {
      target.delete(callback);
      autoDisable();
    };
  }
  /**
   * 按全局添加鼠标移动事件
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseMoveEventByGlobal(callback: GlobalEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalMouseMoveEvents,
      callback,
      () => this.enableGlobalMouseMoveEvent(),
      () => this.tryAutoDisableGlobalListener('move')
    );
  }
  /**
   * 按全局添加鼠标点击事件
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseClickEventByGlobal(callback: GlobalEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalMouseClickEvents,
      callback,
      () => this.enableGlobalMouseClickEvent(),
      () => this.tryAutoDisableGlobalListener('click')
    );
  }
  /**
   * 按全局添加鼠标左键按下事件
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseLeftDownEventByGlobal(callback: GlobalEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalMouseLeftDownEvents,
      callback,
      () => this.enableGlobalMouseLeftDownEvent(),
      () => this.tryAutoDisableGlobalListener('leftDown')
    );
  }
  /**
   * 按全局添加鼠标左键抬起事件
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseLeftUpEventByGlobal(callback: GlobalEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalMouseLeftUpEvents,
      callback,
      () => this.enableGlobalMouseLeftUpEvent(),
      () => this.tryAutoDisableGlobalListener('leftUp')
    );
  }
  /**
   * 按全局添加鼠标双击事件
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseDblClickEventByGlobal(callback: GlobalEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalMouseDblClickEvents,
      callback,
      () => this.enableGlobalMouseDblClickEvent(),
      () => this.tryAutoDisableGlobalListener('dblClick')
    );
  }
  /**
   * 按全局添加鼠标右键单击事件
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseRightClickEventByGlobal(callback: GlobalEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalMouseRightClickEvents,
      callback,
      () => this.enableGlobalMouseRightClickEvent(),
      () => this.tryAutoDisableGlobalListener('rightClick')
    );
  }
  /**
   * 按全局添加键盘按下事件
   * @param callback 回调函数，详见{@link GlobalKeyDownEventCallback}
   * 可重复添加，返回一个取消当前回调的方法
   */
  addKeyDownEventByGlobal(callback: GlobalKeyDownEventCallback): () => void {
    return this.addGlobalEvent(
      this.globalKeyDownEvents,
      callback,
      () => this.enableGlobalKeyDownEvent(),
      () => this.tryAutoDisableGlobalListener('keyDown')
    );
  }
  /**
   * 按全局添加鼠标点击事件,只执行一次。该方法无需启用事件和删除事件，直接调用即可
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseOnceClickEventByGlobal(callback: GlobalEventCallback): void {
    this.addCancelableMouseOnceClickEventByGlobal(callback);
  }
  /**
   * 按全局添加一次性鼠标点击事件，并返回取消当前监听的方法。
   */
  addCancelableMouseOnceClickEventByGlobal(callback: GlobalEventCallback): () => void {
    const key = this.map.once('click', (evt) => {
      callback.call(this, {
        position: toLonLat(evt.coordinate),
        pixel: evt.pixel
      });
    });
    return () => unByKey(key);
  }
  /**
   * 按全局添加鼠标右击事件,只执行一次。该方法无需启用事件和删除事件，直接调用即可
   * @param callback 回调函数，详见{@link GlobalEventCallback}。可配合{@link Earth}类`getFeatureAtPixel`方法查询该像素位置是否存在feature元素
   */
  addMouseOnceRightClickEventByGlobal(callback: GlobalEventCallback): void {
    this.addCancelableMouseOnceRightClickEventByGlobal(callback);
  }
  /**
   * 按全局添加一次性鼠标右键事件，并返回取消当前监听的方法。
   */
  addCancelableMouseOnceRightClickEventByGlobal(callback: GlobalEventCallback): () => void {
    const viewport = this.map.getViewport();
    let active = true;
    const handler = (event: MouseEvent) => {
      if (!active) return;
      active = false;
      const coordinate = this.map.getEventCoordinate(event);
      callback.call(this, {
        position: toLonLat(coordinate),
        pixel: this.map.getEventPixel(event)
      });
    };
    viewport.addEventListener('contextmenu', handler, { once: true });
    return () => {
      if (!active) return;
      active = false;
      viewport.removeEventListener('contextmenu', handler);
    };
  }
  /**
   * 校验模块是否注册鼠标移动事件
   * @param module 模块名称
   */
  hasModuleMouseMoveEvent(module: string): boolean {
    return this.moduleMouseMoveEvent.has(module);
  }
  /**
   * 校验模块是否注册鼠标单击事件
   * @param module 模块名称
   */
  hasModuleMouseClickEvent(module: string): boolean {
    return this.moduleMouseClickEvent.has(module);
  }
  /**
   * 校验模块是否注册鼠标左键按下事件
   * @param module 模块名称
   */
  hasModuleMouseLeftDownEvent(module: string): boolean {
    return this.moduleMouseLeftDownEvent.has(module);
  }
  /**
   * 校验模块是否注册鼠标左键抬起事件
   * @param module 模块名称
   */
  hasModuleMouseLeftUpEvent(module: string): boolean {
    return this.moduleMouseLeftUpEvent.has(module);
  }
  /**
   * 校验模块是否注册鼠标双击事件
   * @param module 模块名称
   */
  hasModuleMouseDblClickEvent(module: string): boolean {
    return this.moduleMouseDblClickEvent.has(module);
  }
  /**
   * 校验模块是否注册鼠标右键单击事件
   * @param module 模块名称
   */
  hasModuleMouseRightClickEvent(module: string): boolean {
    return this.moduleMouseRightClickEvent.has(module);
  }
  /**
   * 校验全局是否注册鼠标移动事件
   */
  hasGlobalMouseMoveEvent(): boolean {
    return !!this.eventKey?.has('globalMouseMove') || this.globalMouseMoveEvents.size > 0;
  }
  /**
   * 校验全局是否注册鼠标点击事件
   */
  hasGlobalMouseClickEvent(): boolean {
    return !!this.eventKey?.has('globalMouseClick') || this.globalMouseClickEvents.size > 0;
  }
  /**
   * 校验全局是否注册鼠标左键按下事件
   */
  hasGlobalMouseLeftDownEvent(): boolean {
    return !!this.eventKey?.has('globalMouseLeftDown') || this.globalMouseLeftDownEvents.size > 0;
  }
  /**
   * 校验全局是否注册鼠标左键抬起事件
   */
  hasGlobalMouseLeftUpEvent(): boolean {
    return !!this.eventKey?.has('globalMouseLeftUp') || this.globalMouseLeftUpEvents.size > 0;
  }
  /**
   * 校验全局是否注册鼠标双击事件
   */
  hasGlobalMouseDblClickEvent(): boolean {
    return !!this.eventKey?.has('globalMouseDblClick') || this.globalMouseDblClickEvents.size > 0;
  }
  /**
   * 校验全局是否注册鼠标右键事件
   */
  hasGlobalMouseRightClickEvent(): boolean {
    return !!this.eventKey?.has('globalMouseRightClick') || this.globalMouseRightClickEvents.size > 0;
  }
  /**
   * 校验全局是否注册键盘按下事件
   */
  hasGlobalKeyDownEvent(): boolean {
    return this.globalKeyDownEvents.size > 0;
  }

  /**
   * 移除指定模块的某一类鼠标事件回调
   * @param module 模块名称
   * @param type 事件类型：move | click | leftDown | leftUp | dblClick | rightClick
   * @returns 是否成功移除
   */
  removeModuleEvent(module: string, type: 'move' | 'click' | 'leftDown' | 'leftUp' | 'dblClick' | 'rightClick'): boolean {
    if (!module) return false;
    let removed = false;
    switch (type) {
      case 'move':
        removed = this.moduleMouseMoveEvent.delete(module);
        this.tryAutoDisableModuleListener('move');
        break;
      case 'click':
        removed = this.moduleMouseClickEvent.delete(module);
        this.tryAutoDisableModuleListener('click');
        break;
      case 'leftDown':
        removed = this.moduleMouseLeftDownEvent.delete(module);
        this.tryAutoDisableModuleListener('leftDown');
        break;
      case 'leftUp':
        removed = this.moduleMouseLeftUpEvent.delete(module);
        this.tryAutoDisableModuleListener('leftUp');
        break;
      case 'dblClick':
        removed = this.moduleMouseDblClickEvent.delete(module);
        this.tryAutoDisableModuleListener('dblClick');
        break;
      case 'rightClick':
        removed = this.moduleMouseRightClickEvent.delete(module);
        this.tryAutoDisableModuleListener('rightClick');
        break;
    }
    return removed;
  }

  /**
   * 移除指定模块注册的所有类型鼠标事件回调
   * @param module 模块名称
   */
  removeAllModuleEvents(module: string): void {
    if (!module) return;
    this.moduleMouseMoveEvent.delete(module);
    this.moduleMouseClickEvent.delete(module);
    this.moduleMouseLeftDownEvent.delete(module);
    this.moduleMouseLeftUpEvent.delete(module);
    this.moduleMouseDblClickEvent.delete(module);
    this.moduleMouseRightClickEvent.delete(module);
    // 分别尝试关闭
    this.tryAutoDisableModuleListener('move');
    this.tryAutoDisableModuleListener('click');
    this.tryAutoDisableModuleListener('leftDown');
    this.tryAutoDisableModuleListener('leftUp');
    this.tryAutoDisableModuleListener('dblClick');
    this.tryAutoDisableModuleListener('rightClick');
  }
}
