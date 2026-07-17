import { describe, expect, it, vi } from 'vitest';
import type { PulseAnimationSpec } from '../src/core/animation/types.js';
import type { ElementState } from '../src/core/element/types.js';
import { CapabilityError } from '../src/core/errors.js';
import type { LayerRenderBatch, LayerRenderContribution } from '../src/core/ports/LayerRenderPort.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { AnimationRegistry } from '../src/services/animation/AnimationRegistry.js';
import type { AnimationDefinition } from '../src/services/animation/types.js';
import { createAnimationHarness, pointElement, polylineElement } from './helpers/animationHarness.js';

describe('AnimationManager effect composition', () => {
  it('multiplies fade and blink opacity while sharing one presentation lease', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');

    const blink = manager.play({ id: 'point' }, { type: 'blink', channel: 'blink', periodMs: 800, dutyCycle: 0.5, minOpacity: 0.25, maxOpacity: 0.8 });
    const fade = manager.play({ id: 'point' }, { type: 'fade', channel: 'fade', direction: 'out', durationMs: 1000, easing: 'linear' });

    expect(acquirePresentation).toHaveBeenCalledTimes(1);
    const lease = acquirePresentation.mock.results[0]?.value;
    if (lease === undefined) throw new Error('missing presentation lease');
    expect(lease.active).toBe(true);

    const first = onlyContribution(render.frame('default', 0));
    expect(first).toEqual(expect.objectContaining({ targetId: 'point', channel: '$animation' }));
    expect(first.value.presentation?.opacity).toBeCloseTo(0.8);

    const composed = onlyContribution(render.frame('default', 400));
    expect(composed.value.presentation?.opacity).toBeCloseTo(0.15);

    blink.stop();
    expect(lease.active).toBe(true);
    expect(manager.activeCount).toBe(1);
    fade.stop();
    expect(lease.active).toBe(false);
    expect(manager.activeCount).toBe(0);
  });

  it('merges Element overlays by channel and slot, then applies total target opacity', () => {
    const { manager, render } = createAnimationHarness([polygonElement('area')]);

    const fade = manager.play({ id: 'area' }, { type: 'fade', direction: 'out', durationMs: 1000, easing: 'linear' });
    const highlight = manager.play({ id: 'area' }, { type: 'highlight', channel: 'attention', mode: 'steady' });
    const alert = manager.play({ id: 'area' }, { type: 'alert', channel: 'warning', periodMs: 1000, repeat: true });

    render.frame('default', 0);
    const contribution = onlyContribution(render.frame('default', 120));
    const primitives = contribution.value.primitives ?? [];

    expect(contribution.channel).toBe('$animation');
    expect(contribution.value.presentation?.opacity).toBeCloseTo(0.88);
    expect(primitives.map(({ slotKey }) => slotKey)).toEqual([
      'attention/highlight-fill',
      'attention/highlight-stroke',
      'warning/alert-fill',
      'warning/alert-stroke',
      'warning/alert-glow'
    ]);
    expect(primitives.map(({ opacity }) => opacity)).toEqual([
      expect.closeTo(0.18 * 0.88),
      expect.closeTo(0.88),
      expect.closeTo(0.22 * 0.88),
      expect.closeTo(0.88),
      expect.closeTo(0.35 * 0.88)
    ]);

    fade.stop();
    highlight.stop();
    alert.stop();
  });

  it('rejects conflicting grow channels atomically without replacing the existing record', () => {
    const firstElement = polylineElement('first');
    const secondElement = polylineElement('second');
    const { manager, render } = createAnimationHarness([firstElement, secondElement]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const existing = manager.play({ id: 'first' }, { type: 'grow', channel: 'primary', durationMs: 1000, easing: 'linear', repeat: true });
    render.frame('default', 0);

    let failure: unknown;
    try {
      manager.play({ module: 'routes' }, { type: 'grow', channel: 'secondary', durationMs: 1000, easing: 'linear', repeat: true });
    } catch (error) {
      failure = error;
    }

    expect(manager.activeCount).toBe(1);
    expect(existing.status).toBe('running');
    expect(acquirePresentation).toHaveBeenCalledTimes(1);
    const contribution = onlyContribution(render.frame('default', 500));
    expect(contribution.targetId).toBe('first');
    expect(contribution.value.presentation?.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [50, 0]
      ]
    });
    existing.stop();

    expect({
      name: failure instanceof Error ? failure.name : undefined,
      mentionsTarget: failure instanceof Error && failure.message.includes('first'),
      mentionsExistingChannel: failure instanceof Error && failure.message.includes('primary'),
      mentionsRequestedChannel: failure instanceof Error && failure.message.includes('secondary')
    }).toEqual({
      name: CapabilityError.name,
      mentionsTarget: true,
      mentionsExistingChannel: true,
      mentionsRequestedChannel: true
    });
  });

  it('keeps every previous channel record when a later target fails during batch replacement', () => {
    const { manager, render } = createAnimationHarness([pointElement('first'), pointElement('second')]);
    const existing = manager.play({ module: 'markers' }, { type: 'pulse', channel: 'replace', repeat: true });
    const acquireOriginal = render.acquirePresentation.bind(render);
    let acquireCount = 0;
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation').mockImplementation((layerId, targetId) => {
      acquireCount += 1;
      if (acquireCount === 2) throw new Error('synthetic lease failure');
      return acquireOriginal(layerId, targetId);
    });

    expect(() => manager.play({ module: 'markers' }, { type: 'fade', channel: 'replace', direction: 'in', durationMs: 1000, easing: 'linear' })).toThrow(
      'synthetic lease failure'
    );

    const firstLease = acquirePresentation.mock.results[0]?.value;
    if (firstLease === undefined) throw new Error('missing first pre-commit lease');
    expect(firstLease.active).toBe(false);
    expect(existing.status).toBe('running');
    expect(manager.activeCount).toBe(2);
    expect(render.frame('default', 0).contributions).toHaveLength(2);

    const replacement = manager.play({ id: 'first' }, { type: 'pulse', channel: 'replace', repeat: true });
    expect(manager.activeCount).toBe(2);
    expect(existing.status).toBe('running');
    replacement.stop();
    existing.stop();
  });

  it('identifies the first incompatible Element in a batch capability error', () => {
    const { manager } = createAnimationHarness([pointElement('unsupported'), polygonElement('area')]);

    let failure: unknown;
    try {
      manager.play({ ids: ['unsupported', 'area'] }, { type: 'highlight', mode: 'steady' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(CapabilityError);
    expect(failure instanceof Error ? failure.message : '').toContain('unsupported');
    expect(manager.activeCount).toBe(0);
  });

  it('binds effective grow geometry to the base presentation and overlays', () => {
    const { manager, render } = createAnimationHarness([polylineElement('route')]);
    const dash = manager.play({ id: 'route' }, { type: 'dash-flow', channel: 'dash' });
    const grow = manager.play({ id: 'route' }, { type: 'grow', channel: 'grow', durationMs: 1000, easing: 'linear', repeat: true });

    render.frame('default', 0);
    const contribution = onlyContribution(render.frame('default', 500));
    const presentation = contribution.value.presentation;
    const primitive = contribution.value.primitives?.[0];
    if (presentation === undefined || primitive === undefined) throw new Error('missing composed grow presentation');

    expect(presentation.geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [50, 0]
      ]
    });
    expect(primitive.slotKey).toBe('dash/dash-flow');
    expect(primitive.geometry).toBe(presentation.geometry);

    dash.stop();
    grow.stop();
  });

  it('reserves every live presentation and overlay slot across inactive and offscreen frames', () => {
    const { manager, render } = createAnimationHarness([polylineElement('route'), polygonElement('area')]);
    const grow = manager.play({ id: 'route' }, { type: 'grow', channel: 'reveal', durationMs: 1_000, easing: 'linear', repeat: true });
    const alert = manager.play({ id: 'area' }, { type: 'alert', channel: 'warning', periodMs: 1_000, repeat: true });
    const expected = [
      { kind: 'presentation', targetId: 'route' },
      { kind: 'overlay', targetId: 'area', channel: '$animation', slotKey: 'warning/alert-fill' },
      { kind: 'overlay', targetId: 'area', channel: '$animation', slotKey: 'warning/alert-stroke' },
      { kind: 'overlay', targetId: 'area', channel: '$animation', slotKey: 'warning/alert-glow' }
    ];

    const initialBoundary = render.frame('default', 0);
    expect(initialBoundary.contributions).toHaveLength(0);
    expect(initialBoundary.slotReservations).toEqual(expected);

    const offscreen = render.frame('default', 100, 1, [10_000, 10_000, 10_100, 10_100]);
    expect(offscreen.contributions).toHaveLength(0);
    expect(offscreen.slotReservations).toEqual(expected);

    const nextBoundary = render.frame('default', 1_000);
    expect(nextBoundary.contributions).toHaveLength(0);
    expect(nextBoundary.slotReservations).toEqual(expected);

    grow.stop();
    alert.stop();
  });

  it('预热后复用 slot reservation 与视觉外扩画像，并在 rebind 时更新', () => {
    let styleReadCount = 0;
    const createSlots = (revision: number) =>
      Object.freeze([
        Object.freeze({
          slotKey: `probe-${revision}`,
          style: new Proxy<StyleSpec>(
            { strokes: [{ color: '#00e676', width: 2, lineJoin: 'round' }] },
            {
              get(target, property, receiver) {
                styleReadCount += 1;
                return Reflect.get(target, property, receiver);
              }
            }
          )
        })
      ]);
    const definition = {
      type: 'pulse',
      writeDomains: new Set(['overlay'] as const),
      requirements: new Set(['structured-presentation'] as const),
      interactionPolicy: Object.freeze({ edit: 'pause-and-suppress' as const, transform: 'pause-and-suppress' as const }),
      normalize: () => Object.freeze({ type: 'pulse' as const, channel: 'profile-probe', repeat: true }),
      assertCompatible: () => undefined,
      create(initialTarget) {
        let target = initialTarget;
        let revision = 0;
        let slots = createSlots(revision);
        return {
          get slots() {
            return slots;
          },
          rebind(next) {
            target = next;
            revision += 1;
            slots = createSlots(revision);
          },
          sample(_context, output) {
            output.reset();
            const slot = output.overlay(slots[0].slotKey);
            slot.active = true;
            slot.geometryKind = 'snapshot';
            slot.geometry = target.geometry;
            slot.opacity = 1;
            return { finished: false, schedule: { kind: 'continuous' as const } };
          },
          destroy() {
            return;
          }
        };
      }
    } satisfies AnimationDefinition<PulseAnimationSpec>;
    const registry = new AnimationRegistry([definition]);
    const { manager, render, store } = createAnimationHarness([pointElement('profile-probe')], registry);
    const handle = manager.play({ id: 'profile-probe' }, { type: 'pulse' });
    const offscreenExtent = [10_000, 10_000, 10_100, 10_100] as const;

    const warm = render.frame('default', 0, 1, offscreenExtent);
    const warmReservation = warm.slotReservations?.[0];
    if (warmReservation === undefined) throw new Error('缺少预热 slot reservation');
    const warmStyleReads = styleReadCount;
    const observedReservations = new Set([warmReservation]);
    for (let frame = 1; frame <= 300; frame += 1) {
      const reservation = render.frame('default', frame * 16, 1, offscreenExtent).slotReservations?.[0];
      if (reservation === undefined) throw new Error('稳定帧缺少 slot reservation');
      observedReservations.add(reservation);
    }

    expect(observedReservations.size).toBe(1);
    expect(styleReadCount).toBe(warmStyleReads);

    store.update({ id: 'profile-probe' }, { data: { revision: 1 } });
    const rebound = render.frame('default', 4_816, 1, offscreenExtent);
    const reboundReservation = rebound.slotReservations?.[0];
    expect(reboundReservation).toMatchObject({ kind: 'overlay', slotKey: 'profile-probe/probe-1' });
    expect(reboundReservation).not.toBe(warmReservation);
    expect(styleReadCount).toBeGreaterThan(warmStyleReads);
    const reboundStyleReads = styleReadCount;
    for (let frame = 1; frame <= 100; frame += 1) render.frame('default', 4_816 + frame * 16, 1, offscreenExtent);
    expect(styleReadCount).toBe(reboundStyleReads);

    handle.stop();
  });

  it('draws canonical geometry once while a completed grow releases its presentation lease', async () => {
    const state = polylineElement('route');
    const { manager, render } = createAnimationHarness([state]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const grow = manager.play({ id: 'route' }, { type: 'grow', durationMs: 100, easing: 'linear' });
    const lease = acquirePresentation.mock.results[0]?.value;
    if (lease === undefined) throw new Error('missing grow presentation lease');

    render.frame('default', 0);
    const completed = onlyContribution(render.frame('default', 100));
    await expect(grow.finished).resolves.toBeUndefined();

    expect(completed.value.presentation).toMatchObject({ geometry: { type: 'polyline', coordinates: state.geometry.controlPoints }, opacity: 1 });
    expect(lease.active).toBe(false);
    expect(manager.activeCount).toBe(0);
  });

  it('keeps steady highlight stable without requesting another frame', () => {
    const { manager, render } = createAnimationHarness([polygonElement('area')]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const highlight = manager.play({ id: 'area' }, { type: 'highlight', mode: 'steady' });

    const batch = render.frame('default', 0);

    expect(batch.requestNextFrame).toBe(false);
    expect(batch.contributions).toHaveLength(1);
    expect(render.nextFrameRequests.has('default')).toBe(false);
    expect(acquirePresentation).not.toHaveBeenCalled();
    expect(manager.activeCount).toBe(1);
    expect(render.activeLoopCount).toBe(1);

    highlight.stop();
    expect(manager.activeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
  });

  it('skips continuous work for conservatively offscreen targets while preserving world copies', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const pulse = manager.play({ id: 'point' }, { type: 'pulse', repeat: true, radius: 6 });

    const offscreen = render.frame('default', 0, 1, [10_000, 10_000, 10_100, 10_100]);
    expect(offscreen.contributions).toHaveLength(0);
    expect(offscreen.requestNextFrame).toBe(false);

    const wrapped = render.frame('default', 100, 1, [10_000, -100, 10_100, 100], 10_000);
    expect(wrapped.contributions).toHaveLength(1);
    expect(wrapped.requestNextFrame).toBe(true);
    pulse.stop();
  });

  it('does not request an intermediate blink render after the latest frame conservatively culled the target', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const blink = manager.play({ id: 'point' }, { type: 'blink', periodMs: 800, dutyCycle: 0.5, minOpacity: 0.2, maxOpacity: 0.9, repeat: false });
    const lease = acquirePresentation.mock.results[0]?.value;
    if (lease === undefined) throw new Error('missing offscreen blink presentation lease');

    const offscreen = render.frame('default', 0, 1, [10_000, 10_000, 10_100, 10_100]);
    expect(offscreen.contributions).toHaveLength(0);
    expect(render.nextWakeTimestamp).toBe(400);
    const initialRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(400);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(initialRequests);
    expect(render.nextWakeTimestamp).toBe(800);
    expect(blink.status).toBe('running');
    expect(lease.active).toBe(true);

    render.advanceTime(800);
    await expect(blink.finished).resolves.toBeUndefined();
    expect(blink.status).toBe('finished');
    expect(manager.activeCount).toBe(0);
    expect(render.activeWakeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
    expect(lease.active).toBe(false);
  });

  it('keeps dynamic visual outsets and curved travel geometry inside conservative culling bounds', () => {
    const point = pointElement('point', { geometry: { type: 'point', controlPoints: [[0, 0]] } });
    const route = polylineElement('route');
    const { manager, render } = createAnimationHarness([point, route]);
    const pulse = manager.play({ id: 'point' }, { type: 'pulse', radius: 50, repeat: true });
    const travel = manager.play(
      { id: 'route' },
      { type: 'path-travel', durationMs: 1000, repeat: true, curvature: 1, width: 1, showStart: false, showEnd: false }
    );

    expect(render.frame('default', 0, 1, [60, -1, 100, 1]).contributions.some(({ targetId }) => targetId === 'point')).toBe(true);
    expect(render.frame('default', 500, 1, [40, 20, 60, 30]).contributions.some(({ targetId }) => targetId === 'route')).toBe(true);

    pulse.stop();
    travel.stop();
  });

  it('retains fade-out resources until stop and releases fade-in resources on completion', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const fadeOut = manager.play({ id: 'point' }, { type: 'fade', direction: 'out', durationMs: 100, easing: 'linear' });
    const retainedLease = acquirePresentation.mock.results[0]?.value;
    if (retainedLease === undefined) throw new Error('missing retained presentation lease');

    render.frame('default', 0);
    const retained = onlyContribution(render.frame('default', 100));
    await expect(fadeOut.finished).resolves.toBeUndefined();

    expect(fadeOut.status).toBe('finished');
    expect(retained.value.presentation?.opacity).toBe(0);
    expect(retainedLease.active).toBe(true);
    expect(manager.activeCount).toBe(1);
    expect(manager.activeLayerCount).toBe(1);

    fadeOut.stop();
    expect(retainedLease.active).toBe(false);
    expect(manager.activeCount).toBe(0);
    expect(manager.activeLayerCount).toBe(0);

    const fadeIn = manager.play({ id: 'point' }, { type: 'fade', direction: 'in', durationMs: 100, easing: 'linear' });
    const removingLease = acquirePresentation.mock.results[1]?.value;
    if (removingLease === undefined) throw new Error('missing removing presentation lease');
    const completed = render.frame('default', 200);
    await expect(fadeIn.finished).resolves.toBeUndefined();

    expect(fadeIn.status).toBe('finished');
    expect(onlyContribution(completed).value.presentation).toMatchObject({ opacity: 1 });
    expect(removingLease.active).toBe(false);
    expect(manager.activeCount).toBe(0);
    expect(manager.activeLayerCount).toBe(0);
  });

  it('rearms repeat blink deadlines behind retained zero opacity without permanently requesting renders', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const blink = manager.play(
      { id: 'point' },
      { type: 'blink', channel: 'blink', periodMs: 200, dutyCycle: 0.5, minOpacity: 0.2, maxOpacity: 0.9, repeat: true }
    );
    const fade = manager.play({ id: 'point' }, { type: 'fade', channel: 'fade', direction: 'out', durationMs: 100, easing: 'linear' });

    render.frame('default', 0);
    render.advanceTime(100);
    await expect(fade.finished).resolves.toBeUndefined();
    expect(fade.status).toBe('finished');
    expect(blink.status).toBe('running');
    expect(render.nextWakeTimestamp).toBe(200);
    const retainedRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(200);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(retainedRequests);
    expect(render.nextWakeTimestamp).toBe(300);
    render.advanceTime(300);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(retainedRequests);
    expect(render.nextWakeTimestamp).toBe(400);
    expect(blink.status).toBe('running');
    expect(manager.activeCount).toBe(2);

    fade.stop();
    blink.stop();
    expect(render.activeWakeCount).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  it('suppresses masked blink deadlines until another opacity channel makes the target visible again', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const mask = manager.play({ id: 'point' }, { type: 'blink', channel: 'mask', periodMs: 400, dutyCycle: 0.25, minOpacity: 0, maxOpacity: 1, repeat: true });
    const blink = manager.play(
      { id: 'point' },
      { type: 'blink', channel: 'blink', periodMs: 200, dutyCycle: 0.5, minOpacity: 0.2, maxOpacity: 0.9, repeat: true }
    );

    render.frame('default', 0);
    const initialRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(100);
    const hiddenRequests = render.requestRenderCalls.get('default') ?? 0;
    expect(hiddenRequests).toBe(initialRequests + 1);
    expect(render.nextWakeTimestamp).toBe(200);

    render.advanceTime(200);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(hiddenRequests);
    expect(render.nextWakeTimestamp).toBe(300);
    render.advanceTime(300);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(hiddenRequests);
    expect(render.nextWakeTimestamp).toBe(400);

    render.advanceTime(400);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(hiddenRequests + 1);
    expect(render.nextWakeTimestamp).toBe(500);

    mask.stop();
    blink.stop();
    expect(render.activeWakeCount).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  it('finishes and cleans a non-repeating blink behind retained zero opacity without a render event', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const blink = manager.play(
      { id: 'point' },
      { type: 'blink', channel: 'blink', periodMs: 300, dutyCycle: 0.5, minOpacity: 0.2, maxOpacity: 0.9, repeat: false }
    );
    const fade = manager.play({ id: 'point' }, { type: 'fade', channel: 'fade', direction: 'out', durationMs: 100, easing: 'linear' });

    render.frame('default', 0);
    render.advanceTime(100);
    await expect(fade.finished).resolves.toBeUndefined();
    expect(render.nextWakeTimestamp).toBe(150);
    const retainedRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(150);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(retainedRequests);
    expect(render.nextWakeTimestamp).toBe(300);
    expect(blink.status).toBe('running');

    render.advanceTime(300);
    await expect(blink.finished).resolves.toBeUndefined();
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(retainedRequests);
    expect(blink.status).toBe('finished');
    expect(render.activeWakeCount).toBe(0);
    expect(manager.activeCount).toBe(1);

    fade.stop();
    expect(manager.activeCount).toBe(0);
  });

  it('requests one cleanup batch when a masked deadline removes cached overlay slots', async () => {
    const { manager, render } = createAnimationHarness([polylineElement('route')]);
    const travel = manager.play(
      { id: 'route' },
      {
        type: 'path-travel',
        channel: 'travel',
        durationMs: 200,
        repeat: false,
        finishBehavior: 'remove',
        gradient: [
          [0, '#00e5ff'],
          [1, '#ff3b30']
        ],
        showStart: false,
        showEnd: false
      }
    );
    const fade = manager.play({ id: 'route' }, { type: 'fade', channel: 'fade', direction: 'out', durationMs: 100, easing: 'linear' });

    render.frame('default', 0);
    render.advanceTime(100);
    await expect(fade.finished).resolves.toBeUndefined();
    const maskedRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(200);
    await expect(travel.finished).resolves.toBeUndefined();
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(maskedRequests + 1);
    const cleanup = render.frame('default', 200);
    expect(cleanup.slotReservations).toEqual([{ kind: 'presentation', targetId: 'route' }]);
    expect(cleanup.contributions[0]?.value.primitives).toBeUndefined();

    fade.stop();
    expect(manager.activeCount).toBe(0);
  });

  it('requests an offscreen cleanup batch when a completed fade-in releases its presentation slot', async () => {
    const { manager, render } = createAnimationHarness([polygonElement('area')]);
    const fade = manager.play({ id: 'area' }, { type: 'fade', channel: 'reveal', direction: 'in', durationMs: 100, easing: 'linear' });
    const highlight = manager.play({ id: 'area' }, { type: 'highlight', channel: 'steady', mode: 'steady' });

    render.frame('default', 50);
    render.frame('default', 50, 1, [10_000, 10_000, 10_100, 10_100]);
    const offscreenRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(100);
    await expect(fade.finished).resolves.toBeUndefined();
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(offscreenRequests + 1);

    const cleanup = render.frame('default', 100, 1, [10_000, 10_000, 10_100, 10_100]);
    expect(cleanup.contributions).toHaveLength(0);
    expect(cleanup.slotReservations).toEqual([
      { kind: 'overlay', targetId: 'area', channel: '$animation', slotKey: 'steady/highlight-fill' },
      { kind: 'overlay', targetId: 'area', channel: '$animation', slotKey: 'steady/highlight-stroke' }
    ]);

    highlight.stop();
    expect(manager.activeCount).toBe(0);
  });

  it('wakes a non-repeating blink at its step and completion deadlines without another render frame', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const blink = manager.play({ id: 'point' }, { type: 'blink', periodMs: 800, dutyCycle: 0.5, minOpacity: 0, maxOpacity: 0.9, repeat: false });
    const lease = acquirePresentation.mock.results[0]?.value;
    if (lease === undefined) throw new Error('missing blink presentation lease');

    render.frame('default', 0);
    const initialRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(399);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(initialRequests);

    render.advanceTime(400);
    const stepRequests = render.requestRenderCalls.get('default') ?? 0;
    expect(stepRequests).toBe(initialRequests + 1);
    expect(blink.status).toBe('running');
    expect(manager.activeCount).toBe(1);
    expect(lease.active).toBe(true);

    render.advanceTime(799);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(stepRequests);

    render.advanceTime(800);
    await expect(blink.finished).resolves.toBeUndefined();
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(stepRequests + 1);
    expect(blink.status).toBe('finished');
    expect(manager.activeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
    expect(lease.active).toBe(false);
  });

  it('finishes fade-out and grow at deadlines without render events while preserving retain and remove ownership', async () => {
    const { manager, render } = createAnimationHarness([pointElement('fade'), polylineElement('grow')]);
    const acquirePresentation = vi.spyOn(render, 'acquirePresentation');
    const fade = manager.play({ id: 'fade' }, { type: 'fade', direction: 'out', durationMs: 100, easing: 'linear' });
    const grow = manager.play({ id: 'grow' }, { type: 'grow', durationMs: 100, easing: 'linear', repeat: false });
    const fadeLease = acquirePresentation.mock.results[0]?.value;
    const growLease = acquirePresentation.mock.results[1]?.value;
    if (fadeLease === undefined || growLease === undefined) throw new Error('missing completion presentation leases');

    render.advanceTime(99);
    expect(fade.status).toBe('running');
    expect(grow.status).toBe('running');
    expect(manager.activeCount).toBe(2);

    render.advanceTime(100);
    await Promise.all([fade.finished, grow.finished]);

    expect(fade.status).toBe('finished');
    expect(grow.status).toBe('finished');
    expect(fadeLease.active).toBe(true);
    expect(growLease.active).toBe(false);
    expect(manager.activeCount).toBe(1);
    expect(manager.activeLayerCount).toBe(1);

    fade.stop();
    expect(fadeLease.active).toBe(false);
    expect(manager.activeCount).toBe(0);
    expect(manager.activeLayerCount).toBe(0);
  });

  it('preserves the no-render completion deadline when geometry is rebound mid-animation', async () => {
    const { manager, render, store } = createAnimationHarness([pointElement('point')]);
    const fade = manager.play({ id: 'point' }, { type: 'fade', direction: 'in', durationMs: 100, easing: 'linear' });

    render.advanceTime(20);
    store.update({ id: 'point' }, { geometry: { type: 'point', controlPoints: [[30, 40]] } });
    render.advanceTime(99);
    expect(fade.status).toBe('running');

    render.advanceTime(100);
    await expect(fade.finished).resolves.toBeUndefined();
    expect(fade.status).toBe('finished');
    expect(manager.activeCount).toBe(0);
    expect(render.activeLoopCount).toBe(0);
  });

  it('cancels a paused deadline and rearms it from the remaining elapsed time', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const blink = manager.play({ id: 'point' }, { type: 'blink', periodMs: 800, dutyCycle: 0.5, minOpacity: 0.2, maxOpacity: 0.9, repeat: false });

    render.frame('default', 0);
    render.frame('default', 100);
    blink.pause();
    const pausedRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(500);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(pausedRequests);
    expect(blink.status).toBe('paused');

    blink.resume();
    const resumedRequests = render.requestRenderCalls.get('default') ?? 0;
    expect(blink.status).toBe('running');

    render.advanceTime(799);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(resumedRequests);
    render.advanceTime(800);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(resumedRequests + 1);
    expect(blink.status).toBe('running');

    const contribution = onlyContribution(render.frame('default', 800));
    expect(contribution.value.presentation?.opacity).toBeCloseTo(0.2);
    blink.stop();
  });

  it('accounts for elapsed wall time when pausing before the first render frame', async () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const fade = manager.play({ id: 'point' }, { type: 'fade', direction: 'in', durationMs: 1000, easing: 'linear' });

    render.advanceTime(300);
    fade.pause();
    render.advanceTime(500);
    fade.resume();

    render.advanceTime(1199);
    expect(fade.status).toBe('running');
    render.advanceTime(1200);
    await expect(fade.finished).resolves.toBeUndefined();
    expect(fade.status).toBe('finished');
  });

  it('treats resume on an already running handle as a timeline no-op', () => {
    const { manager, render } = createAnimationHarness([pointElement('point')]);
    const fade = manager.play({ id: 'point' }, { type: 'fade', direction: 'in', durationMs: 1000, easing: 'linear' });

    render.frame('default', 0);
    render.advanceTime(100);
    fade.resume();
    const contribution = onlyContribution(render.frame('default', 200));

    expect(contribution.value.presentation?.opacity).toBeCloseTo(0.2);
    fade.stop();
  });

  it('cancels a hidden deadline and rearms it after the first resumed render from the remaining elapsed time', () => {
    const { manager, render, store } = createAnimationHarness([pointElement('point')]);
    const blink = manager.play({ id: 'point' }, { type: 'blink', periodMs: 800, dutyCycle: 0.5, minOpacity: 0.2, maxOpacity: 0.9, repeat: false });

    render.frame('default', 0);
    render.frame('default', 100);
    store.hide({ id: 'point' });
    const hiddenRequests = render.requestRenderCalls.get('default') ?? 0;
    expect(blink.status).toBe('paused');
    expect(render.activeLoopCount).toBe(0);

    render.advanceTime(500);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(hiddenRequests);

    store.show({ id: 'point' });
    expect(blink.status).toBe('running');
    expect(render.activeLoopCount).toBe(1);
    render.frame('default', 500);
    const resumedRequests = render.requestRenderCalls.get('default') ?? 0;

    render.advanceTime(799);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(resumedRequests);
    render.advanceTime(800);
    expect(render.requestRenderCalls.get('default') ?? 0).toBe(resumedRequests + 1);

    const contribution = onlyContribution(render.frame('default', 800));
    expect(contribution.value.presentation?.opacity).toBeCloseTo(0.2);
    blink.stop();
  });
});

function onlyContribution(batch: LayerRenderBatch): LayerRenderContribution {
  expect(batch.contributions).toHaveLength(1);
  const contribution = batch.contributions[0];
  if (contribution === undefined) throw new Error('missing animation contribution');
  return contribution;
}

function polygonElement(id: string): ElementState {
  return {
    id,
    type: 'polygon',
    geometry: {
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100]
      ]
    },
    style: {
      fill: { type: 'solid', color: '#334155' },
      strokes: [{ color: '#94a3b8', width: 2 }]
    },
    module: 'areas',
    layerId: 'default',
    visible: true
  };
}
