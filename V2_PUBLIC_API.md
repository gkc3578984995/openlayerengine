# V2 公共 API 调用说明

本文按模块列出 `@vrsim/earth-engine-ol` 2.0 的常用公共 API。示例只保留必要参数，每段都是调用示意，不是一份连续执行的程序。除“Earth 初始化”外，其余片段都假设已有活动的 `earth`；`point`、`line`、`circle` 等名称表示前文创建的兼容 Element 句柄。

## 使用前约定

```ts
import { useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css'; // OpenLayers 与本库组件样式

const earth = useEarth({
  target: 'map' // 地图容器 ID，也可以传 HTMLElement
});
```

- JavaScript、类和类型统一从包根入口导入，不使用 `/layers`、`/draw`、`/plot` 或 `/dist/*` 等深层路径。
- Element 的坐标使用当前 View 投影坐标。经纬度写入前调用 `earth.view.toProjectedCoordinates()`。
- `geometry.type: 'circle'` 的 `radius` 单位固定为米；`style.symbol.radius` 的单位是 CSS 像素。
- `circle.state.geometry.radius` 是业务米制值；`circle.olFeature` 中原生 OL Circle 的半径仍是 View 投影单位。
- Earth 会自动创建 ID 为 `default` 的矢量图层；`draw.start()` 仍需显式传入 `layerId`。
- `Element` 和 `Layer` 由对应服务返回，不要手动调用它们的构造函数。
- Draw、Edit、Transform 和 Measure 是互斥的指针交互；默认启动新会话会取消并替换旧会话。

需要显式声明业务类型时，同样从包根使用 `import type`：

```ts
import type {
  DrawOptions, // 绘制启动参数
  ElementCreateInput, // Element 创建参数
  MeasureResult, // 测量结果
  OverlaySpec, // Overlay 创建参数
  TransformOptions // Transform 启动参数
} from '@vrsim/earth-engine-ol';
```

## 模块目录

