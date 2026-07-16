import { vi } from 'vitest';
import { basicShapeDefinitions } from '../../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../../src/core/common/types.js';
import { ElementStore } from '../../src/core/element/ElementStore.js';
import type { ElementState } from '../../src/core/element/types.js';
import type { AnimationControlHandle, TransformAnimationPort } from '../../src/core/ports/AnimationControlPort.js';
import type {
  TransformCopyPreview,
  TransformInteractionEvent,
  TransformInteractionHandle,
  TransformInteractionOptions,
  TransformInteractionPort,
  TransformInteractionTarget
} from '../../src/core/ports/TransformInteractionPort.js';
import type {
  TransformToolbarPort,
  TransformToolbarViewEvent,
  TransformToolbarViewHandle,
  TransformToolbarViewSpec
} from '../../src/core/ports/TransformToolbarPort.js';
import type {
  TransformTooltipPort,
  TransformTooltipViewHandle,
  TransformTooltipViewSpec,
  TransformTooltipViewState
} from '../../src/core/ports/TransformTooltipPort.js';
import type { TransientAnimationHandle, TransientAnimationPort, TransientAnimationSpec } from '../../src/core/ports/TransientAnimationPort.js';
import { ShapeRegistry } from '../../src/core/shape/ShapeRegistry.js';
import type { ShapeState, ShapeType } from '../../src/core/shape/types.js';
import type { ElementStyleState } from '../../src/core/style/types.js';
import { InteractionCoordinator } from '../../src/services/events/InteractionCoordinator.js';
import { StyleService } from '../../src/services/style/StyleService.js';
import { TransformService } from '../../src/services/transform/TransformService.js';
import type { InternalTransformToolbarOptions } from '../../src/services/transform/types.js';

export class FakeTransformPort implements TransformInteractionPort {
  readonly log: string[];
  listener: ((event: TransformInteractionEvent) => void) | undefined;
  handle: FakeTransformHandle | undefined;
  options: TransformInteractionOptions | undefined;

  constructor(log: string[]) {
    this.log = log;
  }

  open(sessionId: string, options: TransformInteractionOptions, listener: (event: TransformInteractionEvent) => void): TransformInteractionHandle {
    this.options = options;
    this.listener = listener;
    this.handle = new FakeTransformHandle(sessionId, this.log);
    return this.handle;
  }

  emit(event: TransformInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Transform interaction is not open');
    this.listener(event);
  }
}

export class FakeTransformHandle implements TransformInteractionHandle {
  readonly renderTargetId: string;
  readonly log: string[];
  readonly #fallbackRenderLayerId: string;
  target: TransformInteractionTarget | undefined;
  copyPreview: TransformCopyPreview | undefined;
  operationActive = false;
  destroyed = false;

  constructor(sessionId: string, log: string[]) {
    this.#fallbackRenderLayerId = `layer:${sessionId}`;
    this.renderTargetId = `target:${sessionId}`;
    this.log = log;
  }

  get renderLayerId(): string {
    return this.target?.layerId ?? this.#fallbackRenderLayerId;
  }

  setTarget(target: TransformInteractionTarget): void {
    this.target = target;
    this.log.push(`target:set:${target.elementId}`);
  }

  clearTarget(): void {
    this.target = undefined;
    this.log.push('target:clear');
  }

  setOperationActive(active: boolean): void {
    this.operationActive = active;
    this.log.push(`interaction:operation-active:${String(active)}`);
  }

  startCopyPreview(preview: TransformCopyPreview): void {
    this.copyPreview = preview;
    this.log.push('copy:start');
  }

  cancelCopyPreview(): void {
    this.copyPreview = undefined;
    this.log.push('copy:cancel');
  }

  destroy(): void {
    this.destroyed = true;
    this.log.push('interaction:destroy');
  }
}

class FakeAnimations implements TransformAnimationPort {
  readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  play(): AnimationControlHandle {
    return { status: 'running', stop: () => this.log.push('animation:handle-stop') };
  }

  pause(selector: { id?: string }): number {
    this.log.push(`animation:pause:${selector.id ?? '*'}`);
    return 1;
  }

  resume(selector: { id?: string }): number {
    this.log.push(`animation:resume:${selector.id ?? '*'}`);
    return 1;
  }

  stop(selector: { id?: string }): number {
    this.log.push(`animation:stop:${selector.id ?? '*'}`);
    return 1;
  }

  setPreview(state: Readonly<ElementState>): void {
    this.log.push(`animation:preview:set:${state.id}`);
  }

  clearPreview(elementId: string): void {
    this.log.push(`animation:preview:clear:${elementId}`);
  }
}

class FakeTransients implements TransientAnimationPort {
  readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  playTransient(spec: TransientAnimationSpec): TransientAnimationHandle {
    this.log.push(`transient:play:${spec.renderTargetId}`);
    let status: TransientAnimationHandle['status'] = 'running';
    return {
      get status() {
        return status;
      },
      stop: () => {
        status = 'stopped';
        this.log.push('transient:handle-stop');
      }
    };
  }

  stopTransient(ownerId: string): number {
    this.log.push(`transient:owner-stop:${ownerId}`);
    return 1;
  }
}

export class FakeToolbarPort implements TransformToolbarPort {
  readonly views: FakeToolbarHandle[] = [];
  command: ((key: string) => void) | undefined;

  open(spec: TransformToolbarViewSpec, listener: (event: TransformToolbarViewEvent) => void): TransformToolbarViewHandle {
    this.command = (key) => listener({ type: 'command', key });
    const view = new FakeToolbarHandle(spec);
    this.views.push(view);
    return view;
  }
}

