import {
  Earth,
  shapeTypes,
  stylePresets,
  type ArrowDecorationSpec,
  type CircleSymbolSpec,
  type Color,
  type Coordinate,
  type IconSymbolSpec,
  type PatternFillSpec,
  type ShapeState,
  type ShapeType,
  type SolidFillSpec,
  type StrokeSpec,
  type StyleInput,
  type StylePatch,
  type StylePresetName,
  type StyleSpec,
  type TextSpec
} from '@vrsim/earth-engine-ol';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import type { ScenarioDefinition } from '../harness/types.js';

const iconDataUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="48" viewBox="0 0 96 48"%3E%3Cpath d="M24 2C13 2 5 10 5 21c0 15 19 25 19 25s19-10 19-25C43 10 35 2 24 2z" fill="%231677ff" stroke="white" stroke-width="3"/%3E%3Ccircle cx="24" cy="20" r="7" fill="white"/%3E%3Cg transform="translate(48 0)"%3E%3Cpath d="M24 2C13 2 5 10 5 21c0 15 19 25 19 25s19-10 19-25C43 10 35 2 24 2z" fill="%23fa8c16" stroke="white" stroke-width="3"/%3E%3Ccircle cx="24" cy="20" r="7" fill="white"/%3E%3C/g%3E%3C/svg%3E';

const boardModules = ['style-shapes', 'style-presets', 'style-patterns', 'style-details', 'style-native'] as const;
type BoardModule = (typeof boardModules)[number];

interface NativeStyleEvidence {
  readonly single: { readonly id: string; readonly style: Style };
  readonly array: { readonly id: string; readonly style: Style[] };
  readonly function: { readonly id: string; readonly style: StyleFunction };
}

const shapeLabels: Record<ShapeType, string> = {
  point: '点',
  polyline: '折线',
  polygon: '多边形',
  circle: '圆',
  ellipse: '椭圆',
  'attack-arrow': '进攻箭头',
  'tailed-attack-arrow': '燕尾进攻箭头',
  'fine-arrow': '细箭头',
  'tailed-squad-combat-arrow': '燕尾战斗箭头',
  'assault-direction-arrow': '突击方向箭头',
  'double-arrow': '双箭头',
  rectangle: '矩形',
  triangle: '三角形',
  'equilateral-triangle': '等边三角形',
  'assemble-polygon': '聚集地',
  'closed-curve-polygon': '闭合曲面',
  sector: '扇形',
  'lune-polygon': '弓形面',
  'lune-polyline': '弓形线',
  'curve-polyline': '曲线'
};

const presetLabels: Record<StylePresetName, string> = {
  'point-default': '默认点样式',
  'icon-default': '默认图标样式',
  'line-default': '默认线样式',
  'arrow-default': '默认箭头样式',
  'polygon-default': '默认面样式',
  'measure-default': '默认测量样式',
  'draw-preview': '默认绘制预览样式',
  'transform-handle': '默认变换手柄样式'
};

const lineShapeTypes = new Set<ShapeType>(['polyline', 'lune-polyline', 'curve-polyline']);

