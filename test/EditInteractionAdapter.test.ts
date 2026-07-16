import { readFileSync } from 'node:fs';
import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import type { FeatureLike } from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import type Layer from 'ol/layer/Layer.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { clearUserProjection, fromUserCoordinate, getUserProjection, setUserProjection } from 'ol/proj.js';
import type Source from 'ol/source/Source.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';
import RBush from 'ol/structs/RBush.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { FeatureBinding, type ProjectionSuppressionLease } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import {
  composeEditPreviewStyle,
  editControlAnchorActiveStyle,
  editControlAnchorHoverStyle,
  editControlAnchorPointStyle,
  editControlAnchorStyle,
  editInsertionAnchorHoverStyle,
  editInsertionAnchorPointStyle,
  editInsertionAnchorStyle,
  editPreviewAccentStyle,
  editPreviewHaloStyle,
  editUnderlayReferenceStyle
} from '../src/adapters/openlayers/interactions/EditAnchorVisuals.js';
import { EditInteractionAdapter } from '../src/adapters/openlayers/interactions/EditInteractionAdapter.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { Coordinate } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import type { EditInteractionEvent, EditInteractionRenderState } from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ElementStyleState } from '../src/core/style/types.js';

const style: ElementStyleState = { strokes: [{ color: '#3366ff', width: 3 }] };

class MapHarness {
  readonly layers = new Collection<BaseLayer>();
  readonly interactions = new Collection<Interaction>();
  readonly view: View;

  constructor(center: Coordinate = [0, 0], projection = 'EPSG:4326') {
    this.view = new View({ projection, center: [...center], zoom: 2 });
  }

  getLayers(): Collection<BaseLayer> {
    return this.layers;
  }

  getAllLayers(): Layer<Source>[] {
    const visit = (layers: readonly BaseLayer[]): Layer<Source>[] =>
      layers.flatMap((layer) => (layer instanceof LayerGroup ? visit(layer.getLayers().getArray()) : [layer as Layer<Source>]));
    return visit(this.layers.getArray());
  }

  addLayer(layer: BaseLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: BaseLayer): BaseLayer | undefined {
    return this.layers.remove(layer);
  }

  getInteractions(): Collection<Interaction> {
    return this.interactions;
  }

  addInteraction(interaction: Interaction): void {
    this.interactions.push(interaction);
    interaction.setMap(this as unknown as OlMap);
  }

  removeInteraction(interaction: Interaction): Interaction | undefined {
    const removed = this.interactions.remove(interaction);
    if (removed !== undefined) interaction.setMap(null);
    return removed;
  }

  getView(): View {
    return this.view;
  }

  getPixelFromCoordinate(coordinate: number[]): [number, number] {
    return [coordinate[0] ?? Number.NaN, coordinate[1] ?? Number.NaN];
  }

  getCoordinateFromPixelInternal(pixel: number[]): [number, number] {
    if (getUserProjection() === null) return [pixel[0] ?? Number.NaN, pixel[1] ?? Number.NaN];
    const coordinate = fromUserCoordinate(pixel, this.view.getProjection());
    return [coordinate[0] ?? Number.NaN, coordinate[1] ?? Number.NaN];
  }
}

function element(
  controlPoints: readonly Coordinate[] = [
    [0, 0],
    [8, 0]
  ]
): ElementState {
  return {
    id: 'editable',
    type: 'polyline',
    geometry: { type: 'polyline', controlPoints },
    style,
    module: 'routes',
    layerId: 'edit-layer',
    visible: true
  };
}

function renderState(
  coordinates: readonly Coordinate[] = [
    [0, 0],
    [8, 0]
  ],
  insertion: Coordinate = [4, 0]
): EditInteractionRenderState {
  return {
    geometry: { type: 'polyline', coordinates },
    style,
    anchors: [
      { kind: 'control', index: 0, coordinate: coordinates[0], role: 'start', removable: false },
      { kind: 'control', index: 1, coordinate: coordinates[1], role: 'end', removable: true },
      { kind: 'insertion', index: 1, coordinate: insertion }
    ]
  };
}

function setup(options: Readonly<{ wrapX?: boolean; center?: Coordinate; projection?: string; state?: ElementState }> = {}) {
  const map = new MapHarness(options.center, options.projection);
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  const layers = new LayerAdapter(map as unknown as OlMap, refs);
  layers.attach({ kind: 'vector', id: 'edit-layer', visible: true, opacity: 1, wrapX: options.wrapX ?? true, declutter: false });
  const entry = options.state ?? element();
  store.add(entry);
  const styles = new StyleCompiler(refs);
  const binding = new FeatureBinding(store, layers, new GeometryCodec(shapes, identityShapeProjection), styles);
  const reports: unknown[] = [];
  const adapter = new EditInteractionAdapter(map as unknown as OlMap, layers, binding, styles, {
    errorReporter: (error) => reports.push(error)
  });
  return {
    adapter,
    binding,
    entry,
    layers,
    map,
    persistentFeature: binding.requireFeature(entry.id),
    persistentSource: layers.requireVectorSource(entry.layerId),
    reports,
    store,
    styles
  };
}

function temporaryLayer(map: MapHarness): VectorLayer<VectorSource<FeatureLike>> {
  const layer = map.layers.getArray().find((candidate, index) => candidate instanceof VectorLayer && index > 0);
  if (!(layer instanceof VectorLayer)) throw new Error('Missing temporary edit layer');
  return layer as VectorLayer<VectorSource<FeatureLike>>;
}

function editInteraction(map: MapHarness): Interaction {
  const current = map.interactions.item(0);
  if (current === null) throw new Error('Missing edit interaction');
  return current;
}

function pointerEvent(
  type: string,
  coordinate: Coordinate,
  fields: Readonly<{ altKey?: boolean; button?: number; isPrimary?: boolean; nativeType?: string }> = {}
): MapBrowserEvent {
  return {
    type,
    coordinate: [...coordinate],
    pixel: [coordinate[0], coordinate[1]],
    originalEvent: {
      type: fields.nativeType ?? type,
      altKey: fields.altKey ?? false,
      button: fields.button ?? 0,
      isPrimary: fields.isPrimary ?? true
    }
  } as unknown as MapBrowserEvent;
}

function fakeCanvasContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0
  };
}

describe('EditAnchorVisuals', () => {
  it('preserves Style and Style[] business order, appends the shared edit accent, and caches each composition', () => {
    const first = new Style({ stroke: new Stroke({ color: '#111111', width: 1 }) });
    const second = new Style({ stroke: new Stroke({ color: '#222222', width: 2 }) });

    const single = composeEditPreviewStyle(first);
    expect(single).toEqual([first, editPreviewHaloStyle, editPreviewAccentStyle]);
    expect(composeEditPreviewStyle(first)).toBe(single);

    const business = [first, second];
    const multiple = composeEditPreviewStyle(business);
    expect(multiple).toEqual([first, second, editPreviewHaloStyle, editPreviewAccentStyle]);
    expect(multiple).not.toBe(business);
    expect(business).toEqual([first, second]);
    expect(composeEditPreviewStyle(business)).toBe(multiple);

    const invisibleStyle = new Style();
    const invisibleStyles = [new Style()];
    const transparentStyle = new Style({ fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }) });
    expect(composeEditPreviewStyle(invisibleStyle)).toBe(invisibleStyle);
    expect(composeEditPreviewStyle(invisibleStyles)).toBe(invisibleStyles);
    expect(composeEditPreviewStyle(transparentStyle)).toBe(transparentStyle);

    invisibleStyles.push(first);
    const becameVisible = composeEditPreviewStyle(invisibleStyles);
    expect(becameVisible).toEqual([invisibleStyles[0], first, editPreviewHaloStyle, editPreviewAccentStyle]);
    expect(composeEditPreviewStyle(invisibleStyles)).toBe(becameVisible);
    invisibleStyles.pop();
    expect(composeEditPreviewStyle(invisibleStyles)).toBe(invisibleStyles);

    expect(
      [
        editPreviewHaloStyle,
        editPreviewAccentStyle,
        editInsertionAnchorStyle,
        editControlAnchorStyle,
        editInsertionAnchorHoverStyle,
        editControlAnchorHoverStyle,
        editControlAnchorActiveStyle
      ].every((style) => style.getZIndex() === Number.MAX_VALUE)
    ).toBe(true);
    for (const anchorStyle of [
      editInsertionAnchorPointStyle,
      editControlAnchorPointStyle,
      editInsertionAnchorHoverStyle,
      editControlAnchorHoverStyle,
      editControlAnchorActiveStyle
    ]) {
      expect(anchorStyle.getImage()).toBeNull();
      expect(anchorStyle.getRenderer()).toBeTypeOf('function');
    }
    expect(editPreviewHaloStyle.getRenderer()).toBeTypeOf('function');
    expect(editPreviewAccentStyle.getRenderer()).toBeTypeOf('function');

    const hoverContext = fakeCanvasContext();
    editControlAnchorHoverStyle.getRenderer()?.([10, 20], {
      context: hoverContext as unknown as CanvasRenderingContext2D,
      pixelRatio: 2
    } as never);
    expect(hoverContext.arc).toHaveBeenCalledWith(10, 20, 14, 0, 2 * Math.PI);
    expect(hoverContext.lineWidth).toBe(6);

    const accentContext = fakeCanvasContext();
    editPreviewAccentStyle.getRenderer()?.(
      [
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 0]
        ]
      ],
      {
        context: accentContext as unknown as CanvasRenderingContext2D,
        geometry: new Polygon([
          [
            [0, 0],
            [20, 0],
            [20, 20],
            [0, 0]
          ]
        ]),
        pixelRatio: 2
      } as never
    );
    expect(accentContext.closePath).toHaveBeenCalledOnce();
    expect(accentContext.setLineDash).toHaveBeenCalledWith([12, 8]);
    expect(accentContext.fill).toHaveBeenCalledOnce();
    expect(accentContext.stroke).toHaveBeenCalledOnce();
  });

  it('preserves StyleFunction visibility and result order while caching visible dynamic compositions', () => {
    const first = new Style({ stroke: new Stroke({ color: '#111111', width: 1 }) });
    const second = new Style({ stroke: new Stroke({ color: '#222222', width: 2 }) });
    const visible = [first, second];
    const empty: Style[] = [];
    let result: Style[] | undefined = visible;
    const business: StyleFunction = vi.fn(() => (result === visible ? [...visible] : result));

    const composed = composeEditPreviewStyle(business);
    if (typeof composed !== 'function') throw new Error('Expected composed style function');
    expect(composeEditPreviewStyle(business)).toBe(composed);

    const feature = new Feature();
    const firstVisibleResult = composed(feature, 1);
    expect(firstVisibleResult).toEqual([first, second, editPreviewHaloStyle, editPreviewAccentStyle]);
    expect(composed(feature, 2)).toBe(firstVisibleResult);

    result = empty;
    expect(composed(feature, 1)).toBe(empty);
    result = undefined;
    expect(composed(feature, 1)).toBeUndefined();
  });
});

