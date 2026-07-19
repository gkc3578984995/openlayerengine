import { shapeTypes } from '@vrsim/earth-engine-ol';
import type { ShapeInput, ShapeType } from '@vrsim/earth-engine-ol';

const shapeExampleGroupDefinitions = [
  { id: 'point', label: '点' },
  { id: 'path', label: '开放路径' },
  { id: 'radial', label: '参数图形' },
  { id: 'area', label: '闭合面' },
  { id: 'arrow', label: '面箭头' }
] as const;

export type ShapeExampleGroupId = (typeof shapeExampleGroupDefinitions)[number]['id'];

export interface ShapeExampleDefinition {
  readonly label: string;
  readonly groupId: ShapeExampleGroupId;
  readonly group: string;
  readonly points: string;
  readonly render: 'Point' | 'LineString' | 'Polygon' | 'Circle';
  readonly description: string;
  /** 仅用于把示例缩放、平移到预览中心，不代表另一份 Shape 状态。 */
  readonly normalizedPoints: readonly (readonly [number, number])[];
}

const definitions = {
  point: {
    label: '点',
    groupId: 'point',
    group: '点',
    points: '1 个控制点',
    render: 'Point',
    description: '圆点或图标由 StyleSpec.symbol 决定。',
    normalizedPoints: [[0, 0]]
  },
  polyline: {
    label: '折线',
    groupId: 'path',
    group: '开放路径',
    points: '2 个及以上',
    render: 'LineString',
    description: '由多个控制点连接成普通折线。',
    normalizedPoints: [
      [0, 0],
      [2, 2],
      [4, 0]
    ]
  },
  polygon: {
    label: '多边形',
    groupId: 'area',
    group: '闭合面',
    points: '3 个及以上',
    render: 'Polygon',
    description: '控制点无需重复首点，引擎会闭合外环。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3]
    ]
  },
  circle: {
    label: '圆',
    groupId: 'radial',
    group: '参数图形',
    points: 'center + radius',
    render: 'Circle',
    description: '由圆心和米制半径定义。',
    normalizedPoints: [
      [0, 0],
      [2, 0]
    ]
  },
  ellipse: {
    label: '椭圆',
    groupId: 'radial',
    group: '参数图形',
    points: '2 个对角控制点',
    render: 'Polygon',
    description: '按轴对齐边界的两个对角点生成。',
    normalizedPoints: [
      [0, 0],
      [4, 2.6]
    ]
  },
  'attack-arrow': {
    label: '进攻箭头',
    groupId: 'arrow',
    group: '面箭头',
    points: '3 个及以上',
    render: 'Polygon',
    description: '支持可变路径控制点的进攻箭头。',
    normalizedPoints: [
      [0, 0],
      [1.4, 0],
      [2.4, 2.2],
      [4.4, 3]
    ]
  },
  'tailed-attack-arrow': {
    label: '燕尾进攻箭头',
    groupId: 'arrow',
    group: '面箭头',
    points: '3 个及以上',
    render: 'Polygon',
    description: '在进攻箭头尾部增加燕尾结构。',
    normalizedPoints: [
      [0, 0],
      [1.4, 0],
      [2.4, 2.2],
      [4.4, 3]
    ]
  },
  'fine-arrow': {
    label: '细箭头',
    groupId: 'arrow',
    group: '面箭头',
    points: '2 个',
    render: 'Polygon',
    description: '用首尾两个控制点生成细长箭头。',
    normalizedPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'tailed-squad-combat-arrow': {
    label: '燕尾战斗箭头',
    groupId: 'arrow',
    group: '面箭头',
    points: '2 个',
    render: 'Polygon',
    description: '用首尾控制点生成带燕尾的战斗箭头。',
    normalizedPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'assault-direction-arrow': {
    label: '突击方向箭头',
    groupId: 'arrow',
    group: '面箭头',
    points: '2 个',
    render: 'Polygon',
    description: '强调突击方向的短宽箭头。',
    normalizedPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'double-arrow': {
    label: '双箭头',
    groupId: 'arrow',
    group: '面箭头',
    points: '规范状态 5 个',
    render: 'Polygon',
    description: '两侧箭头共用中心连接点。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ]
  },
  rectangle: {
    label: '矩形',
    groupId: 'area',
    group: '闭合面',
    points: '2 个对角控制点',
    render: 'Polygon',
    description: '由两个对角点生成轴对齐矩形。',
    normalizedPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  triangle: {
    label: '三角形',
    groupId: 'area',
    group: '闭合面',
    points: '3 个',
    render: 'Polygon',
    description: '三个控制点直接组成三角形。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'equilateral-triangle': {
    label: '等边三角形',
    groupId: 'area',
    group: '闭合面',
    points: '2 个',
    render: 'Polygon',
    description: '由一条基准边生成等边三角形。',
    normalizedPoints: [
      [0, 0],
      [4, 0]
    ]
  },
  'assemble-polygon': {
    label: '集结地',
    groupId: 'area',
    group: '闭合面',
    points: '3 个',
    render: 'Polygon',
    description: '三个控制点生成集结地平滑面。',
    normalizedPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  },
  'closed-curve-polygon': {
    label: '闭合曲面',
    groupId: 'area',
    group: '闭合面',
    points: '3 个及以上',
    render: 'Polygon',
    description: '使用多个控制点拟合平滑闭合面。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3]
    ]
  },
  sector: {
    label: '扇形',
    groupId: 'area',
    group: '闭合面',
    points: '3 个',
    render: 'Polygon',
    description: '依次使用圆心、起始射线和结束射线。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [0, 4]
    ]
  },
  'lune-polygon': {
    label: '弓形面',
    groupId: 'area',
    group: '闭合面',
    points: '3 个',
    render: 'Polygon',
    description: '三个控制点定义一段圆弧及其弦。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'lune-polyline': {
    label: '圆弧线',
    groupId: 'path',
    group: '开放路径',
    points: '3 个',
    render: 'LineString',
    description: '三个控制点定义开放圆弧。',
    normalizedPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'curve-polyline': {
    label: '曲线',
    groupId: 'path',
    group: '开放路径',
    points: '2 个及以上',
    render: 'LineString',
    description: '使用多个控制点拟合开放平滑曲线。',
    normalizedPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  }
} as const satisfies Record<ShapeType, ShapeExampleDefinition>;

export const shapeExampleByType: Readonly<Record<ShapeType, ShapeExampleDefinition>> = Object.freeze(definitions);

export type ShapeExample = ShapeExampleDefinition & { readonly type: ShapeType };

export const shapeExamples: readonly ShapeExample[] = Object.freeze(shapeTypes.map((type) => Object.freeze({ type, ...shapeExampleByType[type] })));

export interface ShapeExampleGroup {
  readonly id: ShapeExampleGroupId;
  readonly label: string;
  readonly examples: readonly ShapeExample[];
}

export const shapeExampleGroups: readonly ShapeExampleGroup[] = Object.freeze(
  shapeExampleGroupDefinitions.map((group) =>
    Object.freeze({
      ...group,
      examples: Object.freeze(shapeExamples.filter((example) => example.groupId === group.id))
    })
  )
);

export const createShapeExampleInput = (type: ShapeType, center: readonly [number, number], scale = 30_000): ShapeInput => {
  if (type === 'circle') return { type, center, radius: scale * 1.8 };

  const points = shapeExampleByType[type].normalizedPoints;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const offsetX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const offsetY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const controlPoints = points.map(([x, y]) => [center[0] + (x - offsetX) * scale, center[1] + (y - offsetY) * scale] as const);
  return { type, controlPoints } as ShapeInput;
};