export const stylesShapesScenario: ScenarioDefinition = {
  id: 'styles-shapes',
  group: '图层与元素',
  title: '20 种图形与完整样式系统',
  summary: '分五个可视面板验收全部 ShapeType、八种 stylePresets、五种纹理、完整结构化样式及三种原生 StyleLike 分支。',
  steps: [
    '切换“20 种图形”“内置样式”“纹理填充”“完整样式”“三种 nativeStyle”五个面板，逐项确认可视结果。',
    '在 ShapeType 下拉框选择图形，分别应用结构化 StyleSpec、StylePatch、内置 preset、Style、Style[] 和 StyleFunction。',
    '在完整样式面板检查图片偏移/锚点、文本字体/背景、多描边，以及四种箭头 placement。',
    '确认状态区列出 20 种 shapeTypes 和 8 种 stylePresets，自动检查全部通过。'
  ],
  mount(context) {
    const target = context.createMapTarget('图形与样式验收地图');
    const earth = context.trackEarth(new Earth({ target, view: { center: [0, 0], zoom: 2 }, controls: { attribution: false, rotate: false } }));

    createShapeBoard(earth);
    createPresetBoard(earth);
    createPatternBoard(earth);
    createDetailBoard(earth);
    const nativeStyleEvidence = createNativeStyleBoard(earth);
    showBoard(earth, 'style-native', [0, 0], 2.8);
    context.render(earth);
    verifyNativeStyleEvidence(context, earth, nativeStyleEvidence);
    showBoard(earth, 'style-shapes', [0, 0], 2.25);

    const presetNames = Object.keys(stylePresets) as StylePresetName[];
    context.status('shapeTypes', shapeTypes);
    context.status('stylePresets', presetNames);
    context.check('shapeTypes 包含 20 种公开图形', shapeTypes.length === 20 && earth.elements.query({ module: 'style-shapes' }).length === 20);
    context.check('stylePresets 包含 8 种内置样式', presetNames.length === 8);
    context.check('nativeStyle 覆盖 Style、Style[]、StyleFunction 三种 StyleLike', earth.elements.query({ module: 'style-native' }).length === 3);
    context.check(
      '每个 ShapeType 都有可视 Element',
      shapeTypes.every((type) => earth.elements.get(shapeElementId(type)) !== undefined)
    );

    const boards = context.section('可视验收面板', '切换时仅改变各模块 visible，不会重新创建 Element；所有面板均使用同一公开 ElementService。');
    const boardActions = context.actions(boards);
    context.button(
      boardActions,
      '显示 20 种图形',
      () => {
        showBoard(earth, 'style-shapes', [0, 0], 2.25);
        context.status('当前面板', '20 种 ShapeType');
      },
      '主要'
    );
    context.button(boardActions, '显示 8 种 stylePresets', () => {
      showBoard(earth, 'style-presets', [0, 0], 3.1);
      context.status('当前面板', '8 种 stylePresets');
    });
    context.button(boardActions, '显示 5 种纹理填充', () => {
      showBoard(earth, 'style-patterns', [0, 0], 3.2);
      context.status('当前面板', 'PatternFillSpec 五种 pattern');
    });
    context.button(boardActions, '显示完整样式能力', () => {
      showBoard(earth, 'style-details', [0, 0], 2.8);
      context.status('当前面板', '图标、文本、多描边和箭头装饰');
    });
    context.button(boardActions, '显示三种 nativeStyle', () => {
      showBoard(earth, 'style-native', [0, 0], 2.8);
      verifyNativeStyleEvidence(context, earth, nativeStyleEvidence);
      context.status('当前面板', 'Style、Style[]、StyleFunction');
    });

    const editing = context.section(
      'StyleService 操作',
      '选择目标 ShapeType 后，set() 和 patch() 会直接更新对应 Element；nativeStyle 覆盖公开 OpenLayers 的三种 StyleLike。'
    );
    const selectedShape = context.select<ShapeType>(
      editing,
      '目标图形类型 ShapeType',
      shapeTypes.map((type) => ({ label: `${shapeLabels[type]}（${type}）`, value: type })),
      'point'
    );
    const selectedPreset = context.select<StylePresetName>(
      editing,
      '内置样式名称 StylePresetName',
      presetNames.map((name) => ({ label: `${presetLabels[name]}（${name}）`, value: name })),
      'point-default'
    );
    const styleActions = context.actions(editing);
    context.button(
      styleActions,
      'StyleService.set() 结构化样式',
      () => {
        const selector = { id: shapeElementId(selectedShape.value as ShapeType) };
        const style: StyleInput = completeStructuredStyle(`结构化 ${selectedShape.value}`);
        earth.styles.set(selector, style);
        showBoard(earth, 'style-shapes', [0, 0], 2.25);
        context.status('结构化 style', earth.elements.get(selector.id)?.state.style);
        context.check('set() 写入结构化 StyleSpec', earth.elements.get(selector.id)?.state.style !== undefined);
        earth.map.renderSync();
      },
      '主要'
    );
    context.button(styleActions, 'StyleService.patch() 深度补丁', () => {
      const id = shapeElementId(selectedShape.value as ShapeType);
      earth.styles.set({ id }, completeStructuredStyle(`补丁前 ${selectedShape.value}`));
      const patch: StylePatch = {
        symbol: {
          type: 'circle',
          radius: 11,
          fill: { type: 'solid', color: '#722ed1' },
          stroke: { color: '#ffffff', width: 3 }
        },
        strokes: [{ color: '#722ed1', width: 5, lineDash: [14, 8], lineDashOffset: 4, lineCap: 'round', lineJoin: 'round', miterLimit: 8 }],
        fill: { type: 'pattern', pattern: 'diagonal', color: '#722ed1', size: 14, lineWidth: 2, backgroundColor: [114, 46, 209, 0.12] },
        text: {
          text: `已 patch：${selectedShape.value}`,
          fontSize: 15,
          fontWeight: 'bold',
          fill: { type: 'solid', color: '#531dab' },
          backgroundFill: { type: 'solid', color: [255, 255, 255, 0.94] },
          padding: [4, 7, 4, 7]
        },
        decorations: [{ type: 'arrow', placement: 'end', offset: 6 }],
        zIndex: 120
      };
      earth.styles.patch({ id }, patch);
      showBoard(earth, 'style-shapes', [0, 0], 2.25);
      context.status('StylePatch 结果', earth.elements.get(id)?.state.style);
      context.check('patch() 更新全部 StylePatch 根字段', earth.elements.get(id)?.state.style !== undefined);
      earth.map.renderSync();
    });
    context.button(styleActions, 'StyleService.set() 应用 preset', () => {
      const id = shapeElementId(selectedShape.value as ShapeType);
      const presetName = selectedPreset.value as StylePresetName;
      earth.styles.set({ id }, stylePresets[presetName]);
      showBoard(earth, 'style-shapes', [0, 0], 2.25);
      context.status('已应用 preset', { id, presetName });
      context.check('preset 已写入 Element.style', earth.elements.get(id)?.state.style !== undefined);
      earth.map.renderSync();
    });
    context.button(styleActions, 'StyleService.set() 原生 Style', () => {
      const id = shapeElementId(selectedShape.value as ShapeType);
      const nativeStyle = createNativeFeatureStyle('原生 Style', '#fa541c', 12, 200);
      earth.styles.set({ id }, { nativeStyle });
      showBoard(earth, 'style-shapes', [0, 0], 2.25);
      context.status('nativeStyle=Style 目标', id);
      context.check('nativeStyle=Style 保留原生对象身份', earth.elements.get(id)?.olFeature.getStyle() === nativeStyle);
      earth.map.renderSync();
    });
    context.button(styleActions, 'StyleService.set() 原生 Style[]', () => {
      const id = shapeElementId(selectedShape.value as ShapeType);
      const nativeStyle = [createNativeFeatureStyle('原生 Style[]', '#13c2c2', 15, 210), createNativeFeatureStyle('', '#ffffff', 6, 211)];
      earth.styles.set({ id }, { nativeStyle });
      showBoard(earth, 'style-shapes', [0, 0], 2.25);
      context.status('nativeStyle=Style[] 目标', id);
      context.check('nativeStyle=Style[] 保留原生数组身份', earth.elements.get(id)?.olFeature.getStyle() === nativeStyle);
      earth.map.renderSync();
    });
    context.button(styleActions, 'StyleService.set() 原生 StyleFunction', () => {
      const id = shapeElementId(selectedShape.value as ShapeType);
      const resolvedStyle = createNativeFeatureStyle('原生 StyleFunction', '#722ed1', 13, 220);
      const nativeStyle: StyleFunction = () => resolvedStyle;
      earth.styles.set({ id }, { nativeStyle });
      showBoard(earth, 'style-shapes', [0, 0], 2.25);
      context.status('nativeStyle=StyleFunction 目标', id);
      context.check('nativeStyle=StyleFunction 保留函数身份', earth.elements.get(id)?.olFeature.getStyle() === nativeStyle);
      earth.map.renderSync();
    });
    context.button(styleActions, '恢复图形默认展示样式', () => {
      const type = selectedShape.value as ShapeType;
      earth.styles.set({ id: shapeElementId(type) }, shapeBoardStyle(type));
      showBoard(earth, 'style-shapes', [0, 0], 2.25);
      earth.map.renderSync();
    });

    context.setCode(`
import { Earth, shapeTypes, stylePresets } from '@vrsim/earth-engine-ol';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';

const earth = new Earth({ target: 'map' });
const element = earth.elements.add({
  geometry: { type: 'point', controlPoints: [[0, 0]] },
  style: stylePresets['point-default']
});

earth.styles.set({ id: element.id }, {
  symbol: { type: 'circle', radius: 8 },
  text: { text: '结构化样式', fontSize: 16, fill: { type: 'solid', color: '#1677ff' } }
});

earth.styles.patch({ id: element.id }, {
  symbol: { radius: 12 },
  text: { backgroundFill: { type: 'solid', color: '#ffffff' } }
});

const singleStyle = new Style({
  image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#fa541c' }) })
});
const styleArray = [
  new Style({ image: new CircleStyle({ radius: 14, fill: new Fill({ color: '#13c2c2' }) }) }),
  new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#ffffff' }) }) })
];
const styleFunction: StyleFunction = () =>
  new Style({ image: new CircleStyle({ radius: 11, fill: new Fill({ color: '#722ed1' }) }) });

earth.elements.add({ geometry: { type: 'point', controlPoints: [[1, 0]] }, style: { nativeStyle: singleStyle } });
earth.elements.add({ geometry: { type: 'point', controlPoints: [[2, 0]] }, style: { nativeStyle: styleArray } });
earth.elements.add({ geometry: { type: 'point', controlPoints: [[3, 0]] }, style: { nativeStyle: styleFunction } });

console.log(shapeTypes);
`);
  }
};