describe('EditInteractionAdapter', () => {
  it('hands off persistent projection suppression and renders detached preview, underlay, and anchors in the selected world copy', () => {
    const entry = element([
      [170, 10],
      [190, 20]
    ]);
    const { adapter, binding, map, persistentFeature, persistentSource, store } = setup({ center: [540, 0], state: entry, wrapX: true });
    const nativeSuppress = binding.suppressProjection.bind(binding);
    let acquisition: ProjectionSuppressionLease | undefined;
    vi.spyOn(binding, 'suppressProjection').mockImplementation((id) => {
      acquisition = nativeSuppress(id);
      return acquisition;
    });
    const callerControlPoints: Coordinate[] = [
      [170, 10],
      [190, 20]
    ];

    const received: EditInteractionEvent[] = [];
    const handle = adapter.open({ elementId: entry.id, controlPoints: callerControlPoints, underlay: true }, (event) => received.push(event));
    callerControlPoints[0] = [999, 999];

    expect(acquisition?.active).toBe(false);
    expect(handle.placement).toEqual({
      controlPoints: [
        [530, 10],
        [550, 20]
      ],
      handoff: { kind: 'wrapped', world: { minX: -180, width: 360 } }
    });
    expect(persistentSource.hasFeature(persistentFeature)).toBe(false);
    expect(map.layers.getLength()).toBe(2);
    expect(map.interactions.getLength()).toBe(1);

    const firstCoordinates: Coordinate[] = [
      [530, 10],
      [550, 20]
    ];
    const first = renderState(firstCoordinates, [540, 15]);
    handle.render(first);
    firstCoordinates[0] = [1, 1];

    const layer = temporaryLayer(map);
    const source = layer.getSource();
    if (source === null) throw new Error('Missing temporary source');
    expect(source.getWrapX()).toBe(false);
    const firstLines = source
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is LineString => geometry instanceof LineString);
    expect(firstLines).toHaveLength(2);
    expect(firstLines.map((line) => line.getCoordinates())).toEqual([
      [
        [530, 10],
        [550, 20]
      ],
      [
        [530, 10],
        [550, 20]
      ]
    ]);
    const firstAnchorBatches = source
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is MultiPoint => geometry instanceof MultiPoint);
    expect(firstAnchorBatches).toHaveLength(2);
    expect(firstAnchorBatches.reduce((count, geometry) => count + geometry.getCoordinates().length, 0)).toBe(3);
    expect(store.get(entry.id)).toEqual(entry);

    const input = editInteraction(map);
    expect(input.handleEvent(pointerEvent('pointerdown', [170, 10]))).toBe(true);
    input.handleEvent(pointerEvent('pointerdown', [530, 10]));
    input.handleEvent(pointerEvent('pointercancel', [530, 10], { button: -1 }));
    expect(received.map(({ type }) => type)).toEqual(['move-start', 'move-cancel']);

    handle.render(
      renderState(
        [
          [530, 10],
          [560, 30]
        ],
        [545, 20]
      )
    );
    const secondSource = layer.getSource();
    if (secondSource === null) throw new Error('Missing replaced temporary source');
    const secondLines = secondSource
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is LineString => geometry instanceof LineString);
    expect(secondLines.map((line) => line.getCoordinates())).toEqual([
      [
        [530, 10],
        [550, 20]
      ],
      [
        [530, 10],
        [560, 30]
      ]
    ]);

    acquisition?.release();
    expect(persistentSource.hasFeature(persistentFeature)).toBe(false);
    handle.destroy();

    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(secondSource.getFeatures()).toEqual([]);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    expect(store.get(entry.id)).toEqual(entry);
  });

  it('renders the frozen underlay with a neutral reference style and the working preview with the business style plus edit accent', () => {
    const { adapter, map, styles } = setup();
    const businessStyle = new Style({ stroke: new Stroke({ color: '#3366ff', width: 3 }) });
    vi.spyOn(styles, 'compile').mockReturnValue(businessStyle);
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: true
      },
      vi.fn()
    );

    try {
      handle.render(renderState());
      const source = temporaryLayer(map).getSource();
      if (source === null) throw new Error('Missing temporary source');
      const lineFeatures = source.getFeatures().filter((feature) => feature.getGeometry() instanceof LineString);
      const underlay = lineFeatures.find((feature) => feature.getStyle() === editUnderlayReferenceStyle);
      const preview = lineFeatures.find((feature) => feature !== underlay);
      if (underlay === undefined || preview === undefined) throw new Error('Missing edit underlay or preview');

      expect(underlay.getStyle()).toBe(editUnderlayReferenceStyle);
      expect(preview.getStyle()).toBe(composeEditPreviewStyle(businessStyle));
      expect(preview.getStyle()).toEqual([businessStyle, editPreviewHaloStyle, editPreviewAccentStyle]);
      expect(editUnderlayReferenceStyle.getStroke()?.getColor()).toBe('rgba(71,85,105,0.65)');
      expect(editPreviewAccentStyle.getStroke()?.getColor()).toBe('#1677ff');

      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      );
      const nextSource = temporaryLayer(map).getSource();
      if (nextSource === null) throw new Error('Missing next temporary source');
      const nextLines = nextSource.getFeatures().filter((feature) => feature.getGeometry() instanceof LineString);
      const nextUnderlay = nextLines.find((feature) => feature.getStyle() === editUnderlayReferenceStyle);
      const nextPreview = nextLines.find((feature) => feature !== nextUnderlay);
      expect((nextUnderlay?.getGeometry() as LineString | undefined)?.getCoordinates()).toEqual([
        [0, 0],
        [8, 0]
      ]);
      expect((nextPreview?.getGeometry() as LineString | undefined)?.getCoordinates()).toEqual([
        [0, 0],
        [12, 4]
      ]);
      expect(nextPreview?.getStyle()).toBe(preview.getStyle());
    } finally {
      handle.destroy();
    }
  });

  it.each([1, -1, 50, -50])('moves an idle edit preview to world %s while preserving canonical hit and drag events', (world) => {
    const { adapter, map } = setup({ wrapX: true });
    const initialCenterListeners = map.view.getListeners('change:center')?.length ?? 0;
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners + 1);

    const offset = world * 360;
    map.view.setCenter([offset, 0]);

    const source = temporaryLayer(map).getSource();
    if (source === null) throw new Error('Missing repositioned edit source');
    const line = source
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .find((geometry): geometry is LineString => geometry instanceof LineString);
    expect(line?.getCoordinates()).toEqual([
      [offset, 0],
      [offset + 8, 0]
    ]);
    const anchorCoordinates = source
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is MultiPoint => geometry instanceof MultiPoint)
      .flatMap((geometry) => geometry.getCoordinates());
    expect(anchorCoordinates).toEqual(
      expect.arrayContaining([
        [offset, 0],
        [offset + 4, 0],
        [offset + 8, 0]
      ])
    );

    const input = editInteraction(map);
    expect(input.handleEvent(pointerEvent('pointerdown', [offset, 0]))).toBe(false);
    expect(input.handleEvent(pointerEvent('pointerdrag', [offset + 2, 1]))).toBe(false);
    expect(input.handleEvent(pointerEvent('pointerup', [offset + 3, 2]))).toBe(false);
    expect(received).toEqual([
      expect.objectContaining({ type: 'move-start', anchor: expect.objectContaining({ index: 0, coordinate: [0, 0] }), coordinate: [0, 0] }),
      expect.objectContaining({ type: 'move', anchor: expect.objectContaining({ index: 0, coordinate: [0, 0] }), coordinate: [2, 1] }),
      expect.objectContaining({ type: 'move-end', anchor: expect.objectContaining({ index: 0, coordinate: [0, 0] }), coordinate: [3, 2] })
    ]);

    handle.destroy();
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners);
  });

  it('reuses the stable anchor index across repeated world repositions and rebuilds it only for a new render plan', () => {
    const { adapter, map } = setup({ wrapX: true });
    const received: EditInteractionEvent[] = [];
    const load = vi.spyOn(RBush.prototype, 'load');
    const anchorIndexLoadCount = (): number =>
      load.mock.calls.filter(([, values]) => values.some((value) => value !== null && typeof value === 'object' && 'anchor' in value)).length;
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    try {
      handle.render(renderState());
      expect(anchorIndexLoadCount()).toBe(1);
      const input = editInteraction(map);

      for (const world of [1, -2, 50, -50, 3, 0]) {
        const offset = world * 360;
        map.view.setCenter([offset, 0]);
        expect(input.handleEvent(pointerEvent('pointerdown', [offset, 0]))).toBe(false);
        expect(input.handleEvent(pointerEvent('pointercancel', [offset, 0], { button: -1 }))).toBe(false);
        expect(anchorIndexLoadCount()).toBe(1);
      }
      expect(received.filter(({ type }) => type === 'move-start')).toEqual(
        Array.from({ length: 6 }, () => expect.objectContaining({ type: 'move-start', coordinate: [0, 0] }))
      );

      handle.render(
        renderState(
          [
            [0, 0],
            [10, 0]
          ],
          [5, 0]
        )
      );
      expect(anchorIndexLoadCount()).toBe(2);
      map.view.setCenter([100 * 360, 0]);
      expect(input.handleEvent(pointerEvent('click', [100 * 360 + 5, 0], { altKey: true }))).toBe(false);
      expect(received.at(-1)).toEqual({ type: 'insert', anchor: { kind: 'insertion', index: 1, coordinate: [5, 0] } });
      expect(anchorIndexLoadCount()).toBe(2);
    } finally {
      handle.destroy();
      load.mockRestore();
    }
  });

  it.each([
    { world: 1, terminal: 'pointerup' },
    { world: -1, terminal: 'pointercancel' },
    { world: 50, terminal: 'pointerup' },
    { world: -50, terminal: 'pointercancel' }
  ] as const)('freezes world offset during an active edit and applies world $world after $terminal', ({ world, terminal }) => {
    const { adapter, map } = setup({ wrapX: true });
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const input = editInteraction(map);
    input.handleEvent(pointerEvent('pointerdown', [0, 0]));

    const offset = world * 360;
    const sourceBeforePan = temporaryLayer(map).getSource();
    map.view.setCenter([offset, 0]);
    expect(temporaryLayer(map).getSource()).toBe(sourceBeforePan);
    const lineBeforeTerminal = sourceBeforePan
      ?.getFeatures()
      .map((feature) => feature.getGeometry())
      .find((geometry): geometry is LineString => geometry instanceof LineString);
    expect(lineBeforeTerminal?.getCoordinates()).toEqual([
      [0, 0],
      [8, 0]
    ]);

    input.handleEvent(pointerEvent('pointerdrag', [offset + 2, 1]));
    input.handleEvent(pointerEvent(terminal, [offset + 3, 2], terminal === 'pointercancel' ? { button: -1 } : {}));

    const repositionedSource = temporaryLayer(map).getSource();
    const repositionedLine = repositionedSource
      ?.getFeatures()
      .map((feature) => feature.getGeometry())
      .find((geometry): geometry is LineString => geometry instanceof LineString);
    expect(repositionedLine?.getCoordinates()).toEqual([
      [offset, 0],
      [offset + 8, 0]
    ]);
    expect(received.slice(0, 2)).toEqual([
      expect.objectContaining({ type: 'move-start', coordinate: [0, 0] }),
      expect.objectContaining({ type: 'move', coordinate: [2, 1] })
    ]);
    expect(received.at(-1)).toEqual(
      terminal === 'pointercancel'
        ? expect.objectContaining({ type: 'move-cancel', anchor: expect.objectContaining({ coordinate: [0, 0] }) })
        : expect.objectContaining({ type: 'move-end', coordinate: [3, 2] })
    );
    handle.destroy();
  });

  it('removes the wrapped-view listener when an edit listener destroys during a pending pointerup', () => {
    const { adapter, map } = setup({ wrapX: true });
    const initialCenterListeners = map.view.getListeners('change:center')?.length ?? 0;
    const owner: { handle?: ReturnType<EditInteractionAdapter['open']> } = {};
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => {
        if (event.type === 'move-end') owner.handle?.destroy();
      }
    );
    owner.handle = handle;
    handle.render(renderState());
    const input = editInteraction(map);
    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    map.view.setCenter([50 * 360, 0]);

    expect(() => input.handleEvent(pointerEvent('pointerup', [50 * 360 + 2, 1]))).not.toThrow();
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners);
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
  });

  it('keeps a 20k-anchor pointerdown below 50 ms by querying only nearby RBush candidates', () => {
    const { adapter, map } = setup({ wrapX: false });
    const anchorCount = 20_000;
    const anchors = Array.from({ length: anchorCount }, (_, index) => ({
      kind: 'control' as const,
      index,
      coordinate: [index * 20, 0] as Coordinate,
      removable: true
    }));
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render({
      geometry: {
        type: 'polyline',
        coordinates: [
          [0, 0],
          [8, 0]
        ]
      },
      style,
      anchors
    });
    const target = anchors[12_345];
    if (target === undefined) throw new Error('Missing latency target anchor');
    const pixelLookup = vi.spyOn(map, 'getPixelFromCoordinate');

    const startedAt = performance.now();
    expect(editInteraction(map).handleEvent(pointerEvent('pointerdown', target.coordinate))).toBe(false);
    const latency = performance.now() - startedAt;

    expect(latency).toBeLessThanOrEqual(50);
    expect(pixelLookup.mock.calls.length).toBeLessThanOrEqual(3);
    handle.destroy();
  });

  it('isolates a retained cross-world render plan from mutable caller geometry and anchors', () => {
    const { adapter, map } = setup({ wrapX: true });
    const callerCoordinates: [number, number][] = [
      [0, 0],
      [8, 0]
    ];
    const callerAnchors = [
      { kind: 'control' as const, index: 0, coordinate: callerCoordinates[0], removable: false },
      { kind: 'control' as const, index: 1, coordinate: callerCoordinates[1], removable: true }
    ];
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open({ elementId: 'editable', controlPoints: callerCoordinates, underlay: false }, (event) => received.push(event));
    handle.render({ geometry: { type: 'polyline', coordinates: callerCoordinates }, style, anchors: callerAnchors });

    callerCoordinates[0][0] = 999;
    callerCoordinates[1][0] = 1_999;
    map.view.setCenter([360, 0]);

    const line = temporaryLayer(map)
      .getSource()
      ?.getFeatures()
      .map((feature) => feature.getGeometry())
      .find((geometry): geometry is LineString => geometry instanceof LineString);
    expect(line?.getCoordinates()).toEqual([
      [360, 0],
      [368, 0]
    ]);
    editInteraction(map).handleEvent(pointerEvent('pointerdown', [360, 0]));
    expect(received.at(-1)).toEqual(expect.objectContaining({ type: 'move-start', anchor: expect.objectContaining({ coordinate: [0, 0] }) }));
    handle.destroy();
  });

  it('updates a large-world polygon preview without changing its canonical render state', () => {
    const { adapter, map } = setup({ wrapX: true });
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0],
          [8, 8]
        ],
        underlay: false
      },
      vi.fn()
    );
    const firstRing: readonly Coordinate[] = [
      [0, 0],
      [8, 0],
      [8, 8],
      [0, 0]
    ];
    handle.render({
      geometry: { type: 'polygon', coordinates: [firstRing] },
      style,
      anchors: [{ kind: 'control', index: 0, coordinate: [0, 0], removable: false }]
    });
    map.view.setCenter([50 * 360, 0]);
    const movedRing: readonly Coordinate[] = [
      [0, 0],
      [10, 1],
      [8, 8],
      [0, 0]
    ];
    handle.render({
      geometry: { type: 'polygon', coordinates: [movedRing] },
      style,
      anchors: [{ kind: 'control', index: 1, coordinate: [10, 1], removable: true }]
    });

    const polygon = temporaryLayer(map)
      .getSource()
      ?.getFeatures()
      .map((feature) => feature.getGeometry())
      .find((geometry): geometry is Polygon => geometry instanceof Polygon);
    expect(polygon?.getCoordinates()).toEqual([
      [
        [50 * 360, 0],
        [50 * 360 + 10, 1],
        [50 * 360 + 8, 8],
        [50 * 360, 0]
      ]
    ]);
    expect(movedRing).toEqual([
      [0, 0],
      [10, 1],
      [8, 8],
      [0, 0]
    ]);
    handle.destroy();
  });

  it('rolls back all native resources when wrapped-view listener installation fails', () => {
    const { adapter, map, persistentFeature, persistentSource } = setup({ wrapX: true });
    const initialCenterListeners = map.view.getListeners('change:center')?.length ?? 0;
    vi.spyOn(map.view, 'addEventListener').mockImplementationOnce(() => {
      throw new Error('center listener installation failed');
    });

    expect(() =>
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        vi.fn()
      )
    ).toThrowError('center listener installation failed');
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners);
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
  });

  it('retries a failed wrapped-view listener removal without leaking the listener', () => {
    const { adapter, map, reports } = setup({ wrapX: true });
    const initialCenterListeners = map.view.getListeners('change:center')?.length ?? 0;
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const nativeRemoveEventListener = map.view.removeEventListener.bind(map.view);
    const removeEventListener = vi.spyOn(map.view, 'removeEventListener').mockImplementationOnce(() => {
      throw new Error('center listener cleanup failed');
    });
    removeEventListener.mockImplementation((type, listener) => nativeRemoveEventListener(type, listener));

    expect(() => handle.destroy()).toThrowError('center listener cleanup failed');
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners + 1);
    expect(reports.map((error) => (error as Error).message)).toContain('center listener cleanup failed');
    expect(() => handle.destroy()).not.toThrow();
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners);
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('omits the entry underlay when disabled and never publishes temporary features through FeatureBinding', () => {
    const { adapter, binding, map, persistentFeature, persistentSource, store } = setup({ wrapX: false });
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());

    const source = temporaryLayer(map).getSource();
    if (source === null) throw new Error('Missing temporary source');
    expect(
      source
        .getFeatures()
        .map((feature) => feature.getGeometry())
        .filter((geometry) => geometry instanceof LineString)
    ).toHaveLength(1);
    expect(source.getFeatures()).toHaveLength(3);
    for (const feature of source.getFeatures()) {
      expect(binding.elementIdFor(feature as never)).toBeUndefined();
      expect(binding.resolveFeature(feature as never)).toBeUndefined();
    }
    expect(persistentSource.hasFeature(persistentFeature)).toBe(false);
    expect(store.get('editable')?.geometry).toEqual(element().geometry);

    handle.destroy();
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
  });

  it('freezes the underlay from the first successful render after an initial source handoff failure', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: true
      },
      vi.fn()
    );
    const layer = temporaryLayer(map);
    const nativeSetSource = layer.setSource.bind(layer);
    const setSource = vi.spyOn(layer, 'setSource').mockImplementationOnce((source) => {
      nativeSetSource(source);
      throw new Error('first handoff failed');
    });
    setSource.mockImplementation((source) => nativeSetSource(source));

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [10, 2]
          ],
          [5, 1]
        )
      )
    ).toThrowError('first handoff failed');
    handle.render(
      renderState(
        [
          [20, 5],
          [30, 7]
        ],
        [25, 6]
      )
    );

    const lines = layer
      .getSource()
      ?.getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is LineString => geometry instanceof LineString);
    expect(lines?.map((line) => line.getCoordinates())).toEqual([
      [
        [20, 5],
        [30, 7]
      ],
      [
        [20, 5],
        [30, 7]
      ]
    ]);
    handle.destroy();
  });

  it('reports pointer movement with the nearest insertion or control anchor for hover guidance', () => {
    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const input = editInteraction(map);

    expect(input.handleEvent(pointerEvent('pointermove', [4, 0], { button: -1 }))).toBe(true);
    expect(input.handleEvent(pointerEvent('pointermove', [8, 0], { button: -1 }))).toBe(true);
    expect(input.handleEvent(pointerEvent('pointermove', [40, 40], { button: -1 }))).toBe(true);

    expect(received).toEqual([
      { type: 'pointer-move', coordinate: [4, 0], anchor: { kind: 'insertion', index: 1, coordinate: [4, 0] } },
      {
        type: 'pointer-move',
        coordinate: [8, 0],
        anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }
      },
      { type: 'pointer-move', coordinate: [40, 40] }
    ]);

    handle.destroy();
  });

  it('reuses one non-hittable feedback Point across hover, active, leave, cancel, insertion, and removal transitions', () => {
    const { adapter, map } = setup();
    const load = vi.spyOn(RBush.prototype, 'load');
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );

    try {
      handle.render(renderState());
      const source = temporaryLayer(map).getSource();
      if (source === null) throw new Error('Missing temporary source');
      const anchorLoads = () =>
        load.mock.calls.filter(([, values]) => values.some((value) => value !== null && typeof value === 'object' && 'anchor' in value));
      expect(anchorLoads()).toHaveLength(1);
      expect(anchorLoads()[0]?.[1]).toHaveLength(3);
      expect(source.getFeatures().some((feature) => feature.getGeometry() instanceof Point)).toBe(false);

      const input = editInteraction(map);
      input.handleEvent(pointerEvent('pointermove', [4, 0], { button: -1 }));
      const feedback = source.getFeatures().find((feature) => feature.getGeometry() instanceof Point);
      if (feedback === undefined) throw new Error('Missing feedback feature');
      const feedbackPoint = feedback.getGeometry();
      expect(feedbackPoint).toBeInstanceOf(Point);
      expect((feedbackPoint as Point).getCoordinates()).toEqual([4, 0]);
      expect(feedback.getStyle()).toBe(editInsertionAnchorHoverStyle);

      input.handleEvent(pointerEvent('pointermove', [8, 0], { button: -1 }));
      expect(feedback.getGeometry()).toBe(feedbackPoint);
      expect((feedback.getGeometry() as Point).getCoordinates()).toEqual([8, 0]);
      expect(feedback.getStyle()).toBe(editControlAnchorHoverStyle);

      expect(input.handleEvent(pointerEvent('pointerdown', [8, 0]))).toBe(false);
      expect(feedback.getStyle()).toBe(editControlAnchorActiveStyle);
      expect(input.handleEvent(pointerEvent('pointerup', [8, 0], { button: -1 }))).toBe(false);
      expect(feedback.getStyle()).toBe(editControlAnchorHoverStyle);

      input.handleEvent(pointerEvent('pointermove', [40, 40], { button: -1 }));
      expect(feedback.getGeometry()).toBeUndefined();
      expect(source.getFeatures()).not.toContain(feedback);
      input.handleEvent(pointerEvent('pointerdown', [0, 0]));
      expect(source.getFeatures()).toContain(feedback);
      expect(feedback.getStyle()).toBe(editControlAnchorActiveStyle);
      input.handleEvent(pointerEvent('pointercancel', [0, 0], { button: -1 }));
      expect(feedback.getGeometry()).toBeUndefined();
      expect(source.getFeatures()).not.toContain(feedback);

      input.handleEvent(pointerEvent('pointermove', [4, 0], { button: -1 }));
      expect(source.getFeatures().find((feature) => feature.getGeometry() instanceof Point)).toBe(feedback);
      input.handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
      expect(feedback.getGeometry()).toBeUndefined();
      input.handleEvent(pointerEvent('pointermove', [8, 0], { button: -1 }));
      expect(source.getFeatures().find((feature) => feature.getGeometry() instanceof Point)).toBe(feedback);
      input.handleEvent(pointerEvent('click', [8, 0], { altKey: true }));
      expect(feedback.getGeometry()).toBeUndefined();

      expect(source.getFeatures().filter((feature) => feature.getGeometry() instanceof Point)).toHaveLength(0);
      expect(source.getFeatures()).not.toContain(feedback);
      expect(anchorLoads()).toHaveLength(1);
      expect(anchorLoads()[0]?.[1].every((value) => 'anchor' in value)).toBe(true);
    } finally {
      handle.destroy();
      load.mockRestore();
    }
  });

  it('clears stale hover feedback when a non-drag render replaces topology and allows the same anchor to highlight again', () => {
    const { adapter, map } = setup();
    const listener = vi.fn();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      listener
    );

    try {
      handle.render(renderState());
      const input = editInteraction(map);
      input.handleEvent(pointerEvent('pointermove', [8, 0], { button: -1 }));
      expect(
        temporaryLayer(map)
          .getSource()
          ?.getFeatures()
          .some((feature) => feature.getGeometry() instanceof Point)
      ).toBe(true);

      handle.render(renderState());
      expect(
        temporaryLayer(map)
          .getSource()
          ?.getFeatures()
          .some((feature) => feature.getGeometry() instanceof Point)
      ).toBe(false);

      input.handleEvent(pointerEvent('pointermove', [8, 0], { button: -1 }));
      const feedback = temporaryLayer(map)
        .getSource()
        ?.getFeatures()
        .find((feature) => feature.getGeometry() instanceof Point);
      expect(feedback?.getStyle()).toBe(editControlAnchorHoverStyle);
      expect(listener).toHaveBeenLastCalledWith({
        type: 'pointer-move',
        coordinate: [8, 0],
        anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }
      });
    } finally {
      handle.destroy();
    }
  });

  it('restores insertion-before-control source order after both drag buffers temporarily hide insertion anchors', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    const full = renderState();
    const active: EditInteractionRenderState = {
      ...full,
      anchors: [{ kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }]
    };

    try {
      handle.render(full);
      const input = editInteraction(map);
      expect(input.handleEvent(pointerEvent('pointerdown', [8, 0]))).toBe(false);
      handle.render(active);
      handle.render(active);
      expect(input.handleEvent(pointerEvent('pointerup', [8, 0], { button: -1 }))).toBe(false);
      handle.render(full);

      const features = temporaryLayer(map).getSource()?.getFeatures() ?? [];
      const insertionIndex = features.findIndex((feature) => feature.getStyle() === editInsertionAnchorStyle);
      const controlIndex = features.findIndex((feature) => feature.getStyle() === editControlAnchorStyle);
      expect(insertionIndex).toBeGreaterThanOrEqual(0);
      expect(controlIndex).toBeGreaterThanOrEqual(0);
      expect(insertionIndex).toBeLessThan(controlIndex);
      expect(features.some((feature) => feature.getGeometry() instanceof Point)).toBe(false);
    } finally {
      handle.destroy();
    }
  });

  it('keeps batched anchor geometry and styles stable while one feedback Point follows large-anchor hover across both render buffers', () => {
    const { adapter, map } = setup();
    const anchors: EditInteractionRenderState['anchors'] = Array.from({ length: 5_000 }, (_, index) => ({
      kind: 'control' as const,
      index,
      coordinate: [index * 10, 0] as Coordinate,
      removable: true
    }));
    const state: EditInteractionRenderState = {
      ...renderState(),
      anchors
    };
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );

    try {
      handle.render(state);
      const layer = temporaryLayer(map);
      const firstSource = layer.getSource();
      if (firstSource === null) throw new Error('Missing first render source');
      const firstFeatures = firstSource.getFeatures();
      const controlFeature = firstFeatures.find((feature) => feature.getGeometry() instanceof MultiPoint);
      if (controlFeature === undefined) throw new Error('Missing batched anchors');
      const controlGeometry = controlFeature.getGeometry();
      if (!(controlGeometry instanceof MultiPoint)) throw new Error('Missing batched control geometry');
      expect(controlGeometry.getCoordinates()).toHaveLength(5_000);
      expect(controlFeature.getStyle()).toBe(editControlAnchorStyle);
      const setCoordinates = vi.spyOn(controlGeometry, 'setCoordinates');
      const setStyle = vi.spyOn(controlFeature, 'setStyle');

      handle.render(state);
      expect(layer.getSource()).not.toBe(firstSource);
      handle.render(state);
      expect(layer.getSource()).toBe(firstSource);
      expect(firstSource.getFeatures()).toEqual(firstFeatures);
      expect(setCoordinates).not.toHaveBeenCalled();
      expect(setStyle).not.toHaveBeenCalled();

      const input = editInteraction(map);
      input.handleEvent(pointerEvent('pointermove', [0, 0], { button: -1 }));
      const feedback = firstSource.getFeatures().find((feature) => feature.getGeometry() instanceof Point);
      if (feedback === undefined) throw new Error('Missing feedback Point');
      for (const index of [2_500, 4_999]) input.handleEvent(pointerEvent('pointermove', [index * 10, 0], { button: -1 }));
      expect(layer.getSource()).toBe(firstSource);
      expect(firstSource.getFeatures()).toEqual([...firstFeatures, feedback]);
      expect(feedback.getGeometry()).toBeInstanceOf(Point);
      expect((feedback.getGeometry() as Point).getCoordinates()).toEqual([49_990, 0]);
      expect(feedback.getStyle()).toBe(editControlAnchorHoverStyle);
      expect(firstSource.getFeatures().filter((feature) => feature.getGeometry() instanceof Point)).toEqual([feedback]);
      expect(setCoordinates).not.toHaveBeenCalled();
      expect(setStyle).not.toHaveBeenCalled();
      expect(controlFeature.getStyle()).toBe(editControlAnchorStyle);
    } finally {
      handle.destroy();
    }
  });

  it('maps control drags and Alt topology clicks to detached semantic events while ordinary midpoint clicks do nothing', () => {
    const { adapter, map, reports } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => {
        received.push(event);
        if (event.type === 'insert') throw new Error('listener failed');
      }
    );
    handle.render(renderState());
    const input = editInteraction(map);

    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    input.handleEvent(pointerEvent('pointerdrag', [2, 1], { button: -1 }));
    input.handleEvent(pointerEvent('pointercancel', [2, 1], { button: -1 }));
    input.handleEvent(pointerEvent('pointerdown', [8, 0]));
    input.handleEvent(pointerEvent('pointerdrag', [9, 2], { button: -1 }));
    input.handleEvent(pointerEvent('pointerup', [10, 3], { button: -1 }));
    input.handleEvent(pointerEvent('click', [4, 0]));
    expect(received).toHaveLength(6);
    input.handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
    input.handleEvent(pointerEvent('click', [8, 0], { altKey: true }));

    expect(received).toEqual([
      { type: 'move-start', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false }, coordinate: [0, 0] },
      { type: 'move', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false }, coordinate: [2, 1] },
      { type: 'move-cancel', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false } },
      { type: 'move-start', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }, coordinate: [8, 0] },
      { type: 'move', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }, coordinate: [9, 2] },
      { type: 'move-end', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }, coordinate: [10, 3] },
      { type: 'insert', anchor: { kind: 'insertion', index: 1, coordinate: [4, 0] } },
      { type: 'remove', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true } }
    ]);
    expect(received.every(Object.isFrozen)).toBe(true);
    expect(reports.map((error) => (error as Error).message)).toEqual(['listener failed']);
    handle.destroy();
    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    expect(received).toHaveLength(8);
  });

  it('uses the nearest anchor when Alt insertion and removal hit tolerances overlap', () => {
    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render({
      ...renderState(),
      anchors: [
        { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: true },
        { kind: 'insertion', index: 1, coordinate: [4, 0] }
      ]
    });
    const input = editInteraction(map);

    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    input.handleEvent(pointerEvent('pointercancel', [0, 0], { button: -1 }));
    input.handleEvent(pointerEvent('click', [4, 0]));
    expect(received.map(({ type }) => type)).toEqual(['move-start', 'move-cancel']);
    input.handleEvent(pointerEvent('click', [3, 0], { altKey: true }));
    input.handleEvent(pointerEvent('click', [1, 0], { altKey: true }));

    expect(received.map(({ type }) => type)).toEqual(['move-start', 'move-cancel', 'insert', 'remove']);
    expect(received[0]).toMatchObject({ type: 'move-start', anchor: { kind: 'control' } });
    expect(received[2]).toMatchObject({ type: 'insert', anchor: { kind: 'insertion' } });
    expect(received[3]).toMatchObject({ type: 'remove', anchor: { kind: 'control' } });
    handle.destroy();
  });

  it('filters overlapping anchors by input semantics before choosing the nearest candidate', () => {
    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [4, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    const input = editInteraction(map);

    handle.render({
      ...renderState(),
      anchors: [
        { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false },
        { kind: 'insertion', index: 1, coordinate: [4, 0] }
      ]
    });
    input.handleEvent(pointerEvent('click', [1, 0], { altKey: true }));
    expect(received).toEqual([{ type: 'insert', anchor: { kind: 'insertion', index: 1, coordinate: [4, 0] } }]);

    handle.render({
      ...renderState(),
      anchors: [
        { kind: 'insertion', index: 0, coordinate: [0, 0] },
        { kind: 'control', index: 1, coordinate: [4, 0], role: 'end', removable: true }
      ]
    });
    input.handleEvent(pointerEvent('pointerdown', [1, 0]));
    expect(received.at(-1)).toMatchObject({ type: 'move-start', anchor: { kind: 'control', index: 1 } });
    input.handleEvent(pointerEvent('pointercancel', [1, 0], { button: -1 }));
    handle.destroy();
  });

  it('prefers the visually higher control anchor when a control and insertion anchor exactly overlap', () => {
    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render({
      ...renderState(),
      anchors: [
        { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: true },
        { kind: 'insertion', index: 1, coordinate: [0, 0] }
      ]
    });
    const input = editInteraction(map);

    input.handleEvent(pointerEvent('pointermove', [0, 0], { button: -1 }));
    input.handleEvent(pointerEvent('click', [0, 0], { altKey: true }));

    expect(received).toEqual([
      {
        type: 'pointer-move',
        coordinate: [0, 0],
        anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: true }
      },
      { type: 'remove', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: true } }
    ]);
    handle.destroy();
  });

  it('scales the batched anchor canvas renderers at DPR 2 and draws each batch with one path', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    try {
      handle.render(renderState());
      const source = temporaryLayer(map).getSource();
      if (source === null) throw new Error('Missing temporary source');
      const batchStyles: Style[] = [];
      for (const feature of source.getFeatures()) {
        if (!(feature.getGeometry() instanceof MultiPoint)) continue;
        const featureStyle = feature.getStyle();
        if (!(featureStyle instanceof Style)) throw new Error('Missing batched anchor style');
        batchStyles.push(featureStyle);
      }
      expect(batchStyles).toEqual(expect.arrayContaining([editControlAnchorStyle, editInsertionAnchorStyle]));
      const controlRenderer = editControlAnchorStyle.getRenderer();
      const insertionRenderer = editInsertionAnchorStyle.getRenderer();
      if (controlRenderer === null || controlRenderer === undefined || insertionRenderer === null || insertionRenderer === undefined) {
        throw new Error('Missing batched anchor renderer');
      }

      const controlContext = fakeCanvasContext();
      controlRenderer(
        [
          [10, 20],
          [30, 40]
        ],
        { context: controlContext as unknown as CanvasRenderingContext2D, pixelRatio: 2 } as never
      );
      expect(controlContext.beginPath).toHaveBeenCalledOnce();
      expect(controlContext.arc).toHaveBeenCalledTimes(2);
      expect(controlContext.arc).toHaveBeenNthCalledWith(1, 10, 20, 10, 0, 2 * Math.PI);
      expect(controlContext.arc).toHaveBeenNthCalledWith(2, 30, 40, 10, 0, 2 * Math.PI);
      expect(controlContext.lineWidth).toBe(4);
      expect(controlContext.fill).toHaveBeenCalledOnce();
      expect(controlContext.stroke).toHaveBeenCalledOnce();

      const insertionContext = fakeCanvasContext();
      insertionRenderer([[15, 25]], { context: insertionContext as unknown as CanvasRenderingContext2D, pixelRatio: 2 } as never);
      expect(insertionContext.beginPath).toHaveBeenCalledOnce();
      expect(insertionContext.setLineDash).toHaveBeenCalledWith([6, 4]);
      expect(insertionContext.fill).toHaveBeenCalledOnce();
      expect(insertionContext.stroke).toHaveBeenCalledOnce();
    } finally {
      handle.destroy();
    }
  });

  it('coalesces browser pointerdrag events per animation frame and flushes or cancels pending moves', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    const cancelFrame = vi.fn((id: number) => {
      frames.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    try {
      handle.render(renderState());
      const input = editInteraction(map);
      input.handleEvent(pointerEvent('pointerdown', [0, 0]));
      for (let index = 1; index <= 100; index += 1) input.handleEvent(pointerEvent('pointerdrag', [index, 1], { button: -1 }));

      expect(requestFrame).toHaveBeenCalledOnce();
      expect(received.map(({ type }) => type)).toEqual(['move-start']);
      const firstFrame = frames.get(1);
      if (firstFrame === undefined) throw new Error('Missing coalesced animation frame');
      frames.delete(1);
      firstFrame(16);
      expect(received.at(-1)).toEqual({
        type: 'move',
        anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false },
        coordinate: [100, 1]
      });

      input.handleEvent(pointerEvent('pointerdrag', [101, 1], { button: -1 }));
      input.handleEvent(pointerEvent('pointerup', [102, 2], { button: -1 }));
      expect(received.slice(-2).map(({ type }) => type)).toEqual(['move', 'move-end']);
      expect((received.at(-2) as Extract<EditInteractionEvent, { type: 'move' }>).coordinate).toEqual([101, 1]);
      expect((received.at(-1) as Extract<EditInteractionEvent, { type: 'move-end' }>).coordinate).toEqual([102, 2]);

      input.handleEvent(pointerEvent('pointerdown', [0, 0]));
      input.handleEvent(pointerEvent('pointerdrag', [3, 3], { button: -1 }));
      const cancelledFrame = frames.get(3);
      if (cancelledFrame === undefined) throw new Error('Missing cancellation animation frame');
      input.handleEvent(pointerEvent('pointercancel', [3, 3], { button: -1 }));
      cancelledFrame(32);
      expect(received.at(-1)?.type).toBe('move-cancel');

      input.handleEvent(pointerEvent('pointerdown', [0, 0]));
      input.handleEvent(pointerEvent('pointerdrag', [4, 4], { button: -1 }));
      const destroyedFrame = frames.get(4);
      if (destroyedFrame === undefined) throw new Error('Missing destroy animation frame');
      const beforeDestroy = received.length;
      handle.destroy();
      destroyedFrame(48);
      expect(received).toHaveLength(beforeDestroy);
      expect(cancelFrame).toHaveBeenCalledTimes(3);
    } finally {
      handle.destroy();
      vi.unstubAllGlobals();
    }
  });

  it('maps an OL pointerup that wraps a native pointercancel to move-cancel', () => {
    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const input = editInteraction(map);

    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    input.handleEvent(pointerEvent('pointerup', [2, 1], { button: -1, nativeType: 'pointercancel' }));

    expect(received).toEqual([
      { type: 'move-start', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false }, coordinate: [0, 0] },
      { type: 'move-cancel', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false } }
    ]);
    handle.destroy();
  });

  it('uses the OpenLayers user projection for wrapped edit placement', () => {
    setUserProjection('EPSG:4326');
    try {
      const entry = element([
        [170, 10],
        [190, 20]
      ]);
      const { adapter } = setup({ center: [540, 0], projection: 'EPSG:3857', state: entry, wrapX: true });

      const handle = adapter.open({ elementId: entry.id, controlPoints: entry.geometry.controlPoints, underlay: false }, vi.fn());

      expect(handle.placement).toEqual({
        controlPoints: [
          [530, 10],
          [550, 20]
        ],
        handoff: { kind: 'wrapped', world: { minX: -180, width: 360 } }
      });
      handle.destroy();
    } finally {
      clearUserProjection();
    }
  });

  it('replays active cross-world drag coordinates through the OpenLayers user projection', () => {
    setUserProjection('EPSG:4326');
    try {
      const { adapter, map } = setup({ center: [0, 0], projection: 'EPSG:3857', wrapX: true });
      const received: EditInteractionEvent[] = [];
      const handle = adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        (event) => received.push(event)
      );
      handle.render(renderState());
      const input = editInteraction(map);
      input.handleEvent(pointerEvent('pointerdown', [0, 0]));
      const offset = 50 * 360;
      map.view.setCenter([offset, 0]);
      input.handleEvent(pointerEvent('pointerdrag', [offset + 2, 1]));
      input.handleEvent(pointerEvent('pointerup', [offset + 3, 2]));

      expect(received).toEqual([
        expect.objectContaining({ type: 'move-start', coordinate: [0, 0] }),
        expect.objectContaining({ type: 'move', coordinate: [2, 1] }),
        expect.objectContaining({ type: 'move-end', coordinate: [3, 2] })
      ]);
      const line = temporaryLayer(map)
        .getSource()
        ?.getFeatures()
        .map((feature) => feature.getGeometry())
        .find((geometry): geometry is LineString => geometry instanceof LineString);
      expect(line?.getCoordinates()).toEqual([
        [offset, 0],
        [offset + 8, 0]
      ]);
      handle.destroy();
    } finally {
      clearUserProjection();
    }
  });

  it('queries the stable anchor index in repeated worlds through the OpenLayers user projection', () => {
    setUserProjection('EPSG:4326');
    try {
      const { adapter, map } = setup({ center: [0, 0], projection: 'EPSG:3857', wrapX: true });
      const received: EditInteractionEvent[] = [];
      const handle = adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        (event) => received.push(event)
      );
      try {
        handle.render(renderState());
        const input = editInteraction(map);
        for (const world of [50, -50, 3]) {
          const offset = world * 360;
          map.view.setCenter([offset, 0]);
          expect(input.handleEvent(pointerEvent('pointerdown', [offset, 0]))).toBe(false);
          expect(input.handleEvent(pointerEvent('pointercancel', [offset, 0], { button: -1 }))).toBe(false);
        }
        expect(received.filter(({ type }) => type === 'move-start')).toEqual(
          Array.from({ length: 3 }, () => expect.objectContaining({ type: 'move-start', coordinate: [0, 0] }))
        );
      } finally {
        handle.destroy();
      }
    } finally {
      clearUserProjection();
    }
  });

  it('reuses two render buffers and defers their native cleanup until destroy', () => {
    const { adapter, map, styles } = setup();
    const compile = vi.spyOn(styles, 'compile');
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const firstSource = layer.getSource();
    if (firstSource === null) throw new Error('Missing first render source');
    const firstFeatures = firstSource.getFeatures();
    const firstClear = vi.spyOn(firstSource, 'clear');
    const firstDispose = vi.spyOn(firstSource, 'dispose');
    const firstFeatureDisposals = firstFeatures.map((feature) => vi.spyOn(feature, 'dispose'));

    handle.render(
      renderState(
        [
          [0, 0],
          [10, 2]
        ],
        [5, 1]
      )
    );

    expect(firstClear).not.toHaveBeenCalled();
    expect(firstSource.getFeatures()).toEqual(firstFeatures);
    expect(firstDispose).not.toHaveBeenCalled();
    expect(firstFeatures.every((feature) => feature.getGeometry() !== undefined && feature.getStyle() !== undefined)).toBe(true);
    expect(firstFeatureDisposals.every((dispose) => dispose.mock.calls.length === 0)).toBe(true);

    const secondSource = layer.getSource();
    if (secondSource === null) throw new Error('Missing second render source');
    const secondFeatures = secondSource.getFeatures();
    const secondDispose = vi.spyOn(secondSource, 'dispose');
    const secondClear = vi.spyOn(secondSource, 'clear');
    const secondFeatureDisposals = secondFeatures.map((feature) => vi.spyOn(feature, 'dispose'));
    const secondPreviewGeometry = secondFeatures.map((feature) => feature.getGeometry()).find((geometry) => geometry instanceof LineString);
    const secondAnchorGeometries = secondFeatures
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is MultiPoint => geometry instanceof MultiPoint);
    if (secondPreviewGeometry === undefined) throw new Error('Missing second preview geometry');
    const previewSetter = vi.spyOn(secondPreviewGeometry, 'setCoordinates');
    const anchorSetters = secondAnchorGeometries.map((geometry) => vi.spyOn(geometry, 'setCoordinates'));

    handle.render(
      renderState(
        [
          [0, 0],
          [12, 4]
        ],
        [6, 2]
      )
    );
    handle.render(
      renderState(
        [
          [0, 0],
          [10, 2]
        ],
        [5, 1]
      )
    );
    expect(layer.getSource()).toBe(secondSource);
    expect(previewSetter).not.toHaveBeenCalled();
    expect(anchorSetters.every((setter) => setter.mock.calls.length === 0)).toBe(true);

    const sources = new Set<VectorSource<FeatureLike>>([firstSource, secondSource]);
    for (let step = 0; step < 100; step += 1) {
      handle.render(
        renderState(
          [
            [0, 0],
            [12 + step, 4]
          ],
          [6 + step / 2, 2]
        )
      );
      const source = layer.getSource();
      if (source === null) throw new Error('Missing reused render source');
      sources.add(source);
    }

    expect(sources).toEqual(new Set([firstSource, secondSource]));
    expect(new Set(firstSource.getFeatures())).toEqual(new Set(firstFeatures));
    expect(new Set(secondSource.getFeatures())).toEqual(new Set(secondFeatures));
    expect(firstClear).not.toHaveBeenCalled();
    expect(secondClear).not.toHaveBeenCalled();
    expect(firstDispose).not.toHaveBeenCalled();
    expect(secondDispose).not.toHaveBeenCalled();
    expect(compile).toHaveBeenCalledOnce();

    const reduced = renderState();
    const reducedState: EditInteractionRenderState = { ...reduced, anchors: reduced.anchors.slice(0, 1) };
    handle.render(reducedState);
    handle.render(reducedState);
    expect(firstSource.getFeatures()).toHaveLength(2);
    expect(secondSource.getFeatures()).toHaveLength(2);

    handle.destroy();
    expect(firstClear).toHaveBeenCalledOnce();
    expect(secondClear).toHaveBeenCalledOnce();
    expect(firstSource.getFeatures()).toEqual([]);
    expect(secondSource.getFeatures()).toEqual([]);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(firstFeatureDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(secondFeatureDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
  });

  it('preserves the preceding render atomically and emits nothing from a failing source handoff', () => {
    const { adapter, map, styles } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const input = editInteraction(map);
    const previousSource = layer.getSource();
    if (previousSource === null) throw new Error('Missing previous source');
    const previousFeatures = previousSource.getFeatures();

    vi.spyOn(styles, 'compile').mockImplementationOnce(() => {
      throw new Error('compile failed');
    });
    const failingStyle: ElementStyleState = { strokes: [{ color: '#ff0000', width: 2 }] };
    expect(() =>
      handle.render({
        ...renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        ),
        style: failingStyle
      })
    ).toThrowError('compile failed');
    expect(layer.getSource()).toBe(previousSource);
    expect(previousSource.getFeatures()).toEqual(previousFeatures);

    const nativeSetSource = layer.setSource.bind(layer);
    const setSource = vi.spyOn(layer, 'setSource').mockImplementationOnce((source) => {
      nativeSetSource(source);
      input.handleEvent(pointerEvent('click', [7, 2], { altKey: true }));
      throw new Error('source handoff failed');
    });
    setSource.mockImplementation((source) => nativeSetSource(source));

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [14, 4]
          ],
          [7, 2]
        )
      )
    ).toThrowError('source handoff failed');
    expect(setSource).toHaveBeenCalledTimes(2);
    expect(layer.getSource()).toBe(previousSource);
    expect(previousSource.getFeatures()).toEqual(previousFeatures);
    expect(received).toEqual([]);

    input.handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
    expect(received).toEqual([{ type: 'insert', anchor: { kind: 'insertion', index: 1, coordinate: [4, 0] } }]);
    handle.destroy();
  });

  it('keeps the layer source cleared when change:source destroys the handle during render', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);

    layer.once('change:source', () => handle.destroy());

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      )
    ).toThrowError('OpenLayers did not install the edit render snapshot');
    expect(layer.getSource()).toBeNull();

    expect(() => handle.destroy()).not.toThrow();
    expect(layer.getSource()).toBeNull();
  });

  it('does not clear the preceding source during frame handoff', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const precedingSource = layer.getSource();
    if (precedingSource === null) throw new Error('Missing preceding source');
    const clearListener = vi.fn(() => handle.destroy());
    precedingSource.once('clear', clearListener);

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      )
    ).not.toThrow();
    expect(clearListener).not.toHaveBeenCalled();
    expect(map.layers.getLength()).toBe(2);
    expect(map.interactions.getLength()).toBe(1);
    expect(() => handle.destroy()).not.toThrow();
    expect(clearListener).toHaveBeenCalledOnce();
    expect(precedingSource.getFeatures()).toEqual([]);
  });

  it('rolls back a failed open, including suppression, after partial OL layer and interaction attachment', () => {
    const { adapter, binding, map, persistentFeature, persistentSource } = setup();
    const events: EditInteractionEvent[] = [];
    const nativeSuppress = binding.suppressProjection.bind(binding);
    let acquisition: ProjectionSuppressionLease | undefined;
    vi.spyOn(binding, 'suppressProjection').mockImplementation((id) => {
      acquisition = nativeSuppress(id);
      return acquisition;
    });
    const nativeAddLayer = map.addLayer.bind(map);
    let candidateLayer: BaseLayer | undefined;
    vi.spyOn(map, 'addLayer').mockImplementation((layer) => {
      candidateLayer = layer;
      nativeAddLayer(layer);
    });
    const nativeAddInteraction = map.addInteraction.bind(map);
    let candidateInteraction: Interaction | undefined;
    vi.spyOn(map, 'addInteraction').mockImplementation((interaction) => {
      candidateInteraction = interaction;
      nativeAddInteraction(interaction);
      interaction.handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
      throw new Error('interaction attach failed');
    });
    const nativeRemoveLayer = map.removeLayer.bind(map);
    const removeLayer = vi.spyOn(map, 'removeLayer').mockImplementationOnce(() => {
      throw new Error('first layer rollback failed');
    });
    removeLayer.mockImplementation((layer) => nativeRemoveLayer(layer));
    const nativeRemoveInteraction = map.removeInteraction.bind(map);
    const removeInteraction = vi.spyOn(map, 'removeInteraction').mockImplementationOnce(() => {
      throw new Error('first interaction rollback failed');
    });
    removeInteraction.mockImplementation((interaction) => nativeRemoveInteraction(interaction));

    expect(() =>
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        (event) => events.push(event)
      )
    ).toThrowError('interaction attach failed');

    expect(events).toEqual([]);
    expect(acquisition?.active).toBe(false);
    expect(map.layers.getArray()).not.toContain(candidateLayer);
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getArray()).not.toContain(candidateInteraction);
    expect(map.interactions.getLength()).toBe(0);
    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    candidateInteraction?.handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
    expect(events).toEqual([]);
  });

  it('surfaces both installation and unrecoverable rollback failures', () => {
    const { adapter, map } = setup();
    const events: EditInteractionEvent[] = [];
    const nativeAddInteraction = map.addInteraction.bind(map);
    vi.spyOn(map, 'addInteraction').mockImplementation((interaction) => {
      nativeAddInteraction(interaction);
      throw new Error('installation failed');
    });
    vi.spyOn(map, 'removeInteraction').mockImplementation(() => {
      throw new Error('map interaction removal failed');
    });
    vi.spyOn(map, 'removeLayer').mockImplementation(() => {
      throw new Error('map layer removal failed');
    });
    vi.spyOn(map.interactions, 'remove').mockImplementation(() => {
      throw new Error('collection interaction removal failed');
    });
    vi.spyOn(map.layers, 'remove').mockImplementation(() => {
      throw new Error('collection layer removal failed');
    });

    let failure: unknown;
    try {
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        (event) => events.push(event)
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toContain('installation failed');
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toContain('map layer removal failed');
    const abandoned = editInteraction(map);
    expect(abandoned.getActive()).toBe(false);
    abandoned.handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
    expect(events).toEqual([]);
  });

  it('attempts every early-open cleanup and surfaces the original and rollback failures', () => {
    const { adapter, binding, layers } = setup();
    const releaseFailure = new Error('suppression release failed');
    const installFailure = new Error('z-index lookup failed');
    const release = vi.fn(() => {
      throw releaseFailure;
    });
    const lease: ProjectionSuppressionLease = {
      elementId: 'editable',
      active: true,
      handoff: () => lease,
      release
    };
    vi.spyOn(binding, 'suppressProjection').mockReturnValue(lease);
    vi.spyOn(layers.requireLayer('edit-layer'), 'getZIndex').mockImplementationOnce(() => {
      throw installFailure;
    });
    const disposeSource = vi.spyOn(VectorSource.prototype, 'dispose');

    let failure: unknown;
    let disposeCalls = 0;
    try {
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        vi.fn()
      );
    } catch (error) {
      failure = error;
    } finally {
      disposeCalls = disposeSource.mock.calls.length;
      disposeSource.mockRestore();
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual(expect.arrayContaining([installFailure, releaseFailure]));
    expect(release).toHaveBeenCalledOnce();
    expect(disposeCalls).toBe(1);
  });

  it('stops events first, attempts every destroy cleanup, and retries only unfinished work', () => {
    const { adapter, map, persistentFeature, persistentSource, reports } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const source = layer.getSource();
    if (source === null) throw new Error('Missing temporary source');
    const input = editInteraction(map);
    const order: string[] = [];
    const nativeSetActive = input.setActive.bind(input);
    const setActive = vi.spyOn(input, 'setActive').mockImplementation((active) => {
      order.push('deactivate');
      nativeSetActive(active);
    });
    const nativeRemoveLayer = map.removeLayer.bind(map);
    const removeLayer = vi.spyOn(map, 'removeLayer').mockImplementationOnce(() => {
      order.push('layer');
      throw new Error('layer cleanup failed');
    });
    removeLayer.mockImplementation((candidate) => {
      order.push('layer');
      return nativeRemoveLayer(candidate);
    });
    const nativeRemoveInteraction = map.removeInteraction.bind(map);
    const removeInteraction = vi.spyOn(map, 'removeInteraction').mockImplementationOnce(() => {
      order.push('interaction');
      throw new Error('interaction cleanup failed');
    });
    removeInteraction.mockImplementation((candidate) => {
      order.push('interaction');
      return nativeRemoveInteraction(candidate);
    });
    const nativeClear = source.clear.bind(source);
    const clear = vi.spyOn(source, 'clear').mockImplementationOnce(() => {
      order.push('source');
      throw new Error('source cleanup failed');
    });
    clear.mockImplementation((fast) => {
      order.push('source');
      nativeClear(fast);
    });

    expect(() => handle.destroy()).toThrowError('layer cleanup failed');
    expect(order).toEqual(['deactivate', 'layer', 'interaction', 'source']);
    expect(reports.map((error) => (error as Error).message)).toEqual(['layer cleanup failed', 'interaction cleanup failed', 'source cleanup failed']);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    expect(received).toEqual([]);

    handle.destroy();
    expect(order).toEqual(['deactivate', 'layer', 'interaction', 'source', 'layer', 'interaction', 'source']);
    expect(setActive).toHaveBeenCalledOnce();
    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(2);
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(source.getFeatures()).toEqual([]);

    handle.destroy();
    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('continues all destroy finalizers when a post-deactivation state check throws', () => {
    const { adapter, map, persistentFeature, persistentSource, reports } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const source = layer.getSource();
    if (source === null) throw new Error('Missing temporary source');
    const input = editInteraction(map);
    vi.spyOn(input, 'getActive').mockImplementation(() => {
      throw new Error('active state check failed');
    });

    expect(() => handle.destroy()).toThrowError('active state check failed');
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(source.getFeatures()).toEqual([]);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    expect(reports.map((error) => (error as Error).message)).toContain('active state check failed');
    expect(() => handle.destroy()).not.toThrow();
  });

  it('isolates native edit resources and suppression ownership between maps', () => {
    const first = setup({ wrapX: false });
    const second = setup({ wrapX: true });
    const firstEvents: EditInteractionEvent[] = [];
    const secondEvents: EditInteractionEvent[] = [];
    const firstHandle = first.adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => firstEvents.push(event)
    );
    const secondHandle = second.adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: true
      },
      (event) => secondEvents.push(event)
    );
    firstHandle.render(renderState());
    secondHandle.render(renderState());

    editInteraction(first.map).handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
    editInteraction(second.map).handleEvent(pointerEvent('click', [8, 0], { altKey: true }));
    expect(firstEvents.map(({ type }) => type)).toEqual(['insert']);
    expect(secondEvents.map(({ type }) => type)).toEqual(['remove']);
    expect(first.persistentSource.hasFeature(first.persistentFeature)).toBe(false);
    expect(second.persistentSource.hasFeature(second.persistentFeature)).toBe(false);

    firstHandle.destroy();
    editInteraction(second.map).handleEvent(pointerEvent('click', [4, 0], { altKey: true }));
    expect(first.map.layers.getLength()).toBe(1);
    expect(first.map.interactions.getLength()).toBe(0);
    expect(first.persistentSource.getFeatures()).toEqual([first.persistentFeature]);
    expect(second.map.layers.getLength()).toBe(2);
    expect(second.map.interactions.getLength()).toBe(1);
    expect(secondEvents.map(({ type }) => type)).toEqual(['remove', 'insert']);
    expect(second.persistentSource.hasFeature(second.persistentFeature)).toBe(false);

    secondHandle.destroy();
    expect(second.persistentSource.getFeatures()).toEqual([second.persistentFeature]);

    const source = readFileSync('src/adapters/openlayers/interactions/EditInteractionAdapter.ts', 'utf8');
    expect(source).not.toMatch(/\.(?:anchor_|coordinate_|pixel_|map_|source_|handleEvent_)\b/u);
    expect(source).not.toContain("from 'ol/interaction.js'");
  });
});
