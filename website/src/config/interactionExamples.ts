import type { ShapeType } from '@vrsim/earth-engine-ol';

export type InteractionTargetId = 'point-icon' | 'polyline' | 'polygon' | 'circle' | 'tailed-attack-arrow';

export interface InteractionTargetExample {
  readonly id: InteractionTargetId;
  readonly label: string;
  readonly type: ShapeType;
  readonly description: string;
  readonly edit: {
    readonly move: boolean;
    readonly insert: boolean;
    readonly remove: boolean;
  };
  readonly transform: {
    readonly translate: boolean;
    readonly rotate: boolean;
    readonly scale: boolean;
    readonly vertex: boolean;
  };
}

/** Edit 与 Transform 文档共用的目标目录，能力值与内置 ShapeDefinition 保持一致。 */
export const interactionTargetExamples: readonly InteractionTargetExample[] = Object.freeze([
  Object.freeze({
    id: 'point-icon',
    label: '图标点 Point / Icon',
    type: 'point',
    description: '拖动唯一锚点改变位置；Transform 还可缩放和旋转图标样式。',
    edit: Object.freeze({ move: true, insert: false, remove: false }),
    transform: Object.freeze({ translate: true, rotate: true, scale: true, vertex: true })
  }),
  Object.freeze({
    id: 'polyline',
    label: '折线 Polyline',
    type: 'polyline',
    description: '既有顶点可移动、删除，线段中点可插入新顶点。',
    edit: Object.freeze({ move: true, insert: true, remove: true }),
    transform: Object.freeze({ translate: true, rotate: true, scale: true, vertex: true })
  }),
  Object.freeze({
    id: 'polygon',
    label: '多边形 Polygon',
    type: 'polygon',
    description: '闭合拓扑支持移动、插入和删除顶点，并保持最小面约束。',
    edit: Object.freeze({ move: true, insert: true, remove: true }),
    transform: Object.freeze({ translate: true, rotate: true, scale: true, vertex: true })
  }),
  Object.freeze({
    id: 'circle',
    label: '圆 Circle',
    type: 'circle',
    description: '两个锚点分别控制圆心与米制半径，不提供插入、删除和旋转。',
    edit: Object.freeze({ move: true, insert: false, remove: false }),
    transform: Object.freeze({ translate: true, rotate: false, scale: true, vertex: true })
  }),
  Object.freeze({
    id: 'tailed-attack-arrow',
    label: '燕尾进攻箭头 Plot',
    type: 'tailed-attack-arrow',
    description: '复杂 Plot 箭头由 ShapeDefinition 重建，支持结构化顶点编辑和完整变换。',
    edit: Object.freeze({ move: true, insert: true, remove: true }),
    transform: Object.freeze({ translate: true, rotate: true, scale: true, vertex: true })
  })
]);

export const interactionTargetById: Readonly<Record<InteractionTargetId, InteractionTargetExample>> = Object.freeze(
  Object.fromEntries(interactionTargetExamples.map((example) => [example.id, example])) as Record<InteractionTargetId, InteractionTargetExample>
);
