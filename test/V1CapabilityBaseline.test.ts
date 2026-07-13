/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Feature from 'ol/Feature';
import { DragPan } from 'ol/interaction';
import OSM from 'ol/source/OSM';
import type View from 'ol/View';
import { describe, expect, it, vi } from 'vitest';
import Earth from '../src/Earth';
import { Utils } from '../src/common';
import DynamicDraw from '../src/components/DynamicDraw';
import GlobalEvent from '../src/components/GlobalEvent';
import Measure from '../src/components/Measure';
import Transform from '../src/components/Transform';
import TransformInteraction from '../src/extends/transform-interaction/TransformInteraction';
import { DrawType, ModifyType } from '../src/interface/dynamicDraw';
import Camera from '../src/modules/Camera';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import {
  fixedLegacyCapabilityIds,
  legacyShapeTypes,
  v1CapabilityManifest,
  v1ExcludedCapabilities,
  v1KnownLimitations,
  type LegacyCapabilityId
} from './fixtures/v1CapabilityManifest.js';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function readInterface(source: string, name: string): string {
  const declaration = new RegExp(`\\binterface\\s+${name}(?:<[^>{]+>)?\\s*(?:extends[^\\{]+)?\\{`).exec(source);
  expect(declaration, `${name} declaration`).not.toBeNull();
  if (!declaration) throw new Error(`Missing interface ${name}`);
  const start = source.indexOf('{', declaration.index);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }
  throw new Error(`Unclosed interface ${name}`);
}

function expectInterfaceKeys(source: string, name: string, keys: readonly string[]): void {
  const body = readInterface(source, name);
  for (const key of keys) expect(body, `${name}.${key}`).toMatch(new RegExp(`\\b${key}\\??\\s*:`));
}

const shapeMethodNames: Record<(typeof legacyShapeTypes)[number], readonly [draw: string, edit: string]> = {
  point: ['drawPoint', 'editPoint'],
  polyline: ['drawLine', 'editPolyline'],
  polygon: ['drawPolygon', 'editPolygon'],
  circle: ['drawCircle', 'editCircle'],
  ellipse: ['drawEllipse', 'editEllipse'],
  'attack-arrow': ['drawAttackArrow', 'editAttackArrow'],
  'tailed-attack-arrow': ['drawTailedAttackArrow', 'editTailedAttackArrow'],
  'fine-arrow': ['drawFineArrow', 'editFineArrow'],
  'tailed-squad-combat-arrow': ['drawTailedSquadCombatArrow', 'editTailedSquadCombatArrow'],
  'assault-direction-arrow': ['drawAssaultDirectionArrow', 'editAssaultDirectionArrow'],
  'double-arrow': ['drawDoubleArrow', 'editDoubleArrow'],
  rectangle: ['drawRectAnglePolygon', 'editRectAnglePolygon'],
  triangle: ['drawTrianglePolygon', 'editTrianglePolygon'],
  'equilateral-triangle': ['drawEquilateralTrianglePolygon', 'editEquilateralTrianglePolygon'],
  'assemble-polygon': ['drawAssemblePolygon', 'editAssemblePolygon'],
  'closed-curve-polygon': ['drawClosedCurvePolygon', 'editClosedCurvePolygon'],
  sector: ['drawSectorPolygon', 'editSectorPolygon'],
  'lune-polygon': ['drawLunePolygon', 'editLunePolygon'],
  'lune-polyline': ['drawLunePolyline', 'editLunePolyline'],
  'curve-polyline': ['drawCurvePolyline', 'editCurvePolyline']
};

