import { Earth, type AnimationHandle, type CenterSpreadAnimationSpec, type RadarScanAnimationSpec } from '../../src/index.ts';
import '../../src/assets/style/public.scss';

type VisualEffect = 'radar-scan' | 'center-spread' | 'path-travel';
type RadarDirection = 'clockwise' | 'counterclockwise';
type RadarScanMode = 'one-way' | 'round-trip';
type RadialTrailStyle = 'solid' | 'gradient';
type VisualTheme = 'light' | 'dark';

interface VisualPreparation {
  readonly effect: VisualEffect;
  readonly direction?: RadarDirection;
  readonly scanMode?: RadarScanMode;
  readonly trailStyle?: RadialTrailStyle;
  readonly elapsedMs: number;
  readonly rotation: number;
  readonly theme: VisualTheme;
  readonly curvature?: number;
}

interface DeterministicClock {
  now(): number;
  set(value: number): void;
}

interface AnimationVisualFixture {
  readonly ready: boolean;
  prepare(input: VisualPreparation): void;
  destroy(): void;
}

declare global {
  interface Window {
    __OL_ENGINE_ANIMATION_VISUAL_CLOCK__?: DeterministicClock;
    __OL_ENGINE_ANIMATION_VISUAL__: AnimationVisualFixture;
  }
}

const clock = window.__OL_ENGINE_ANIMATION_VISUAL_CLOCK__ ?? installDeterministicClock();

const target = document.getElementById('map');
if (!(target instanceof HTMLElement)) throw new Error('动画视觉回归地图容器不存在');

const startTime = 1_000_000;
const layerId = 'animation-visual-layer';
const circleId = 'animation-visual-circle';
const sectorId = 'animation-visual-sector';
const pathId = 'animation-visual-path';
clock.set(startTime);

const earth = new Earth({
  target,
  view: { center: [0, 0], resolution: 1, rotation: 0, projection: 'EPSG:3857', multiWorld: false },
  controls: { zoom: false, rotate: false, attribution: false }
});
earth.layers.add({ kind: 'vector', id: layerId, zIndex: 10, wrapX: false, declutter: false });
earth.elements.add({
  id: circleId,
  layerId,
  geometry: { type: 'circle', center: [-125, 0], radius: 98 },
  style: {
    fill: { type: 'solid', color: 'rgba(14, 116, 144, 0.12)' },
    strokes: [{ color: '#0891b2', width: 2 }]
  }
});
earth.elements.add({
  id: pathId,
  layerId,
  visible: false,
  geometry: {
    type: 'polyline',
    controlPoints: [
      [-205, 45],
      [-105, -45],
      [-5, 45],
      [95, -45],
      [205, 45]
    ]
  },
  style: { strokes: [{ color: 'rgba(8, 145, 178, 0.08)', width: 1 }] }
});
earth.elements.add({
  id: sectorId,
  layerId,
  geometry: {
    type: 'sector',
    controlPoints: [
      [125, 0],
      [62, -75],
      [210, 49]
    ]
  },
  style: {
    fill: { type: 'solid', color: 'rgba(14, 116, 144, 0.12)' },
    strokes: [{ color: '#0891b2', width: 2 }]
  }
});

let handles: AnimationHandle[] = [];
let destroyed = false;

