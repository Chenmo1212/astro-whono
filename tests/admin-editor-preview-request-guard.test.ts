import { describe, expect, it, vi } from 'vitest';
import {
  createEditorPreviewRequestGuard
} from '../src/components/admin/editor/shared/editor-preview-request-guard';

describe('editor preview request guard', () => {
  it('aborts the active preview request when a newer one begins', () => {
    const firstAbortController = new AbortController();
    const secondAbortController = new AbortController();
    const guard = createEditorPreviewRequestGuard({
      createAbortController: vi.fn()
        .mockReturnValueOnce(firstAbortController)
        .mockReturnValueOnce(secondAbortController)
    });

    const firstRequest = guard.beginRequest('first body');
    const secondRequest = guard.beginRequest('second body');

    expect(firstAbortController.signal.aborted).toBe(true);
    expect(secondAbortController.signal.aborted).toBe(false);
    expect(firstRequest.isCurrent()).toBe(false);
    expect(secondRequest.isCurrent()).toBe(true);
    expect(guard.getLatestSource()).toBe('second body');
  });

  it('invalidates active requests without needing a newer request to finish', () => {
    const abortController = new AbortController();
    const guard = createEditorPreviewRequestGuard({
      createAbortController: () => abortController
    });

    const request = guard.beginRequest('body');
    guard.abortActiveRequest({ invalidate: true });

    expect(abortController.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
    expect(request.isCurrentForSource('body')).toBe(false);
  });

  it('tracks stale responses by request id and source snapshot', () => {
    const guard = createEditorPreviewRequestGuard();

    const request = guard.beginRequest('body');

    expect(request.isCurrentForSource('body')).toBe(true);
    expect(request.isCurrentForSource('changed body')).toBe(false);
  });

  it('schedules only the latest debounced request and returns a cleanup', () => {
    const scheduledCallbacks = new Map<number, () => void>();
    let nextTimerId = 1;
    const clearTimeout = vi.fn((timerId: number) => {
      scheduledCallbacks.delete(timerId);
    });
    const guard = createEditorPreviewRequestGuard({
      scheduler: {
        setTimeout: ((callback: () => void) => {
          const timerId = nextTimerId;
          nextTimerId += 1;
          scheduledCallbacks.set(timerId, callback);
          return timerId;
        }) as typeof globalThis.setTimeout,
        clearTimeout: clearTimeout as typeof globalThis.clearTimeout
      }
    });
    const callback = vi.fn();

    guard.scheduleRequest('first body', 100, callback);
    const cleanup = guard.scheduleRequest('second body', 100, callback);

    expect(clearTimeout).toHaveBeenCalledTimes(1);
    expect(scheduledCallbacks.size).toBe(1);

    cleanup();

    expect(clearTimeout).toHaveBeenCalledTimes(2);
    expect(scheduledCallbacks.size).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('destroys active request lifecycle state', () => {
    const abortController = new AbortController();
    const scheduledCallbacks = new Map<number, () => void>();
    const clearTimeout = vi.fn((timerId: number) => {
      scheduledCallbacks.delete(timerId);
    });
    const guard = createEditorPreviewRequestGuard({
      createAbortController: () => abortController,
      scheduler: {
        setTimeout: ((callback: () => void) => {
          scheduledCallbacks.set(1, callback);
          return 1;
        }) as typeof globalThis.setTimeout,
        clearTimeout: clearTimeout as typeof globalThis.clearTimeout
      }
    });

    const request = guard.beginRequest('body');
    guard.scheduleRequest('body', 100, () => {});
    guard.destroy();

    expect(abortController.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
    expect(clearTimeout).toHaveBeenCalledWith(1);
    expect(scheduledCallbacks.size).toBe(0);
  });

  it('allows exactly one initial request until destroyed', () => {
    const guard = createEditorPreviewRequestGuard();

    expect(guard.consumeInitialRequest()).toBe(true);
    expect(guard.consumeInitialRequest()).toBe(false);

    guard.destroy();

    expect(guard.consumeInitialRequest()).toBe(true);
  });
});