function createNativeStyleBoard(earth: Earth): NativeStyleEvidence {
  const singleStyle = createNativeFeatureStyle('Style 单对象', '#fa541c', 16, 300);
  const arrayStyle = [createNativeFeatureStyle('Style[] 数组', '#13c2c2', 19, 310), createNativeFeatureStyle('', '#ffffff', 8, 311)];
  const functionResult = createNativeFeatureStyle('StyleFunction 函数', '#722ed1', 17, 320);
  const functionStyle: StyleFunction = () => functionResult;
  const evidence: NativeStyleEvidence = {
    single: { id: 'native-style-single', style: singleStyle },
    array: { id: 'native-style-array', style: arrayStyle },
    function: { id: 'native-style-function', style: functionStyle }
  };
  const samples: readonly [id: string, x: number, nativeStyle: Style | Style[] | StyleFunction][] = [
    [evidence.single.id, -1_500_000, evidence.single.style],
    [evidence.array.id, 0, evidence.array.style],
    [evidence.function.id, 1_500_000, evidence.function.style]
  ];
  for (const [id, x, nativeStyle] of samples) {
    earth.elements.add({
      id,
      geometry: { type: 'point', controlPoints: [[x, 0]] },
      style: { nativeStyle },
      data: { styleLike: id },
      module: 'style-native',
      visible: false
    });
  }
  return evidence;
}