window.__OL_ENGINE_ANIMATION_VISUAL__ = Object.freeze({
  ready: true,
  prepare(input) {
    if (destroyed) throw new Error('动画视觉回归 fixture 已销毁');
    stopAnimations();
    clock.set(startTime);
    document.documentElement.dataset.theme = input.theme;
    earth.map.getView().setRotation(input.rotation);
    const radialVisible = input.effect !== 'path-travel';
    earth.elements.update({ id: circleId }, { visible: radialVisible });
    earth.elements.update({ id: sectorId }, { visible: radialVisible });
    earth.elements.update({ id: pathId }, { visible: !radialVisible });

    if (input.effect === 'radar-scan') {
      const spec: RadarScanAnimationSpec = {
        type: 'radar-scan' as const,
        periodMs: 120_000,
        direction: input.direction ?? 'clockwise',
        scanMode: input.scanMode ?? 'one-way',
        ...(input.trailStyle === 'solid'
          ? { color: '#00e676' }
          : {
              gradient: [
                [0, 'transparent'],
                [0.58, 'hsl(151 100% 45% / 0.46)'],
                [1, 'rgb(0 255 136 / 1)']
              ] as const
            }),
        opacity: 0.9,
        beamWidthDeg: 74,
        repeat: true
      };
      target.dataset.trailStyle = 'color' in spec ? 'solid' : 'gradient';
      handles = [earth.animations.play({ id: circleId }, spec), earth.animations.play({ id: sectorId }, spec)];
    } else if (input.effect === 'center-spread') {
      const spec: CenterSpreadAnimationSpec = {
        type: 'center-spread' as const,
        periodMs: 4_000,
        ...(input.trailStyle === 'solid'
          ? { color: '#00e676' }
          : {
              gradient: [
                [0, 'transparent'],
                [0.55, 'hsl(151 100% 45% / 0.48)'],
                [1, 'rgb(0 255 136 / 1)']
              ] as const
            }),
        opacity: 0.9,
        trailLength: 0.32,
        strokeWidth: 2,
        ringCount: 3,
        repeat: true
      };
      target.dataset.trailStyle = 'color' in spec ? 'solid' : 'gradient';
      handles = [earth.animations.play({ id: circleId }, spec), earth.animations.play({ id: sectorId }, spec)];
    } else {
      handles = [
        earth.animations.play(
          { id: pathId },
          {
            type: 'path-travel',
            durationMs: 4_000,
            repeat: false,
            trailLength: 1,
            gradient: [
              [0, 'rebeccapurple'],
              [0.5, 'hsl(194 100% 50% / 0.72)'],
              [1, 'rgb(0 255 136 / 1)']
            ],
            width: 6,
            curvature: input.curvature ?? 0.65,
            smoothness: 192,
            showStart: false,
            showEnd: false,
            finishBehavior: 'retain'
          }
        )
      ];
    }

    clock.set(startTime + input.elapsedMs);
    earth.map.updateSize();
    earth.map.renderSync();
    earth.map.renderSync();
  },
  destroy() {
    if (destroyed) return;
    destroyed = true;
    stopAnimations();
    earth.destroy();
  }
});

earth.map.updateSize();
earth.map.renderSync();
target.dataset.ready = 'true';
prepareFromLocation();

function stopAnimations(): void {
  for (const handle of handles) handle.stop();
  handles = [];
}

function installDeterministicClock(): DeterministicClock {
  let now = 1_000_000;
  const value = Object.freeze({
    now: () => now,
    set(next: number) {
      if (!Number.isFinite(next)) throw new Error('视觉回归时钟必须是有限数');
      now = next;
    }
  });
  Date.now = value.now;
  Object.defineProperty(window, '__OL_ENGINE_ANIMATION_VISUAL_CLOCK__', { configurable: false, value });
  return value;
}

function prepareFromLocation(): void {
  const parameters = new URLSearchParams(window.location.search);
  const effect = parameters.get('effect');
  if (effect !== 'radar-scan' && effect !== 'center-spread' && effect !== 'path-travel') return;
  const direction = parameters.get('direction');
  const scanMode = parameters.get('scanMode');
  const theme = parameters.get('theme');
  const elapsedMs = Number(parameters.get('elapsedMs') ?? 2_400);
  const rotation = Number(parameters.get('rotation') ?? 0);
  const curvature = Number(parameters.get('curvature') ?? 0.65);
  window.__OL_ENGINE_ANIMATION_VISUAL__.prepare({
    effect,
    ...(effect === 'radar-scan' && (direction === 'clockwise' || direction === 'counterclockwise') ? { direction } : {}),
    ...(effect === 'radar-scan' && (scanMode === 'one-way' || scanMode === 'round-trip') ? { scanMode } : {}),
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 2_400,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    theme: theme === 'dark' ? 'dark' : 'light',
    ...(effect === 'path-travel' && Number.isFinite(curvature) ? { curvature } : {})
  });
}