describe('v1 capability baseline', () => {
  it('freezes the audited manifest, approved API breaks, limitations, and Wind exclusion', () => {
    expect(v1CapabilityManifest.map((item) => item.id)).toEqual([...fixedLegacyCapabilityIds]);
    expect(new Set(fixedLegacyCapabilityIds).size).toBe(fixedLegacyCapabilityIds.length);
    expect(fixedLegacyCapabilityIds.every((id) => !id.toLowerCase().includes('wind'))).toBe(true);

    const intentionalBreaks = v1CapabilityManifest.filter((item) => item.disposition === 'intentional-api-break');
    expect(intentionalBreaks.map((item) => item.id).sort()).toEqual(
      [
        'public-base-subclass-extension',
        'public-low-level-plot-api',
        'public-low-level-transform-interaction',
        'public-feature-metadata-keys',
        'public-legacy-type-only-ast',
        'earth-default-context-resolution',
        'event-manual-enable-disable'
      ].sort()
    );
    for (const item of intentionalBreaks) {
      expect(item.replacementIds?.length).toBeGreaterThan(0);
      expect(item.specificationSection?.length).toBeGreaterThan(0);
    }
    expect(v1KnownLimitations.map((item) => item.id)).toEqual([
      'descriptor-custom-content',
      'descriptor-close-callback',
      'measure-text-size',
      'measure-total-distance-toggle',
      'dash-flow-single-remove-cleanup',
      'flight-line-listener-cleanup',
      'draw-remove-all-semantics'
    ]);
    expect(v1ExcludedCapabilities).toEqual([{ id: 'wind', reason: '已批准删除' }]);
    for (const item of v1CapabilityManifest) {
      expect(item.legacySources.every(existsSync), item.id).toBe(true);
      expect(item.testFiles.every(existsSync), item.id).toBe(true);
    }
  });

  it('validates declared coverage against the frozen manifest at runtime', () => {
    expect(coversCapabilities('earth-raster-osm-preset', 'camera-fly-home')).toEqual(['earth-raster-osm-preset', 'camera-fly-home']);
    expect(() => coversCapabilities('wind' as LegacyCapabilityId)).toThrowError('Unknown frozen capability: wind');
  });

  it('freezes direct evidence and public OpenLayers native escape hatches', () => {
    const nativeEscape = v1CapabilityManifest.find((item) => item.id === 'public-ol-native-escape');
    const earthSource = readSource('src/Earth.ts');
    const baseSource = readSource('src/base/Base.ts');

    expect(nativeEscape?.legacySources).toEqual(expect.arrayContaining(['src/Earth.ts', 'src/base/Base.ts']));
    expect(nativeEscape?.testFiles).toEqual(expect.arrayContaining(['test/V1CapabilityBaseline.test.ts', 'test/types/V1PublicApi.type-test.ts']));
    expect(earthSource).toMatch(/public\s+map:\s*Map;/);
    expect(earthSource).toMatch(/public\s+view:\s*View;/);
    expect(baseSource).toMatch(/public\s+layer:\s*VectorLayer<VectorSource<Feature<Geometry>>>;/);
    expect(baseSource).toMatch(/getLayer\(\):\s*VectorLayer<VectorSource<Feature<Geometry>>>/);
  });

  it('freezes root exports and OSM, compact XYZ, and custom tile URL behavior', () => {
    const rootEntry = readSource('src/index.ts');
    for (const exportedModule of [
      './Earth.js',
      './modules/index.js',
      './components/index.js',
      './useEarth.js',
      './ast.js',
      './common/index.js',
      './base/index.js',
      './interface/index.js',
      './enum/index.js',
      './extends/index.js'
    ]) {
      expect(rootEntry).toContain(`'${exportedModule}'`);
    }

    const earth = Object.create(Earth.prototype) as Earth;
    const osmLayer = earth.createOsmLayer();
    expect(osmLayer.getSource()).toBeInstanceOf(OSM);

    const xyzLayer = earth.createXyzLayer('https://tiles.example');
    const xyzUrl = xyzLayer.getSource()?.getTileUrlFunction() as (coordinate: [number, number, number]) => string;
    expect(xyzUrl([3, 10, 12])).toBe('https://tiles.example/L03/R0000000C/C0000000A.jpg');

    const customUrl = vi.fn(([z, x, y]: [number, number, number]) => `${z}/${x}/${y}`);
    const customLayer = earth.createXyzLayer(customUrl);
    const customTileUrl = customLayer.getSource()?.getTileUrlFunction() as (coordinate: [number, number, number]) => string;
    expect(customTileUrl([4, 5, 6])).toBe('4/5/6');
    expect(customUrl).toHaveBeenCalledWith([4, 5, 6]);
  });

  it('freezes cursor, DragPan toggles, and pixel-hit payloads through public Earth methods', () => {
    const earth = Object.create(Earth.prototype) as any;
    const target = { style: { cursor: 'auto' } };
    const dragPan = new DragPan();
    const passiveInteraction = { setActive: vi.fn() };
    earth.map = {
      getTargetElement: () => target,
      getInteractions: () => ({ forEach: (callback: (interaction: unknown) => void) => [dragPan, passiveInteraction].forEach(callback) })
    };

    earth.setMouseStyleToCrosshair();
    expect(target.style.cursor).toBe('crosshair');
    earth.setMouseStyleToDefault();
    expect(target.style.cursor).toBe('auto');
    earth.disabledMapDrag();
    expect(dragPan.getActive()).toBe(false);
    earth.enableMapDrag();
    expect(dragPan.getActive()).toBe(true);
    expect(passiveInteraction.setActive).not.toHaveBeenCalled();

    const feature = new Feature();
    feature.setId('feature-1');
    feature.set('module', 'vehicles');
    const layer = { id: 'layer-1' };
    const hasFeatureAtPixel = vi.fn(() => true);
    const forEachFeatureAtPixel = vi.fn((_pixel, callback) => callback(feature, layer));
    earth.map = { hasFeatureAtPixel, forEachFeatureAtPixel };
    const hitPixel = [12, 24];
    expect(earth.getFeatureAtPixel(hitPixel)).toEqual({ isExists: true, id: 'feature-1', module: 'vehicles', feature, layer });
    expect(hasFeatureAtPixel).toHaveBeenCalledWith(hitPixel);
    expect(forEachFeatureAtPixel).toHaveBeenCalledWith(hitPixel, expect.any(Function));

    hasFeatureAtPixel.mockReturnValue(false);
    forEachFeatureAtPixel.mockClear();
    expect(earth.getFeatureAtPixel([0, 0])).toEqual({ isExists: false });
    expect(forEachFeatureAtPixel).not.toHaveBeenCalled();
  });

  it('freezes Camera home, animated, and immediate view operations', () => {
    const view = {
      animate: vi.fn(),
      getZoom: vi.fn(() => 7),
      setCenter: vi.fn(),
      setZoom: vi.fn()
    } as unknown as View;
    const camera = new Camera(view, () => [119, 39]);

    camera.flyHome(600);
    camera.animateFlyTo([120, 30]);
    camera.flyTo([121, 31], 9);

    expect(view.animate).toHaveBeenNthCalledWith(1, { center: [119, 39], zoom: Camera.HOME_ZOOM, duration: 600 });
    expect(view.animate).toHaveBeenNthCalledWith(2, { center: [120, 30], zoom: 7, duration: Camera.DEFAULT_DURATION });
    expect(view.setCenter).toHaveBeenCalledWith([121, 31]);
    expect(view.setZoom).toHaveBeenCalledWith(9);
  });

  it('freezes Overlay and Descriptor public parameter surfaces', () => {
    const defaults = readSource('src/interface/default.ts');
    const descriptor = readSource('src/interface/descriptor.ts');
    const overlayLayer = readSource('src/base/OverlayLayer.ts');

    expectInterfaceKeys(defaults, 'IAddBaseParam', ['id']);
    expectInterfaceKeys(defaults, 'IBaseData', ['module', 'data']);
    expect(defaults).toMatch(/interface\s+IOverlayParam<T>\s+extends\s+IAddBaseParam<T>/);
    expectInterfaceKeys(defaults, 'IOverlayParam', ['element', 'position', 'offset', 'positioning', 'stopEvent', 'insertFirst', 'autoPan', 'className']);
    expectInterfaceKeys(defaults, 'ISetOverlayParam', ['id', 'element', 'position', 'offset', 'positioning']);
    for (const key of ['element', 'position', 'offset', 'positioning', 'stopEvent', 'insertFirst', 'autoPan', 'className']) {
      expect(overlayLayer, `OverlayLayer.add forwards ${key}`).toMatch(new RegExp(`${key}: param\\.${key}`));
    }
    expectInterfaceKeys(descriptor, 'IDescriptorParams', [
      'type',
      'isShowFixedline',
      'fixedLineColor',
      'fixedModel',
      'drag',
      'isShowClose',
      'header',
      'footer',
      'close'
    ]);
    expectInterfaceKeys(descriptor, 'IDescriptorSetParams', ['position', 'element', 'offset', 'data']);
  });

  it('freezes icon, label, stroke, fill, and animation option names', () => {
    const defaults = readSource('src/interface/default.ts');
    expectInterfaceKeys(defaults, 'IStroke', ['color', 'width', 'lineDash', 'lineDashOffset', 'fitPatternOnce']);
    expectInterfaceKeys(defaults, 'IFill', ['color']);
    expectInterfaceKeys(defaults, 'IPatternFill', ['type', 'color', 'size', 'lineWidth', 'dotRadius', 'backgroundColor']);
    expectInterfaceKeys(defaults, 'ILabel', [
      'text',
      'font',
      'offsetX',
      'offsetY',
      'scale',
      'textAlign',
      'textBaseline',
      'fill',
      'stroke',
      'backgroundFill',
      'backgroundStroke',
      'padding',
      'rotation'
    ]);
    expectInterfaceKeys(defaults, 'IBillboardParam', [
      'center',
      'src',
      'size',
      'color',
      'displacement',
      'scale',
      'rotation',
      'anchor',
      'anchorOrigin',
      'anchorXUnits',
      'anchorYUnits',
      'label'
    ]);
    expectInterfaceKeys(defaults, 'IPointParam', ['isFlash', 'flashColor', 'duration', 'isRepeat']);
    expectInterfaceKeys(defaults, 'IPolylineParam', ['isArrow', 'arrowIsRepeat', 'isFlowingDash', 'fullLineColor', 'dottedLineColor']);
    expectInterfaceKeys(defaults, 'IPolylineFlyParam', [
      'position',
      'width',
      'isRepeat',
      'isShowAnchorPoint',
      'isShowAnchorLine',
      'isShowArrow',
      'color',
      'anchorLineColor',
      'arrowColor'
    ]);
    expectInterfaceKeys(defaults, 'IFlightLineParams', ['splitLength', 'oneFrameLimitTime', 'controlRatio']);
  });

  it('freezes all 20 public draw and edit shape method pairs', () => {
    expect(legacyShapeTypes).toHaveLength(20);
    for (const type of legacyShapeTypes) {
      const [drawMethod, editMethod] = shapeMethodNames[type];
      expect(typeof (DynamicDraw.prototype as any)[drawMethod], `${type} draw method`).toBe('function');
      expect(typeof (DynamicDraw.prototype as any)[editMethod], `${type} edit method`).toBe('function');
    }
    const dynamicDraw = readSource('src/interface/dynamicDraw.ts');
    expectInterfaceKeys(dynamicDraw, 'IDrawBase', ['keepGraphics', 'callback']);
    expectInterfaceKeys(dynamicDraw, 'IDrawPoint', ['limit', 'size', 'fillColor']);
    expect(Object.values(DrawType)).toEqual(['drawstart', 'drawing', 'drawend', 'drawingClick', 'drawexit']);
    expect(Object.values(ModifyType)).toEqual(['modifying', 'modifyexit']);
    for (const method of ['get', 'remove', 'destroy']) expect(typeof (DynamicDraw.prototype as any)[method], method).toBe('function');
  });

  it('freezes Measure methods, payload, and option declarations', () => {
    for (const method of ['lineSegmentation', 'lineFirst', 'lineCenter', 'polygonMeasure', 'clear']) {
      expect(typeof (Measure.prototype as any)[method], method).toBe('function');
    }
    const defaults = readSource('src/interface/default.ts');
    expectInterfaceKeys(defaults, 'IMeasure', [
      'lineColor',
      'lineWidth',
      'pointShow',
      'pointColor',
      'pointSzie',
      'textColor',
      'textSize',
      'textBackgroundColor',
      'isShowTotalDistance',
      'callback'
    ]);
    expectInterfaceKeys(defaults, 'IMeasureData', ['startP', 'endP', 'distance']);
    expectInterfaceKeys(defaults, 'IMeasureEvent', ['data', 'totalDistance', 'area']);
  });

  it('freezes Transform commands and high- and low-level advanced options', () => {
    for (const method of ['replaceEditingFeature', 'undo', 'redo', 'on', 'off', 'remove', 'destroy']) {
      expect(typeof (Transform.prototype as any)[method], method).toBe('function');
    }
    const defaults = readSource('src/interface/default.ts');
    expectInterfaceKeys(defaults, 'ITransformParams', [
      'earth',
      'hitTolerance',
      'translateType',
      'scale',
      'stretch',
      'rotate',
      'beforeTransform',
      'transformLayers',
      'transformFeatures',
      'historyLimit'
    ]);
    const interaction = readSource('src/extends/transform-interaction/TransformInteraction.ts');
    expectInterfaceKeys(interaction, 'TransformOptions', [
      'filter',
      'condition',
      'addCondition',
      'keepAspectRatio',
      'modifyCenter',
      'layers',
      'features',
      'select',
      'graticule',
      'hitTolerance',
      'translateFeature',
      'translate',
      'translateBBox',
      'stretch',
      'scale',
      'rotate',
      'noFlip',
      'selection',
      'enableRotatedTransform',
      'keepRectangle',
      'buffer',
      'style',
      'pointRadius'
    ]);
    for (const method of ['setStyle', 'setCenter', 'setPointRadius', 'select', 'setSelection', 'getFeatures']) {
      expect(typeof (TransformInteraction.prototype as any)[method], method).toBe('function');
    }
  });

  it('freezes global and module event input methods', () => {
    const mouseKinds = ['Move', 'Click', 'LeftDown', 'LeftUp', 'DblClick', 'RightClick'];
    const globalMethods = mouseKinds.flatMap((kind) => [
      `addMouse${kind}EventByGlobal`,
      `hasGlobalMouse${kind}Event`,
      `enableGlobalMouse${kind}Event`,
      `disableGlobalMouse${kind}Event`
    ]);
    globalMethods.push(
      'addKeyDownEventByGlobal',
      'hasGlobalKeyDownEvent',
      'enableGlobalKeyDownEvent',
      'disableGlobalKeyDownEvent',
      'addMouseOnceClickEventByGlobal',
      'addCancelableMouseOnceClickEventByGlobal',
      'addMouseOnceRightClickEventByGlobal',
      'addCancelableMouseOnceRightClickEventByGlobal'
    );
    const moduleMethods = mouseKinds.flatMap((kind) => [
      `addMouse${kind}EventByModule`,
      `hasModuleMouse${kind}Event`,
      `enableModuleMouse${kind}Event`,
      `disableModuleMouse${kind}Event`
    ]);
    moduleMethods.push('removeModuleEvent', 'removeAllModuleEvents');
    for (const method of [...globalMethods, ...moduleMethods]) expect(typeof (GlobalEvent.prototype as any)[method], method).toBe('function');

    const globalEvent = readSource('src/components/GlobalEvent.ts');
    expect(globalEvent).toMatch(/ensure\(\);[\s\S]*?target\.add\(callback\);[\s\S]*?target\.delete\(callback\);[\s\S]*?autoDisable\(\);/);
    expect(globalEvent).toMatch(/target\.set\(module, \{ callback \}\);[\s\S]*?target\.delete\(module\);[\s\S]*?autoDisable\(\);/);
  });

  it('freezes arrow, point-flash, and throttle implementation contracts', () => {
    const utils = readSource('src/common/Utils.ts');
    expect(utils).toMatch(/geometry:\s*new Point\(end\)/);
    expect(utils).toMatch(/anchor:\s*\[0\.75, 0\.5\]/);
    expect(utils).toMatch(/rotation:\s*-rotation/);
    expect(utils).toMatch(/color:\s*color \|\| '#ffcc33'/);
    expect(utils).toMatch(/duration:\s*1000[\s\S]*?flashColor:[\s\S]*?isRepeat:\s*true/);
    expect(utils).toMatch(/layer\.on\('postrender'[\s\S]*?translate\(offset \* worldWidth, 0\)[\s\S]*?translate\(worldWidth, 0\)/);
    expect(utils).toMatch(/feature\.set\('listenerKey', listenerKey\)/);

    vi.useFakeTimers();
    try {
      const canceledCallback = vi.fn();
      const canceled = Utils.throttle(canceledCallback, 100, { leading: false });
      canceled();
      canceled.cancel();
      vi.advanceTimersByTime(100);
      expect(canceledCallback).not.toHaveBeenCalled();

      const flushedCallback = vi.fn(() => 'flushed');
      const flushed = Utils.throttle(flushedCallback, 100, { leading: false });
      flushed();
      expect(flushed.flush()).toBe('flushed');
      expect(flushedCallback).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