function createNativeFeatureStyle(label: string, color: string, radius: number, zIndex: number): Style {
  return new Style({
    image: new CircleStyle({ radius, fill: new Fill({ color }), stroke: new Stroke({ color: '#ffffff', width: 4 }) }),
    stroke: new Stroke({ color, width: 6, lineDash: [18, 10] }),
    fill: new Fill({ color: `${color}33` }),
    ...(label.length === 0
      ? {}
      : {
          text: new Text({
            text: label,
            font: 'bold 15px Microsoft YaHei, sans-serif',
            fill: new Fill({ color: '#16324f' }),
            backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.94)' }),
            padding: [5, 8, 5, 8],
            offsetY: -34
          })
        }),
    zIndex
  });
}

function verifyNativeStyleEvidence(context: Parameters<ScenarioDefinition['mount']>[0], earth: Earth, evidence: NativeStyleEvidence): void {
  const single = earth.elements.get(evidence.single.id);
  const array = earth.elements.get(evidence.array.id);
  const functionElement = earth.elements.get(evidence.function.id);
  const elements = [single, array, functionElement];
  context.check('nativeStyle=Style 保留原生对象身份', single?.olFeature.getStyle() === evidence.single.style);
  context.check('nativeStyle=Style[] 保留原生数组身份', array?.olFeature.getStyle() === evidence.array.style);
  context.check('nativeStyle=StyleFunction 保留原生函数身份', functionElement?.olFeature.getStyle() === evidence.function.style);
  context.check(
    '三种 StyleLike 样例均处于可见状态',
    elements.every((element) => element?.state.visible === true)
  );
  earth.map.updateSize();
  earth.map.renderSync();
  const mapSize = earth.map.getSize();
  const resolution = earth.view.olView.getResolution();
  context.check(
    '三种 StyleLike 均位于视口并解析为可渲染 Style',
    mapSize !== undefined &&
      resolution !== undefined &&
      elements.every((element) => {
        if (element === undefined || element.state.geometry.type !== 'point') return false;
        const coordinate = element.state.geometry.controlPoints[0];
        if (coordinate === undefined) return false;
        const pixel = earth.map.getPixelFromCoordinate([...coordinate]);
        const inViewport =
          pixel[0] !== undefined && pixel[1] !== undefined && pixel[0] >= 0 && pixel[1] >= 0 && pixel[0] <= mapSize[0] && pixel[1] <= mapSize[1];
        const resolved = element.olFeature.getStyleFunction()?.(element.olFeature, resolution);
        const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
        return inViewport && styles.length > 0 && styles.every((style) => style instanceof Style);
      })
  );
  context.status('nativeStyle 可视样例', [
    { id: evidence.single.id, branch: 'Style' },
    { id: evidence.array.id, branch: 'Style[]' },
    { id: evidence.function.id, branch: 'StyleFunction' }
  ]);
}