export class FakeToolbarHandle implements TransformToolbarViewHandle {
  readonly setActive = vi.fn();
  readonly updateItem = vi.fn();
  readonly updateOptions = vi.fn();
  readonly show = vi.fn();
  readonly hide = vi.fn();
  readonly destroy = vi.fn();
  readonly spec: TransformToolbarViewSpec;

  constructor(spec: TransformToolbarViewSpec) {
    this.spec = spec;
  }
}

export class FakeTooltipPort implements TransformTooltipPort {
  readonly views: FakeTooltipHandle[] = [];

  open(spec: TransformTooltipViewSpec): TransformTooltipViewHandle {
    const view = new FakeTooltipHandle(spec);
    this.views.push(view);
    return view;
  }
}

export class FakeTooltipHandle implements TransformTooltipViewHandle {
  readonly spec: TransformTooltipViewSpec;
  state: TransformTooltipViewState;
  destroyed = false;

  constructor(spec: TransformTooltipViewSpec) {
    this.spec = spec;
    this.state = {
      position: spec.position,
      lines: spec.lines,
      offset: spec.offset,
      visible: spec.visible
    };
  }

  update(patch: Partial<TransformTooltipViewState>): void {
    if (!this.destroyed) this.state = { ...this.state, ...patch };
  }

  show(): void {
    this.update({ visible: true });
  }

  hide(): void {
    this.update({ visible: false });
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeTransformInput {
  readonly focus = vi.fn();
  listener: ((event: KeyboardInput) => void) | undefined;

  on(_type: 'keydown', listener: (event: KeyboardInput) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  key(key: string, options: Partial<Omit<KeyboardInput, 'key' | 'preventDefault'>> = {}): ReturnType<typeof vi.fn> {
    const preventDefault = vi.fn();
    this.listener?.({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...options, preventDefault });
    return preventDefault;
  }
}

interface KeyboardInput {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

export interface TransformHarnessAnimationPorts {
  readonly animations: TransformAnimationPort;
  readonly transients: TransientAnimationPort;
}

export function createTransformHarness(
  toolbar = false as false | InternalTransformToolbarOptions,
  createAnimationPorts?: (context: Readonly<{ store: ElementStore; shapes: ShapeRegistry }>) => TransformHarnessAnimationPorts
) {
  const log: string[] = [];
  const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
  const store = new ElementStore(shapes);
  const styles = new StyleService(store);
  const coordinator = new InteractionCoordinator();
  const interaction = new FakeTransformPort(log);
  const toolbarPort = new FakeToolbarPort();
  const tooltipPort = new FakeTooltipPort();
  const input = new FakeTransformInput();
  const animationPorts = createAnimationPorts?.({ store, shapes }) ?? {
    animations: new FakeAnimations(log),
    transients: new FakeTransients(log)
  };
  let id = 0;
  const service = new TransformService({
    store,
    shapes,
    styles,
    coordinator,
    interaction,
    animations: animationPorts.animations,
    transients: animationPorts.transients,
    toolbar: toolbarPort,
    tooltip: tooltipPort,
    input,
    createId: () => `copy-${++id}`,
    errorReporter: () => undefined
  });
  return { coordinator, input, interaction, log, service, shapes, store, styles, toolbar, toolbarPort, tooltipPort };
}

export function addElement<T = unknown>(
  harness: ReturnType<typeof createTransformHarness>,
  id: string,
  type: ShapeType,
  points: readonly Coordinate[],
  style: ElementStyleState = { strokes: [{ color: '#36f', width: 2 }] },
  data?: T
): Readonly<ElementState<T>> {
  const definition = harness.shapes.get(type);
  const draft = definition.createDraft(points);
  if (draft === undefined) throw new Error(`Incomplete representative geometry: ${type}`);
  const completion = definition.tryComplete(draft as never);
  if (completion.status !== 'complete') throw new Error(`Incomplete representative geometry: ${type}`);
  return harness.store.add<T>({
    id,
    type,
    geometry: completion.state as ShapeState,
    style,
    ...(data === undefined ? {} : { data }),
    layerId: 'vector',
    visible: true
  });
}

export const representativePoints = {
  point: [[1, 2]],
  polyline: [
    [0, 0],
    [4, 2]
  ],
  polygon: [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  circle: [
    [0, 0],
    [2, 0]
  ],
  ellipse: [
    [0, 0],
    [4, 2]
  ],
  'attack-arrow': [
    [0, 0],
    [2, 0],
    [3, 3],
    [5, 4]
  ],
  'tailed-attack-arrow': [
    [0, 0],
    [2, 0],
    [3, 3],
    [5, 4]
  ],
  'fine-arrow': [
    [0, 0],
    [4, 3]
  ],
  'tailed-squad-combat-arrow': [
    [0, 0],
    [4, 3]
  ],
  'assault-direction-arrow': [
    [0, 0],
    [4, 3]
  ],
  'double-arrow': [
    [0, 0],
    [4, 0],
    [3, 3],
    [1, 3]
  ],
  rectangle: [
    [0, 0],
    [4, 3]
  ],
  triangle: [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  'equilateral-triangle': [
    [0, 0],
    [4, 0]
  ],
  'assemble-polygon': [
    [0, 0],
    [2, 3],
    [4, 0]
  ],
  'closed-curve-polygon': [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3]
  ],
  sector: [
    [0, 0],
    [4, 0],
    [0, 4]
  ],
  'lune-polygon': [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  'lune-polyline': [
    [0, 0],
    [4, 0],
    [2, 3]
  ],
  'curve-polyline': [
    [0, 0],
    [2, 3],
    [4, 0]
  ]
} satisfies Record<ShapeType, readonly Coordinate[]>;