- [1. Earth 初始化与销毁](#1-earth-初始化与销毁)
- [2. View 与 Controls](#2-view-与-controls)
- [3. Layers 图层](#3-layers-图层)
- [4. Elements 元素](#4-elements-元素)
- [5. Styles 与 Shapes](#5-styles-与-shapes)
- [6. Draw 与 Edit](#6-draw-与-edit)
- [7. Measure 测量](#7-measure-测量)
- [8. Transform 变换](#8-transform-变换)
- [9. Animations 动画](#9-animations-动画)
- [10. Events 与 ContextMenu](#10-events-与-contextmenu)
- [11. Overlays 与 Descriptor](#11-overlays-与-descriptor)
- [12. Utilities 工具](#12-utilities-工具)
- [生命周期清理建议](#生命周期清理建议)

## 1. Earth 初始化与销毁

`useEarth()` 是常规入口，遵循“没有就创建，有就返回”。

```ts
import { useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

// 创建或获取默认实例。
const earth = useEarth({
  target: 'map', // 地图容器
  view: {
    center: [0, 0], // 当前 View 投影坐标
    zoom: 5 // 初始缩放级别
  }
});

// 相同 ID 始终返回同一个活动实例。
const planning = useEarth({
  id: 'planning', // 实例 ID
  target: 'planning-map' // 命名实例的容器
});
const samePlanning = useEarth('planning');

console.log(planning === samePlanning); // true

// 释放地图、会话、监听、动画和覆盖物等全部资源。
earth.destroy();
planning.destroy();
```

需要完全自行管理且不进入 `useEarth` 注册表时，可以直接创建 `Earth`：

```ts
import { Earth } from '@vrsim/earth-engine-ol';

const standalone = new Earth({
  target: 'preview-map' // 独立地图容器
});

console.log(standalone.lifecycle); // 'ready'
console.log(standalone.isDestroyed); // false

standalone.destroy(); // destroy() 可重复调用
```

`earth.map`、`earth.target` 和 `earth.view.olView` 是只读的 OpenLayers 高级互操作入口。持久业务状态仍应通过本页各服务修改，不要依赖直接修改原生对象反向更新 Element。

## 2. View 与 Controls

### 坐标转换与视图定位

```ts
// EPSG:4326 经纬度转为当前 View 投影坐标。
const center = earth.view.toProjectedCoordinates([
  116.4074, // 经度
  39.9042 // 纬度
]);

earth.view.setCenter(center); // 设置中心点
earth.view.setZoom(10); // 设置缩放级别
earth.view.flyTo(center, 12); // 立即定位到中心点和缩放级别
earth.view.animateFlyTo(center); // 动画定位，可省略动画配置
earth.view.flyHome(); // 动画返回初始中心点

const currentCenter = earth.view.getCenter(); // 当前中心点
const currentZoom = earth.view.getZoom(); // 当前缩放级别
const lngLat = earth.view.toGeographicCoordinates(center); // 转回 EPSG:4326

console.log(currentCenter, currentZoom, lngLat);
```

转换方法也支持扁平坐标和一层嵌套坐标，并保持输入结构：

```ts
const flat = earth.view.toProjectedCoordinates([120, 30, 121, 31]); // 两组扁平经纬度
const nested = earth.view.toProjectedCoordinates([
  [120, 30],
  [121, 31, 500] // 第三维原样保留
]);
```

### 光标、拖拽与屏幕位置

```ts
earth.view.setCursor('pointer'); // 设置 CSS cursor
earth.view.useCrosshairCursor(); // 使用十字光标
earth.view.useDefaultCursor(); // 恢复默认光标
earth.view.setDragEnabled(false); // 禁止地图拖拽
earth.view.setDragEnabled(true); // 恢复地图拖拽

const coordinate = earth.view.coordinateAtPixel([120, 80]); // 屏幕像素转地图坐标
const moved = earth.view.translateCoordinatesToPixel(
  [120, 80], // 目标屏幕像素
  [
    [0, 0],
    [1000, 1000]
  ] // 要整体平移的地图坐标
);

console.log(coordinate, moved);
```

### 跨世界辅助

```ts
const width = earth.view.worldWidth(); // 当前投影的世界宽度
const index = earth.view.worldIndex(20_037_508); // X 坐标所在的世界副本
const normalized = earth.view.normalizeToViewWorld([0, 0]); // 移到当前视图所在副本
const restored = earth.view.restoreToWorld(normalized, index); // 恢复到指定副本

console.log(width, restored);
```

### 地图控件

```ts
earth.controls.enableGraticule(); // 启用经纬网
earth.controls.enableScaleLine(); // 启用比例尺

console.log(earth.controls.graticule); // 当前经纬网实例
console.log(earth.controls.scaleLine); // 当前比例尺实例

earth.controls.disableGraticule(); // 移除经纬网
earth.controls.disableScaleLine(); // 移除比例尺
```

## 3. Layers 图层

### 创建图层

```ts
// 创建矢量图层。
const vector = earth.layers.add({
  kind: 'vector' // 图层类型
});

// 创建 OSM 瓦片图层。
const osm = earth.layers.add({
  kind: 'tile', // 图层类型
  preset: 'osm' // 内置 OSM 数据源
});

// 创建 XYZ 瓦片图层。
const xyz = earth.layers.add({
  kind: 'tile', // 图层类型
  preset: 'xyz', // XYZ 地址模板
  url: 'https://example.com/{z}/{x}/{y}.png' // 瓦片地址
});

// 创建紧凑目录瓦片图层。
const compact = earth.layers.add({
  kind: 'tile', // 图层类型
  preset: 'compact-xyz', // 本地紧凑目录预设
  baseUrl: './tiles' // 瓦片根目录
});
```

接入调用方创建的 OpenLayers 图层时使用 `native`：

```ts
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';

const native = earth.layers.add({
  kind: 'native', // 原生 OpenLayers 图层
  layer: new VectorLayer({ source: new VectorSource() }) // BaseLayer 实例
});

console.log(native.olLayer); // 原生 OpenLayers 图层
```

默认所有权是 `external`，Earth 只解绑调用方传入的原生资源；需要 Earth 负责释放时显式传 `ownership: 'earth'`。

### 查询、更新与移除

```ts
const found = earth.layers.get(vector.id); // 按 ID 获取
const vectors = earth.layers.query('vector'); // 按类型查询

vector.update({ opacity: 0.6 }); // 更新图层
vector.hide(); // 隐藏图层
vector.show(); // 显示图层

console.log(vector.id, vector.kind, vector.state); // 读取当前图层状态
console.log(vector.visible, vector.opacity, vector.zIndex); // 读取显示属性

earth.layers.remove(osm.id); // 按 ID 移除
xyz.remove(); // 通过句柄移除

console.log(found, vectors);
```

```ts
earth.elements.clear(); // 先清理图层内的 Element
earth.layers.clear(); // 再清空全部图层
```

## 4. Elements 元素

Element 是 V2 的业务状态真源。除圆外，内置图形都使用 `type + controlPoints`；圆使用 `type + center + radius`。

### 创建元素

```ts
const pointCoordinate = earth.view.toProjectedCoordinates([116.4074, 39.9042]);

// 创建点元素，只有 geometry 必填。
const point = earth.elements.add({
  geometry: {
    type: 'point', // 图形类型
    controlPoints: [pointCoordinate] // 当前 View 投影坐标
  }
});

// 创建折线元素。
const line = earth.elements.add({
  geometry: {
    type: 'polyline', // 图形类型
    controlPoints: [
      [0, 0],
      [1000, 1000]
    ]
  }
});

// 创建圆元素。
const circle = earth.elements.add({
  geometry: {
    type: 'circle', // 图形类型
    center: [0, 0], // 当前 View 投影坐标
    radius: 1000 // 几何半径，固定为米
  }
});

console.log(point.id, line.state, circle.olFeature);
```

### 查询与批量操作

```ts
const found = earth.elements.get(point.id); // 按 ID 获取
const points = earth.elements.query({ type: 'point' }); // 按选择器查询

earth.elements.update(
  { id: point.id }, // 目标选择器
  { module: 'vehicles' } // 要更新的字段
);
earth.elements.hide({ module: 'vehicles' }); // 批量隐藏
earth.elements.show({ module: 'vehicles' }); // 批量显示

const copy = earth.elements.copy(point.id); // 复制元素
const hit = earth.elements.atPixel([120, 80]); // 命中屏幕位置
const extent = earth.elements.getScreenExtent(copy); // 获取屏幕范围

console.log(found, points, hit, extent);
```

选择器可使用 `id`、`ids`、`module`、`layerId`、`type`、`visible` 或 `predicate`。批量写操作必须提供至少一个选择条件：

```ts
earth.elements.remove({ id: copy.id }); // 按条件删除
point.update({ visible: false }); // 通过句柄更新
line.remove(); // 通过句柄删除
earth.elements.clear(); // 明确清空全部元素
```

## 5. Styles 与 Shapes

### 样式预设与结构化样式

```ts
import { stylePresets } from '@vrsim/earth-engine-ol';

earth.styles.set(
  { id: point.id }, // 目标选择器
  stylePresets['point-default'] // 完整替换样式
);

earth.styles.patch(
  { id: point.id }, // 目标选择器
  {
    symbol: {
      radius: 12 // 圆点显示半径，单位为 CSS 像素
    }
  }
);
```

最小结构化样式示例：

```ts
earth.styles.set(
  { id: line.id }, // 目标选择器
  {
    strokes: [
      {
        color: '#1677ff', // 线颜色
        width: 3 // 线宽，单位为 CSS 像素
      }
    ]
  }
);
```

点、线、面和文字分别使用 `symbol`、`strokes`、`fill` 和 `text`。`stylePresets` 还包含 `icon-default`、`line-default`、`arrow-default`、`polygon-default`、`measure-default`、`draw-preview` 和 `transform-handle`。

### 内置图形

```ts
import { shapeTypes } from '@vrsim/earth-engine-ol';

console.log(shapeTypes); // 查看全部 20 种内置图形名称
```

当前内置图形为：

```text
point, polyline, polygon, circle, ellipse,
attack-arrow, tailed-attack-arrow, fine-arrow,
tailed-squad-combat-arrow, assault-direction-arrow, double-arrow,
rectangle, triangle, equilateral-triangle, assemble-polygon,
closed-curve-polygon, sector, lune-polygon, lune-polyline, curve-polyline
```

V2 暂不提供公共 Shape 注册入口。高级 OpenLayers 样式可通过 `{ nativeStyle: olStyle }` 传入，但不能再使用 `styles.patch()` 做结构化字段更新。

## 6. Draw 与 Edit

### 绘制

`draw.start()` 的必要参数是 `type` 和 `layerId`：

```ts
const draw = earth.draw.start({
  type: 'polygon', // 要绘制的内置图形
  layerId: 'default' // 完成元素写入的矢量图层
});

const offDrawComplete = draw.on('complete', ({ element }) => {
  console.log(element.id); // 绘制完成后返回 Element
});

draw.finished.then((elements) => {
  console.log(elements); // 会话结束后保留的全部结果
});

// 以下操作按实际交互时机选择，不要连续执行：
// draw.undo(); // 撤销当前草图的一步
// draw.redo(); // 重做当前草图的一步
// draw.finish(); // 用户输入足够控制点后提交并结束
// draw.cancel(); // 放弃当前草图并结束
// offDrawComplete(); // 页面卸载时取消事件订阅
// draw.destroy(); // 页面卸载时释放活动会话
```

空草图直接调用 `finish()` 会按未完成取消，不会触发 `complete`。页面卸载时，可先判断 `draw.status === 'active'` 再调用 `destroy()`。

### 编辑已有元素

```ts
const target = earth.elements.get(point.id);

if (target) {
  const edit = earth.draw.edit(target); // 启动动态编辑
  const offModifying = edit.on('modifying', ({ geometry }) => {
    console.log(geometry); // 尚未提交的工作几何
  });

  edit.finished.then((element) => {
    console.log(element); // 提交成功时为目标 Element，取消时为 undefined
  });

  // 以下操作按实际交互时机选择，不要连续执行：
  // edit.undo(); // 撤销一次编辑
  // edit.redo(); // 重做一次编辑
  // edit.finish(); // 提交编辑结果
  // edit.cancel(); // 放弃编辑结果
  // offModifying(); // 页面卸载时取消事件订阅
  // edit.destroy(); // 页面卸载时释放活动会话
}
```

绘制服务创建的结果可单独查询和清理：

```ts
const results = earth.draw.query({ module: 'planning' }); // 查询绘制结果
const removed = earth.draw.clear({ module: 'planning' }); // 清理匹配结果

console.log(results, removed);
```

## 7. Measure 测量

`measure.start()` 只有 `type` 必填：

```ts
import { measureTypes } from '@vrsim/earth-engine-ol';

const measure = earth.measure.start({
  type: 'distance-total' // 测量类型
});

const offMeasureChange = measure.on('change', ({ result }) => {
  console.log(result.formatted); // 交互中的实时结果
});

const offMeasureComplete = measure.on('complete', ({ result }) => {
  console.log(result.formatted); // 已格式化结果
  console.log(result.geographicCoordinates); // EPSG:4326 坐标
});

measure.finished.then((result) => {
  console.log(result); // 完成时为 MeasureResult，取消时为 undefined
});

// 以下操作按实际交互时机选择：
// measure.finish(); // 用户输入足够测量点后完成
// measure.cancel(); // 放弃活动测量
// offMeasureChange(); // 页面卸载时取消变化订阅
// offMeasureComplete(); // 页面卸载时取消完成订阅
// earth.measure.clear(); // 需要移除已有测量展示时调用

console.log(measureTypes); // 全部测量类型
```

可用类型是 `distance-segments`、`distance-total`、`distance-radial` 和 `area`。放弃活动测量时调用 `measure.cancel()`；`MeasureSession` 没有 `destroy()`。

## 8. Transform 变换

### 直接选择元素

```ts
const target = earth.elements.get(point.id);

if (target) {
  const transform = earth.transform.select(target); // 选择并开始变换
  const offTranslate = transform.on('translating', ({ element }) => {
    console.log(element.id); // 正在变换的 Element
  });

  transform.setMode('edit'); // 切换到顶点编辑模式

  // 以下操作按实际交互时机选择，不要连续执行：
  // transform.undo(); // 撤销一次操作
  // transform.redo(); // 重做一次操作
  // transform.finish(); // 提交并结束会话
  // transform.cancel(); // 放弃预览并结束会话
  // offTranslate(); // 页面卸载时取消事件订阅
}
```

等待用户在地图上点击选择时使用：

```ts
const waitingTransform = earth.transform.start(); // 启动等待选择的会话

// waitingTransform.select(point); // 也可以通过代码选择元素
// waitingTransform.cancel(); // 放弃预览并结束会话
```

其他会话操作：

```ts
const commandTransform = earth.transform.select(point);

// 以下命令按需要选择：
// commandTransform.copy(); // 复制当前选中元素
// commandTransform.replaceSelected(circle); // 替换当前选择
// commandTransform.remove(); // 删除当前选中元素
// commandTransform.cancel(); // 结束会话
```

`TransformSession` 没有 `destroy()`，使用 `finish()` 或 `cancel()` 结束。需要内置工具栏时，在启动配置中传 `toolbar: true`，再通过 `transform.toolbar` 调用 `show()`、`hide()` 或 `destroy()`。

```ts
const toolbarSession = earth.transform.select(point, { toolbar: true });
const toolbar = toolbarSession.toolbar;

if (toolbar) {
  toolbar.setActive('edit'); // 激活工具栏项目
  toolbar.updateItem('remove', { disabled: true }); // 更新项目状态
  toolbar.updateOptions({ offset: [12, 8] }); // 更新工具栏视图
  toolbar.hide(); // 隐藏工具栏
  toolbar.show(); // 显示工具栏
  toolbar.destroy(); // 只销毁工具栏视图
}

toolbarSession.cancel(); // 结束 Transform 会话
```

## 9. Animations 动画

动画需要兼容的几何：`pulse` 用于点，`dash-flow` 和 `path-travel` 用于线。

```ts
import { animationTypes } from '@vrsim/earth-engine-ol';

const animation = earth.animations.play(
  { id: point.id }, // 目标 ElementSelector
  { type: 'pulse' } // 动画类型
);

animation.pause(); // 暂停本次动画
animation.resume(); // 继续本次动画
animation.stop(); // 停止本次动画

animation.finished.then(() => {
  console.log(animation.status); // 'stopped' 或 'finished'
});

console.log(animationTypes); // ['pulse', 'dash-flow', 'path-travel']
```

批量控制使用同一个 ElementSelector：

```ts
earth.animations.pause({ module: 'vehicles' }); // 暂停匹配动画
earth.animations.resume({ module: 'vehicles' }); // 恢复匹配动画
earth.animations.stop({ module: 'vehicles' }); // 停止匹配动画
earth.animations.stopAll(); // 停止当前 Earth 的全部动画
```

## 10. Events 与 ContextMenu

### 地图事件

```ts
const offClick = earth.events.on('click', (event) => {
  console.log(event.coordinate); // 当前 View 投影坐标
  console.log(event.element); // 命中时返回 Element
});

const cancelOnce = earth.events.once('rightclick', (event) => {
  console.log(event.pixel); // 相对地图视口的像素位置
});

offClick(); // 取消持续订阅
cancelOnce(); // 事件尚未触发时可提前取消一次性订阅
```

按业务模块订阅和清理：

```ts
const offPlanning = earth.events.on(
  'click',
  (event) => console.log(event.element), // 事件回调
  { module: 'planning' } // 只接收该模块元素的事件
);

console.log(earth.events.has('click', 'planning')); // 是否存在模块订阅
earth.events.clearModule('planning'); // 清除该模块的全部事件订阅
offPlanning(); // 重复清理是安全的
```

公共事件名称包括 `pointermove`、`click`、`leftdown`、`leftup`、`doubleclick`、`rightclick` 和 `keydown`。

### 右键菜单

```ts
const menu = earth.contextMenu.register('map', {
  items: [
    {
      key: 'inspect', // 菜单项唯一标识
      label: '查看位置' // 菜单文字
    }
  ],
  onSelect: (context) => {
    console.log(context.coordinate); // 右键位置
  }
});

earth.contextMenu.setItemState('map', 'inspect', { disabled: true }); // 更新菜单项
const state = earth.contextMenu.getItemState('map', 'inspect'); // 读取菜单项
earth.contextMenu.toggleItem('map', 'inspect'); // 切换菜单项可见状态
earth.contextMenu.setTheme('dark'); // 设置暗色主题
earth.contextMenu.toggleTheme(); // 切换明暗主题
earth.contextMenu.clearElementState(point.id); // 清除一个元素保存的菜单状态
earth.contextMenu.close(); // 关闭当前菜单
menu.destroy(); // 注销本次菜单注册

console.log(state);
```

`register()` 的目标可以是 `'map'`、`{ module: 'planning' }` 或一个实际 `Element`。菜单项状态的读取、修改和切换只接受 `'map'` 或实际 `Element`。

## 11. Overlays 与 Descriptor

### 普通 Overlay

`overlays.add()` 只有 `element` 必填，通常还会同时传入显示位置：

```ts
const marker = document.createElement('div');
marker.textContent = '目标';

const overlay = earth.overlays.add({
  element: marker, // 要显示的 DOM 元素
  position: [0, 0] // 当前 View 投影坐标
});

overlay.update({ positioning: 'bottom-center' }); // 批量更新 Overlay
overlay.setPosition([1000, 1000]); // 更新位置
overlay.hide(); // 隐藏
overlay.show(); // 显示
overlay.panIntoView(); // 平移地图以完整显示
overlay.destroy(); // 销毁并解绑 DOM
```

### Descriptor 标牌

Descriptor 的必要字段是 `type`、`content` 和 `position`：

```ts
const descriptor = earth.overlays.createDescriptor({
  type: 'list', // 内容类型
  content: [
    {
      label: '状态', // 列表项名称
      value: '正常' // 列表项值
    }
  ],
  position: [0, 0] // 当前 View 投影坐标
});

const offClose = descriptor.on('close', () => {
  console.log('标牌已关闭');
});

descriptor.update({ position: [1000, 1000] }); // 更新标牌
descriptor.setPosition([2000, 2000]); // 设置标牌位置
descriptor.hide(); // 隐藏标牌
descriptor.show(); // 显示标牌
descriptor.close(); // 按配置执行隐藏或销毁
offClose(); // 取消事件订阅
descriptor.destroy(); // 释放标牌资源
```

服务级管理：

```ts
const found = earth.overlays.get(overlay.id); // 按 ID 获取
const overlays = earth.overlays.query({ module: 'planning' }); // 按条件查询
const removed = earth.overlays.remove({ module: 'planning' }); // 按条件移除
earth.overlays.clear(); // 清除全部 Overlay 和 Descriptor

console.log(found, overlays, removed);
```

## 12. Utilities 工具

```ts
import {
  add2,
  closeRing,
  createId,
  degToRad,
  lerp2,
  quadraticBezier2,
  radToDeg,
  scale2,
  throttle,
  toFlatCoordinates,
  trimClosingCoordinate
} from '@vrsim/earth-engine-ol';

const sum = add2([1, 2], [3, 4]); // 二维向量相加
const scaled = scale2([2, 3], 2); // 二维向量缩放
const midpoint = lerp2([0, 0], [10, 20], 0.5); // 线性插值
const curvePoint = quadraticBezier2([0, 0], [5, 10], [10, 0], 0.5); // 二次贝塞尔点
const radians = degToRad(180); // 角度转弧度
const degrees = radToDeg(Math.PI); // 弧度转角度
const ring = closeRing([
  [0, 0],
  [10, 0],
  [10, 10]
]); // 闭合坐标环
const openRing = trimClosingCoordinate(ring); // 移除重复闭合点
const flat = toFlatCoordinates([
  [120, 30],
  [121, 31]
]); // 展平坐标
const id = createId(); // 创建 UUID 格式 ID

console.log(sum, scaled, midpoint, curvePoint, radians, degrees, openRing, flat, id);
```

节流函数带有 `flush()` 和 `cancel()`：

```ts
const save = throttle(
  (value: string) => console.log(value), // 要节流的函数
  300 // 最小执行间隔，单位为毫秒
);

save('第一次');
save.flush(); // 立即执行等待中的尾调用
save.cancel(); // 取消等待并清空节流状态
```

V2 还公开以下稳定错误类型，调用方可通过 `instanceof` 分类处理：

```ts
import {
  CapabilityError,
  DuplicateElementIdError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError
} from '@vrsim/earth-engine-ol';

try {
  earth.elements.remove({}); // 空选择器会被拒绝
} catch (error) {
  if (error instanceof InvalidSelectorError) {
    console.error(error.message);
  }
}
```

## 生命周期清理建议

```ts
// 先清理调用方持有的单次注册和活动会话。
offClick();
menu.destroy();
if (measure.status === 'active') measure.cancel();
if (waitingTransform.status === 'active') waitingTransform.cancel();

// 最后销毁 Earth，兜底释放其管理的全部资源。
earth.destroy();
```

事件注销函数、菜单句柄、Overlay 句柄以及 `earth.destroy()` 均可安全重复清理。会话已经进入完成或取消状态时，不需要再次执行另一种终止操作。