function createShapeBoard(earth: Earth): void {
  shapeTypes.forEach((type, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const origin: Coordinate = [(column - 2) * 3_000_000, (1.5 - row) * 2_400_000];
    earth.elements.add({
      id: shapeElementId(type),
      geometry: shapeGeometry(type, origin, 170_000),
      style: shapeBoardStyle(type),
      data: { label: shapeLabels[type], type },
      module: 'style-shapes',
      visible: true
    });
  });
}

function createPresetBoard(earth: Earth): void {
  const entries = Object.keys(stylePresets) as StylePresetName[];
  entries.forEach((name, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const origin: Coordinate = [(column - 1.5) * 3_000_000, (0.6 - row) * 3_000_000];
    earth.elements.add({
      id: `preset-${name}`,
      geometry: presetGeometry(name, origin),
      style: stylePresets[name],
      data: { preset: name },
      module: 'style-presets',
      visible: false
    });
    earth.elements.add({
      id: `preset-label-${name}`,
      geometry: { type: 'point', controlPoints: [[origin[0], origin[1] - 700_000]] },
      style: labelStyle(name),
      module: 'style-presets',
      visible: false
    });
  });
}

function createPatternBoard(earth: Earth): void {
  const patterns: readonly PatternFillSpec['pattern'][] = ['diagonal', 'cross', 'dot', 'horizontal', 'vertical'];
  patterns.forEach((pattern, index) => {
    const x = (index - 2) * 2_600_000;
    const fill: PatternFillSpec = {
      type: 'pattern',
      pattern,
      color: index % 2 === 0 ? '#1677ff' : ([82, 196, 26, 0.95] as Color),
      size: 16,
      lineWidth: 2,
      dotRadius: 3,
      backgroundColor: [255, 255, 255, 0.92]
    };
    earth.elements.add({
      id: `pattern-${pattern}`,
      geometry: {
        type: 'polygon',
        controlPoints: [
          [x - 900_000, -900_000],
          [x + 900_000, -900_000],
          [x + 900_000, 900_000],
          [x - 900_000, 900_000]
        ]
      },
      style: {
        strokes: [{ color: '#16324f', width: 3 }],
        fill,
        text: {
          text: pattern,
          fontSize: 15,
          fontWeight: 'bold',
          fill: { type: 'solid', color: '#16324f' },
          backgroundFill: { type: 'solid', color: [255, 255, 255, 0.9] },
          padding: [4, 7, 4, 7]
        }
      },
      module: 'style-patterns',
      visible: false
    });
  });
}

