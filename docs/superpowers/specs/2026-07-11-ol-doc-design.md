# ol-doc Design Spec

**Date:** 2026-07-11

## Goal

在 `D:\code\project\ol-doc` 创建一个独立的文档项目，使用 `Vue 3 + TypeScript + Vite + Vue Router + Element Plus`，整体信息架构和阅读体验参考 Element Plus 中文文档站，并基于打包产物 `vrsim-earth-engine-ol-1.0.3.tgz` 交付一个可真实运行的 `PointLayer` 在线示例页。

## Scope

本次只做首版验证，范围包含：

- 文档站基础工程初始化
- 顶部导航、左侧侧栏、右侧页内目录的公共文档布局
- 首页/组件总览页
- `PointLayer` 文档详情页
- 一个可运行的地图示例，直接消费 `vrsim-earth-engine-ol-1.0.3.tgz`
- 对应的示例代码展示
- 手工整理的首版 API 表格

本次不包含：

- 自动从 `.d.ts` 生成文档
- 在线代码编辑器
- 多组件批量接入
- SSR、静态站点生成或部署流程

## Product Direction

首版目标不是做完整文档平台，而是验证三件事：

1. `tgz` 发布包是否能被独立文档项目稳定消费
2. Element Plus 风格的文档阅读体验是否适合该地图引擎
3. 组件说明、在线演示、示例代码、API 表格这一套内容结构是否适合作为后续页面模板

因此优先采用轻量、可扩展、但不过度抽象的实现方式。

## User Experience

### Overall Layout

站点采用三栏式文档布局：

- 顶部导航栏：展示站点标识和一级入口
- 左侧侧边栏：按文档分组组织页面
- 中间主内容区：承载页面正文、示例、API
- 右侧页内目录：展示当前页锚点，便于快速跳转

阅读体验参考 Element Plus 文档站，但不做视觉逐像素复刻。首版优先保证信息层级清晰、留白合理、演示区醒目、移动端不破版。

### Navigation

首版导航结构如下：

- 顶部导航
  - 首页
  - 组件
- 左侧侧栏
  - 指南
    - 首页
    - 组件总览
  - 基础图层
    - PointLayer 点图层

### Homepage

首页兼任组件总览入口，提供：

- 项目简介
- 安装方式，明确依赖来源是 `vrsim-earth-engine-ol-1.0.3.tgz`
- 快速开始片段
- 组件入口卡片，至少包含 `PointLayer`

页面目标是让第一次进入站点的用户在一分钟内知道“这是什么、怎么装、先看哪里”。

### PointLayer Page

`PointLayer` 页面采用组件文档常见节奏：

1. 页面标题和一句摘要
2. 何时使用
3. 基础用法说明
4. 在线示例
5. 示例代码
6. API 表格
7. 注意事项

示例和代码围绕同一套最小可用场景组织，避免文档说明和演示行为脱节。

## Technical Design

### Project Stack

- Vite
- Vue 3
- TypeScript
- Vue Router
- Element Plus
- `vrsim-earth-engine-ol-1.0.3.tgz` 本地文件依赖

### Dependency Strategy

文档项目直接通过本地文件依赖安装 `D:\code\project\ol-engine\vrsim-earth-engine-ol-1.0.3.tgz`，不手动解压拷贝产物。

原因：

- 最贴近真实使用方式
- 可直接消费包内 `dist/index.es.js`、样式和类型声明
- 后续升级到新版本时替换依赖更直接

### Directory Structure

建议采用以下目录组织：

```text
ol-doc/
  src/
    assets/
    components/
      docs/
    config/
    examples/
    layouts/
    router/
    views/
  public/
```

职责约定如下：

- `src/layouts`：文档站公共布局
- `src/views`：页面级视图
- `src/components/docs`：文档站通用组件，例如示例卡片、API 表格、锚点目录
- `src/examples`：真实可运行的地图示例组件
- `src/config`：导航、侧栏、页面元数据
- `src/router`：路由定义

