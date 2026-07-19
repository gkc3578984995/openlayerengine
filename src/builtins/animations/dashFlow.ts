import type { DashFlowAnimationSpec } from '../../core/animation/types.js';
import { cloneCoreState } from '../../core/common/clone.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type {
  InlinePathTextSpec,
  LineworkSpec,
  PathDecorationSpec,
  PathGlyphPrimitiveSpec,
  PathGlyphSpec,
  PathGlyphStrokeSpec,
  StyleSpec
} from '../../core/style/types.js';
import type {
  AnimationDefinition,
  AnimationFrameBuffer,
  AnimationFrameContext,
  AnimationRuntime,
  AnimationSlotDefinition,
  AnimationTargetProfile
} from '../../services/animation/types.js';
import { animationRecord, arrayValues, channel, finite, optionalColor } from './validation.js';

const continuousSample = Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }) });

export const dashFlowAnimationDefinition = Object.freeze({
  type: 'dash-flow',
  writeDomains: new Set(['overlay'] as const),
  requirements: new Set(['structured-presentation'] as const),
  interactionPolicy: Object.freeze({ edit: 'pause-and-suppress', transform: 'follow-preview' }),
  normalize(input) {
    const record = animationRecord(input, 'dash-flow', ['type', 'channel', 'speed', 'lineDash', 'color']);
    if (record.type !== 'dash-flow') throw new CapabilityError('Dash-flow animation type must be dash-flow');
    const lineDash = normalizeLineDash(record.lineDash);
    const animation: DashFlowAnimationSpec = {
      type: 'dash-flow',
      channel: channel(record.channel, 'dash-flow', 'Dash-flow channel'),
      speed: finite(record.speed, 24, 'Dash-flow speed'),
      ...(lineDash === undefined ? {} : { lineDash }),
      ...(record.color === undefined ? {} : { color: optionalColor(record.color, 'Dash-flow color') })
    };
    return Object.freeze(animation);
  },
  assertCompatible(target) {
    assertDashFlowTarget(target);
  },
  create(target, spec) {
    assertDashFlowTarget(target);
    return createDashFlowRuntime(target, spec);
  }
} satisfies AnimationDefinition<DashFlowAnimationSpec>);

function createDashFlowRuntime(initialTarget: AnimationTargetProfile, spec: Readonly<DashFlowAnimationSpec>): AnimationRuntime {
  let target = initialTarget;
  let plans = createSlotPlans(target, spec);
  let slots = slotDefinitions(plans);
  return {
    get slots() {
      return slots;
    },
    rebind(next) {
      assertDashFlowTarget(next);
      target = next;
      plans = createSlotPlans(target, spec);
      slots = slotDefinitions(plans);
    },
    sample(context: AnimationFrameContext, output: AnimationFrameBuffer) {
      output.reset();
      const animatedOffset = -((context.elapsedMs / 1000) * (spec.speed ?? 24));
      for (const plan of plans) {
        const slot = output.overlay(plan.definition.slotKey);
        slot.active = true;
        slot.geometryKind = 'effective-target';
        if (plan.basePhase !== undefined) {
          slot.lineDashOffset = plan.basePhase + animatedOffset;
          slot.lineDashOffsetStrokeIndex = plan.strokeIndex;
        }
      }
      return continuousSample;
    },
    destroy() {
      return;
    }
  };
}

interface DashFlowSlotPlan {
  readonly definition: AnimationSlotDefinition;
  readonly basePhase: number | undefined;
  readonly strokeIndex: number | undefined;
}

function slotDefinitions(plans: readonly DashFlowSlotPlan[]): readonly AnimationSlotDefinition[] {
  return Object.freeze(plans.map(({ definition }) => definition));
}

function createSlotPlans(target: AnimationTargetProfile, spec: Readonly<DashFlowAnimationSpec>): readonly DashFlowSlotPlan[] {
  const base = cloneCoreState(target.style) as StyleSpec;
  if (base.linework !== undefined) return createLineworkSlotPlans(base, spec);
  const sourceStrokes = base.strokes ?? [{ width: 2 }];
  const strokes = sourceStrokes.map((stroke, index) => ({
    ...stroke,
    lineDash: [...(index === sourceStrokes.length - 1 ? (spec.lineDash ?? stroke.lineDash ?? [10, 10]) : (stroke.lineDash ?? []))],
    ...(index === sourceStrokes.length - 1 && spec.color !== undefined ? { color: spec.color } : {})
  }));
  const style = cloneCoreState({ ...base, strokes }) as StyleSpec;
  const strokeIndex = sourceStrokes.length - 1;
  return Object.freeze([
    Object.freeze({
      definition: Object.freeze({ slotKey: 'dash-flow', style, dynamicParameters: Object.freeze(['lineDashOffset'] as const) }),
      basePhase: strokeIndex < 0 ? undefined : 0,
      strokeIndex: strokeIndex < 0 ? undefined : strokeIndex
    })
  ]);
}