function createDetailBoard(earth: Earth): void {
  const circleSymbol: CircleSymbolSpec = {
    type: 'circle',
    radius: 18,
    fill: { type: 'pattern', pattern: 'dot', color: '#722ed1', size: 10, dotRadius: 2, backgroundColor: '#f9f0ff' },
    stroke: { color: '#531dab', width: 4, lineDash: [6, 4], lineCap: 'round' }
  };
  earth.elements.add({
    id: 'detail-circle-symbol',
    geometry: { type: 'point', controlPoints: [[-4_500_000, 2_200_000]] },
    style: { symbol: circleSymbol, text: detailLabel('CircleSymbolSpec') },
    module: 'style-details',
    visible: false
  });

  const iconSymbol: IconSymbolSpec = {
    type: 'icon',
    src: iconDataUrl,
    size: [48, 48],
    color: [255, 255, 255, 1],
    offset: [48, 0],
    displacement: [12, -8],
    scale: [1.15, 0.95],
    rotation: 0.15,
    rotateWithView: false,
    anchor: [0.5, 1],
    anchorOrigin: 'top-left',
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
    origin: 'top-left',
    opacity: 0.92,
    crossOrigin: null
  };
  earth.elements.add({
    id: 'detail-icon-symbol',
    geometry: { type: 'point', controlPoints: [[-1_500_000, 2_200_000]] },
    style: { symbol: iconSymbol, text: detailLabel('IconSymbolSpec') },
    module: 'style-details',
    visible: false
  });

  const fullStroke: StrokeSpec = {
    color: '#1677ff',
    width: 7,
    lineDash: [18, 10],
    lineDashOffset: 5,
    lineCap: 'round',
    lineJoin: 'miter',
    miterLimit: 9,
    fitPatternOnce: true
  };
  earth.elements.add({
    id: 'detail-multiple-strokes',
    geometry: {
      type: 'polyline',
      controlPoints: [
        [1_000_000, 2_000_000],
        [3_000_000, 2_800_000],
        [5_000_000, 1_900_000]
      ]
    },
    style: {
      strokes: [{ color: '#ffffff', width: 12, lineCap: 'square', lineJoin: 'bevel' }, fullStroke],
      text: detailLabel('StrokeSpec / 多描边')
    },
    module: 'style-details',
    visible: false
  });

  const solidFill: SolidFillSpec = { type: 'solid', color: [22, 119, 255, 0.2] };
  const fullText: TextSpec = {
    text: '完整 TextSpec 沿线重复',
    font: 'italic bold 18px sans-serif',
    fontFamily: 'Microsoft YaHei, sans-serif',
    fontSize: '18px',
    fontWeight: 700,
    fontStyle: 'italic',
    fill: { type: 'solid', color: '#ffffff' },
    stroke: { color: '#16324f', width: 4 },
    backgroundFill: { type: 'pattern', pattern: 'horizontal', color: '#1677ff', size: 12, lineWidth: 2, backgroundColor: [22, 119, 255, 0.86] },
    backgroundStroke: { color: '#ffffff', width: 2 },
    padding: [6, 10, 6, 10],
    offsetX: 5,
    offsetY: -8,
    scale: [1, 1],
    textAlign: 'center',
    textBaseline: 'middle',
    rotation: 0,
    rotateWithView: false,
    overflow: true,
    placement: 'line',
    maxAngle: Math.PI / 3,
    repeat: 260,
    justify: 'center',
    keepUpright: true
  };
  earth.elements.add({
    id: 'detail-full-text',
    geometry: {
      type: 'polyline',
      controlPoints: [
        [-5_500_000, 200_000],
        [-2_500_000, 700_000],
        [500_000, 100_000],
        [3_500_000, 600_000],
        [5_500_000, 0]
      ]
    },
    style: { strokes: [{ color: '#1677ff', width: 5 }], fill: solidFill, text: fullText, zIndex: 80 },
    module: 'style-details',
    visible: false
  });

  const placements: readonly ArrowDecorationSpec['placement'][] = ['start', 'end', 'each-segment', 'repeat'];
  placements.forEach((placement, index) => {
    const y = -1_600_000 - index * 900_000;
    const decoration: ArrowDecorationSpec = {
      type: 'arrow',
      placement,
      ...(placement === 'start' ? { symbol: { ...iconSymbol, size: [24, 24], scale: 0.7, anchor: [0.5, 0.5] } } : {}),
      offset: 12,
      spacing: 420_000
    };
    earth.elements.add({
      id: `detail-arrow-${placement}`,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [-4_500_000, y],
          [-1_500_000, y + 350_000],
          [1_500_000, y - 200_000],
          [4_500_000, y + 250_000]
        ]
      },
      style: {
        strokes: [{ color: ['#13c2c2', '#1677ff', '#722ed1', '#fa541c'][index] ?? '#1677ff', width: 4 }],
        text: {
          ...detailLabel(`ArrowDecorationSpec：${placement}`),
          placement: 'point',
          offsetY: -18
        },
        decorations: [decoration],
        zIndex: 90 + index
      },
      module: 'style-details',
      visible: false
    });
  });
}

