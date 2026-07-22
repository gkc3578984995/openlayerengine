# @vrsim/earth-engine-ol

基于 OpenLayers 10.9 的 TypeScript 地图能力库。2.0 以 Earth 为生命周期根节点，通过 Layer、Element 和 Session 提供图层、图形、样式、动画、绘制、编辑、测量、Transform、事件、右键菜单、Overlay 与 Descriptor 能力。

## 环境与安装

- Node.js：`>=24.18.0 <25`
- npm：`>=11 <12`
- 模块格式：ESM
- OpenLayers：`10.9.0`

```bash
npm install @vrsim/earth-engine-ol@2.0.0 ol@10.9.0
```

`ol` 是 optional peer dependency：npm 安装引擎包时不会自动下载它，但业务项目在构建和运行地图前仍必须显式安装 OpenLayers。

## 基础用法

```ts
import { useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const earth = useEarth({
  target: 'map',
  view: { zoom: 5 }
});

earth.layers.add({
  kind: 'tile',
  id: 'basemap',
  preset: 'osm'
});

const center = earth.view.toProjectedCoordinates([119, 39]);
const point = earth.elements.add({
  id: 'point-1',
  geometry: {
    type: 'point',
    controlPoints: center
  },
  style: {
    symbol: {
      type: 'circle',
      radius: 8,
      fill: { type: 'solid', color: '#ff3b30' },
      stroke: { color: '#ffffff', width: 2 }
    }
  },
  data: { name: 'demo' }
});

point.update({ visible: false });
point.update({ visible: true });

earth.destroy();
```

`useEarth()` 按 ID 获取或创建活动实例；同一 ID 的后续调用不会覆盖首次创建时的 `target`、`view` 或 `controls`。调用 `earth.destroy()` 后，再次使用相同 ID 会创建新实例。需要完全自行管理且不进入注册表时，可以使用 `new Earth(options)`。

JavaScript API 和公共类型只从包根入口导入，样式只从 `@vrsim/earth-engine-ol/style.css` 导入。2.0 不提供 1.x 兼容层、CommonJS、功能子路径或 `dist/*` 深路径。

## 开发命令

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run typecheck:tests
npm run lint
npm run format:check
npm run build
npm run verify
```

`npm test` 会先构建发布产物并同步 TypeDoc 数据，再运行完整 Vitest；`npm run verify` 还会先执行类型检查和 ESLint。

## 文档

```bash
npm run docs:dev
npm run docs:build
```

用户文档位于 `website/`。TypeDoc Markdown 输出到 `website/public/api/`，结构化 API 数据输出到 `website/src/generated/`；两者都是可再生成内容。

## 打包发布

```bash
npm run build
npm pack
```

发布包只包含 `dist/`，公开 ESM 入口、类型声明和 `style.css`。OpenLayers 始终保持 external，不会被打入引擎产物。

从 1.x 升级时，请阅读 [MIGRATION.txt](./MIGRATION.txt)。
