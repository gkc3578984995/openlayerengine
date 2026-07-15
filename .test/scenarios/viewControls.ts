import { Earth, type FlyToOptions, type GraticuleOptions, type ScaleLineOptions, type ViewAnimationOptions } from '@vrsim/earth-engine-ol';
import type { Coordinate, Pixel } from '@vrsim/earth-engine-ol';
import OlScaleLine from 'ol/control/ScaleLine.js';
import type MapEvent from 'ol/MapEvent.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Text from 'ol/style/Text.js';
import type { ScenarioDefinition } from '../harness/types.js';

export const viewControlsScenario: ScenarioDefinition = {
  id: 'view-controls',
  group: '核心与实例',
  title: '视图、世界坐标与地图控件',
  summary: '通过中文参数面板验证 ViewService 的定位、动画、光标、拖拽、跨世界和像素换算能力，以及经纬网和比例尺控件。',
  steps: [
    '修改中心、缩放级别和动画时长，依次执行即时定位、动画飞行与返回初始位置。',
    '切换光标和地图拖拽开关，直接在地图上确认交互结果。',
    '启用、禁用经纬网与比例尺，确认 controls.graticule 和 controls.scaleLine 状态同步变化。',
    '执行世界坐标与像素换算，检查点、线、面三种重载均返回结果。'
  ],
  mount(context) {
    const target = context.createMapTarget('视图与控件验收地图');
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 2, minZoom: 1, maxZoom: 18 },
        controls: { attribution: false, rotate: true, zoom: true }
      })
    );
    addReferenceMarkers(earth);
    context.render(earth);

    context.check('ViewService.olView 与 Earth.map 使用同一 View', earth.view.olView === earth.map.getView());
    refreshViewStatus(context, earth);

    const position = context.section('视图定位与动画', '数值使用 EPSG:3857 投影坐标；动画 callback 的完成状态会写入日志。');
    const centerX = context.number(position, '视图中心 center[0]（X）', 2_000_000, { step: 100_000 });
    const centerY = context.number(position, '视图中心 center[1]（Y）', 1_000_000, { step: 100_000 });
    const zoom = context.number(position, '缩放级别 zoom', 4, { min: 1, max: 18, step: 1 });
    const duration = context.number(position, '动画时长 duration（毫秒）', 800, { min: 0, max: 10_000, step: 100 });
    const positionActions = context.actions(position);
    context.button(positionActions, '设置中心与缩放 setCenter() + setZoom()', () => {
      earth.view.setCenter(readCoordinate(centerX, centerY));
      earth.view.setZoom(zoom.valueAsNumber);
      earth.map.renderSync();
      refreshViewStatus(context, earth);
    });
    context.button(positionActions, 'flyTo() 即时定位', () => {
      earth.view.flyTo(readCoordinate(centerX, centerY), zoom.valueAsNumber);
      earth.map.renderSync();
      refreshViewStatus(context, earth);
    });
    context.button(
      positionActions,
      'animateFlyTo() 动画飞行',
      () => {
        const options: FlyToOptions = {
          duration: duration.valueAsNumber,
          zoom: zoom.valueAsNumber,
          easing: easeInOut,
          callback: (completed) => {
            if (context.isDisposed) return;
            context.log(`animateFlyTo() callback：${completed ? '动画完成' : '动画中止'}`, completed ? '成功' : '警告');
            refreshViewStatus(context, earth);
          }
        };
        earth.view.animateFlyTo(readCoordinate(centerX, centerY), options);
      },
      '主要'
    );
    context.button(positionActions, 'flyHome() 返回初始位置', () => {
      const options: ViewAnimationOptions = {
        duration: duration.valueAsNumber,
        easing: easeInOut,
        callback: (completed) => {
          if (context.isDisposed) return;
          context.log(`flyHome() callback：${completed ? '动画完成' : '动画中止'}`, completed ? '成功' : '警告');
          refreshViewStatus(context, earth);
        }
      };
      earth.view.flyHome(options);
    });

    const interaction = context.section('光标与拖拽', 'setCursor() 接受任意非空 CSS cursor；常用默认值另有便捷方法。');
    const cursor = context.select(
      interaction,
      '光标样式 cursor',
      [
        { label: '指针 pointer', value: 'pointer' },
        { label: '抓取 grab', value: 'grab' },
        { label: '等待 wait', value: 'wait' },
        { label: '十字 crosshair', value: 'crosshair' }
      ],
      'pointer'
    );
    const dragEnabled = context.checkbox(interaction, '允许拖拽 setDragEnabled', true, (enabled) => {
      earth.view.setDragEnabled(enabled);
      context.status('拖拽状态', enabled ? '已启用' : '已禁用');
    });
    const cursorActions = context.actions(interaction);
    context.button(cursorActions, '设置自定义光标 setCursor()', () => {
      earth.view.setCursor(cursor.value);
      context.status('当前 cursor', target.querySelector<HTMLElement>('.ol-viewport')?.style.cursor ?? cursor.value);
    });
    context.button(cursorActions, '使用十字光标 useCrosshairCursor()', () => {
      earth.view.useCrosshairCursor();
      cursor.value = 'crosshair';
      context.status('当前 cursor', 'crosshair');
    });
    context.button(cursorActions, '恢复默认光标 useDefaultCursor()', () => {
      earth.view.useDefaultCursor();
      context.status('当前 cursor', 'auto');
    });
    context.button(cursorActions, '切换 setDragEnabled()', () => {
      dragEnabled.checked = !dragEnabled.checked;
      earth.view.setDragEnabled(dragEnabled.checked);
      context.status('拖拽状态', dragEnabled.checked ? '已启用' : '已禁用');
    });

    const controls = context.section('经纬网与比例尺', '完整传入 OpenLayers 10.9 的 GraticuleOptions 与 ScaleLineOptions，并验证专用 target 容器。');
    const scaleLineTargetLabel = document.createElement('p');
    scaleLineTargetLabel.textContent = '比例尺专用目标容器 target';
    const scaleLineTarget = document.createElement('div');
    scaleLineTarget.className = 'acceptance-scale-line-target';
    scaleLineTarget.style.minHeight = '42px';
    scaleLineTarget.style.padding = '8px';
    scaleLineTarget.style.border = '1px dashed rgba(22, 119, 255, 0.45)';
    scaleLineTarget.style.position = 'relative';
    scaleLineTarget.style.overflow = 'hidden';
    controls.append(scaleLineTargetLabel, scaleLineTarget);

    const graticuleOptions: GraticuleOptions = {
      className: 'ol-layer acceptance-graticule-layer',
      opacity: 0.88,
      visible: true,
      extent: [-20_037_508, -20_037_508, 20_037_508, 20_037_508],
      zIndex: 500,
      minResolution: 0,
      maxResolution: 1_000_000,
      minZoom: 0,
      maxZoom: 20,
      maxLines: 120,
      strokeStyle: new Stroke({ color: 'rgba(22, 119, 255, 0.45)', width: 1.5, lineDash: [6, 4] }),
      targetSize: 96,
      showLabels: true,
      lonLabelFormatter: (longitude) => `${longitude.toFixed(1)}° 经度`,
      latLabelFormatter: (latitude) => `${latitude.toFixed(1)}° 纬度`,
      lonLabelPosition: 0.04,
      latLabelPosition: 0.96,
      lonLabelStyle: new Text({
        font: '12px Microsoft YaHei, sans-serif',
        textBaseline: 'bottom',
        fill: new Fill({ color: '#0958d9' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      }),
      latLabelStyle: new Text({
        font: '12px Microsoft YaHei, sans-serif',
        textAlign: 'end',
        fill: new Fill({ color: '#0958d9' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      }),
      intervals: [90, 45, 30, 20, 10, 5, 2, 1, 0.5],
      wrapX: true,
      properties: { acceptanceLabel: '完整 GraticuleOptions', purpose: '人工验收' }
    };
    let scaleRenderCount = 0;
    let scaleLineForRender: OlScaleLine | undefined;
    const scaleLineOptions: ScaleLineOptions = {
      className: 'ol-scale-bar',
      minWidth: 120,
      maxWidth: 260,
      render: (event: MapEvent) => {
        scaleRenderCount += 1;
        if (scaleLineForRender !== undefined) OlScaleLine.prototype.render.call(scaleLineForRender, event);
      },
      target: scaleLineTarget,
      units: 'metric',
      bar: true,
      steps: 4,
      text: true,
      dpi: 96
    };
    const enableFullGraticule = () => {
      const graticule = earth.controls.enableGraticule(graticuleOptions);
      earth.map.renderSync();
      return graticule;
    };
    const enableFullScaleLine = () => {
      scaleLineForRender = undefined;
      const scaleLine = earth.controls.enableScaleLine(scaleLineOptions);
      scaleLineForRender = scaleLine;
      earth.map.renderSync();
      return scaleLine;
    };

    const initialGraticule = enableFullGraticule();
    const initialScaleLine = enableFullScaleLine();
    context.check(
      '全部 GraticuleOptions 已真实传入并保持地图可见',
      Reflect.ownKeys(graticuleOptions).length === 22 &&
        initialGraticule.getClassName() === 'ol-layer acceptance-graticule-layer' &&
        initialGraticule.getVisible() &&
        initialGraticule.get('acceptanceLabel') === '完整 GraticuleOptions'
    );
    context.check(
      '全部 ScaleLineOptions 已真实传入专用 target',
      Reflect.ownKeys(scaleLineOptions).length === 10 &&
        initialScaleLine.getUnits() === 'metric' &&
        initialScaleLine.getMap() === earth.map &&
        scaleLineTarget.querySelector('.ol-scale-bar') !== null &&
        scaleRenderCount > 0
    );
    context.status('GraticuleOptions 全字段', Reflect.ownKeys(graticuleOptions));
    context.status('ScaleLineOptions 全字段', Reflect.ownKeys(scaleLineOptions));

    const controlActions = context.actions(controls);
    context.button(controlActions, '启用经纬网 enableGraticule()', () => {
      const graticule = enableFullGraticule();
      context.status('controls.graticule', graticule === earth.controls.graticule ? '已启用' : '状态异常');
      context.check(
        '经纬网完整选项已添加到地图',
        earth.controls.graticule !== undefined &&
          graticule.getOpacity() === graticuleOptions.opacity &&
          graticule.getMinResolution() === graticuleOptions.minResolution &&
          graticule.getMaxResolution() === graticuleOptions.maxResolution &&
          graticule.getMinZoom() === graticuleOptions.minZoom &&
          graticule.getMaxZoom() === graticuleOptions.maxZoom
      );
    });
    context.button(controlActions, '禁用经纬网 disableGraticule()', () => {
      earth.controls.disableGraticule();
      context.status('controls.graticule', earth.controls.graticule === undefined ? '未启用' : '仍然存在');
      context.check('经纬网已移除', earth.controls.graticule === undefined);
    });
    context.button(controlActions, '启用比例尺 enableScaleLine()', () => {
      const beforeRender = scaleRenderCount;
      const scaleLine = enableFullScaleLine();
      context.status('controls.scaleLine', scaleLine === earth.controls.scaleLine ? '已启用' : '状态异常');
      context.status('ScaleLineOptions.render 调用次数', scaleRenderCount);
      context.check(
        '比例尺完整选项已添加到专用 target',
        earth.controls.scaleLine !== undefined &&
          scaleLine.getUnits() === 'metric' &&
          scaleLine.getMap() === earth.map &&
          scaleLineTarget.querySelector('.ol-scale-bar') !== null &&
          scaleRenderCount > beforeRender
      );
    });
    context.button(controlActions, '禁用比例尺 disableScaleLine()', () => {
      earth.controls.disableScaleLine();
      scaleLineForRender = undefined;
      context.status('controls.scaleLine', earth.controls.scaleLine === undefined ? '未启用' : '仍然存在');
      context.check('比例尺已移除', earth.controls.scaleLine === undefined);
    });

    const coordinates = context.section('世界坐标与像素换算', '同时调用点、折线和面环重载，便于人工检查跨世界恢复与像素锚定结果。');
    const coordinateActions = context.actions(coordinates);
    context.button(coordinateActions, '检查 worldWidth() 与 worldIndex()', () => {
      const width = earth.view.worldWidth();
      const x = width === undefined ? 0 : width * 1.25;
      context.status('worldWidth()', width);
      context.status('worldIndex(x)', earth.view.worldIndex(x));
      context.check('当前投影支持跨世界宽度', width !== undefined && width > 0);
    });
    context.button(coordinateActions, '归一化并恢复世界坐标 normalizeToViewWorld() / restoreToWorld()', () => {
      const width = earth.view.worldWidth() ?? 40_075_016.68557849;
      const point: Coordinate = [width * 1.2, 500_000];
      const line: readonly Coordinate[] = [point, [point[0] + 400_000, 900_000]];
      const rings: readonly (readonly Coordinate[])[] = [[point, [point[0] + 400_000, 500_000], [point[0] + 200_000, 900_000], point]];
      const index = earth.view.worldIndex(point[0]);
      const normalizedPoint = earth.view.normalizeToViewWorld(point);
      const normalizedLine = earth.view.normalizeToViewWorld(line);
      const normalizedRings = earth.view.normalizeToViewWorld(rings);
      const restoredPoint = earth.view.restoreToWorld(normalizedPoint, index);
      const restoredLine = earth.view.restoreToWorld(normalizedLine, index);
      const restoredRings = earth.view.restoreToWorld(normalizedRings, index);
      context.status('归一化点', normalizedPoint);
      context.status('恢复后的点', restoredPoint);
      context.check('点重载可恢复原世界', closeCoordinate(restoredPoint, point));
      context.check('折线重载返回全部坐标', restoredLine.length === line.length);
      context.check('面环重载返回全部环', restoredRings.length === rings.length);
    });
    context.button(coordinateActions, '转换像素与坐标 coordinateAtPixel() / translateCoordinatesToPixel()', () => {
      earth.map.updateSize();
      earth.map.renderSync();
      const size = earth.map.getSize();
      if (size === undefined) throw new Error('地图尚未获得有效尺寸');
      const pixel: Pixel = [size[0] / 2, size[1] / 2];
      const coordinate = earth.view.coordinateAtPixel(pixel);
      if (coordinate === undefined) throw new Error('无法从地图中心像素获得坐标');
      const line: readonly Coordinate[] = [coordinate, [coordinate[0] + 500_000, coordinate[1] + 300_000]];
      const rings: readonly (readonly Coordinate[])[] = [
        [coordinate, [coordinate[0] + 300_000, coordinate[1]], [coordinate[0], coordinate[1] + 300_000], coordinate]
      ];
      const translatedPoint = earth.view.translateCoordinatesToPixel(pixel, coordinate);
      const translatedLine = earth.view.translateCoordinatesToPixel(pixel, line);
      const translatedRings = earth.view.translateCoordinatesToPixel(pixel, rings);
      context.status('地图中心 pixel', pixel);
      context.status('coordinateAtPixel()', coordinate);
      context.check('点重载返回坐标', translatedPoint !== undefined);
      context.check('折线重载返回全部坐标', translatedLine?.length === line.length);
      context.check('面环重载返回全部环', translatedRings?.length === rings.length);
    });

    context.setCode(`
import { Earth, type GraticuleOptions, type ScaleLineOptions } from '@vrsim/earth-engine-ol';
import OlScaleLine from 'ol/control/ScaleLine.js';
import type MapEvent from 'ol/MapEvent.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Text from 'ol/style/Text.js';

const earth = new Earth({
  target: 'map',
  view: { center: [0, 0], zoom: 3 },
  controls: { rotate: false }
});

earth.view.setCenter([2_000_000, 1_000_000]);
earth.view.setZoom(5);
earth.view.animateFlyTo([0, 0], {
  duration: 800,
  zoom: 4,
  easing: (progress) => progress * progress,
  callback: (completed) => console.log(completed)
});

const graticuleOptions: GraticuleOptions = {
  className: 'ol-layer business-graticule',
  opacity: 0.88,
  visible: true,
  extent: [-20_037_508, -20_037_508, 20_037_508, 20_037_508],
  zIndex: 500,
  minResolution: 0,
  maxResolution: 1_000_000,
  minZoom: 0,
  maxZoom: 20,
  maxLines: 120,
  strokeStyle: new Stroke({ color: '#1677ff', width: 1.5 }),
  targetSize: 96,
  showLabels: true,
  lonLabelFormatter: (value) => \`\${value.toFixed(1)}° 经度\`,
  latLabelFormatter: (value) => \`\${value.toFixed(1)}° 纬度\`,
  lonLabelPosition: 0.04,
  latLabelPosition: 0.96,
  lonLabelStyle: new Text({ fill: new Fill({ color: '#0958d9' }) }),
  latLabelStyle: new Text({ fill: new Fill({ color: '#0958d9' }) }),
  intervals: [90, 45, 30, 20, 10, 5, 2, 1, 0.5],
  wrapX: true,
  properties: { purpose: '业务经纬网' }
};
earth.controls.enableGraticule(graticuleOptions);

const scaleTarget = document.querySelector<HTMLElement>('#scale-target')!;
let scaleLine: OlScaleLine | undefined;
const scaleLineOptions: ScaleLineOptions = {
  className: 'ol-scale-bar',
  minWidth: 120,
  maxWidth: 260,
  render: (event: MapEvent) => {
    if (scaleLine !== undefined) OlScaleLine.prototype.render.call(scaleLine, event);
  },
  target: scaleTarget,
  units: 'metric',
  bar: true,
  steps: 4,
  text: true,
  dpi: 96
};
scaleLine = earth.controls.enableScaleLine(scaleLineOptions);
earth.map.renderSync();
`);
  }
};

function readCoordinate(x: HTMLInputElement, y: HTMLInputElement): Coordinate {
  return [x.valueAsNumber, y.valueAsNumber];
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

function closeCoordinate(left: Coordinate, right: Coordinate): boolean {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

function refreshViewStatus(context: Parameters<ScenarioDefinition['mount']>[0], earth: Earth): void {
  context.status('getCenter()', earth.view.getCenter());
  context.status('getZoom()', earth.view.getZoom());
  context.status('olView 投影', earth.view.olView.getProjection().getCode());
}

function addReferenceMarkers(earth: Earth): void {
  const markers: readonly [string, Coordinate, string][] = [
    ['view-home', [0, 0], '初始位置'],
    ['view-east', [2_000_000, 1_000_000], '目标位置'],
    ['view-west', [-2_000_000, -1_000_000], '参考位置']
  ];
  for (const [id, coordinate, label] of markers) {
    earth.elements.add({
      id,
      geometry: { type: 'point', controlPoints: [coordinate] },
      style: {
        symbol: { type: 'circle', radius: 7, fill: { type: 'solid', color: '#1677ff' }, stroke: { color: '#ffffff', width: 2 } },
        text: {
          text: label,
          fontSize: 13,
          fill: { type: 'solid', color: '#16324f' },
          backgroundFill: { type: 'solid', color: [255, 255, 255, 0.88] },
          padding: [3, 6, 3, 6],
          offsetY: -19
        }
      }
    });
  }
}
