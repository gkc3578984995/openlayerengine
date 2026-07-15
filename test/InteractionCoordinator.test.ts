import { describe, expect, it, vi } from 'vitest';
import { InteractionConflictError, InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { ErrorReporter } from '../src/core/ports/ErrorReporter.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import type { ExclusiveInteractionSession, RoutedPointerEvent } from '../src/services/events/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

function session(overrides: Partial<ExclusiveInteractionSession> = {}): ExclusiveInteractionSession {
  return {
    cancel: vi.fn(),
    handleContextMenu: vi.fn(() => 'pass' as const),
    ...overrides
  };
}

const rightclick = Object.freeze({ type: 'rightclick' }) as RoutedPointerEvent<'rightclick'>;

describe('InteractionCoordinator', () => {
  coversCapabilities('earth-default-interaction-policy', 'contextmenu-transform-arbitration');

  it('replaces by default, cancels before activation, and keeps stale releases harmless', () => {
    const coordinator = new InteractionCoordinator();
    const first = session();
    const second = session();

    coordinator.activate(first);
    coordinator.activate(first);
    expect(first.cancel).not.toHaveBeenCalled();

    coordinator.activate(second);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(first.cancel).toHaveBeenCalledWith('replaced');
    expect(coordinator.active).toBe(second);

    coordinator.release(first);
    expect(coordinator.active).toBe(second);
    coordinator.release(second);
    coordinator.release(second);
    expect(coordinator.active).toBeUndefined();
  });

  it('rejects conflicts without changing the old session', () => {
    const coordinator = new InteractionCoordinator();
    const first = session();
    const second = session();
    coordinator.activate(first);

    expect(() => coordinator.activate(second, 'reject')).toThrow(InteractionConflictError);
    expect(coordinator.active).toBe(first);
    expect(first.cancel).not.toHaveBeenCalled();
  });

  it('leaves no active session when replacement cancellation fails', () => {
    const failure = new Error('cancel failed');
    const coordinator = new InteractionCoordinator();
    const first = session({
      cancel: vi.fn(
        () =>
          void (() => {
            throw failure;
          })()
      )
    });
    const second = session();
    coordinator.activate(first);

    expect(() => coordinator.activate(second)).toThrow(failure);
    expect(coordinator.active).toBeUndefined();
    expect(second.cancel).not.toHaveBeenCalled();
  });

  it('lets destruction win when the replaced session destroys during cancellation', () => {
    const coordinator = new InteractionCoordinator();
    const first = session({ cancel: vi.fn(() => coordinator.destroy()) });
    const second = session();
    coordinator.activate(first);

    expect(() => coordinator.activate(second)).toThrow(ObjectDisposedError);
    expect(coordinator.active).toBeUndefined();
    expect(second.cancel).not.toHaveBeenCalled();
    expect(coordinator.handleContextMenu(rightclick)).toBe('pass');
  });

  it('clears before cancellation and blocks unsafe reentrant transitions', () => {
    const coordinator = new InteractionCoordinator();
    const reentrant = session();
    const active = session({
      cancel: vi.fn(() => {
        expect(coordinator.active).toBeUndefined();
        expect(() => coordinator.activate(reentrant)).toThrow(InvalidArgumentError);
      })
    });
    coordinator.activate(active);

    coordinator.cancelActive('cancelled');
    expect(active.cancel).toHaveBeenCalledWith('cancelled');
    expect(coordinator.active).toBeUndefined();
  });

  it('passes without an active interaction and isolates context-menu handler failures', () => {
    const reports: Parameters<ErrorReporter>[] = [];
    const coordinator = new InteractionCoordinator((...args) => reports.push(args));
    expect(coordinator.handleContextMenu(rightclick)).toBe('pass');

    const failure = new Error('context menu failed');
    const active = session({
      handleContextMenu: vi.fn((): 'consume' => {
        throw failure;
      })
    });
    coordinator.activate(active);
    expect(coordinator.handleContextMenu(rightclick)).toBe('consume');
    expect(reports).toEqual([[failure, { source: 'InteractionCoordinator', operation: 'handleContextMenu' }]]);
  });

  it('destroys idempotently, cancels with destroyed, and leaves context menus passable', () => {
    const coordinator = new InteractionCoordinator();
    const active = session();
    coordinator.activate(active);

    coordinator.destroy();
    coordinator.destroy();
    expect(active.cancel).toHaveBeenCalledOnce();
    expect(active.cancel).toHaveBeenCalledWith('destroyed');
    expect(coordinator.active).toBeUndefined();
    expect(coordinator.handleContextMenu(rightclick)).toBe('pass');
    coordinator.release(active);
  });
});