/** linework 的每条虚线轨道使用独立稳定 slot，避免复制端帽、装饰和文本。 */
function createLineworkSlotPlans(base: StyleSpec, spec: Readonly<DashFlowAnimationSpec>): readonly DashFlowSlotPlan[] {
  const linework = base.linework;
  if (linework === undefined) return [];
  const plans: DashFlowSlotPlan[] = [];
  for (let index = 0; index < linework.tracks.length; index += 1) {
    const sourceTrack = linework.tracks[index];
    if (!isDashedTrack(sourceTrack.stroke.lineDash)) continue;
    const track = {
      ...sourceTrack,
      stroke: {
        ...sourceTrack.stroke,
        lineDash: [...(spec.lineDash ?? sourceTrack.stroke.lineDash ?? [])],
        ...(spec.color === undefined ? {} : { color: spec.color })
      }
    };
    const style = cloneCoreState({
      linework: {
        tracks: [track],
        ...(linework.contour === undefined ? {} : { contour: linework.contour }),
        ...cutoutOnlyLinework(linework)
      },
      ...(base.zIndex === undefined ? {} : { zIndex: base.zIndex })
    }) as StyleSpec;
    plans.push(
      Object.freeze({
        definition: Object.freeze({
          slotKey: `dash-flow-track-${index}`,
          style,
          dynamicParameters: Object.freeze(['lineDashOffset'] as const)
        }),
        basePhase: sourceTrack.stroke.lineDashOffset ?? 0,
        strokeIndex: undefined
      })
    );
  }
  return Object.freeze(plans);
}

/** dash-flow 只复用中点切口语义，透明占位由 StyleCompiler 跳过可见绘制。 */
function cutoutOnlyLinework(linework: LineworkSpec): Pick<LineworkSpec, 'decorations' | 'inlineText'> {
  const centerDecorations = linework.decorations
    ?.filter((decoration): decoration is Extract<PathDecorationSpec, { placement: { kind: 'center' } }> => decoration.placement.kind === 'center')
    .map((decoration) => ({ ...decoration, glyph: transparentGlyph(decoration.glyph) }));
  return {
    ...(centerDecorations === undefined || centerDecorations.length === 0 ? {} : { decorations: centerDecorations }),
    ...(linework.inlineText === undefined ? {} : { inlineText: transparentInlineText(linework.inlineText) })
  };
}

function transparentInlineText(text: InlinePathTextSpec): InlinePathTextSpec {
  return {
    ...text,
    fill: { ...text.fill, color: transparentColor() },
    ...(text.stroke === undefined ? {} : { stroke: transparentGlyphStroke(text.stroke) }),
    ...(text.backgroundFill === undefined ? {} : { backgroundFill: { ...text.backgroundFill, color: transparentColor() } })
  };
}

function transparentGlyph(glyph: PathGlyphSpec): PathGlyphSpec {
  return { primitives: glyph.primitives.map(transparentPrimitive) };
}

function transparentPrimitive(primitive: PathGlyphPrimitiveSpec): PathGlyphPrimitiveSpec {
  if (primitive.type === 'segment') return { ...primitive, stroke: transparentGlyphStroke(primitive.stroke) };
  if (primitive.type === 'group') return { ...primitive, primitives: primitive.primitives.map(transparentPrimitive) };
  return {
    ...primitive,
    ...(primitive.fill === undefined ? {} : { fill: { ...primitive.fill, color: transparentColor() } }),
    ...(primitive.stroke === undefined ? {} : { stroke: transparentGlyphStroke(primitive.stroke) })
  };
}

function transparentGlyphStroke(stroke: PathGlyphStrokeSpec): PathGlyphStrokeSpec {
  return { ...stroke, color: transparentColor() };
}

function transparentColor(): [number, number, number, number] {
  return [0, 0, 0, 0];
}

function assertDashFlowTarget(target: AnimationTargetProfile): void {
  const linework = target.style.linework;
  if (linework !== undefined) {
    const expectedGeometry = linework.contour?.kind === 'closed' ? 'polygon' : 'polyline';
    if (target.geometry.type !== expectedGeometry) {
      throw new CapabilityError(`Dash-flow linework requires ${expectedGeometry} render geometry`);
    }
    if (!linework.tracks.some(({ stroke }) => isDashedTrack(stroke.lineDash))) {
      throw new CapabilityError('Dash-flow animation requires at least one dashed linework track');
    }
    return;
  }
  if (target.geometry.type !== 'polyline') throw new CapabilityError('Dash-flow animation requires polyline render geometry');
}

function isDashedTrack(lineDash: readonly number[] | undefined): boolean {
  return lineDash !== undefined && lineDash.length > 0 && lineDash.some((value) => value > 0);
}

function normalizeLineDash(value: unknown): readonly number[] | undefined {
  if (value === undefined) return undefined;
  const parts = arrayValues(value, 'Dash-flow lineDash');
  if (parts.length === 0 || parts.some((part) => typeof part !== 'number' || !Number.isFinite(part) || part < 0)) {
    throw new InvalidArgumentError('Dash-flow lineDash must be a non-empty array of finite non-negative numbers');
  }
  if (parts.every((part) => part === 0)) throw new InvalidArgumentError('Dash-flow lineDash cannot contain only zeros');
  return Object.freeze(parts as readonly number[]);
}