function showBoard(earth: Earth, module: BoardModule, center: Coordinate, zoom: number): void {
  for (const candidate of boardModules) earth.elements.hide({ module: candidate });
  earth.elements.show({ module });
  earth.view.flyTo(center, zoom);
  earth.map.renderSync();
}

function shapeElementId(type: ShapeType): string {
  return `shape-${type}`;
}

function shapeGeometry(type: ShapeType, origin: Coordinate, unit: number): ShapeState {
  if (type === 'circle') return { type, center: origin, radius: unit * 2.2 };
  const template = shapeTemplates[type];
  return {
    type,
    controlPoints: template.map(([x, y]) => [origin[0] + x * unit, origin[1] + y * unit] as Coordinate)
  } as ShapeState;
}

function shapeBoardStyle(type: ShapeType): StyleSpec {
  const color = shapeColor(type);
  const base: StyleSpec = {
    symbol: {
      type: 'circle',
      radius: 7,
      fill: { type: 'solid', color },
      stroke: { color: '#ffffff', width: 2 }
    },
    strokes: [
      { color: '#ffffff', width: 6, lineCap: 'round', lineJoin: 'round' },
      { color, width: 3, lineCap: 'round', lineJoin: 'round' }
    ],
    text: {
      text: `${shapeLabels[type]}\n${type}`,
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: 12,
      fontWeight: 'bold',
      fill: { type: 'solid', color: '#16324f' },
      backgroundFill: { type: 'solid', color: [255, 255, 255, 0.9] },
      padding: [3, 5, 3, 5],
      offsetY: -15,
      overflow: true
    },
    zIndex: 20
  };
  if (type === 'point') return base;
  if (lineShapeTypes.has(type)) return { ...base, symbol: undefined, fill: undefined };
  return { ...base, symbol: undefined, fill: { type: 'solid', color: colorWithAlpha(color, 0.2) } };
}

function completeStructuredStyle(label: string): StyleSpec {
  return {
    symbol: {
      type: 'circle',
      radius: 10,
      fill: { type: 'pattern', pattern: 'dot', color: '#1677ff', size: 10, dotRadius: 2, backgroundColor: '#ffffff' },
      stroke: { color: '#16324f', width: 3 }
    },
    strokes: [
      { color: '#ffffff', width: 9 },
      { color: '#1677ff', width: 5, lineDash: [16, 8], lineDashOffset: 3, lineCap: 'round', lineJoin: 'round', miterLimit: 8, fitPatternOnce: true }
    ],
    fill: { type: 'pattern', pattern: 'cross', color: '#1677ff', size: 14, lineWidth: 2, backgroundColor: [22, 119, 255, 0.14] },
    text: {
      text: label,
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: 15,
      fontWeight: 'bold',
      fill: { type: 'solid', color: '#16324f' },
      backgroundFill: { type: 'solid', color: [255, 255, 255, 0.92] },
      backgroundStroke: { color: '#1677ff', width: 1 },
      padding: [4, 7, 4, 7],
      offsetY: -18,
      overflow: true
    },
    decorations: [{ type: 'arrow', placement: 'end', offset: 6, spacing: 300_000 }],
    zIndex: 100
  };
}

