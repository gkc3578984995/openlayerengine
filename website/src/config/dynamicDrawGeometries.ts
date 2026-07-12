const dynamicDrawEditMethods = {
  drawCircle: 'editCircle',
  drawEllipse: 'editEllipse',
  drawAttackArrow: 'editAttackArrow',
  drawTailedAttackArrow: 'editTailedAttackArrow',
  drawFineArrow: 'editFineArrow',
  drawTailedSquadCombatArrow: 'editTailedSquadCombatArrow',
  drawAssaultDirectionArrow: 'editAssaultDirectionArrow',
  drawDoubleArrow: 'editDoubleArrow',
  drawRectAnglePolygon: 'editRectAnglePolygon',
  drawTrianglePolygon: 'editTrianglePolygon',
  drawEquilateralTrianglePolygon: 'editEquilateralTrianglePolygon',
  drawAssemblePolygon: 'editAssemblePolygon',
  drawClosedCurvePolygon: 'editClosedCurvePolygon',
  drawSectorPolygon: 'editSectorPolygon',
  drawLunePolygon: 'editLunePolygon',
  drawLunePolyline: 'editLunePolyline',
  drawCurvePolyline: 'editCurvePolyline',
  drawPolygon: 'editPolygon',
  drawLine: 'editPolyline',
  drawPoint: 'editPoint'
} as const;

export type DynamicDrawMethod = keyof typeof dynamicDrawEditMethods;
export type DynamicEditMethod = (typeof dynamicDrawEditMethods)[DynamicDrawMethod];
type DynamicDrawGeometryGroup = '范围' | '箭头' | '区域' | '线' | '基础几何';

interface DynamicDrawGeometryDefinition<T extends DynamicDrawMethod = DynamicDrawMethod> {
  value: string;
  label: string;
  group: DynamicDrawGeometryGroup;
  drawMethod: T;
  editDescription: string;
}

export interface DynamicDrawGeometry<T extends DynamicDrawMethod = DynamicDrawMethod> extends DynamicDrawGeometryDefinition<T> {
  editMethod: (typeof dynamicDrawEditMethods)[T];
}

const addEditMethod = <T extends DynamicDrawMethod>(geometry: DynamicDrawGeometryDefinition<T>): DynamicDrawGeometry<T> => ({ ...geometry, editMethod: dynamicDrawEditMethods[geometry.drawMethod] });

const advancedGeometryDefinitions = [
  { value: 'circle', label: '圆形范围', group: '范围', drawMethod: 'drawCircle', editDescription: '编辑圆形范围，调整圆心和半径' },
  { value: 'ellipse', label: '椭圆范围', group: '范围', drawMethod: 'drawEllipse', editDescription: '编辑椭圆范围，调整中心和轴线' },
  { value: 'attack-arrow', label: '进攻箭头', group: '箭头', drawMethod: 'drawAttackArrow', editDescription: '编辑进攻箭头，拖动控制点调整方向和形状' },
  { value: 'tailed-attack-arrow', label: '燕尾进攻箭头', group: '箭头', drawMethod: 'drawTailedAttackArrow', editDescription: '编辑燕尾进攻箭头，拖动控制点调整箭身和燕尾' },
  { value: 'fine-arrow', label: '细直箭头', group: '箭头', drawMethod: 'drawFineArrow', editDescription: '编辑细直箭头，拖动控制点调整方向和长度' },
  { value: 'tailed-squad-combat-arrow', label: '燕尾单箭头', group: '箭头', drawMethod: 'drawTailedSquadCombatArrow', editDescription: '编辑燕尾单箭头，拖动控制点调整方向和箭尾' },
  { value: 'assault-direction-arrow', label: '攻击方向箭头', group: '箭头', drawMethod: 'drawAssaultDirectionArrow', editDescription: '编辑攻击方向箭头，拖动控制点调整进攻方向' },
  { value: 'double-arrow', label: '双箭头', group: '箭头', drawMethod: 'drawDoubleArrow', editDescription: '编辑双箭头，拖动控制点调整两翼和指向' },
  { value: 'rectangle', label: '矩形区域', group: '区域', drawMethod: 'drawRectAnglePolygon', editDescription: '编辑矩形区域，拖动控制点调整对角范围' },
  { value: 'triangle', label: '三角形区域', group: '区域', drawMethod: 'drawTrianglePolygon', editDescription: '编辑三角形区域，拖动三个控制点调整顶点' },
  { value: 'equilateral-triangle', label: '正三角形区域', group: '区域', drawMethod: 'drawEquilateralTrianglePolygon', editDescription: '编辑正三角形区域，拖动控制点调整方向和尺度' },
  { value: 'assemble', label: '集结地', group: '区域', drawMethod: 'drawAssemblePolygon', editDescription: '编辑集结地，拖动控制点调整范围和方向' },
  { value: 'closed-curve', label: '闭合曲面', group: '区域', drawMethod: 'drawClosedCurvePolygon', editDescription: '编辑闭合曲面，拖动控制点调整曲面边界' },
  { value: 'sector', label: '扇形区域', group: '区域', drawMethod: 'drawSectorPolygon', editDescription: '编辑扇形区域，拖动控制点调整圆心、半径和张角' },
  { value: 'lune-polygon', label: '弓形区域', group: '区域', drawMethod: 'drawLunePolygon', editDescription: '编辑弓形区域，拖动控制点调整两端和弧度' },
  { value: 'lune-polyline', label: '弓形线', group: '线', drawMethod: 'drawLunePolyline', editDescription: '编辑弓形线，拖动控制点调整端点和弧度' },
  { value: 'curve-polyline', label: '曲线', group: '线', drawMethod: 'drawCurvePolyline', editDescription: '编辑曲线，拖动控制点调整曲线路径' }
] satisfies readonly DynamicDrawGeometryDefinition[];

const basicGeometryDefinitions = [
  { value: 'polygon', label: '普通面', group: '基础几何', drawMethod: 'drawPolygon', editDescription: '编辑普通面，拖动顶点调整边界' },
  { value: 'polyline', label: '普通线', group: '基础几何', drawMethod: 'drawLine', editDescription: '编辑普通线，拖动顶点调整路径' },
  { value: 'point', label: '普通点', group: '基础几何', drawMethod: 'drawPoint', editDescription: '编辑普通点，拖动修改位置' }
] satisfies readonly DynamicDrawGeometryDefinition[];

export const advancedDynamicDrawGeometries = advancedGeometryDefinitions.map(addEditMethod);
export const editableDynamicDrawGeometries = [...advancedDynamicDrawGeometries, ...basicGeometryDefinitions.map(addEditMethod)];
export const dynamicDrawGeometryGroups = ['范围', '箭头', '区域', '线', '基础几何'] as const;