### Page Composition

首版至少包含两个路由页面：

- `/`：首页/组件总览
- `/components/point-layer`：`PointLayer` 文档页

其中 `PointLayer` 页需要拆为下列内容单元：

- 页面头部说明区
- 说明文案区
- 在线示例区
- 代码展示区
- API 表格区

### Demo Architecture

在线示例使用独立 Vue 组件 `MapDemoPointLayer.vue` 承载，职责是：

- 挂载地图容器
- 初始化 `Earth`
- 创建 `PointLayer`
- 提供按钮驱动示例行为
- 在组件卸载时清理实例和监听

交互按钮至少包含：

- 添加默认点
- 添加带标签点
- 更新点位置
- 开始或继续闪烁
- 停止闪烁
- 清空图层

### API Coverage

首版 API 表格手工整理 `PointLayer` 的核心公开方法：

- `constructor(earth?, options?)`
- `add(param)`
- `set(param)`
- `setPosition(id, position)`
- `stopFlash(id?)`
- `continueFlash(id?)`
- `remove(id?)`

文案以“方法名、说明、关键参数、返回值”为主，先保证准确和易读，不追求首版穷尽所有类型细节。

## Data Flow

页面级数据流保持简单：

1. 路由决定当前页面
2. 页面从配置层读取标题、描述、章节锚点等静态内容
3. `PointLayer` 页面把示例组件、示例源码字符串、API 表格数据组装成完整文档内容
4. 示例组件内部独立维护地图实例和点图层实例

这样首版扩展更多图层时，只需要新增页面配置、示例组件和 API 数据，不需要改动主布局。

## Error Handling

首版需要覆盖以下失败场景：

- 本地包安装或解析失败时，开发环境能快速暴露错误
- 地图容器初始化失败时，示例区显示明确提示，不让页面整体崩溃
- 示例组件重复进入和离开页面时，不残留地图 DOM、图层实例或事件监听

不要求本次实现复杂的运行时遥测或错误上报。

## Testing Strategy

首版至少覆盖以下验证层级：

- 基础工程可启动
- 路由可正常进入首页和 `PointLayer` 页
- `PointLayer` 示例可成功渲染地图容器
- 示例按钮可触发核心方法，不出现明显运行时错误
- 布局在桌面宽度和窄屏宽度下不破版

如果项目中引入测试，优先覆盖文档页面的渲染和示例组件的关键生命周期；如果首版更偏搭建验证，也至少要完成手动运行验证并记录可复现步骤。

## Visual Direction

视觉方向参考 Element Plus 中文文档站：

- 轻量、明亮、留白充足
- 信息分层清晰
- 示例卡片优先级高于装饰元素
- 色彩使用以中性色和蓝色系为主，避免过重视觉噪音

但不照搬品牌资产，也不强行复刻站点全部导航和营销内容。

## Implementation Constraints

- 必须创建在 `D:\code\project\ol-doc`
- 必须使用 `Vue 3 + TypeScript`
- 必须使用 `Element Plus`
- 必须直接消费 `vrsim-earth-engine-ol-1.0.3.tgz`
- 必须至少交付一个可真实运行的 `PointLayer` 在线示例
- 首页和 `PointLayer` 页面都需要纳入统一文档布局

## Success Criteria

满足以下条件即可认为首版达成目标：

- `ol-doc` 可以本地启动
- 首页和 `PointLayer` 页面可正常访问
- `PointLayer` 页的在线示例能真实调用包内 API 并产生可见地图效果
- 页面整体阅读体验接近成熟组件文档站
- 该页面结构能够作为后续其他图层页面的模板

## Deferred Work

以下内容明确延期到后续阶段：

- 自动从类型声明或源码生成 API 文档
- 统一的多示例内容模型
- 全站搜索
- 深色模式
- 更多组件页批量接入
- 站点部署与发布自动化
