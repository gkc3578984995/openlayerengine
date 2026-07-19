import { InvalidArgumentError } from '../../core/errors.js';
import type { AnimationFrameBuffer, AnimationOverlaySlotBuffer, AnimationSlotDefinition } from './types.js';

/** 创建一份由 Runtime 重复写入的稳定帧缓冲区。 */
export function createAnimationFrameBuffer(slots: readonly AnimationSlotDefinition[]): AnimationFrameBuffer {
  const keys = new Set<string>();
  const overlayByKey = new Map<string, AnimationOverlaySlotBuffer>();
  const overlays = slots.map(({ slotKey }) => {
    if (typeof slotKey !== 'string' || slotKey.length === 0) throw new InvalidArgumentError('Animation slotKey must be a non-empty string');
    if (keys.has(slotKey)) throw new InvalidArgumentError(`Animation slotKey is duplicated: ${slotKey}`);
    keys.add(slotKey);
    const slot: AnimationOverlaySlotBuffer = {
      active: false,
      geometryKind: 'effective-target',
      geometry: undefined,
      opacity: 1,
      lineDashOffset: undefined,
      lineDashOffsetStrokeIndex: undefined,
      symbolRadius: undefined,
      strokeWidth: undefined,
      rotation: undefined
    };
    overlayByKey.set(slotKey, slot);
    return slot;
  });
  const buffer: AnimationFrameBuffer = {
    targetOpacity: undefined,
    targetGeometry: undefined,
    targetReveal: undefined,
    overlays,
    reset() {
      buffer.targetOpacity = undefined;
      buffer.targetGeometry = undefined;
      buffer.targetReveal = undefined;
      for (const slot of overlays) {
        slot.active = false;
        slot.geometryKind = 'effective-target';
        slot.geometry = undefined;
        slot.opacity = 1;
        slot.lineDashOffset = undefined;
        slot.lineDashOffsetStrokeIndex = undefined;
        slot.symbolRadius = undefined;
        slot.strokeWidth = undefined;
        slot.rotation = undefined;
      }
    },
    overlay(slotKey) {
      const slot = overlayByKey.get(slotKey);
      if (slot === undefined) throw new InvalidArgumentError(`Animation slot is not declared: ${slotKey}`);
      return slot;
    }
  };
  return buffer;
}