function presetGeometry(name: StylePresetName, origin: Coordinate): ShapeState {
  if (name === 'point-default' || name === 'icon-default' || name === 'transform-handle') {
    return { type: 'point', controlPoints: [origin] };
  }
  if (name === 'line-default' || name === 'arrow-default' || name === 'measure-default') {
    return {
      type: 'polyline',
      controlPoints: [
        [origin[0] - 850_000, origin[1] - 250_000],
        [origin[0], origin[1] + 350_000],
        [origin[0] + 850_000, origin[1] - 150_000]
      ]
    };
  }
  return {
    type: 'polygon',
    controlPoints: [
      [origin[0] - 700_000, origin[1] - 450_000],
      [origin[0] + 700_000, origin[1] - 450_000],
      [origin[0] + 500_000, origin[1] + 500_000],
      [origin[0] - 600_000, origin[1] + 450_000]
    ]
  };
}

function labelStyle(text: string): StyleSpec {
  return {
    symbol: { type: 'circle', radius: 1, fill: { type: 'solid', color: [0, 0, 0, 0] } },
    text: detailLabel(text)
  };
}

function detailLabel(text: string): TextSpec {
  return {
    text,
    fontFamily: 'Microsoft YaHei, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: { type: 'solid', color: '#16324f' },
    backgroundFill: { type: 'solid', color: [255, 255, 255, 0.92] },
    padding: [4, 7, 4, 7],
    offsetY: -28,
    overflow: true
  };
}

function shapeColor(type: ShapeType): string {
  const index = shapeTypes.indexOf(type);
  return ['#1677ff', '#13c2c2', '#52c41a', '#722ed1', '#fa8c16'][index % 5] ?? '#1677ff';
}

function colorWithAlpha(color: string, alpha: number): Color {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

const shapeTemplates: Record<Exclude<ShapeType, 'circle'>, readonly Coordinate[]> = {
  point: [[0, 0]],
  polyline: [
    [-2, -1],
    [0, 1],
    [2, -0.5]
  ],
  polygon: [
    [-2, -1],
    [2, -1],
    [1, 1.5],
    [-1.5, 1]
  ],
  ellipse: [
    [-2, -1],
    [2, 1]
  ],
  'attack-arrow': [
    [-2, -1],
    [-0.5, -1],
    [0.5, 1],
    [2.5, 1.5]
  ],
  'tailed-attack-arrow': [
    [-2, -1],
    [-0.5, -1],
    [0.5, 1],
    [2.5, 1.5]
  ],
  'fine-arrow': [
    [-2, -1],
    [2, 1.5]
  ],
  'tailed-squad-combat-arrow': [
    [-2, -1],
    [2, 1.5]
  ],
  'assault-direction-arrow': [
    [-2, -1],
    [2, 1.5]
  ],
  'double-arrow': [
    [-2, -1],
    [2, -1],
    [1.5, 1.5],
    [-1.5, 1.5],
    [0, -0.8]
  ],
  rectangle: [
    [-2, -1],
    [2, 1]
  ],
  triangle: [
    [-2, -1],
    [2, -1],
    [0, 1.5]
  ],
  'equilateral-triangle': [
    [-2, -1],
    [2, -1]
  ],
  'assemble-polygon': [
    [-2, -1],
    [0, 1.5],
    [2, -1]
  ],
  'closed-curve-polygon': [
    [-2, -1],
    [2, -1],
    [2, 1],
    [-2, 1]
  ],
  sector: [
    [-1.5, -1],
    [2, -1],
    [-1.5, 2]
  ],
  'lune-polygon': [
    [-2, -1],
    [2, -1],
    [0, 1.5]
  ],
  'lune-polyline': [
    [-2, -1],
    [2, -1],
    [0, 1.5]
  ],
  'curve-polyline': [
    [-2, -1],
    [0, 1.5],
    [2, -1]
  ]
};
