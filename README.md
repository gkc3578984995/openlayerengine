# @vrsim/earth-engine-ol

基于 OpenLayers 7 的 TypeScript 地图基础能力封装库，面向业务地图快速开发。库内封装了地图实例、基础矢量图层、覆盖物、风场、绘制测量、标绘、要素变换、全局事件和常用地理计算工具。

## 功能范围

- 图层：点、线、圆、多边形、图片标牌、覆盖物、风场等。
- 组件：动态绘制、测量、Transform 编辑、Descriptor 标牌、右键菜单。
- 事件：全局地图事件、按模块过滤事件。
- 扩展：态势标绘、飞线、工具栏、Transform interaction。
- 工具：角度转换、世界宽度计算、跨世界坐标归一化、要素平移、闪烁效果等。

## 安装

```bash
npm install @vrsim/earth-engine-ol ol@^7
```

`ol` 是 peer dependency，需要由业务项目显式安装。

## 基础用法

```ts
import { PointLayer, useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';

const earth = useEarth({
  target: 'olContainer',
  view: { center: fromLonLat([119, 39]), zoom: 5 }
});
earth.addLayer(earth.createOsmLayer());

const points = new PointLayer(earth);
points.add({
  id: 'point-1',
  center: fromLonLat([119, 39]),
  size: 8,
  fill: { color: '#ff3b30' },
  data: { name: 'demo' }
});
```

`useEarth()` 是常规单地图的默认入口：首次调用创建并注册默认实例，后续调用返回同一活动实例。销毁后可再次创建。

命名实例适用于同一页面的多个地图：

```ts
import { useEarth } from '@vrsim/earth-engine-ol';

const overview = useEarth({ id: 'overview', target: 'overview' });
const detail = useEarth({ id: 'detail', target: 'detail' });

useEarth('overview') === overview;
useEarth('detail') === detail;
```

`new Earth(viewOptions?, options?)` 仍是完整的公共构造入口。图层和工具内部会显式传递 `Earth`；常规单地图使用默认实例时不需要增加额外样板代码。

## 开发命令

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run verify
```

`npm run verify` 会依次执行类型检查、lint、单元测试和生产构建。

## 文档

```bash
npm run doc
```

TypeDoc 输出目录为 `website/public/api`，由文档站点作为静态资源发布。

## 打包发布

```bash
npm run build
npm pack
```

发布产物位于 `dist`，包含 ESM `.mjs` 入口、CSS 和类型声明。包仅发布 ESM 入口，因为 OpenLayers 本身是 ESM；应用代码应从包根、功能子路径或 `style.css` 导出导入，不要直接引用 `./dist/*`。

## 工程状态

- Rollup 构建已清理历史循环依赖警告。
- `ol` 深路径导入保持 external，不打入库产物。
- `cesium`、`@turf/turf` 不再作为隐式 external 保留。
- 仍有历史 lint warning，主要集中在 plot、Transform、事件层的 `any` 和旧式空实现，建议后续按模块逐步收敛。
